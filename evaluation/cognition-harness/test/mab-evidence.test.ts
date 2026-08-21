import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  assertMabEvidenceCitations,
  loadMabEvidence,
  persistMabEvidence,
  retrieveMabEvidence,
} from "../src/mab-evidence.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function evidenceDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cortex-mab-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

test("persists exact private evidence and verifies it on reload", async () => {
  const directory = await evidenceDirectory();
  const chunks = [
    "223. goaltender is associated with the sport of ice hockey.",
    "310. goaltender is associated with the sport of pesäpallo.",
  ];
  const written = await persistMabEvidence(directory, {
    id: "factconsolidation_sh_6k",
    source: "factconsolidation_sh_6k",
    chunks,
  });
  const loaded = await loadMabEvidence(directory);

  assert.deepEqual(loaded, written);
  assert.equal(loaded.documents[1]?.text, chunks[1]);
  assert.match(
    loaded.documents[1]?.reference ?? "",
    /^evidence\/chunk-002\.txt#sha256=[a-f0-9]{64}$/,
  );
  assert.equal(
    (await stat(join(directory, "evidence", "chunk-002.txt"))).mode & 0o777,
    0o600,
  );
});

test("rejects tampered evidence", async () => {
  const directory = await evidenceDirectory();
  await persistMabEvidence(directory, {
    id: "fixture",
    source: "fixture",
    chunks: ["original evidence"],
  });
  const path = join(directory, "evidence", "chunk-001.txt");
  await chmod(path, 0o600);
  await writeFile(path, "tampered evidence", "utf8");

  await assert.rejects(
    loadMabEvidence(directory),
    /evidence digest mismatch/,
  );
});

test("rejects evidence paths outside the store", async () => {
  const directory = await evidenceDirectory();
  await persistMabEvidence(directory, {
    id: "fixture",
    source: "fixture",
    chunks: ["grounded evidence"],
  });
  const manifestPath = join(directory, "evidence", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.records[0].path = "../outside.txt";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

  await assert.rejects(
    loadMabEvidence(directory),
    /invalid MemoryAgentBench evidence manifest record/,
  );
});

test("rejects an evidence manifest that omits a source chunk", async () => {
  const directory = await evidenceDirectory();
  const stream = {
    id: "fixture",
    source: "fixture",
    chunks: ["first evidence", "second evidence"],
  };
  await persistMabEvidence(directory, stream);
  const manifestPath = join(directory, "evidence", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.records.pop();
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

  await assert.rejects(
    loadMabEvidence(directory, stream),
    /does not match the source stream/,
  );
});

test("rejects unresolved memory citations", async () => {
  const directory = await evidenceDirectory();
  const evidence = await persistMabEvidence(directory, {
    id: "fixture",
    source: "fixture",
    chunks: ["grounded evidence"],
  });

  assert.throws(
    () =>
      assertMabEvidenceCitations(
        [
          {
            id: "candidate",
            kind: "learning",
            text: "A claim.",
            evidence: "unresolved reference",
            source: "observed",
          },
        ],
        evidence.documents,
        "fixture memory",
      ),
    /unresolved evidence citations/,
  );
});

test("ranks matching evidence deterministically and excludes zero scores", async () => {
  const directory = await evidenceDirectory();
  const evidence = await persistMabEvidence(directory, {
    id: "fixture",
    source: "fixture",
    chunks: [
      "Clouds produce rain.",
      "A goaltender is associated with pesäpallo.",
      "A goalkeeper guards a goal.",
    ],
  });

  const matches = retrieveMabEvidence(
    evidence.documents,
    "Which sport is goaltender associated with?",
    2,
  );
  assert.deepEqual(
    matches.map((match) => match.document.id),
    ["fixture.evidence-002"],
  );
  assert.ok((matches[0]?.score ?? 0) > 0);

  const tied = retrieveMabEvidence(evidence.documents, "absent-term", 2);
  assert.deepEqual(tied, []);

  const sameScore = evidence.documents.slice(0, 2).map((document, index) => ({
    ...document,
    id: index === 0 ? "fixture-b" : "fixture-a",
    text: "shared term",
  }));
  assert.deepEqual(
    retrieveMabEvidence(sameScore, "shared", 2).map(
      (match) => match.document.id,
    ),
    ["fixture-a", "fixture-b"],
  );
});
