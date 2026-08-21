import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  PROJECT_EMBER_DIRECT_MEMORY,
  PROJECT_EMBER_EXPECTED_OUTPUT,
  PROJECT_EMBER_RELEASE_NOTE,
} from "../src/project-ember-fixture.js";
import { runProjectEmberBatch } from "../src/project-ember-batch.js";
import {
  ScriptedBaselineExecutor,
  ScriptedDirectMemoryExecutor,
  ScriptedPhaseExecutor,
  type ScriptedPhaseStep,
} from "../src/scripted-executor.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function cortexSteps(): ScriptedPhaseStep[] {
  return [
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Convention acknowledged.",
        summary: "Captured the convention.",
        memoryCandidates: [
          {
            id: "ember-marker",
            kind: "decision",
            text: "Project Ember release notes end with CANARY-GREEN.",
            evidence: "operator instruction",
            source: "operator",
          },
        ],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "Persisted the convention.",
        writes: [
          {
            candidateId: "ember-marker",
            record: {
              id: "ember-marker",
              kind: "decision",
              text: "Project Ember release notes end with CANARY-GREEN.",
              evidence: "operator instruction",
              source: "operator",
            },
          },
        ],
      },
    },
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: ["ember-marker"],
        summary: "Selected the convention.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: PROJECT_EMBER_EXPECTED_OUTPUT,
        summary: "Applied the convention.",
        memoryCandidates: [],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "No new memory.",
        writes: [],
      },
    },
  ];
}

test("runs a stable balanced manifest and aggregates all three conditions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-ember-batch-"));
  temporaryDirectories.push(directory);
  const directExecutors: ScriptedDirectMemoryExecutor[] = [];

  const report = await runProjectEmberBatch({
    artifactDirectory: directory,
    batchId: "batch-test",
    trialCount: 3,
    createExecutors() {
      const directMemoryExecutor = new ScriptedDirectMemoryExecutor([
        PROJECT_EMBER_EXPECTED_OUTPUT,
      ]);
      directExecutors.push(directMemoryExecutor);
      return {
        baselineExecutor: new ScriptedBaselineExecutor([
          PROJECT_EMBER_RELEASE_NOTE,
        ]),
        directMemoryExecutor,
        phaseExecutor: new ScriptedPhaseExecutor(cortexSteps()),
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

  assert.equal(report.status, "passed");
  assert.deepEqual(
    report.manifest.conditionOrders.map((entry) => entry.order),
    [
      ["stateless", "direct-memory", "cortex"],
      ["direct-memory", "cortex", "stateless"],
      ["cortex", "stateless", "direct-memory"],
    ],
  );
  assert.equal(report.aggregates.stateless.passed, 3);
  assert.equal(report.aggregates.stateless.telemetry.attempts, 3);
  assert.equal(report.aggregates.stateless.telemetry.turns, 3);
  assert.equal(report.aggregates["direct-memory"].passed, 3);
  assert.equal(report.aggregates.cortex.passed, 3);
  assert.equal(report.aggregates.cortex.telemetry.attempts, 18);
  assert.equal(report.aggregates.cortex.telemetry.turns, 18);
  assert.equal(report.aggregates.cortex.checksPassed.memoryPrecisionPreserved, 3);
  assert.equal((await stat(join(directory, "manifest.json"))).mode & 0o777, 0o600);
  assert.equal(
    (await stat(join(directory, "trial-001", "report.json"))).mode & 0o777,
    0o600,
  );
  for (const executor of directExecutors) {
    assert.deepEqual(executor.calls[0]?.memory, [PROJECT_EMBER_DIRECT_MEMORY]);
  }
});

test("retains a failed arm and still runs the remaining conditions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-ember-batch-"));
  temporaryDirectories.push(directory);
  const directMemoryExecutor = new ScriptedDirectMemoryExecutor([
    PROJECT_EMBER_EXPECTED_OUTPUT,
  ]);
  const phaseExecutor = new ScriptedPhaseExecutor(cortexSteps());

  const report = await runProjectEmberBatch({
    artifactDirectory: directory,
    batchId: "batch-failure-test",
    trialCount: 1,
    createExecutors() {
      return {
        baselineExecutor: new ScriptedBaselineExecutor([]),
        directMemoryExecutor,
        phaseExecutor,
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

  assert.equal(report.status, "failed");
  assert.equal(report.trials[0]?.status, "error");
  assert.equal(report.trials[0]?.conditions.stateless.status, "error");
  assert.match(
    report.trials[0]?.conditions.stateless.error?.message ?? "",
    /no scripted baseline response/,
  );
  assert.equal(report.trials[0]?.conditions["direct-memory"].status, "completed");
  assert.equal(report.trials[0]?.conditions.cortex.status, "completed");
  assert.equal(report.aggregates.stateless.errors, 1);
  assert.equal(report.aggregates["direct-memory"].passed, 1);
  assert.equal(report.aggregates.cortex.passed, 1);
  directMemoryExecutor.assertExhausted();
  phaseExecutor.assertExhausted();

  const saved = JSON.parse(
    await readFile(join(directory, "batch-report.json"), "utf8"),
  ) as { trials: unknown[] };
  assert.equal(saved.trials.length, 1);
});

test("retains a completed learning session when Cortex recall fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-ember-batch-"));
  temporaryDirectories.push(directory);
  const phases = new ScriptedPhaseExecutor([
    ...cortexSteps().slice(0, 3),
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: ["invented-memory"],
        summary: "Selected an invalid record.",
      },
    },
  ]);

  const report = await runProjectEmberBatch({
    artifactDirectory: directory,
    batchId: "batch-partial-evidence-test",
    trialCount: 1,
    createExecutors() {
      return {
        baselineExecutor: new ScriptedBaselineExecutor([
          PROJECT_EMBER_RELEASE_NOTE,
        ]),
        directMemoryExecutor: new ScriptedDirectMemoryExecutor([
          PROJECT_EMBER_EXPECTED_OUTPUT,
        ]),
        phaseExecutor: phases,
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

  const cortex = report.trials[0]?.conditions.cortex;
  assert.equal(cortex?.status, "error");
  assert.equal(cortex?.telemetry.attempts, 4);
  assert.ok(cortex?.evidence && "learningSession" in cortex.evidence);
  assert.equal(cortex.evidence.learningSession?.memory.length, 1);
  phases.assertExhausted();
});
