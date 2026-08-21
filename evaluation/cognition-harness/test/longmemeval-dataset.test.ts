import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  loadLongMemEvalPilot,
  parseLongMemEvalItem,
  prepareLongMemEvalPilot,
  type LongMemEvalItem,
  type LongMemEvalQuestionType,
} from "../src/longmemeval-dataset.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function item(
  questionId: string,
  questionType: LongMemEvalQuestionType,
  oracle = false,
): LongMemEvalItem {
  const sessions = [
    [{ role: "user" as const, content: `Distractor for ${questionId}.` }],
    [
      {
        role: "user" as const,
        content: `Evidence for ${questionId}.`,
        has_answer: true as const,
      },
    ],
  ];
  return {
    question_id: questionId,
    question_type: questionType,
    question: `Question for ${questionId}?`,
    answer: `Answer for ${questionId}.`,
    question_date: "2026-08-20",
    haystack_session_ids: oracle ? [`${questionId}-evidence`] : [
      `${questionId}-distractor`,
      `${questionId}-evidence`,
    ],
    haystack_dates: oracle
      ? ["2026-08-19"]
      : ["2026-08-18", "2026-08-19"],
    haystack_sessions: oracle ? [sessions[1]!] : sessions,
    answer_session_ids: [`${questionId}-evidence`],
  };
}

test("streams, hashes, and deterministically selects a stratified pilot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-"));
  temporaryDirectories.push(directory);
  const historyPath = join(directory, "history.json");
  const oraclePath = join(directory, "oracle.json");
  const history = [
    item("update-1", "knowledge-update"),
    item("update-2", "knowledge-update"),
    item("temporal-1", "temporal-reasoning"),
    item("temporal-2", "temporal-reasoning"),
  ];
  const oracle = [...history]
    .reverse()
    .map((entry) => {
      const oracleItem = item(entry.question_id, entry.question_type, true);
      oracleItem.question_date = "2030-01-01";
      oracleItem.haystack_dates = ["2029-12-31"];
      return oracleItem;
    });
  await writeFile(historyPath, JSON.stringify(history), "utf8");
  await writeFile(oraclePath, JSON.stringify(oracle), "utf8");

  const first = await prepareLongMemEvalPilot({
    historyPath,
    oraclePath,
    outputDirectory: join(directory, "prepared-1"),
    itemsPerStratum: 1,
    seed: "fixed-seed",
    strata: ["knowledge-update", "temporal-reasoning"],
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });
  const second = await prepareLongMemEvalPilot({
    historyPath,
    oraclePath,
    outputDirectory: join(directory, "prepared-2"),
    itemsPerStratum: 1,
    seed: "fixed-seed",
    strata: ["knowledge-update", "temporal-reasoning"],
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });

  assert.deepEqual(first.items, second.items);
  assert.equal(first.historySource.itemCount, 4);
  assert.equal(first.oracleSource.itemCount, 4);
  assert.match(first.historySource.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.items.length, 2);
  assert.equal(
    (await stat(join(directory, "prepared-1", "manifest.json"))).mode & 0o777,
    0o600,
  );
  const prepared = JSON.parse(
    await readFile(
      join(directory, "prepared-1", first.items[0]!.file),
      "utf8",
    ),
  ) as { history: LongMemEvalItem; oracle: LongMemEvalItem };
  assert.equal(prepared.history.haystack_sessions.length, 2);
  assert.equal(prepared.oracle.haystack_sessions.length, 1);
  const loaded = await loadLongMemEvalPilot(
    join(directory, "prepared-1"),
  );
  assert.equal(loaded.items.length, 2);
  assert.equal(loaded.manifestSha256.length, 64);

  await assert.rejects(
    prepareLongMemEvalPilot({
      historyPath,
      oraclePath,
      outputDirectory: join(directory, "prepared-1"),
      itemsPerStratum: 1,
      seed: "fixed-seed",
      strata: ["knowledge-update", "temporal-reasoning"],
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST",
  );
});

test("rejects malformed LongMemEval items before preparation", () => {
  const malformed = {
    ...item("bad-item", "multi-session"),
    haystack_dates: [],
  };

  assert.throws(
    () => parseLongMemEvalItem(malformed, 0),
    /must have equal lengths/,
  );
});

test("preserves official has_answer false annotations", () => {
  const annotated = item("annotated-item", "single-session-user");
  annotated.haystack_sessions[0]![0]!.has_answer = false;

  const parsed = parseLongMemEvalItem(annotated, 0);

  assert.equal(parsed.haystack_sessions[0]?.[0]?.has_answer, false);
});

test("normalizes official numeric answers to strings", () => {
  const numeric = { ...item("numeric-item", "multi-session"), answer: 3 };

  const parsed = parseLongMemEvalItem(numeric, 0);

  assert.equal(parsed.answer, "3");
});

test("rejects a selected item missing from the oracle dataset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-"));
  temporaryDirectories.push(directory);
  const historyPath = join(directory, "history.json");
  const oraclePath = join(directory, "oracle.json");
  await writeFile(
    historyPath,
    JSON.stringify([item("update-1", "knowledge-update")]),
    "utf8",
  );
  await writeFile(oraclePath, "[]", "utf8");
  const outputDirectory = join(directory, "prepared");

  await assert.rejects(
    prepareLongMemEvalPilot({
      historyPath,
      oraclePath,
      outputDirectory,
      itemsPerStratum: 1,
      seed: "fixed-seed",
      strata: ["knowledge-update"],
    }),
    /oracle dataset is missing selected question/,
  );
  await assert.rejects(stat(outputDirectory), { code: "ENOENT" });
});

test("rejects a full-history file passed as the oracle control", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-longmemeval-"));
  temporaryDirectories.push(directory);
  const historyPath = join(directory, "history.json");
  const history = [item("update-1", "knowledge-update")];
  await writeFile(historyPath, JSON.stringify(history), "utf8");

  await assert.rejects(
    prepareLongMemEvalPilot({
      historyPath,
      oraclePath: historyPath,
      outputDirectory: join(directory, "prepared"),
      itemsPerStratum: 1,
      seed: "fixed-seed",
      strata: ["knowledge-update"],
    }),
    /oracle item must contain exactly the evidence sessions/,
  );
});
