import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  LOSSLESS_BOOTSTRAP_SEED,
  DIRECT_READER_SYSTEM_PROMPT,
  buildFormedClaimReviewPacket,
  claimLosslessStage,
  createBootstrapPlan,
  decideLosslessFormation,
  directReaderInput,
  freezeLosslessRunManifest,
  gradeExactActionSet,
  loadFrozenLosslessFixture,
  losslessManifestSealPath,
  losslessStageClaimPath,
  pairedContrast,
  readLosslessRunManifest,
  renderDirectReaderUserPrompt,
  runLosslessFormationStage,
  runLosslessInstrument,
  runLosslessTreatmentStage,
  usdTotalsEqual,
  type AnswerCellReport,
  type FormationRunReport,
  type FrozenLosslessFixture,
  type LosslessFixtureSource,
  type LosslessFixtureStream,
  type LosslessModelSpec,
  type LosslessRunManifest,
} from "../src/lossless-formation-eval.js";
import {
  appendObservationBatch,
  bundleFromEvidence,
  canonicalJson,
  observationSha256,
  sha256Canonical,
  sha256Text,
  type DerivedClaim,
  type LosslessObservation,
} from "../src/lossless-memory.js";
import { PiAgentRunError } from "../src/pi-agent-runner.js";
import { emptyTelemetry } from "../src/types.js";

const temporaryDirectories: string[] = [];
type FixtureArtifactName =
  | "fixture-source.json"
  | "fixture-review-packet.md"
  | "fixture-review-labels.blind.json"
  | "fixture-review-adjudication.json"
  | "fixture-claim-review-packet.md"
  | "fixture-claim-review-labels.blind.json"
  | "fixture-claim-review-adjudication.json"
  | "fixture-manifest.json";
type FixtureArtifactHashes = Record<FixtureArtifactName, string>;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function makeObservation(streamId: string, ordinal: number): LosslessObservation {
  const authoredAt = `2025-${String(ordinal).padStart(2, "0")}-01T00:00:00Z`;
  const text = `Team ${streamId} approved action-${streamId}-1 for subject ${ordinal}.`;
  return {
    id: `${streamId}-observation-${String(ordinal).padStart(2, "0")}`,
    authoredAt,
    text,
    sha256: observationSha256(authoredAt, text),
  };
}

function makeStream(index: number): LosslessFixtureStream {
  const id = `stream-${String(index).padStart(2, "0")}`;
  const memoryType =
    index <= 4 ? "decision" : index <= 8 ? "procedure" : "preference";
  const actions = Array.from({ length: 5 }, (_, actionIndex) => ({
    actionId: `action-${id}-${actionIndex + 1}`,
    description: `Action ${actionIndex + 1}`,
  }));
  const observations = Array.from({ length: 12 }, (_, observationIndex) =>
    makeObservation(id, observationIndex + 1),
  );
  const claims: DerivedClaim[] = observations.map((observation, claimIndex) => ({
    id: `${id}-claim-${String(claimIndex + 1).padStart(2, "0")}`,
    kind: memoryType,
    subjectKey: `subject-${claimIndex + 1}`,
    statement: observation.text,
    scope: { level: "team", key: `team-${id}` },
    effectiveAt: observation.authoredAt,
    evidenceIds: [observation.id],
    supersedesClaimIds: [],
  }));
  const queryTypes = [
    "current_in_scope",
    "adjacent_scope",
    "historical_as_of",
  ] as const;
  return {
    id,
    memoryType,
    mechanism:
      index % 2 === 0
        ? "require-prohibit-reversal"
        : "action-substitution",
    narrowScope: { level: "team", key: `team-${id}` },
    positionPatternId: `pattern-${((index - 1) % 4) + 1}`,
    targetObservationIds: observations.slice(0, 3).map((entry) => entry.id),
    targetSubjectKey: "subject-1",
    actions,
    observations,
    claims,
    claimActionRules: claims.map((claim) => ({
      claimId: claim.id,
      requiredActionIds: [actions[0]!.actionId],
    })),
    tasks: queryTypes.map((queryType, taskIndex) => ({
      id: `${id}-task-${String(taskIndex + 1).padStart(2, "0")}`,
      queryType,
      scopePath: {
        organization: "example-org",
        team: `team-${id}`,
        project: `project-${id}`,
        workflow: `workflow-${id}`,
      },
      queryAt: "2026-01-01T00:00:00Z",
      conversation: [
        { turnId: "turn-1", role: "user", content: `Conversation ${taskIndex}` },
      ],
      targetQuery: `Target query ${taskIndex}`,
      governingClaimIds: [claims[0]!.id],
      requiredActionIds: [actions[0]!.actionId],
      prohibitedActionIds: actions.slice(1).map((action) => action.actionId),
    })),
  };
}

function makeSource(): LosslessFixtureSource {
  return {
    schemaVersion: 1,
    split: "development",
    provenance: "synthetic",
    reviewStatus: "approved",
    shuffleSeed: 20260831,
    positionPatterns: {
      "pattern-1": [1, 2, 3],
      "pattern-2": [2, 3, 4],
      "pattern-3": [3, 4, 5],
      "pattern-4": [4, 5, 6],
    },
    streams: Array.from({ length: 12 }, (_, index) => makeStream(index + 1)),
  };
}

function fakeHashes(): FrozenLosslessFixture["hashes"] {
  return {
    sourceSha256: "1".repeat(64),
    fixtureContentSha256: "2".repeat(64),
    fixtureManifestSha256: "3".repeat(64),
    reviewPacketSha256: "4".repeat(64),
    behaviorLabelSha256: "5".repeat(64),
    behaviorAdjudicationSha256: "6".repeat(64),
    claimReviewPacketSha256: "7".repeat(64),
    claimLabelSha256: "8".repeat(64),
    claimAdjudicationSha256: "9".repeat(64),
  };
}

function makeFixture(): FrozenLosslessFixture {
  return {
    sourcePath: "/fixture/fixture-source.json",
    source: makeSource(),
    fixtureManifest: {},
    hashes: fakeHashes(),
  };
}

function model(
  maximumInvocationCostUsd = 0.01,
): LosslessModelSpec {
  return {
    provider: "scripted",
    requestedId: "scripted",
    resolvedId: "scripted",
    requestedThinkingLevel: "low",
    effectiveThinkingLevel: "low",
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

async function freezeTestManifest(
  directory: string,
  fixture = makeFixture(),
  maximumInvocationCostUsd = 0.01,
): Promise<{
  fixture: FrozenLosslessFixture;
  manifest: LosslessRunManifest;
  manifestSha256: string;
  sourceFiles: Record<string, string>;
}> {
  const manifestPath = join(directory, "manifest.json");
  const sourceFiles = { "diagnostic.ts": "a".repeat(64) };
  const manifest = await freezeLosslessRunManifest({
    manifestPath,
    batchId: "lossless-stage-test",
    fixture,
    model: model(maximumInvocationCostUsd),
    repository: { commit: "fixture", dirty: false },
    sourceFiles,
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  return {
    fixture,
    manifest,
    manifestSha256: sha256Text(await readFile(manifestPath, "utf8")),
    sourceFiles,
  };
}

async function createReadyInstrument(
  directory: string,
  frozen: Awaited<ReturnType<typeof freezeTestManifest>>,
) {
  const artifactDirectory = join(directory, "instrument-source");
  const report = await runLosslessInstrument({
    artifactDirectory,
    fixture: frozen.fixture,
    manifest: frozen.manifest,
    manifestSha256: frozen.manifestSha256,
    execution: {
      model: frozen.manifest.model,
      repository: frozen.manifest.repository,
      sourceFiles: frozen.sourceFiles,
    },
    createAnswerExecutor(context) {
      return {
        async execute(stream, task) {
          return {
            events:
              context.condition === "oracle_enriched_direct"
                ? [
                    {
                      event: "action_call" as const,
                      action_id: task.requiredActionIds[0]!,
                    },
                    { event: "final_answer" as const, content: "Done." },
                  ]
                : [{ event: "final_answer" as const, content: "Done." }],
            telemetry: emptyTelemetry("scripted"),
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  assert.equal(report.status, "ready_for_formation");
  return {
    report,
    sha256: sha256Text(canonicalJson(report)),
  };
}

async function createEmptyFormation(
  directory: string,
  frozen: Awaited<ReturnType<typeof freezeTestManifest>>,
  instrument: Awaited<ReturnType<typeof createReadyInstrument>>,
) {
  const artifactDirectory = join(directory, "formation-source");
  const report = await runLosslessFormationStage({
    artifactDirectory,
    fixture: frozen.fixture,
    manifest: frozen.manifest,
    manifestSha256: frozen.manifestSha256,
    execution: {
      model: frozen.manifest.model,
      repository: frozen.manifest.repository,
      sourceFiles: frozen.sourceFiles,
    },
    instrumentReport: instrument.report,
    instrumentReportSha256: instrument.sha256,
    createFormationExecutor() {
      return {
        async executeObservation(bundle, observation) {
          return {
            observationId: observation.id,
            promptSha256: "0".repeat(64),
            candidates: 0,
            bundle: appendObservationBatch(bundle, observation, []),
            telemetry: emptyTelemetry("scripted"),
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  assert.equal(report.status, "completed");
  return {
    report,
    sha256: sha256Text(canonicalJson(report)),
  };
}

async function writeFrozenFixture(
  directory: string,
  incompleteReview = false,
): Promise<string> {
  const source = makeSource();
  const sourcePath = join(directory, "fixture-source.json");
  const reviewPacket = "behavior packet\n";
  const claimPacket = "claim packet\n";
  const behaviorEntries: Record<string, unknown>[] = [];
  const behaviorPairs: Record<string, unknown>[] = [];
  const neutralBehaviorReviewMapping: Record<string, unknown> = {};
  const neutralBehaviorPairMapping: Record<string, unknown> = {};
  let behaviorOrdinal = 1;
  let pairOrdinal = 1;
  for (const stream of source.streams) {
    for (const task of stream.tasks) {
      const pairId = `RP-${String(pairOrdinal).padStart(3, "0")}`;
      const reviewIds = ["observations-only", "claims-added"].map((view) => {
        const reviewId = `RV-${String(behaviorOrdinal).padStart(3, "0")}`;
        behaviorOrdinal += 1;
        neutralBehaviorReviewMapping[reviewId] = {
          pairId,
          queryType: task.queryType,
          streamId: stream.id,
          taskId: task.id,
          view,
        };
        behaviorEntries.push({
          ambiguityNotes: "",
          ambiguous: false,
          prohibitedActionIds: task.prohibitedActionIds,
          requiredActionIds: task.requiredActionIds,
          reviewId,
        });
        return reviewId;
      });
      neutralBehaviorPairMapping[pairId] = {
        queryType: task.queryType,
        reviewIds,
        streamId: stream.id,
        taskId: task.id,
      };
      behaviorPairs.push({
        behaviorEquivalent: true,
        entryIds: reviewIds,
        equivalenceNotes: "",
        pairId,
      });
      pairOrdinal += 1;
    }
  }
  const claimEntries: Record<string, unknown>[] = [];
  const neutralClaimReviewMapping: Record<string, unknown> = {};
  let claimOrdinal = 1;
  for (const stream of source.streams) {
    for (const claim of stream.claims) {
      const reviewId = `CR-${String(claimOrdinal).padStart(3, "0")}`;
      neutralClaimReviewMapping[reviewId] = {
        claimId: claim.id,
        observationId: claim.evidenceIds[0],
        sourceOrdinal: claimOrdinal,
        streamId: stream.id,
      };
      claimEntries.push({
        ambiguous: false,
        effectiveTimeAndEvidenceBinding: "pass",
        exactScope: "pass",
        kind: "pass",
        notes: "",
        reviewId,
        statementSupport: "pass",
        subjectKey: "pass",
        supersession: "pass",
      });
      claimOrdinal += 1;
    }
  }
  const behaviorLabels = canonicalJson({
    entries: incompleteReview ? [] : behaviorEntries,
    pairs: behaviorPairs,
    sourcePacketSha256: sha256Text(reviewPacket),
  });
  const claimLabels = canonicalJson({
    entries: claimEntries,
    sourcePacketSha256: sha256Text(claimPacket),
  });
  const contentValue: Record<string, unknown> = { ...source };
  delete contentValue.reviewStatus;
  const fixtureContentSha256 = sha256Canonical(contentValue);
  const behaviorAdjudication = canonicalJson({
    adjudicationType: "behavior-review",
    fixtureContentSha256,
    labels: { sha256: sha256Text(behaviorLabels) },
    packet: { sha256: sha256Text(reviewPacket) },
    agreementCounts: {
      behaviorEquivalent: 36,
      entries: 72,
      fullActionPartitions: 72,
      pairs: 36,
      prohibitedActionSets: 72,
      requiredActionSets: 72,
    },
    ambiguityCounts: { entries: 0 },
    schemaVersion: 1,
    status: "passed",
  });
  const claimAdjudication = canonicalJson({
    adjudicationType: "claim-review",
    fixtureContentSha256,
    labels: { sha256: sha256Text(claimLabels) },
    packet: { sha256: sha256Text(claimPacket) },
    agreementCounts: {
      effectiveTimeAndEvidenceBinding: 144,
      entries: 144,
      exactScope: 144,
      fullPasses: 144,
      kind: 144,
      statementSupport: 144,
      subjectKey: 144,
      supersession: 144,
    },
    ambiguityCounts: { entries: 0 },
    schemaVersion: 1,
    status: "passed",
  });
  const sourceText = canonicalJson(source);
  const manifest = {
    fixtureContentSha256,
    hashes: {
      behaviorAdjudicationSha256: sha256Text(behaviorAdjudication),
      behaviorLabelSha256: sha256Text(behaviorLabels),
      claimAdjudicationSha256: sha256Text(claimAdjudication),
      claimLabelSha256: sha256Text(claimLabels),
      claimReviewPacketSha256: sha256Text(claimPacket),
      fixtureContentSha256,
      reviewPacketSha256: sha256Text(reviewPacket),
      sourceSha256: sha256Text(sourceText),
    },
    reviewStatus: "approved",
    schemaVersion: 1,
    status: "frozen",
    neutralBehaviorReviewMapping,
    neutralBehaviorPairMapping,
    neutralClaimReviewMapping,
    streams: source.streams.map((stream) => ({
      claimSetSha256: sha256Canonical(stream.claims),
      observationSetSha256: sha256Canonical(stream.observations),
      sourceSha256: sha256Canonical(stream),
      streamId: stream.id,
      taskSetSha256: sha256Canonical(stream.tasks),
    })),
  };
  await Promise.all([
    writeFile(sourcePath, sourceText),
    writeFile(join(directory, "fixture-review-packet.md"), reviewPacket),
    writeFile(
      join(directory, "fixture-review-labels.blind.json"),
      behaviorLabels,
    ),
    writeFile(
      join(directory, "fixture-review-adjudication.json"),
      behaviorAdjudication,
    ),
    writeFile(join(directory, "fixture-claim-review-packet.md"), claimPacket),
    writeFile(
      join(directory, "fixture-claim-review-labels.blind.json"),
      claimLabels,
    ),
    writeFile(
      join(directory, "fixture-claim-review-adjudication.json"),
      claimAdjudication,
    ),
    writeFile(join(directory, "fixture-manifest.json"), canonicalJson(manifest)),
  ]);
  return sourcePath;
}

async function fixtureArtifactHashes(
  directory: string,
): Promise<FixtureArtifactHashes> {
  const names = [
    "fixture-source.json",
    "fixture-review-packet.md",
    "fixture-review-labels.blind.json",
    "fixture-review-adjudication.json",
    "fixture-claim-review-packet.md",
    "fixture-claim-review-labels.blind.json",
    "fixture-claim-review-adjudication.json",
    "fixture-manifest.json",
  ] as const;
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        sha256Text(await readFile(join(directory, name), "utf8")),
      ] as const),
    ),
  ) as FixtureArtifactHashes;
}

test("cryptographically binds the explicit fixture and review adjudications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-fixture-"));
  temporaryDirectories.push(directory);
  const sourcePath = await writeFrozenFixture(directory);

  const hashes = await fixtureArtifactHashes(directory);
  const loaded = await loadFrozenLosslessFixture(sourcePath, hashes);
  assert.equal(loaded.source.streams.length, 12);

  const changed = {
    ...loaded.source,
    shuffleSeed: loaded.source.shuffleSeed + 1,
  };
  await writeFile(sourcePath, canonicalJson(changed));
  await assert.rejects(
    loadFrozenLosslessFixture(sourcePath, hashes),
    /frozen Faber artifact hash mismatch/,
  );
});

test("rejects a hash-consistent but incomplete blind review", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-review-"));
  temporaryDirectories.push(directory);
  const sourcePath = await writeFrozenFixture(directory, true);
  const hashes = await fixtureArtifactHashes(directory);
  await assert.rejects(
    loadFrozenLosslessFixture(sourcePath, hashes),
    /behavior review is incomplete/,
  );
});

test("keeps answer conditions blind and grades the exact action set", () => {
  const stream = makeStream(1);
  const task = stream.tasks[0]!;
  const raw = renderDirectReaderUserPrompt(stream, task, []);
  const oracle = renderDirectReaderUserPrompt(stream, task, stream.claims);

  assert.equal(raw.includes("raw_direct"), false);
  assert.equal(oracle.includes("oracle_enriched_direct"), false);
  assert.equal(raw.includes("requiredActionIds"), false);
  assert.equal(raw.includes("prohibitedActionIds"), false);
  assert.equal(
    DIRECT_READER_SYSTEM_PROMPT.includes(
      "Claims are comparable only when both kind and subjectKey match.",
    ),
    true,
  );
  assert.deepEqual(Object.keys(directReaderInput(stream, task, [])), [
    "actions",
    "observations",
    "derivedClaims",
    "scopePath",
    "queryAt",
    "conversation",
    "targetQuery",
  ]);
  assert.equal(
    gradeExactActionSet(
      [
        { event: "action_call", action_id: stream.actions[0]!.actionId },
        { event: "final_answer", content: "Done." },
      ],
      task,
      stream.actions,
    ),
    true,
  );
  assert.equal(
    gradeExactActionSet(
      [
        { event: "action_call", action_id: stream.actions[0]!.actionId },
        { event: "action_call", action_id: stream.actions[1]!.actionId },
        { event: "final_answer", content: "Done." },
      ],
      task,
      stream.actions,
    ),
    false,
  );
});

test("accepts sub-picodollar grouping differences in cumulative USD totals", () => {
  const callOrder = [0.1, 0.2, 0.3].reduce(
    (sum, value) => sum + value,
    0,
  );
  const grouped = 0.1 + (0.2 + 0.3);
  assert.notEqual(callOrder, grouped);
  assert.equal(usdTotalsEqual(callOrder, grouped), true);
  assert.equal(usdTotalsEqual(callOrder, grouped + 1e-8), false);
});

test("seals the frozen manifest and rejects exact protocol or decision-rule drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-manifest-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory);
  const manifestPath = join(directory, "manifest.json");
  const sealPath = losslessManifestSealPath(manifestPath);

  const loaded = await readLosslessRunManifest(manifestPath);
  assert.equal(loaded.sha256, frozen.manifestSha256);

  const changedTimestamp = {
    ...frozen.manifest,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  await writeFile(manifestPath, canonicalJson(changedTimestamp));
  await assert.rejects(
    readLosslessRunManifest(manifestPath),
    /manifest seal mismatch/,
  );

  for (const changed of [
    {
      ...frozen.manifest,
      protocol: {
        ...frozen.manifest.protocol,
        timeoutMs: frozen.manifest.protocol.timeoutMs + 1,
      },
    },
    {
      ...frozen.manifest,
      decisionRules: {
        ...frozen.manifest.decisionRules,
        modelMinimumAggregateGain: 0.99,
      },
    },
  ]) {
    const changedText = canonicalJson(changed);
    await writeFile(manifestPath, changedText);
    await writeFile(
      sealPath,
      canonicalJson({
        schemaVersion: 1,
        diagnostic: "cortex-lossless-memory-formation-v1",
        manifestSha256: sha256Text(changedText),
      }),
    );
    await assert.rejects(
      readLosslessRunManifest(manifestPath),
      /does not match this frozen evaluator/,
    );
  }
});

test("rejects manifest contract drift before instrument calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-contract-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory);
  const manifest = structuredClone(frozen.manifest);
  (
    manifest.decisionRules as unknown as {
      modelMinimumAggregateGain: number;
    }
  ).modelMinimumAggregateGain = 0.99;
  let calls = 0;

  await assert.rejects(
    runLosslessInstrument({
      artifactDirectory: join(directory, "instrument"),
      fixture: frozen.fixture,
      manifest,
      manifestSha256: sha256Text(canonicalJson(manifest)),
      execution: {
        model: manifest.model,
        repository: manifest.repository,
        sourceFiles: frozen.sourceFiles,
      },
      createAnswerExecutor() {
        calls += 1;
        throw new Error("must not create answer executor");
      },
    }),
    /does not match this frozen evaluator/,
  );
  assert.equal(calls, 0);
});

test("rejects an unbound instrument report before formation calls or claims", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-binding-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory);
  const instrument = await createReadyInstrument(directory, frozen);
  const artifactDirectory = join(directory, "formation");
  let calls = 0;

  await assert.rejects(
    runLosslessFormationStage({
      artifactDirectory,
      fixture: frozen.fixture,
      manifest: frozen.manifest,
      manifestSha256: frozen.manifestSha256,
      execution: {
        model: frozen.manifest.model,
        repository: frozen.manifest.repository,
        sourceFiles: frozen.sourceFiles,
      },
      instrumentReport: instrument.report,
      instrumentReportSha256: "f".repeat(64),
      createFormationExecutor() {
        calls += 1;
        throw new Error("must not create formation executor");
      },
    }),
    /instrument report SHA-256 binding mismatch/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    readFile(losslessStageClaimPath(artifactDirectory, "formation"), "utf8"),
    (error: unknown) =>
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
});

test("does not stop a call whose floating reservation is mathematically at the cap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-float-cap-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory, makeFixture(), 0.23);
  const costs = [1.34, 2.43, 0.23];
  let calls = 0;
  const report = await runLosslessInstrument({
    artifactDirectory: join(directory, "instrument"),
    fixture: frozen.fixture,
    manifest: frozen.manifest,
    manifestSha256: frozen.manifestSha256,
    execution: {
      model: frozen.manifest.model,
      repository: frozen.manifest.repository,
      sourceFiles: frozen.sourceFiles,
    },
    createAnswerExecutor() {
      return {
        async execute(stream, task) {
          const telemetry = emptyTelemetry("scripted");
          telemetry.usage.costUsd = costs[calls] ?? 0;
          calls += 1;
          return {
            events: [
              {
                event: "action_call" as const,
                action_id: task.requiredActionIds[0]!,
              },
              { event: "final_answer" as const, content: "Done." },
            ],
            telemetry,
          };
        },
      };
    },
  });
  assert.equal(calls, 3);
  assert.equal(usdTotalsEqual(report.spentUsd, 4), true);
  assert.equal(report.status, "inconclusive");
});

test("uses deterministic common Mulberry32 cluster resampling and type-7 bounds", () => {
  const plan = createBootstrapPlan(12, 200, LOSSLESS_BOOTSTRAP_SEED);
  assert.deepEqual(
    plan,
    createBootstrapPlan(12, 200, LOSSLESS_BOOTSTRAP_SEED),
  );
  const cells: AnswerCellReport[] = [];
  for (let stream = 1; stream <= 12; stream += 1) {
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      for (let task = 1; task <= 3; task += 1) {
        const common = {
          repetition,
          streamId: `stream-${stream}`,
          taskId: `stream-${stream}-task-${task}`,
          memoryType: "decision" as const,
          queryType: "current_in_scope" as const,
          status: "completed" as const,
          telemetry: emptyTelemetry("scripted"),
        };
        cells.push({
          ...common,
          condition: "raw_direct",
          correct: false,
        });
        cells.push({
          ...common,
          condition: "model_enriched_direct",
          correct: stream <= 6,
        });
      }
    }
  }
  const contrast = pairedContrast(
    cells,
    "model_enriched_direct",
    "raw_direct",
    Array.from({ length: 12 }, (_, index) => `stream-${index + 1}`),
    plan,
  );
  assert.equal(contrast.difference, 0.5);
  assert.equal(contrast.mcnemar.treatmentOnlyCorrect, 54);
  assert.equal(contrast.mcnemar.comparatorOnlyCorrect, 0);
  assert.ok(contrast.lower >= 0);
  assert.ok(contrast.upper <= 1);
});

test("formed-claim review shows every earlier eligible claim and declared edges", () => {
  const observations = Array.from({ length: 6 }, (_, index) =>
    makeObservation("review-stream", index + 1),
  );
  const claims: DerivedClaim[] = [
    {
      id: "claim-a",
      kind: "decision",
      subjectKey: "release-route",
      statement: "Eligible A",
      scope: { level: "team", key: "atlas-team" },
      effectiveAt: observations[0]!.authoredAt,
      evidenceIds: [observations[0]!.id],
      supersedesClaimIds: [],
    },
    {
      id: "claim-b",
      kind: "decision",
      subjectKey: "release-route",
      statement: "Eligible B",
      scope: { level: "team", key: "atlas-team" },
      effectiveAt: observations[1]!.authoredAt,
      evidenceIds: [observations[1]!.id],
      supersedesClaimIds: ["claim-a"],
    },
    {
      id: "claim-different-kind",
      kind: "procedure",
      subjectKey: "release-route",
      statement: "Excluded kind",
      scope: { level: "team", key: "atlas-team" },
      effectiveAt: observations[2]!.authoredAt,
      evidenceIds: [observations[2]!.id],
      supersedesClaimIds: [],
    },
    {
      id: "claim-cross-scope",
      kind: "decision",
      subjectKey: "release-route",
      statement: "Excluded scope",
      scope: { level: "project", key: "atlas-project" },
      effectiveAt: observations[3]!.authoredAt,
      evidenceIds: [observations[3]!.id],
      supersedesClaimIds: [],
    },
    {
      id: "claim-different-subject",
      kind: "decision",
      subjectKey: "release-channel",
      statement: "Excluded subject",
      scope: { level: "team", key: "atlas-team" },
      effectiveAt: observations[4]!.authoredAt,
      evidenceIds: [observations[4]!.id],
      supersedesClaimIds: [],
    },
    {
      id: "claim-current",
      kind: "decision",
      subjectKey: "release-route",
      statement: "Current claim",
      scope: { level: "team", key: "atlas-team" },
      effectiveAt: observations[5]!.authoredAt,
      evidenceIds: [observations[5]!.id],
      supersedesClaimIds: ["claim-b"],
    },
  ];
  const run: FormationRunReport = {
    repetition: 1,
    streamId: "review-stream",
    status: "completed",
    completedObservations: observations.length,
    bundle: bundleFromEvidence("review-stream", observations, claims),
    receipts: [],
    telemetry: emptyTelemetry("scripted"),
  };
  const packet = buildFormedClaimReviewPacket([run], 123);
  const entries = [...packet.text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
    (match) => JSON.parse(match[1]!) as Record<string, unknown>,
  );
  const current = entries.find((entry) => {
    const claim = entry.claim;
    return (
      typeof claim === "object" &&
      claim !== null &&
      "statement" in claim &&
      claim.statement === "Current claim"
    );
  });
  assert.ok(current);
  const contexts = current.earlierEligibleClaimContext;
  assert.ok(Array.isArray(contexts));
  assert.equal(contexts.length, 2);
  const declared = contexts.map((context) => {
    assert.ok(typeof context === "object" && context !== null);
    assert.ok("declaredSuperseded" in context);
    return context.declaredSuperseded;
  });
  assert.deepEqual(declared, [false, true]);
  const secondContext = contexts[1];
  assert.ok(typeof secondContext === "object" && secondContext !== null);
  assert.ok("claim" in secondContext);
  assert.ok(
    typeof secondContext.claim === "object" &&
      secondContext.claim !== null &&
      "supersedesClaimIds" in secondContext.claim,
  );
  assert.deepEqual(secondContext.claim.supersedesClaimIds, [
    `${current.reviewId}-EARLIER-1`,
  ]);
  const serialized = JSON.stringify(current);
  assert.equal(serialized.includes("Excluded kind"), false);
  assert.equal(serialized.includes("Excluded scope"), false);
  assert.equal(serialized.includes("Excluded subject"), false);
  const currentClaim = current.claim;
  assert.ok(typeof currentClaim === "object" && currentClaim !== null);
  assert.ok("supersedesClaimIds" in currentClaim);
  assert.equal(typeof current.reviewId, "string");
  assert.deepEqual(currentClaim.supersedesClaimIds, [
    `${current.reviewId}-EARLIER-2`,
  ]);
});

test("returns every frozen decision state in the specified precedence order", () => {
  const supported = {
    preflightIntegrityPassed: true,
    costStopped: false,
    infrastructureFailureCells: 0,
    instrumentHeadroomPassed: true,
    auditComplete: true,
    modelBeatsRawEachRepetition: true,
    aggregateGainMet: true,
    clusteredLowerBoundAboveZero: true,
    noMemoryTypeRegression: true,
    auditAllSupported: true,
    lifecycleIntegrityPassed: true,
    withinCostCap: true,
  };
  assert.equal(decideLosslessFormation(supported), "formation_supported");
  assert.equal(
    decideLosslessFormation({ ...supported, auditAllSupported: false }),
    "formation_not_supported",
  );
  assert.equal(
    decideLosslessFormation({
      ...supported,
      instrumentHeadroomPassed: false,
    }),
    "instrument_invalid",
  );
  assert.equal(
    decideLosslessFormation({
      ...supported,
      preflightIntegrityPassed: false,
      costStopped: true,
    }),
    "instrument_invalid",
  );
  assert.equal(
    decideLosslessFormation({ ...supported, costStopped: true }),
    "inconclusive",
  );
  assert.equal(
    decideLosslessFormation({
      ...supported,
      infrastructureFailureCells: 7,
    }),
    "inconclusive",
  );
  assert.equal(
    decideLosslessFormation({ ...supported, auditComplete: false }),
    "instrument_invalid",
  );
});

test("retains every planned instrument cell when cost reservation stops calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-cost-"));
  temporaryDirectories.push(directory);
  const fixture = makeFixture();
  const manifestPath = join(directory, "manifest.json");
  const sourceFiles = { "diagnostic.ts": "a".repeat(64) };
  const manifest: LosslessRunManifest = await freezeLosslessRunManifest({
    manifestPath,
    batchId: "lossless-test",
    fixture,
    model: model(3),
    repository: { commit: "fixture", dirty: false },
    sourceFiles,
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  const manifestSha256 = sha256Text(await readFile(manifestPath, "utf8"));
  let calls = 0;
  const report = await runLosslessInstrument({
    artifactDirectory: join(directory, "run"),
    fixture,
    manifest,
    manifestSha256,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      sourceFiles,
    },
    createAnswerExecutor() {
      return {
        async execute(stream, task) {
          calls += 1;
          const telemetry = emptyTelemetry("scripted");
          telemetry.usage.costUsd = 2;
          return {
            events: [
              {
                event: "action_call" as const,
                action_id: task.requiredActionIds[0]!,
              },
              { event: "final_answer" as const, content: "Done." },
            ],
            telemetry,
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  assert.equal(calls, 1);
  assert.equal(report.cells.length, 216);
  assert.equal(report.cells[0]!.status, "completed");
  assert.equal(
    report.cells.filter((cell) => cell.status === "cost_stopped").length,
    215,
  );
  assert.equal(report.status, "inconclusive");
});

test("retains a failed answer cell and continues the frozen instrument plan", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-failure-"));
  temporaryDirectories.push(directory);
  const fixture = makeFixture();
  const manifestPath = join(directory, "manifest.json");
  const sourceFiles = { "diagnostic.ts": "a".repeat(64) };
  const manifest = await freezeLosslessRunManifest({
    manifestPath,
    batchId: "lossless-failure-test",
    fixture,
    model: model(),
    repository: { commit: "fixture", dirty: false },
    sourceFiles,
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  const manifestSha256 = sha256Text(await readFile(manifestPath, "utf8"));
  let calls = 0;
  const report = await runLosslessInstrument({
    artifactDirectory: join(directory, "run"),
    fixture,
    manifest,
    manifestSha256,
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      sourceFiles,
    },
    createAnswerExecutor() {
      return {
        async execute(stream, task) {
          calls += 1;
          if (calls === 1) throw new Error("invalid model receipt");
          return {
            events: [
              {
                event: "action_call" as const,
                action_id: task.requiredActionIds[0]!,
              },
              { event: "final_answer" as const, content: "Done." },
            ],
            telemetry: emptyTelemetry("scripted"),
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  });

  assert.equal(calls, 216);
  assert.equal(report.cells.length, 216);
  assert.equal(
    report.cells.filter((cell) => cell.status === "condition_failure").length,
    1,
  );
  assert.equal(
    report.cells.filter((cell) => cell.status === "completed").length,
    215,
  );
});

test("stops provider calls after the seventh infrastructure failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-infra-"));
  temporaryDirectories.push(directory);
  const fixture = makeFixture();
  const manifestPath = join(directory, "manifest.json");
  const sourceFiles = { "diagnostic.ts": "a".repeat(64) };
  const manifest = await freezeLosslessRunManifest({
    manifestPath,
    batchId: "lossless-infra-test",
    fixture,
    model: model(),
    repository: { commit: "fixture", dirty: false },
    sourceFiles,
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  let calls = 0;
  const report = await runLosslessInstrument({
    artifactDirectory: join(directory, "run"),
    fixture,
    manifest,
    manifestSha256: sha256Text(await readFile(manifestPath, "utf8")),
    execution: {
      model: manifest.model,
      repository: manifest.repository,
      sourceFiles,
    },
    createAnswerExecutor() {
      return {
        async execute() {
          calls += 1;
          throw new PiAgentRunError(
            "provider timed out",
            emptyTelemetry("scripted"),
          );
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  });
  assert.equal(calls, 7);
  assert.equal(report.infrastructureFailureCells, 7);
  assert.equal(report.cells.length, 216);
  assert.equal(
    report.cells.filter(
      (cell) => cell.status === "inconclusive_stopped",
    ).length,
    209,
  );
  assert.equal(report.status, "inconclusive");
});

test("atomically claims instrument before concurrent or sequential executor replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-claim-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory);
  const artifactDirectory = join(directory, "instrument-run");
  let calls = 0;
  const options = {
    artifactDirectory,
    fixture: frozen.fixture,
    manifest: frozen.manifest,
    manifestSha256: frozen.manifestSha256,
    execution: {
      model: frozen.manifest.model,
      repository: frozen.manifest.repository,
      sourceFiles: frozen.sourceFiles,
    },
    createAnswerExecutor() {
      return {
        async execute(stream: LosslessFixtureStream, task: LosslessFixtureStream["tasks"][number]) {
          calls += 1;
          return {
            events: [
              {
                event: "action_call" as const,
                action_id: task.requiredActionIds[0]!,
              },
              { event: "final_answer" as const, content: "Done." },
            ],
            telemetry: emptyTelemetry("scripted"),
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  };
  const concurrent = await Promise.allSettled([
    runLosslessInstrument(options),
    runLosslessInstrument(options),
  ]);
  assert.equal(
    concurrent.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrent.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof Error &&
        (result.reason as NodeJS.ErrnoException).code === "EEXIST",
    ).length,
    1,
  );
  assert.equal(calls, 216);
  await assert.rejects(
    runLosslessInstrument(options),
    (error: unknown) =>
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "EEXIST",
  );
  assert.equal(calls, 216);
});

test("concurrent strict claims elect one owner for every executable stage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-owner-"));
  temporaryDirectories.push(directory);
  const manifestSha256 = "a".repeat(64);
  for (const stage of ["instrument", "formation", "treatment"] as const) {
    const stageDirectory = join(directory, stage);
    const results = await Promise.allSettled([
      claimLosslessStage(stageDirectory, stage, manifestSha256),
      claimLosslessStage(stageDirectory, stage, manifestSha256),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof Error &&
          (result.reason as NodeJS.ErrnoException).code === "EEXIST",
      ).length,
      1,
    );
  }
});

test("formation and treatment sequential replay fails before new executor calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cortex-lossless-stage-"));
  temporaryDirectories.push(directory);
  const frozen = await freezeTestManifest(directory);
  const instrument = await createReadyInstrument(directory, frozen);
  const formation = await createEmptyFormation(directory, frozen, instrument);
  const formationDirectory = join(directory, "formation-source");
  let formationFactories = 0;
  await assert.rejects(
    runLosslessFormationStage({
      artifactDirectory: formationDirectory,
      fixture: frozen.fixture,
      manifest: frozen.manifest,
      manifestSha256: frozen.manifestSha256,
      execution: {
        model: frozen.manifest.model,
        repository: frozen.manifest.repository,
        sourceFiles: frozen.sourceFiles,
      },
      instrumentReport: instrument.report,
      instrumentReportSha256: instrument.sha256,
      createFormationExecutor() {
        formationFactories += 1;
        throw new Error("must not create formation executor");
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "EEXIST",
  );
  assert.equal(formationFactories, 0);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        losslessStageClaimPath(formationDirectory, "formation"),
        "utf8",
      ),
    ),
    {
      manifestSha256: frozen.manifestSha256,
      schemaVersion: 1,
      stage: "formation",
    },
  );

  const treatmentDirectory = join(directory, "treatment-source");
  const audit = canonicalJson({
    schemaVersion: 1,
    reviewType: "formed-claim-review",
    runManifestSha256: frozen.manifestSha256,
    formationReportSha256: formation.sha256,
    sourcePacketSha256: formation.report.claimReviewPacketSha256,
    entries: [],
  });
  let treatmentCalls = 0;
  const treatmentOptions = {
    artifactDirectory: treatmentDirectory,
    fixture: frozen.fixture,
    manifest: frozen.manifest,
    manifestSha256: frozen.manifestSha256,
    execution: {
      model: frozen.manifest.model,
      repository: frozen.manifest.repository,
      sourceFiles: frozen.sourceFiles,
    },
    instrumentReport: instrument.report,
    instrumentReportSha256: instrument.sha256,
    formationReport: formation.report,
    formationReportSha256: formation.sha256,
    claimAuditRaw: audit,
    createAnswerExecutor() {
      return {
        async execute(stream: LosslessFixtureStream, task: LosslessFixtureStream["tasks"][number]) {
          treatmentCalls += 1;
          return {
            events: [
              {
                event: "action_call" as const,
                action_id: task.requiredActionIds[0]!,
              },
              { event: "final_answer" as const, content: "Done." },
            ],
            telemetry: emptyTelemetry("scripted"),
          };
        },
      };
    },
    now: () => new Date("2026-08-31T00:00:00Z"),
  };
  await runLosslessTreatmentStage(treatmentOptions);
  assert.equal(treatmentCalls, 108);
  await assert.rejects(
    runLosslessTreatmentStage(treatmentOptions),
    (error: unknown) =>
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "EEXIST",
  );
  assert.equal(treatmentCalls, 108);
});
