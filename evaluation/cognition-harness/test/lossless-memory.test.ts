import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  MAX_BUNDLE_BYTES,
  appendObservationBatch,
  bundleFromEvidence,
  canonicalJson,
  createLosslessMemoryBundle,
  observationSha256,
  parseLosslessMemoryBundle,
  publishPrivateJsonWriteOnce,
  type DerivedClaim,
  type LosslessObservation,
} from "../src/lossless-memory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function observation(
  ordinal: number,
  text = `Observation ${ordinal}`,
): LosslessObservation {
  const authoredAt = `2025-${String(ordinal).padStart(2, "0")}-01T00:00:00Z`;
  return {
    id: `stream-test-observation-${String(ordinal).padStart(2, "0")}`,
    authoredAt,
    text,
    sha256: observationSha256(authoredAt, text),
  };
}

test("appends exact evidence and host-bound claims without mutating prior state", () => {
  const original = createLosslessMemoryBundle("stream-test");
  const firstObservation = observation(1, "Team Atlas approved route alpha.");
  const next = appendObservationBatch(original, firstObservation, [
    {
      kind: "decision",
      subjectKey: "release-route",
      statement: "Team Atlas approved route alpha.",
      scope: { level: "team", key: "atlas-team" },
      supersedesClaimIds: [],
    },
  ]);

  assert.equal(original.observations.length, 0);
  assert.deepEqual(next.observations, [firstObservation]);
  assert.deepEqual(next.claims[0], {
    id: "stream-test-formed-01-01",
    kind: "decision",
    subjectKey: "release-route",
    statement: "Team Atlas approved route alpha.",
    scope: { level: "team", key: "atlas-team" },
    effectiveAt: firstObservation.authoredAt,
    evidenceIds: [firstObservation.id],
    supersedesClaimIds: [],
  });
  assert.deepEqual(parseLosslessMemoryBundle(next), next);
});

test("rejects an invalid candidate batch without partial append", () => {
  const first = appendObservationBatch(
    createLosslessMemoryBundle("stream-test"),
    observation(1),
    [
      {
        kind: "procedure",
        subjectKey: "release-check",
        statement: "Run the release check.",
        scope: { level: "project", key: "atlas-project" },
        supersedesClaimIds: [],
      },
    ],
  );
  const snapshot = canonicalJson(first);
  assert.throws(
    () =>
      appendObservationBatch(first, observation(2), [
        {
          kind: "procedure",
          subjectKey: "release-check",
          statement: "Run the replacement check.",
          scope: { level: "team", key: "atlas-team" },
          supersedesClaimIds: ["stream-test-formed-01-01"],
        },
        {
          kind: "procedure",
          subjectKey: "release-check",
          statement: "This candidate must not be partially appended.",
          scope: { level: "project", key: "atlas-project" },
          supersedesClaimIds: [],
        },
      ]),
    /different kind, subject, or scope/,
  );
  assert.equal(canonicalJson(first), snapshot);
  assert.equal(first.observations.length, 1);
  assert.equal(first.claims.length, 1);
});

test("rejects chronology violations and later or cyclic supersession", () => {
  const firstObservation = observation(1);
  const secondObservation = observation(2);
  const firstClaim: DerivedClaim = {
    id: "claim-1",
    kind: "preference",
    subjectKey: "reply-format",
    statement: "Use a short reply.",
    scope: { level: "global", key: null },
    effectiveAt: firstObservation.authoredAt,
    evidenceIds: [firstObservation.id],
    supersedesClaimIds: ["claim-2"],
  };
  const secondClaim: DerivedClaim = {
    id: "claim-2",
    kind: "preference",
    subjectKey: "reply-format",
    statement: "Use a detailed reply.",
    scope: { level: "global", key: null },
    effectiveAt: secondObservation.authoredAt,
    evidenceIds: [secondObservation.id],
    supersedesClaimIds: ["claim-1"],
  };
  assert.throws(
    () =>
      bundleFromEvidence(
        "stream-test",
        [firstObservation, secondObservation],
        [firstClaim, secondClaim],
      ),
    /earlier claim|cycle/,
  );
  assert.throws(
    () =>
      appendObservationBatch(
        bundleFromEvidence("stream-test", [secondObservation], []),
        firstObservation,
        [],
      ),
    /chronology/,
  );
  const futureObservation = observation(2);
  const earlierObservation = observation(1);
  assert.throws(
    () =>
      bundleFromEvidence(
        "stream-test",
        [earlierObservation, futureObservation],
        [
          {
            id: "future-claim",
            kind: "decision",
            subjectKey: "route",
            statement: futureObservation.text,
            scope: { level: "team", key: "atlas-team" },
            effectiveAt: futureObservation.authoredAt,
            evidenceIds: [futureObservation.id],
            supersedesClaimIds: [],
          },
          {
            id: "earlier-claim",
            kind: "decision",
            subjectKey: "route",
            statement: earlierObservation.text,
            scope: { level: "team", key: "atlas-team" },
            effectiveAt: earlierObservation.authoredAt,
            evidenceIds: [earlierObservation.id],
            supersedesClaimIds: ["future-claim"],
          },
        ],
      ),
    /earlier-effective/,
  );
});

test("enforces the canonical 64 KiB bundle ceiling", () => {
  const oversized = "x".repeat(MAX_BUNDLE_BYTES);
  assert.throws(
    () =>
      appendObservationBatch(
        createLosslessMemoryBundle("stream-test"),
        observation(1, oversized),
        [],
      ),
    /bundle exceeds/,
  );
});

test("publishes owner-only files once without replacing existing content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-write-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "manifest.json");

  await publishPrivateJsonWriteOnce(path, { version: 1 });
  await publishPrivateJsonWriteOnce(path, { version: 1 });
  assert.deepEqual(await readdir(directory), ["manifest.json"]);
  assert.equal(await readFile(path, "utf8"), '{\n  "version": 1\n}\n');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);

  await assert.rejects(
    publishPrivateJsonWriteOnce(path, { version: 2 }),
    (error: unknown) =>
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "EEXIST",
  );
  assert.equal(await readFile(path, "utf8"), '{\n  "version": 1\n}\n');
});
