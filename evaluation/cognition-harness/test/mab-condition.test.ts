import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { runMabCondition, type MabStream } from "../src/mab-condition.js";
import {
  ScriptedAdvisoryMemoryExecutor,
  ScriptedDirectMemoryExecutor,
  ScriptedPhaseExecutor,
  type ScriptedPhaseStep,
} from "../src/scripted-executor.js";
import { emptyTelemetry } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const stream: MabStream = {
  id: "banking-fixture",
  source: "icl_banking77_5900shot_balance",
  competency: "test-time-learning",
  stratum: "banking77",
  chunks: ["A failed disposable card maps to label 28."],
  questions: [
    {
      id: "question-1",
      prompt: "Label a failed disposable card.",
      retrievalQuery: "failed disposable card",
      answers: ["28"],
      metric: "exact_match",
    },
  ],
};

const evidenceReference =
  `evidence/chunk-001.txt#sha256=${createHash("sha256")
    .update(stream.chunks[0]!)
    .digest("hex")}`;

function phases(): ScriptedPhaseStep[] {
  return [
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "No memory.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Observation acknowledged.",
        memoryCandidates: [
          {
            id: "label-28",
            kind: "learning",
            text: "A failed disposable card maps to label 28.",
            evidence: evidenceReference,
            source: "observed",
          },
        ],
        summary: "Captured the example.",
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        writes: [
          {
            candidateId: "label-28",
            record: {
              id: "label-28",
              kind: "learning",
              text: "A failed disposable card maps to label 28.",
              evidence: evidenceReference,
              source: "observed",
            },
          },
        ],
        summary: "Persisted the example.",
      },
    },
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "Selection is diagnostic only.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "28",
        memoryCandidates: [],
        summary: "Answered from complete memory.",
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        writes: [],
        summary: "No write.",
      },
    },
  ];
}

test("runs regular raw persistence without acquisition model calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-condition-"));
  temporaryDirectories.push(directory);
  const direct = new ScriptedDirectMemoryExecutor(["28"]);
  let factoryCalls = 0;
  const report = await runMabCondition({
    artifactDirectory: directory,
    stream,
    condition: "regular",
    repetition: 1,
    model: "scripted",
    evidenceTopK: 10,
    createExecutors() {
      factoryCalls += 1;
      return {
        directMemoryExecutor: direct,
        advisoryMemoryExecutor: new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: new ScriptedPhaseExecutor([]),
      };
    },
    score(output, question) {
      return question.answers.includes(output);
    },
  });

  assert.equal(report.status, "completed");
  assert.equal(report.acquisition.memoryRecords, 1);
  assert.equal(report.correct, 1);
  assert.equal(report.questions[0]?.memoryRecordsBefore, 0);
  assert.equal(report.questions[0]?.retrieval.documents.length, 1);
  assert.equal(factoryCalls, 1);
  assert.equal(direct.calls[0]?.memory.length, 0);
  assert.equal(direct.calls[0]?.evidence[0]?.text, stream.chunks[0]);
  assert.equal((await stat(join(directory, "report.json"))).mode & 0o777, 0o600);
});

test("runs advisory acquisition and delayed use with isolated calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-condition-"));
  temporaryDirectories.push(directory);
  const acquire = new ScriptedAdvisoryMemoryExecutor([
    {
      output: "Acknowledged.",
      memoryCandidates: [
        {
          id: "label-28",
          kind: "learning",
          text: "A failed disposable card maps to label 28.",
          evidence: evidenceReference,
          source: "observed",
        },
      ],
      telemetry: emptyTelemetry(),
    },
  ]);
  const answer = new ScriptedAdvisoryMemoryExecutor([
    {
      output: "28",
      memoryCandidates: [],
      telemetry: emptyTelemetry(),
    },
  ]);

  const report = await runMabCondition({
    artifactDirectory: directory,
    stream,
    condition: "advisory",
    repetition: 1,
    model: "scripted",
    evidenceTopK: 10,
    createExecutors(context) {
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor:
          context.stage === "acquisition" ? acquire : answer,
        phaseExecutor: new ScriptedPhaseExecutor([]),
      };
    },
    score(output, question) {
      return question.answers.includes(output);
    },
  });

  assert.equal(report.status, "completed");
  assert.equal(report.acquisition.completedChunks, 1);
  assert.equal(report.correct, 1);
  assert.equal(answer.calls[0]?.memory[0]?.id, "label-28");
  assert.equal(
    acquire.calls[0]?.evidence[0]?.reference,
    evidenceReference,
  );
  assert.equal(answer.calls[0]?.evidence[0]?.text, stream.chunks[0]);
  assert.equal(
    report.questions[0]?.retrieval.documents[0]?.id,
    "banking-fixture.evidence-001",
  );
  assert.equal(acquire.calls[0]?.mode, "acquire");
  assert.equal(answer.calls[0]?.mode, "answer");
});

test("runs Cortex acquisition and answers with complete mounted memory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-condition-"));
  temporaryDirectories.push(directory);
  const phaseExecutor = new ScriptedPhaseExecutor(phases());

  const report = await runMabCondition({
    artifactDirectory: directory,
    stream,
    condition: "cortex",
    repetition: 1,
    model: "scripted",
    evidenceTopK: 10,
    createExecutors() {
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor: new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor,
      };
    },
    score(output, question) {
      return question.answers.includes(output);
    },
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.acquisition.memoryRecords, 1);
  assert.equal(report.correct, 1);
  const acquisitionWork = phaseExecutor.calls[1];
  const evaluationWork = phaseExecutor.calls[4];
  assert.equal(
    acquisitionWork?.phase === "work"
      ? acquisitionWork.memoryScope
      : undefined,
    "complete-mounted",
  );
  assert.equal(
    acquisitionWork?.phase === "work"
      ? acquisitionWork.evidence[0]?.reference
      : undefined,
    evidenceReference,
  );
  assert.equal(
    evaluationWork?.phase === "work"
      ? evaluationWork.recalledMemory[0]?.text
      : undefined,
    "A failed disposable card maps to label 28.",
  );
  assert.equal(
    evaluationWork?.phase === "work"
      ? evaluationWork.evidence[0]?.text
      : undefined,
    stream.chunks[0],
  );
  phaseExecutor.assertExhausted();
});

test("rejects advisory acquisition candidates with unresolved evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-condition-"));
  temporaryDirectories.push(directory);
  const report = await runMabCondition({
    artifactDirectory: directory,
    stream,
    condition: "advisory",
    repetition: 1,
    model: "scripted",
    evidenceTopK: 10,
    createExecutors() {
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor: new ScriptedAdvisoryMemoryExecutor([
          {
            output: "Acknowledged.",
            memoryCandidates: [
              {
                id: "ungrounded",
                kind: "learning",
                text: "A claim without durable evidence.",
                evidence: "current observation",
                source: "observed",
              },
            ],
            telemetry: emptyTelemetry(),
          },
        ]),
        phaseExecutor: new ScriptedPhaseExecutor([]),
      };
    },
    score() {
      return false;
    },
  });

  assert.equal(report.status, "error");
  assert.match(
    report.acquisition.error?.message ?? "",
    /unresolved evidence citations/,
  );
  assert.equal(report.questions[0]?.status, "error");
});

test("retains every question as an error when acquisition fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-condition-"));
  temporaryDirectories.push(directory);
  const report = await runMabCondition({
    artifactDirectory: directory,
    stream,
    condition: "advisory",
    repetition: 1,
    model: "scripted",
    evidenceTopK: 10,
    createExecutors() {
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor: new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: new ScriptedPhaseExecutor([]),
      };
    },
    score() {
      return false;
    },
  });

  assert.equal(report.status, "error");
  assert.equal(report.acquisition.status, "error");
  assert.equal(report.totalQuestions, 1);
  assert.equal(report.errors, 1);
  assert.equal(report.questions[0]?.error?.name, "AcquisitionError");
});
