import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  MAB_SELECTED_SOURCES,
  type MabPreparedStream,
  type MabSource,
} from "../src/mab-adapter.js";
import {
  defaultMabThresholds,
  freezeMabManifest,
  readMabManifest,
  runMabBatch,
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

function prepared(source: MabSource): MabPreparedStream {
  const banking = source === "icl_banking77_5900shot_balance";
  return {
    source,
    task: banking ? "test-time-learning" : "fact-consolidation",
    stratum: banking ? "banking77" : source.includes("32k") ? "32k" : "6k",
    hop: banking ? null : source.includes("_mh_") ? "multi-hop" : "single-hop",
    contextHash: source.padEnd(64, "0").slice(0, 64),
    chunks: [`${source} observation with answer 1.`],
    questions: [`${source} question`],
    answers: [["1"]],
    qaPairIds: [`${source}_no0`],
  };
}

function cortexPhases(source: string): ScriptedPhaseStep[] {
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
        output: "Acknowledged.",
        memoryCandidates: [
          {
            id: `${source}-memory`,
            kind: "learning",
            text: `${source} observation with answer 1.`,
            evidence: "observation",
            source: "observed",
          },
        ],
        summary: "Captured observation.",
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        writes: [
          {
            candidateId: `${source}-memory`,
            record: {
              id: `${source}-memory`,
              kind: "learning",
              text: `${source} observation with answer 1.`,
              evidence: "observation",
              source: "observed",
            },
          },
        ],
        summary: "Persisted observation.",
      },
    },
  ];
}

function cortexAnswerPhases(): ScriptedPhaseStep[] {
  return [
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "Selection is diagnostic.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "1",
        memoryCandidates: [],
        summary: "Answered.",
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

test("freezes an immutable balanced manifest and runs all conditions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-batch-"));
  temporaryDirectories.push(directory);
  const streams = MAB_SELECTED_SOURCES.map(prepared);
  const manifestPath = join(directory, "manifest.json");
  const manifest = await freezeMabManifest({
    manifestPath,
    batchId: "mab-test",
    streams,
    questionsPerStream: 1,
    repetitions: 1,
    model: {
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
      maximumInvocationCostUsd: 0.0001,
    },
    repository: { commit: "fixture", dirty: false },
    source: { wake: "fixture" },
    execution: {
      maxAttempts: 2,
      maxTurns: 3,
      timeoutMs: 10_000,
      workMemory: "complete-mounted",
      questionIsolation: "fresh-runtime-and-cloned-store",
    },
    thresholds: {
      ...defaultMabThresholds(),
      minimumAccuracyImprovement: 0,
      confidenceLevel: 0.8,
      maximumCostUsd: 1,
      bootstrapSamples: 100,
    },
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });

  await assert.rejects(
    freezeMabManifest({
      manifestPath,
      batchId: "second",
      streams,
      questionsPerStream: 1,
      repetitions: 1,
      model: manifest.model,
      repository: manifest.repository,
      source: manifest.source,
      execution: manifest.protocol.execution,
      thresholds: manifest.thresholds,
    }),
    /EEXIST/,
  );
  assert.equal((await readMabManifest(manifestPath)).runs.length, 5);
  assert.deepEqual(
    manifest.runs.map((run) => run.conditionOrder),
    [
      ["regular", "advisory", "cortex"],
      ["advisory", "cortex", "regular"],
      ["cortex", "regular", "advisory"],
      ["regular", "advisory", "cortex"],
      ["advisory", "cortex", "regular"],
    ],
  );
  await assert.rejects(
    runMabBatch({
      artifactDirectory: join(directory, "wrong-model"),
      manifest,
      streams,
      execution: {
        model: { ...manifest.model, resolvedId: "other-model" },
        repository: manifest.repository,
        source: manifest.source,
      },
      createExecutors() {
        throw new Error("must not initialize executors");
      },
    }),
    /execution model does not match/,
  );

  const report = await runMabBatch({
    artifactDirectory: join(directory, "run"),
    manifest,
    streams,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      source: manifest.source,
    },
    createExecutors(context) {
      const advisory =
        context.stage === "acquisition"
          ? new ScriptedAdvisoryMemoryExecutor([
              {
                output: "Acknowledged.",
                memoryCandidates: [
                  {
                    id: `${context.streamId}-advisory`,
                    kind: "learning",
                    text: `${context.streamId} observation with answer 1.`,
                    evidence: "observation",
                    source: "observed",
                  },
                ],
                telemetry: emptyTelemetry(),
              },
            ])
          : new ScriptedAdvisoryMemoryExecutor([
              {
                output: "1",
                memoryCandidates: [],
                telemetry: emptyTelemetry(),
              },
            ]);
      const phases =
        context.stage === "acquisition"
          ? cortexPhases(context.streamId)
          : cortexAnswerPhases();
      return {
        directMemoryExecutor: new ScriptedDirectMemoryExecutor(["1"]),
        advisoryMemoryExecutor: advisory,
        phaseExecutor: new ScriptedPhaseExecutor(phases),
      };
    },
    now: () => new Date("2026-08-21T00:00:00.000Z"),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.reports.length, 15);
  assert.equal(report.aggregates.regular.accuracy, 1);
  assert.equal(report.aggregates.advisory.accuracy, 1);
  assert.equal(report.aggregates.cortex.accuracy, 1);
  assert.equal(report.contrasts[0]?.difference, 0);
  assert.equal(report.criteria.supported, false);
});

test("stops before a model call can exceed the cost limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-cost-"));
  temporaryDirectories.push(directory);
  const streams = MAB_SELECTED_SOURCES.map(prepared);
  const manifest = await freezeMabManifest({
    manifestPath: join(directory, "manifest.json"),
    batchId: "mab-cost-test",
    streams,
    questionsPerStream: 1,
    repetitions: 1,
    model: {
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
      maximumInvocationCostUsd: 0.002,
    },
    repository: { commit: "fixture", dirty: false },
    source: { wake: "fixture" },
    execution: {
      maxAttempts: 2,
      maxTurns: 3,
      timeoutMs: 10_000,
      workMemory: "complete-mounted",
      questionIsolation: "fresh-runtime-and-cloned-store",
    },
    thresholds: {
      ...defaultMabThresholds(),
      maximumCostUsd: 0.001,
      bootstrapSamples: 10,
    },
  });
  const costlyTelemetry = emptyTelemetry();
  costlyTelemetry.usage.costUsd = 0.002;
  let modelCalls = 0;

  const report = await runMabBatch({
    artifactDirectory: join(directory, "run"),
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
            modelCalls += 1;
            return { output: "1", telemetry: costlyTelemetry };
          },
        },
        advisoryMemoryExecutor: new ScriptedAdvisoryMemoryExecutor([]),
        phaseExecutor: new ScriptedPhaseExecutor([]),
      };
    },
  });

  assert.equal(report.status, "cost-limit");
  assert.equal(report.reports.length, 1);
  assert.equal(modelCalls, 0);
  assert.equal(report.criteria.runComplete, false);
  assert.equal(report.criteria.supported, false);
});
