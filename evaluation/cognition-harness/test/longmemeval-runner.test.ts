import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  LONGMEMEVAL_DATASET,
  type LoadedLongMemEvalPilot,
  type LongMemEvalItem,
  type LongMemEvalPreparedItem,
} from "../src/longmemeval-dataset.js";
import {
  longMemEvalMemoryId,
  runLongMemEvalPilot,
} from "../src/longmemeval-runner.js";
import {
  ScriptedBaselineExecutor,
  ScriptedDirectMemoryExecutor,
  ScriptedPhaseExecutor,
} from "../src/scripted-executor.js";
import type { BaselineExecutor } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function historyItem(oracle = false): LongMemEvalItem {
  const evidence = [
    {
      role: "user" as const,
      content:
        "Project Ember release notes must end with the marker CANARY-GREEN.",
      has_answer: true as const,
    },
  ];
  return {
    question_id: "single-session-user-test",
    question_type: "single-session-user",
    question: "Which marker must end Project Ember release notes?",
    answer: "CANARY-GREEN",
    question_date: "2026-08-20",
    haystack_session_ids: oracle
      ? ["evidence-session"]
      : ["distractor-session", "evidence-session"],
    haystack_dates: oracle
      ? ["2026-08-19"]
      : ["2026-08-18", "2026-08-19"],
    haystack_sessions: oracle
      ? [evidence]
      : [
          [
            {
              role: "assistant",
              content: "Atlas uses blue buttons.",
            },
          ],
          evidence,
        ],
    answer_session_ids: ["evidence-session"],
  };
}

function prepared(abstention = false): LoadedLongMemEvalPilot {
  const history = historyItem();
  const oracle = historyItem(true);
  oracle.question_date = "2030-01-01";
  oracle.haystack_dates = ["2029-12-31"];
  if (abstention) {
    history.question_id = "single-session-user-test_abs";
    history.question = "Which nonexistent marker was adopted?";
    history.answer = "I don't know.";
    oracle.question_id = history.question_id;
    oracle.question = history.question;
    oracle.answer = history.answer;
  }
  const item: LongMemEvalPreparedItem = {
    stratum: abstention ? "abstention" : "single-session-user",
    history,
    oracle,
  };
  return {
    directory: "/fixture",
    manifestSha256: "a".repeat(64),
    manifest: {
      schemaVersion: 1,
      benchmark: "longmemeval-cleaned",
      createdAt: "2026-08-21T00:00:00.000Z",
      dataset: LONGMEMEVAL_DATASET,
      seed: "fixture",
      itemsPerStratum: 1,
      strata: ["single-session-user"],
      historySource: {
        file: "history.json",
        bytes: 1,
        sha256: "b".repeat(64),
        itemCount: 1,
      },
      oracleSource: {
        file: "oracle.json",
        bytes: 1,
        sha256: "c".repeat(64),
        itemCount: 1,
      },
      items: [
        {
          questionId: item.history.question_id,
          questionType: item.history.question_type,
          stratum: item.stratum,
          file: `items/${item.history.question_id}.json`,
          sha256: "d".repeat(64),
        },
      ],
    },
    items: [item],
  };
}

function cortexExecutor(
  selectedMemoryIds = [longMemEvalMemoryId("evidence-session")],
  output = "CANARY-GREEN",
): ScriptedPhaseExecutor {
  return new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds,
        summary: "Selected the evidence session.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output,
        memoryCandidates: [],
        summary: "Answered from the selected session.",
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        writes: [],
        summary: "No new durable memory.",
      },
    },
  ]);
}

test("runs isolated LongMemEval conditions and records retrieval evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-run-"));
  temporaryDirectories.push(directory);
  const direct = new ScriptedDirectMemoryExecutor(["CANARY-GREEN"]);
  const baseline = new ScriptedBaselineExecutor(["I don't know."]);
  const cortex = cortexExecutor();

  const report = await runLongMemEvalPilot({
    prepared: prepared(),
    artifactDirectory: directory,
    retrievalLimit: 1,
    createExecutors() {
      return {
        baselineExecutor: baseline,
        directMemoryExecutor: direct,
        phaseExecutor: cortex,
      };
    },
    model: {
      provider: "scripted",
      requestedId: "scripted",
      resolvedId: "scripted",
      thinkingLevel: "off",
    },
    source: { digest: "fixture" },
    repository: { commit: "fixture", dirty: false },
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.conditions.stateless.completed, 1);
  assert.equal(report.conditions.oracle.diagnosticNormalizedExactMatches, 1);
  assert.equal(report.conditions["cortex-bm25"].telemetry.attempts, 3);
  assert.equal(report.retrieval.candidateFullRecall, 1);
  assert.equal(report.retrieval.selectedFullRecall, 1);
  const cortexEvidence =
    report.items[0]?.conditions["cortex-bm25"].evidence;
  assert.ok(cortexEvidence && "retrieval" in cortexEvidence);
  assert.equal(cortexEvidence.retrieval.candidateRecall, 1);
  assert.equal(cortexEvidence.retrieval.selectedPrecision, 1);
  assert.equal(direct.calls[0]?.memory.length, 1);
  assert.equal(direct.calls[0]?.memory[0]?.source, "imported");
  assert.match(baseline.calls[0] ?? "", /as of 2026-08-20/);
  assert.match(direct.calls[0]?.task ?? "", /as of 2030-01-01/);
  direct.assertExhausted();
  cortex.assertExhausted();

  const hypotheses = await readFile(
    join(directory, "hypotheses", "stateless.jsonl"),
    "utf8",
  );
  assert.deepEqual(JSON.parse(hypotheses.trim()), {
    question_id: "single-session-user-test",
    hypothesis: "I don't know.",
  });
});

test("retains a failed LongMemEval condition without suppressing others", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-run-"));
  temporaryDirectories.push(directory);
  const failingBaseline: BaselineExecutor = {
    async execute() {
      throw new Error("baseline unavailable");
    },
  };
  const direct = new ScriptedDirectMemoryExecutor(["CANARY-GREEN"]);
  const cortex = cortexExecutor();

  const report = await runLongMemEvalPilot({
    prepared: prepared(),
    artifactDirectory: directory,
    retrievalLimit: 1,
    createExecutors() {
      return {
        baselineExecutor: failingBaseline,
        directMemoryExecutor: direct,
        phaseExecutor: cortex,
      };
    },
    model: {
      provider: "scripted",
      requestedId: "scripted",
      resolvedId: "scripted",
      thinkingLevel: "off",
    },
    source: { digest: "fixture" },
    repository: { commit: "fixture", dirty: false },
  });

  assert.equal(report.status, "completed-with-errors");
  assert.equal(report.conditions.stateless.errors, 1);
  assert.equal(report.conditions.oracle.completed, 1);
  assert.equal(report.conditions["cortex-bm25"].completed, 1);
  assert.equal(report.items[0]?.conditions.stateless.output, "");
  const hypotheses = await readFile(
    join(directory, "hypotheses", "stateless.jsonl"),
    "utf8",
  );
  assert.deepEqual(JSON.parse(hypotheses.trim()), {
    question_id: "single-session-user-test",
    hypothesis: "",
  });
});

test("partitions abstention retrieval by benchmark stratum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-run-"));
  temporaryDirectories.push(directory);
  const input = prepared(true);
  input.items[0]!.history.question_id = "q1_abs";
  input.items[0]!.history.haystack_session_ids = ["answer_q1_abs_1"];
  input.items[0]!.oracle.question_id = "q1_abs";
  input.items[0]!.oracle.haystack_session_ids = ["answer_q1_abs_1"];
  const direct = new ScriptedDirectMemoryExecutor(["I don't know."]);
  const phase = cortexExecutor([], "I don't know.");

  const report = await runLongMemEvalPilot({
    prepared: input,
    artifactDirectory: directory,
    retrievalLimit: 1,
    createExecutors() {
      return {
        baselineExecutor: new ScriptedBaselineExecutor(["I don't know."]),
        directMemoryExecutor: direct,
        phaseExecutor: phase,
      };
    },
    model: {
      provider: "scripted",
      requestedId: "scripted",
      resolvedId: "scripted",
      thinkingLevel: "off",
    },
    source: { digest: "fixture" },
    repository: { commit: "fixture", dirty: false },
  });

  assert.equal(report.retrieval.answerableItemsCompleted, 0);
  assert.equal(report.retrieval.abstentionItemsCompleted, 1);
  assert.equal(report.retrieval.abstentionItemsWithNoSelection, 1);
  assert.doesNotMatch(JSON.stringify(direct.calls), /_abs/);
  assert.doesNotMatch(JSON.stringify(phase.calls), /_abs/);
});
