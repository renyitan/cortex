import assert from "node:assert/strict";
import test from "node:test";
import {
  MAB_CHUNK_TOKEN_LIMIT,
  chunkMabContext,
  countMabTokens,
  filterSelectedMabRows,
  flattenMabAnswers,
  formatMabQueryPrompt,
  parseMabOutput,
  prepareMabStreams,
  scoreMabOutput,
  selectMabQuestions,
  validateMabRow,
  type MabDatasetRow,
} from "../src/mab-adapter.js";

function row(
  source: string,
  context: string,
  questionCount = 4,
): MabDatasetRow {
  return {
    context,
    questions: Array.from(
      { length: questionCount },
      (_, index) => `${source} question ${index}`,
    ),
    answers: Array.from(
      { length: questionCount },
      (_, index) => [`${source} answer ${index}`],
    ),
    metadata: {
      source,
      qa_pair_ids: Array.from(
        { length: questionCount },
        (_, index) => `${source}_no${index}`,
      ),
    },
  };
}

test("rejects rows that do not match the four-column schema", () => {
  const valid = row(
    "icl_banking77_5900shot_balance",
    "example\nlabel: 1",
  );
  assert.deepEqual(validateMabRow(valid), valid);
  assert.throws(
    () => validateMabRow({ ...valid, unexpected: true }),
    /exactly the columns/,
  );
  assert.throws(
    () =>
      validateMabRow({
        ...valid,
        answers: [["only one"]],
      }),
    /same non-zero length/,
  );
  assert.throws(
    () =>
      validateMabRow({
        ...valid,
        metadata: { source: valid.metadata.source },
      }),
    /qa_pair_ids/,
  );
});

test("chunks deterministically on task semantic units within 4096 tokens", () => {
  const bankingExamples = Array.from(
    { length: 700 },
    (_, index) =>
      `example ${index} ${"payment ".repeat(12)}\nlabel: ${index % 77}`,
  );
  const bankingContext = bankingExamples.join("\n\n");
  const first = chunkMabContext(
    "icl_banking77_5900shot_balance",
    bankingContext,
  );
  const second = chunkMabContext(
    "icl_banking77_5900shot_balance",
    bankingContext,
  );
  assert.deepEqual(first, second);
  assert.ok(first.length > 1);
  assert.ok(
    first.every((chunk) => countMabTokens(chunk) <= MAB_CHUNK_TOKEN_LIMIT),
  );
  assert.ok(first.every((chunk) => /^example \d+/.test(chunk)));
  assert.ok(first.every((chunk) => /label: \d+$/.test(chunk)));

  const facts = [
    "Here is a list of facts:",
    ...Array.from(
      { length: 1_500 },
      (_, index) => `${index}. Entity ${index} has value ${index}.`,
    ),
  ];
  const factChunks = chunkMabContext(
    "factconsolidation_mh_32k",
    facts.join("\n"),
  );
  assert.ok(factChunks.length > 1);
  assert.ok(
    factChunks.every(
      (chunk) => countMabTokens(chunk) <= MAB_CHUNK_TOKEN_LIMIT,
    ),
  );
  assert.ok(
    factChunks
      .slice(1)
      .every((chunk) => /^\d+\. Entity \d+ has value \d+\./.test(chunk)),
  );
});

test("filters to the five selected sources and prepares source metadata", () => {
  const rows = [
    row("unselected_source", "ignored"),
    row(
      "factconsolidation_sh_6k",
      "Here is a list of facts:\n0. The current value is blue.",
    ),
    row(
      "icl_banking77_5900shot_balance",
      "card question\nlabel: 7",
    ),
  ];
  assert.deepEqual(
    filterSelectedMabRows(rows).map((entry) => entry.metadata.source),
    [
      "factconsolidation_sh_6k",
      "icl_banking77_5900shot_balance",
    ],
  );

  const streams = prepareMabStreams(rows);
  assert.deepEqual(
    streams.map((stream) => stream.source),
    [
      "icl_banking77_5900shot_balance",
      "factconsolidation_sh_6k",
    ],
  );
  assert.deepEqual(
    {
      task: streams[1]?.task,
      stratum: streams[1]?.stratum,
      hop: streams[1]?.hop,
    },
    {
      task: "fact-consolidation",
      stratum: "6k",
      hop: "single-hop",
    },
  );
  assert.match(streams[0]?.contextHash ?? "", /^[a-f0-9]{64}$/);
});

test("selects an even deterministic question count from every stream", () => {
  const streams = prepareMabStreams([
    row(
      "icl_banking77_5900shot_balance",
      "card question\nlabel: 7",
    ),
    row(
      "factconsolidation_mh_6k",
      "Here is a list of facts:\n0. The current value is blue.",
    ),
  ]);
  const first = selectMabQuestions(streams, 2);
  const second = selectMabQuestions(streams, 2);
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.deepEqual(
    first.map((question) => question.questionIndex),
    [0, 3, 0, 3],
  );
  assert.deepEqual(
    first.map((question) => question.qaPairId),
    [
      "icl_banking77_5900shot_balance_no0",
      "icl_banking77_5900shot_balance_no3",
      "factconsolidation_mh_6k_no0",
      "factconsolidation_mh_6k_no3",
    ],
  );
});

test("flattens answer variants without changing their order", () => {
  assert.deepEqual(
    flattenMabAnswers([["first"], [["second", ["third"]]], "fourth"]),
    ["first", "second", "third", "fourth"],
  );
});

test("formats official-style Banking77 and FactConsolidation prompts", () => {
  const banking = formatMabQueryPrompt(
    "icl_banking77_5900shot_balance",
    "Why was my card declined?",
  );
  assert.match(banking, /Return only the numeric label continuation/);
  assert.match(banking, /Why was my card declined\?$/);

  const conflict = formatMabQueryPrompt(
    "factconsolidation_mh_6k",
    "What is the current value?",
  );
  assert.match(conflict, /newer fact has larger serial number/);
  assert.match(
    conflict,
    /Based on the provided Knowledge Pool, What is the current value\?\s+\nAnswer:$/,
  );
});

test("scores normalized exact and substring matches using raw and parsed output", () => {
  assert.deepEqual(
    scoreMabOutput(
      "icl_banking77_5900shot_balance",
      "Answer: The 28.\nExplanation follows.",
      [["28"]],
    ),
    {
      metric: "exact_match",
      score: 1,
      rawScore: 0,
      parsedScore: 1,
      parsedOutput: "The 28.",
    },
  );
  assert.equal(
    scoreMabOutput(
      "icl_banking77_5900shot_balance",
      "The correct labels are 28 and 29",
      [["28"]],
    ).score,
    0,
  );
  assert.equal(
    scoreMabOutput(
      "icl_banking77_5900shot_balance",
      "label: 28",
      [["28"]],
    ).score,
    0,
  );
  assert.equal(
    scoreMabOutput(
      "factconsolidation_sh_32k",
      "The newest fact says: Donald Trump.",
      [["Donald Trump"]],
    ).score,
    1,
  );
  assert.equal(
    scoreMabOutput(
      "factconsolidation_sh_32k",
      "The answer is Donald Duck.",
      [["Donald Trump"]],
    ).score,
    0,
  );
});

test("parses an Answer line first and otherwise extracts the first line", () => {
  assert.equal(
    parseMabOutput("Reasoning first.\nAnswer: Belgium\nMore text."),
    "Belgium",
  );
  assert.equal(parseMabOutput("Belgium\nMore text."), "Belgium");
  assert.equal(parseMabOutput("Answer: Answer: Belgium"), "Belgium");
});
