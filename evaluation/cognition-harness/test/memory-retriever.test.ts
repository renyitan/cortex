import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { MemoryEventSink } from "../src/artifacts.js";
import { LifecycleController } from "../src/controller.js";
import { AtomicMemoryStore } from "../src/memory-store.js";
import { Bm25MemoryRetriever } from "../src/memory-retriever.js";
import { ScriptedPhaseExecutor } from "../src/scripted-executor.js";
import type { MemoryRecord, MemoryRetriever } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function record(id: string, text: string): MemoryRecord {
  return {
    id,
    kind: "decision",
    text,
    evidence: "fixture",
    source: "operator",
    status: "active",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
}

test("BM25 returns a bounded deterministic candidate set", async () => {
  const retriever = new Bm25MemoryRetriever({ limit: 1 });
  const result = await retriever.retrieve({
    task: "Write the Project Ember release note.",
    memory: [
      record("unrelated", "Use blue buttons in Atlas."),
      record("ember-marker", "Project Ember release notes end with CANARY-GREEN."),
    ],
  });

  assert.equal(result.strategy, "bm25");
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.memoryId),
    ["ember-marker"],
  );
  assert.ok((result.candidates[0]?.score ?? 0) > 0);
});

test("controller lets WAKE select only from retrieved candidates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-retrieval-"));
  temporaryDirectories.push(directory);
  const store = new AtomicMemoryStore(join(directory, "memory.json"));
  await store.applyWrites([
    {
      candidateId: "unrelated",
      record: {
        id: "unrelated",
        kind: "decision",
        text: "Use blue buttons in Atlas.",
        evidence: "fixture",
        source: "operator",
      },
    },
    {
      candidateId: "ember-marker",
      record: {
        id: "ember-marker",
        kind: "decision",
        text: "Project Ember release notes end with CANARY-GREEN.",
        evidence: "fixture",
        source: "operator",
      },
    },
  ]);
  const executor = new ScriptedPhaseExecutor([
    {
      phase: "wake",
      payload: {
        phase: "wake",
        selectedMemoryIds: ["ember-marker"],
        summary: "Selected the retrieved convention.",
      },
    },
    {
      phase: "work",
      payload: {
        phase: "work",
        output: "Project Ember now starts faster. CANARY-GREEN",
        summary: "Applied the convention.",
        memoryCandidates: [],
      },
    },
    {
      phase: "sleep",
      payload: { phase: "sleep", summary: "No new memory.", writes: [] },
    },
  ]);
  const controller = new LifecycleController(
    executor,
    store,
    new MemoryEventSink(),
    () => new Date("2026-08-21T00:00:00.000Z"),
    () => "run-retrieval",
    new Bm25MemoryRetriever({ limit: 1 }),
  );

  const result = await controller.runSession(
    "Write the Project Ember release note.",
  );

  assert.equal(result.retrieval.strategy, "bm25");
  assert.equal(result.retrieval.totalActiveMemory, 2);
  assert.equal(result.retrieval.candidates.length, 1);
  assert.equal(result.retrieval.candidates[0]?.memoryId, "ember-marker");
  assert.ok(Number.isFinite(result.retrieval.candidates[0]?.score));
  assert.deepEqual(
    executor.calls[0]?.phase === "wake" ? executor.calls[0].memory : undefined,
    [result.memory.find((item) => item.id === "ember-marker")],
  );
  assert.deepEqual(
    executor.calls[2]?.phase === "sleep"
      ? executor.calls[2].candidateMemory.map((item) => item.id)
      : undefined,
    ["ember-marker"],
  );
  assert.deepEqual(
    executor.calls[2]?.phase === "sleep"
      ? executor.calls[2].recalledMemory.map((item) => item.id)
      : undefined,
    ["ember-marker"],
  );
});

test("controller rejects retriever IDs outside active memory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-retrieval-"));
  temporaryDirectories.push(directory);
  const store = new AtomicMemoryStore(join(directory, "memory.json"));
  const executor = new ScriptedPhaseExecutor([]);
  const retriever: MemoryRetriever = {
    async retrieve() {
      return {
        strategy: "invalid-fixture",
        candidates: [{ memoryId: "invented", score: 1 }],
      };
    },
  };
  const controller = new LifecycleController(
    executor,
    store,
    new MemoryEventSink(),
    () => new Date("2026-08-21T00:00:00.000Z"),
    () => "run-invalid-retrieval",
    retriever,
  );

  await assert.rejects(
    controller.runSession("Use memory."),
    /retrieval returned unknown active memory/,
  );
  assert.equal(executor.calls.length, 0);
});
