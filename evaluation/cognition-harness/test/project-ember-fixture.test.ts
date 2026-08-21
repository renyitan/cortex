import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  PROJECT_EMBER_MARKER,
  runProjectEmberFixture,
} from "../src/project-ember-fixture.js";
import {
  ScriptedBaselineExecutor,
  ScriptedPhaseExecutor,
} from "../src/scripted-executor.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("scores the stateless baseline against two enforced Cortex sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-ember-fixture-"));
  temporaryDirectories.push(directory);
  const baseline = new ScriptedBaselineExecutor([
    "Project Ember now starts faster for a smoother launch.",
  ]);
  const phases = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Convention acknowledged.",
        summary: "Captured the explicit convention.",
        memoryCandidates: [
          {
            id: "ember-release-marker",
            kind: "decision",
            text: `Project Ember release notes end with ${PROJECT_EMBER_MARKER}.`,
            evidence: "explicit convention in the learning task",
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
            candidateId: "ember-release-marker",
            record: {
              id: "ember-release-marker",
              kind: "decision",
              text: `Project Ember release notes end with ${PROJECT_EMBER_MARKER}.`,
              evidence: "explicit convention in the learning task",
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
        selectedMemoryIds: ["ember-release-marker"],
        summary: "Recalled the release marker.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: `Project Ember now starts faster for a smoother launch. ${PROJECT_EMBER_MARKER}`,
        summary: "Applied the recalled convention.",
        memoryCandidates: [],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "No new durable memory.",
        writes: [],
      },
    },
  ]);

  const report = await runProjectEmberFixture({
    artifactDirectory: directory,
    phaseExecutor: phases,
    baselineExecutor: baseline,
    model: {
      provider: "scripted",
      requestedId: "scripted",
      resolvedId: "scripted",
      thinkingLevel: "off",
    },
    source: { fixture: true },
    repository: { commit: "fixture", dirty: false },
    now: () => new Date("2026-08-20T00:00:00.000Z"),
  });

  assert.equal(report.status, "passed");
  assert.deepEqual(report.score, {
    baselineMarkerAbsent: true,
    sleepPersistedMarker: true,
    wakeRecalledMarker: true,
    workAppliedMarker: true,
    passed: true,
  });
  assert.equal((await stat(join(directory, "report.json"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, "memory.json"))).mode & 0o777, 0o600);
  assert.deepEqual(
    report.cortex.learningSession.receipts.map((receipt) => receipt.sequence),
    [1, 2, 3],
  );
  assert.deepEqual(
    report.cortex.recallSession.receipts.map((receipt) => receipt.sequence),
    [1, 2, 3],
  );
  baseline.assertExhausted();
  phases.assertExhausted();
});

test("preserves completed baseline and phase evidence when a run fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-ember-fixture-"));
  temporaryDirectories.push(directory);
  const baseline = new ScriptedBaselineExecutor(["Stateless result."]);
  const phases = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: ["invented-record"],
        summary: "Selected unavailable memory.",
      },
    },
  ]);

  await assert.rejects(
    runProjectEmberFixture({
      artifactDirectory: directory,
      phaseExecutor: phases,
      baselineExecutor: baseline,
      model: {
        provider: "scripted",
        requestedId: "scripted",
        resolvedId: "scripted",
        thinkingLevel: "off",
      },
      source: { fixture: true },
      repository: { commit: "fixture", dirty: false },
    }),
    /unknown memory/,
  );

  const failure = JSON.parse(await readFile(join(directory, "failure.json"), "utf8")) as {
    phase: string;
    durableEffectApplied: boolean;
    baseline: { output: string };
    receipts: unknown[];
    memory: unknown[];
  };
  assert.equal(failure.phase, "wake");
  assert.equal(failure.durableEffectApplied, false);
  assert.equal(failure.baseline.output, "Stateless result.");
  assert.deepEqual(failure.receipts, []);
  assert.deepEqual(failure.memory, []);
});
