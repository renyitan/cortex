import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { MemoryEventSink, type EventSink } from "../src/artifacts.js";
import {
  LifecycleController,
  LifecycleObservationError,
  LifecycleRunError,
} from "../src/controller.js";
import { AtomicMemoryStore } from "../src/memory-store.js";
import { ScriptedPhaseExecutor } from "../src/scripted-executor.js";
import type { RunEvent } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createStore(): Promise<AtomicMemoryStore> {
  const directory = await mkdtemp(join(tmpdir(), "cortex-controller-"));
  temporaryDirectories.push(directory);
  return new AtomicMemoryStore(join(directory, "memory.json"), () => new Date("2026-08-20T00:00:00.000Z"));
}

test("enforces WAKE -> WORK -> SLEEP and commits only supported writes", async () => {
  const store = await createStore();
  const sink = new MemoryEventSink();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No prior memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Acknowledged.",
        summary: "Recorded the operator convention as a candidate.",
        memoryCandidates: [
          {
            id: "ember-release-marker",
            kind: "decision",
            text: "Project Ember release notes end with CANARY-GREEN.",
            evidence: "operator statement in the current task",
            source: "operator",
          },
        ],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "Promoted the explicit operator decision.",
        writes: [
          {
            candidateId: "ember-release-marker",
            record: {
              id: "ember-release-marker",
              kind: "decision",
              text: "Project Ember release notes end with CANARY-GREEN.",
              evidence: "operator statement in the current task",
              source: "operator",
            },
          },
        ],
      },
    },
  ]);
  const controller = new LifecycleController(
    executor,
    store,
    sink,
    () => new Date("2026-08-20T00:00:00.000Z"),
    () => "run-1",
  );

  const result = await controller.runSession(
    "For Project Ember, every release note must end with CANARY-GREEN.",
  );

  assert.deepEqual(
    result.receipts.map((receipt) => receipt.phase),
    ["wake", "work", "sleep"],
  );
  assert.equal(result.memory.length, 1);
  assert.equal(result.memory[0]?.id, "ember-release-marker");
  assert.deepEqual(
    sink.events.map((event) => event.type),
    [
      "phase.started",
      "phase.completed",
      "phase.started",
      "phase.completed",
      "phase.started",
      "memory.committed",
      "phase.completed",
    ],
  );
  executor.assertExhausted();
});

test("rejects a WAKE receipt that names unavailable memory", async () => {
  const store = await createStore();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: ["invented-record"],
        summary: "Selected a record that does not exist.",
      },
    },
  ]);
  const controller = new LifecycleController(executor, store);

  await assert.rejects(
    controller.runSession("Use prior memory."),
    (error: unknown) =>
      error instanceof LifecycleRunError &&
      error.phase === "wake" &&
      error.currentTelemetry?.attempts === 1 &&
      error.message.includes("unknown memory"),
  );
  assert.deepEqual(await store.snapshot(), []);
});

test("does not write memory when SLEEP fails", async () => {
  const store = await createStore();
  const sink = new MemoryEventSink();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Done.",
        summary: "Candidate observed.",
        memoryCandidates: [
          {
            id: "candidate",
            kind: "learning",
            text: "A candidate.",
            evidence: "fixture",
            source: "observed",
          },
        ],
      },
    },
    { phase: "sleep", error: new Error("injected crash") },
  ]);
  const controller = new LifecycleController(executor, store, sink);

  await assert.rejects(
    controller.runSession("Trigger a SLEEP failure."),
    (error: unknown) => error instanceof LifecycleRunError && error.phase === "sleep",
  );
  assert.deepEqual(await store.snapshot(), []);
  assert.equal(sink.events.at(-1)?.type, "phase.failed");
});

test("does not complete SLEEP when the durable commit fails", async () => {
  class FailingMemoryStore extends AtomicMemoryStore {
    override async applyWrites(): Promise<never> {
      throw new Error("injected commit failure");
    }
  }

  const directory = await mkdtemp(join(tmpdir(), "cortex-controller-"));
  temporaryDirectories.push(directory);
  const store = new FailingMemoryStore(join(directory, "memory.json"));
  const sink = new MemoryEventSink();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Done.",
        summary: "Candidate observed.",
        memoryCandidates: [
          {
            id: "candidate",
            kind: "learning",
            text: "A candidate.",
            evidence: "fixture",
            source: "observed",
          },
        ],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "Write the candidate.",
        writes: [
          {
            candidateId: "candidate",
            record: {
              id: "candidate",
              kind: "learning",
              text: "A candidate.",
              evidence: "fixture",
              source: "observed",
            },
          },
        ],
      },
    },
  ]);
  const controller = new LifecycleController(executor, store, sink);

  await assert.rejects(
    controller.runSession("Trigger a commit failure."),
    (error: unknown) =>
      error instanceof LifecycleRunError &&
      error.phase === "sleep" &&
      error.message.includes("commit failure"),
  );
  assert.deepEqual(
    sink.events.slice(-2).map((event) => event.type),
    ["phase.started", "phase.failed"],
  );
});

test("rejects SLEEP content that differs from its WORK candidate", async () => {
  const store = await createStore();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Done.",
        summary: "Candidate observed.",
        memoryCandidates: [
          {
            id: "candidate",
            kind: "learning",
            text: "Supported text.",
            evidence: "fixture",
            source: "observed",
          },
        ],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "Altered the candidate.",
        writes: [
          {
            candidateId: "candidate",
            record: {
              id: "candidate",
              kind: "learning",
              text: "Unsupported replacement text.",
              evidence: "fixture",
              source: "observed",
            },
          },
        ],
      },
    },
  ]);
  const controller = new LifecycleController(executor, store);

  await assert.rejects(
    controller.runSession("Reject an unsupported write."),
    (error: unknown) =>
      error instanceof LifecycleRunError &&
      error.phase === "sleep" &&
      error.message.includes("preserve candidate content"),
  );
  assert.deepEqual(await store.snapshot(), []);
});

test("reports observation failure separately after a successful SLEEP commit", async () => {
  class FailingCommitEventSink implements EventSink {
    readonly events: RunEvent[] = [];

    async append(event: RunEvent): Promise<void> {
      if (event.type === "memory.committed") {
        throw new Error("injected observation failure");
      }
      this.events.push(structuredClone(event));
    }
  }

  const store = await createStore();
  const sink = new FailingCommitEventSink();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: [], summary: "No memory." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Done.",
        summary: "Candidate observed.",
        memoryCandidates: [
          {
            id: "candidate",
            kind: "learning",
            text: "Supported text.",
            evidence: "fixture",
            source: "observed",
          },
        ],
      },
    },
    {
      phase: "sleep",
      payload: {
        phase: "sleep",
        summary: "Commit the candidate.",
        writes: [
          {
            candidateId: "candidate",
            record: {
              id: "candidate",
              kind: "learning",
              text: "Supported text.",
              evidence: "fixture",
              source: "observed",
            },
          },
        ],
      },
    },
  ]);
  const controller = new LifecycleController(executor, store, sink);

  await assert.rejects(
    controller.runSession("Commit before telemetry fails."),
    (error: unknown) =>
      error instanceof LifecycleObservationError &&
      error.phase === "sleep" &&
      error.message.includes("durable effect"),
  );
  assert.equal((await store.snapshot()).length, 1);
  assert.equal(sink.events.some((event) => event.type === "phase.failed"), false);
});

test("retains progress when phase-start observation fails", async () => {
  class FailingWorkStartSink implements EventSink {
    async append(event: RunEvent): Promise<void> {
      if (event.type === "phase.started" && event.phase === "work") {
        throw new Error("injected WORK start failure");
      }
    }
  }

  const store = await createStore();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "No memory.",
      },
    },
  ]);
  const controller = new LifecycleController(
    executor,
    store,
    new FailingWorkStartSink(),
  );

  await assert.rejects(
    controller.runSession("Observe phase progress."),
    (error: unknown) =>
      error instanceof LifecycleRunError &&
      error.phase === "work" &&
      error.receipts.length === 1 &&
      error.progress?.wake?.phase === "wake",
  );
});

test("CURATE proposals are recorded but never applied automatically", async () => {
  const store = await createStore();
  await store.applyWrites([
    {
      candidateId: "existing",
      record: {
        id: "existing",
        kind: "learning",
        text: "Existing memory.",
        evidence: "fixture",
        source: "observed",
      },
    },
  ]);
  const before = await store.snapshot();
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: { phase: "wake", selectedMemoryIds: ["existing"], summary: "Selected existing." },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Done.",
        memoryCandidates: [],
        summary: "No candidate.",
      },
    },
    {
      phase: "sleep",
      payload: { phase: "sleep", writes: [], summary: "No write." },
    },
    {
      phase: "curate",
      payload: {
        phase: "curate",
        summary: "Retirement requires approval.",
        proposals: [
          {
            recordId: "existing",
            action: "retire",
            reason: "Fixture proposal.",
          },
        ],
      },
    },
  ]);
  const controller = new LifecycleController(executor, store);

  const result = await controller.runSession("Review memory.", { curate: true });

  assert.equal(result.curate?.proposals[0]?.action, "retire");
  assert.deepEqual(await store.snapshot(), before);
});
