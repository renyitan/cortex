import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { AtomicMemoryStore } from "../src/memory-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<{ path: string; store: AtomicMemoryStore }> {
  const directory = await mkdtemp(join(tmpdir(), "cortex-memory-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "memory.json");
  return {
    path,
    store: new AtomicMemoryStore(path, () => new Date("2026-08-20T01:02:03.000Z")),
  };
}

test("writes private deterministic insert-only state", async () => {
  const { path, store } = await fixture();
  await store.applyWrites([
    {
      candidateId: "first",
      record: {
        id: "decision-a",
        kind: "decision",
        text: "First text.",
        evidence: "fixture",
        source: "operator",
      },
    },
  ]);
  const first = (await store.snapshot())[0];

  await assert.rejects(
    store.applyWrites([
      {
        candidateId: "replacement",
        record: {
          id: "decision-a",
          kind: "decision",
          text: "Replacement text.",
          evidence: "second fixture",
          source: "operator",
        },
      },
    ]),
    /insert-only/,
  );
  const afterRejectedReplacement = (await store.snapshot())[0];

  assert.equal(first?.createdAt, "2026-08-20T01:02:03.000Z");
  assert.deepEqual(afterRejectedReplacement, first);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.match(await readFile(path, "utf8"), /"schemaVersion": 1/);
});

test("rejects duplicate writes without partially changing the store", async () => {
  const { store } = await fixture();
  await assert.rejects(
    store.applyWrites([
      {
        candidateId: "same",
        record: {
          id: "one",
          kind: "learning",
          text: "One.",
          evidence: "fixture",
          source: "observed",
        },
      },
      {
        candidateId: "same",
        record: {
          id: "two",
          kind: "learning",
          text: "Two.",
          evidence: "fixture",
          source: "observed",
        },
      },
    ]),
    /duplicate candidate writes/,
  );
  assert.deepEqual(await store.snapshot(), []);
});
