import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  MAB_CAUSAL_ARMS,
  freezeMabCausalManifest,
  readMabCausalManifest,
  runMabCausalBatch,
  type MabCausalManifest,
} from "../src/mab-causal.js";
import type {
  MabPreparedStream,
  MabSource,
} from "../src/mab-adapter.js";
import type {
  MabBatchModel,
  MabExecutionPolicy,
} from "../src/mab-batch.js";
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

const sources = [
  "factconsolidation_mh_6k",
  "factconsolidation_mh_32k",
] as const;

function prepared(source: MabSource): MabPreparedStream {
  const question = `${source} question`;
  return {
    source,
    task:
      source === "icl_banking77_5900shot_balance"
        ? "test-time-learning"
        : "fact-consolidation",
    stratum: source.includes("32k") ? "32k" : "6k",
    hop:
      source === "icl_banking77_5900shot_balance"
        ? null
        : source.includes("_mh_")
          ? "multi-hop"
          : "single-hop",
    contextHash: createHash("sha256")
      .update(`${source}-context`)
      .digest("hex"),
    chunks: [`${source} observation with answer 1.`],
    questions: [question],
    answers: [["1"]],
    qaPairIds: [`${source}_no0`],
  };
}

function model(
  maximumInvocationCostUsd = 0.0001,
): MabBatchModel {
  return {
    provider: "scripted",
    requestedId: "scripted",
    resolvedId: "scripted",
    requestedThinkingLevel: "off",
    effectiveThinkingLevel: "off",
    contextWindow: 100_000,
    maxOutputTokens: 1_000,
    costPerMillionTokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    maximumInvocationCostUsd,
  };
}

const execution: MabExecutionPolicy = {
  maxAttempts: 2,
  maxTurns: 3,
  timeoutMs: 10_000,
  wakeIdentitySelection: "model-memory-id-host-active-record-binding",
  acquisitionWorkMemory: "complete-mounted",
  answerWorkMemory: "wake-selected",
  questionIsolation: "fresh-runtime-and-cloned-store",
  evidenceRetention: "immutable-source-chunks-sha256",
  evidenceRetrieval: "shared-deterministic-bm25",
  evidenceCitationSelection:
    "model-evidence-id-host-reference-binding",
  evidencePromptProjection: "id-and-text-only",
  memoryCandidateIdentity: "host-validated-unique-and-insert-only",
  memoryWriteBinding: "model-candidate-id-host-content-binding",
  answerMemoryCandidates: "prohibited-without-external-feedback",
  answerMemoryWrites: "prohibited-without-external-feedback",
  answerSleepExecution: "deterministic-empty-when-no-candidates",
  workEvidenceComparison: "structured-competing-claims",
  evidenceTopK: 10,
};

function evidenceReference(source: string): string {
  const text = `${source} observation with answer 1.`;
  return `evidence/chunk-001.txt#sha256=${createHash("sha256")
    .update(text)
    .digest("hex")}`;
}

function semanticAcquisitionPhases(
  source: string,
): ScriptedPhaseStep[] {
  const record = {
    id: `${source}-semantic`,
    kind: "learning" as const,
    text: `${source} semantic memory with answer 1.`,
    evidence: evidenceReference(source),
    source: "observed" as const,
  };
  return [
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "No prior memory.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Observation acquired.",
        memoryCandidates: [record],
        summary: "Created semantic memory.",
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        writes: [{ candidateId: record.id, record }],
        summary: "Persisted semantic memory.",
      },
    },
  ];
}

function answerPhases(memoryId: string): ScriptedPhaseStep[] {
  return [
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [memoryId],
        summary: "Selected the frozen record.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "1",
        memoryCandidates: [],
        summary: "Answered from selected memory.",
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

async function freezeFixture(
  directory: string,
  options: {
    maximumCostUsd?: number;
    maximumInvocationCostUsd?: number;
  } = {},
): Promise<{
  manifest: MabCausalManifest;
  streams: MabPreparedStream[];
}> {
  const streams = sources.map(prepared);
  const manifest = await freezeMabCausalManifest({
    manifestPath: join(directory, "manifest.json"),
    batchId: "mab-causal-test",
    streams,
    exposedQuestionIds: streams.flatMap(
      (stream) => stream.qaPairIds,
    ),
    exposedManifestSha256: "a".repeat(64),
    forbiddenQuestionIds: ["forbidden-question"],
    forbiddenManifestSha256: ["b".repeat(64)],
    questionsPerSource: 1,
    repetitions: 1,
    model: model(options.maximumInvocationCostUsd),
    repository: { commit: "fixture", dirty: false },
    source: { wake: "fixture" },
    execution,
    thresholds: {
      confidenceLevel: 0.95,
      maximumFailureRate: 0.25,
      maximumCostUsd: options.maximumCostUsd ?? 1,
      bootstrapSamples: 100,
    },
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });
  return { manifest, streams };
}

test("shares frozen raw and semantic stores across isolated use arms", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "cortex-mab-causal-"),
  );
  temporaryDirectories.push(directory);
  const { manifest, streams } = await freezeFixture(directory);
  const acquisitionExecutors: ScriptedPhaseExecutor[] = [];
  const answerExecutors: ScriptedPhaseExecutor[] = [];
  const directExecutors: ScriptedDirectMemoryExecutor[] = [];
  const contexts: string[] = [];

  const report = await runMabCausalBatch({
    artifactDirectory: join(directory, "run"),
    manifest,
    streams,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      source: manifest.source,
    },
    createExecutors(context) {
      contexts.push(context.artifactDirectory);
      if (context.stage === "acquisition") {
        const phases = new ScriptedPhaseExecutor(
          semanticAcquisitionPhases(context.streamId),
        );
        acquisitionExecutors.push(phases);
        return {
          directMemoryExecutor:
            new ScriptedDirectMemoryExecutor([]),
          advisoryMemoryExecutor:
            new ScriptedAdvisoryMemoryExecutor([]),
          phaseExecutor: phases,
        };
      }
      if (context.condition === "regular") {
        const direct = new ScriptedDirectMemoryExecutor(["1"]);
        directExecutors.push(direct);
        return {
          directMemoryExecutor: direct,
          advisoryMemoryExecutor:
            new ScriptedAdvisoryMemoryExecutor([]),
          phaseExecutor: new ScriptedPhaseExecutor([]),
        };
      }
      const raw = context.artifactDirectory.includes("raw-enforced");
      const memoryId = raw
        ? `${context.streamId}.evidence-001`
        : `${context.streamId}-semantic`;
      const phases = new ScriptedPhaseExecutor(
        answerPhases(memoryId),
      );
      answerExecutors.push(phases);
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor:
          new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: phases,
      };
    },
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.semanticAcquisitions.length, 2);
  assert.equal(acquisitionExecutors.length, 2);
  assert.equal(answerExecutors.length, 4);
  assert.equal(directExecutors.length, 4);
  assert.equal(new Set(contexts).size, 10);
  assert.equal(report.reports.length, 8);
  assert.equal(
    report.reports.reduce(
      (sum, arm) => sum + arm.totalQuestions,
      0,
    ),
    8,
  );
  assert.ok(
    Object.values(report.aggregates).every(
      (aggregate) =>
        aggregate.correct === 2 &&
        aggregate.errors === 0,
    ),
  );
  assert.ok(
    report.contrasts.every(
      (contrast) => contrast.difference === 0,
    ),
  );
  assert.deepEqual(report.checks, {
    inputStoreIdentityMatched: true,
    noAnswerEvidence: true,
    noAnswerWrites: true,
    runComplete: true,
    modelMatched: true,
    repositoryMatched: true,
    sourceMatched: true,
    runtimeMatched: true,
    failureRateMet: true,
    costLimitMet: true,
  });

  for (const source of sources) {
    const byArm = new Map(
      report.reports
        .filter((arm) => arm.source === source)
        .map((arm) => [arm.arm, arm]),
    );
    assert.equal(
      byArm.get("raw-direct")?.inputMemorySha256,
      byArm.get("raw-enforced")?.inputMemorySha256,
    );
    assert.equal(
      byArm.get("raw-direct")?.inputMemoryFileSha256,
      byArm.get("raw-enforced")?.inputMemoryFileSha256,
    );
    assert.equal(
      byArm.get("semantic-direct")?.inputMemorySha256,
      byArm.get("semantic-enforced")?.inputMemorySha256,
    );
    assert.equal(
      byArm.get("semantic-direct")?.inputMemoryFileSha256,
      byArm.get("semantic-enforced")?.inputMemoryFileSha256,
    );
  }

  const directCalls = directExecutors.flatMap(
    (executor) => executor.calls,
  );
  assert.equal(directCalls.length, 4);
  assert.ok(
    directCalls.every(
      (call) =>
        call.memory.length === 1 && call.evidence.length === 0,
    ),
  );
  assert.ok(
    directCalls.some(
      (call) =>
        call.memory[0]?.text ===
        `${sources[0]} observation with answer 1.`,
    ),
  );
  assert.ok(
    directCalls.some(
      (call) =>
        call.memory[0]?.text ===
        `${sources[0]} semantic memory with answer 1.`,
    ),
  );

  for (const executor of answerExecutors) {
    assert.equal(executor.calls.length, 3);
    const wake = executor.calls[0];
    const work = executor.calls[1];
    const sleep = executor.calls[2];
    assert.equal(
      wake?.phase === "wake" ? wake.memory.length : undefined,
      1,
    );
    assert.equal(
      work?.phase === "work" ? work.evidence.length : undefined,
      0,
    );
    assert.equal(
      work?.phase === "work" ? work.memoryScope : undefined,
      "wake-selected",
    );
    assert.equal(
      work?.phase === "work"
        ? work.recalledMemory.length
        : undefined,
      1,
    );
    assert.equal(
      sleep?.phase === "sleep"
        ? sleep.writePolicy
        : undefined,
      "prohibit-unconfirmed",
    );
    executor.assertExhausted();
  }
  for (const executor of acquisitionExecutors) {
    assert.equal(executor.calls.length, 3);
    executor.assertExhausted();
  }
  assert.equal(
    (await stat(join(directory, "run", "batch-report.json"))).mode &
      0o777,
    0o600,
  );
});

test("retains an answer failure and continues all remaining arms", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "cortex-mab-causal-failure-"),
  );
  temporaryDirectories.push(directory);
  const { manifest, streams } = await freezeFixture(directory);
  let failed = false;
  let completedAnswerCalls = 0;

  const report = await runMabCausalBatch({
    artifactDirectory: join(directory, "run"),
    manifest,
    streams,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      source: manifest.source,
    },
    createExecutors(context) {
      if (context.stage === "acquisition") {
        return {
          directMemoryExecutor:
            new ScriptedDirectMemoryExecutor([]),
          advisoryMemoryExecutor:
            new ScriptedAdvisoryMemoryExecutor([]),
          phaseExecutor: new ScriptedPhaseExecutor(
            semanticAcquisitionPhases(context.streamId),
          ),
        };
      }
      if (context.condition === "regular") {
        return {
          directMemoryExecutor: {
            async execute() {
              if (!failed) {
                failed = true;
                throw new Error("scripted answer failure");
              }
              completedAnswerCalls += 1;
              return { output: "1", telemetry: emptyTelemetry() };
            },
          },
          advisoryMemoryExecutor:
            new ScriptedAdvisoryMemoryExecutor([]),
          phaseExecutor: new ScriptedPhaseExecutor([]),
        };
      }
      const raw = context.artifactDirectory.includes("raw-enforced");
      const memoryId = raw
        ? `${context.streamId}.evidence-001`
        : `${context.streamId}-semantic`;
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([]),
        advisoryMemoryExecutor:
          new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: new ScriptedPhaseExecutor(
          answerPhases(memoryId),
        ),
      };
    },
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.reports.length, 8);
  assert.equal(report.aggregates["raw-direct"].errors, 1);
  assert.equal(
    Object.values(report.aggregates).reduce(
      (sum, aggregate) => sum + aggregate.errors,
      0,
    ),
    1,
  );
  assert.equal(completedAnswerCalls, 3);
  assert.equal(report.checks.runComplete, true);
  assert.equal(report.checks.failureRateMet, true);
});

test("freezes only exposed non-holdout questions and enforces cost", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "cortex-mab-causal-guard-"),
  );
  temporaryDirectories.push(directory);
  const { manifest, streams } = await freezeFixture(directory, {
    maximumCostUsd: 1,
    maximumInvocationCostUsd: 2,
  });
  assert.equal(
    (await readMabCausalManifest(
      join(directory, "manifest.json"),
    )).schemaVersion,
    1,
  );
  assert.deepEqual(
    manifest.runs.map((run) => run.armOrder),
    [
      [...MAB_CAUSAL_ARMS],
      [
        "semantic-direct",
        "raw-enforced",
        "semantic-enforced",
        "raw-direct",
      ],
    ],
  );
  await assert.rejects(
    freezeMabCausalManifest({
      manifestPath: join(directory, "overlap.json"),
      batchId: "overlap",
      streams,
      exposedQuestionIds: streams.flatMap(
        (stream) => stream.qaPairIds,
      ),
      exposedManifestSha256: "a".repeat(64),
      forbiddenQuestionIds: [streams[0]!.qaPairIds[0]!],
      forbiddenManifestSha256: ["b".repeat(64)],
      questionsPerSource: 1,
      repetitions: 1,
      model: model(),
      repository: { commit: "fixture", dirty: false },
      source: { wake: "fixture" },
      execution,
      thresholds: manifest.thresholds,
    }),
    /overlaps the forbidden holdout/,
  );
  await assert.rejects(
    freezeMabCausalManifest({
      manifestPath: join(directory, "unknown.json"),
      batchId: "unknown",
      streams,
      exposedQuestionIds: [
        ...streams.flatMap((stream) => stream.qaPairIds),
        "unknown-question",
      ],
      exposedManifestSha256: "a".repeat(64),
      forbiddenQuestionIds: ["forbidden-question"],
      forbiddenManifestSha256: ["b".repeat(64)],
      questionsPerSource: 1,
      repetitions: 1,
      model: model(),
      repository: { commit: "fixture", dirty: false },
      source: { wake: "fixture" },
      execution,
      thresholds: manifest.thresholds,
    }),
    /unavailable question IDs/,
  );
  await assert.rejects(
    freezeMabCausalManifest({
      manifestPath: join(directory, "manifest.json"),
      batchId: "duplicate",
      streams,
      exposedQuestionIds: streams.flatMap(
        (stream) => stream.qaPairIds,
      ),
      exposedManifestSha256: "a".repeat(64),
      forbiddenQuestionIds: ["forbidden-question"],
      forbiddenManifestSha256: ["b".repeat(64)],
      questionsPerSource: 1,
      repetitions: 1,
      model: model(),
      repository: { commit: "fixture", dirty: false },
      source: { wake: "fixture" },
      execution,
      thresholds: manifest.thresholds,
    }),
    /EEXIST/,
  );

  let underlyingCalls = 0;
  const report = await runMabCausalBatch({
    artifactDirectory: join(directory, "cost-run"),
    manifest,
    streams,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      source: manifest.source,
    },
    createExecutors() {
      return {
        directMemoryExecutor: {
          async execute() {
            underlyingCalls += 1;
            return { output: "1", telemetry: emptyTelemetry() };
          },
        },
        advisoryMemoryExecutor:
          new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: {
          async execute() {
            underlyingCalls += 1;
            throw new Error("must be stopped before execution");
          },
        },
      };
    },
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });
  assert.equal(report.status, "cost-limited");
  assert.equal(underlyingCalls, 0);
  assert.equal(report.reports.length, 8);
  assert.equal(report.checks.runComplete, true);
  assert.equal(report.checks.costLimitMet, false);

  await assert.rejects(
    runMabCausalBatch({
      artifactDirectory: join(directory, "wrong-source"),
      manifest,
      streams,
      execution: {
        model: manifest.model,
        repository: manifest.repository,
        source: { wake: "changed" },
      },
      createExecutors() {
        throw new Error("must not create executors");
      },
    }),
    /execution source does not match/,
  );

  const wrongRuntime = structuredClone(manifest);
  wrongRuntime.runtime.node = "v0.0.0";
  await assert.rejects(
    runMabCausalBatch({
      artifactDirectory: join(directory, "wrong-runtime"),
      manifest: wrongRuntime,
      streams,
      execution: {
        model: wrongRuntime.model,
        repository: wrongRuntime.repository,
        source: wrongRuntime.source,
      },
      createExecutors() {
        throw new Error("must not create executors");
      },
    }),
    /runtime does not match/,
  );
});

test("rejects unsafe or provenance-incomplete causal manifests", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "cortex-mab-causal-manifest-"),
  );
  temporaryDirectories.push(directory);
  const { manifest } = await freezeFixture(directory);

  async function expectRejectedManifest(
    name: string,
    mutate: (candidate: MabCausalManifest) => void,
    expected: RegExp,
  ): Promise<void> {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    const path = join(directory, name);
    await writeFile(path, JSON.stringify(candidate));
    await assert.rejects(readMabCausalManifest(path), expected);
  }

  await expectRejectedManifest(
    "zero-attempts.json",
    (candidate) => {
      candidate.protocol.execution.maxAttempts = 0;
    },
    /invalid causal|positive integer/,
  );
  await expectRejectedManifest(
    "zero-turns.json",
    (candidate) => {
      candidate.protocol.execution.maxTurns = 0;
    },
    /invalid causal|positive integer/,
  );
  await expectRejectedManifest(
    "zero-reservation.json",
    (candidate) => {
      candidate.model.maximumInvocationCostUsd = 0;
    },
    /invalid causal/,
  );
  await expectRejectedManifest(
    "wrong-benchmark.json",
    (candidate) => {
      candidate.benchmark.parquetSha256 = {
        ...candidate.benchmark.parquetSha256,
        Fact_Consolidation: "c".repeat(64),
      };
    },
    /benchmark checksums are invalid/,
  );
  await expectRejectedManifest(
    "no-holdout.json",
    (candidate) => {
      candidate.questionSelection.forbiddenManifestSha256 = [];
    },
    /invalid causal|forbidden holdout provenance/,
  );
  await expectRejectedManifest(
    "duplicate-question.json",
    (candidate) => {
      candidate.streams[1]!.questions[0] = structuredClone(
        candidate.streams[0]!.questions[0]!,
      );
    },
    /duplicate question IDs/,
  );
});

test("redacts frozen question IDs from causal validation errors", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "cortex-mab-causal-redaction-"),
  );
  temporaryDirectories.push(directory);
  const { manifest, streams } = await freezeFixture(directory);
  const originalId = streams[0]!.qaPairIds[0]!;
  const changedStreams = structuredClone(streams);
  changedStreams[0]!.qaPairIds[0] = "changed-question";

  await assert.rejects(
    runMabCausalBatch({
      artifactDirectory: join(directory, "redacted-run"),
      manifest,
      streams: changedStreams,
      execution: {
        model: manifest.model,
        repository: manifest.repository,
        source: manifest.source,
      },
      createExecutors() {
        throw new Error("must not create executors");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /frozen question validation failed/);
      assert.ok(!error.message.includes(originalId));
      return true;
    },
  );

  const manifestBytes = await readFile(
    join(directory, "manifest.json"),
    "utf8",
  );
  assert.ok(manifestBytes.includes(originalId));
});
