import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  MAB_CHUNK_TOKEN_LIMIT,
  MAB_DATASET_REPOSITORY,
  MAB_DATASET_REVISION,
  MAB_PARQUET_FILES,
  scoreMabOutput,
  selectMabQuestions,
  type MabPreparedStream,
  type MabSource,
} from "./mab-adapter.js";
import {
  streamForManifest,
  type MabBatchModel,
  type MabExecutionPolicy,
  type MabManifestStream,
} from "./mab-batch.js";
import {
  acquireMabMemory,
  createRawMabMemory,
  type MabAcquisitionReport,
  type MabConditionExecutors,
  type MabExecutorContext,
  type MabQuestion,
  type MabQuestionReport,
  type MabStream,
} from "./mab-condition.js";
import {
  writePrivateJson,
  writePrivateJsonExclusive,
} from "./artifacts.js";
import { JsonlEventSink } from "./artifacts.js";
import { LifecycleController } from "./controller.js";
import { AtomicMemoryStore } from "./memory-store.js";
import { persistMabEvidence } from "./mab-evidence.js";
import {
  collectErrorTelemetry,
  combineTelemetry,
  sessionTelemetry,
  zeroTelemetry,
} from "./telemetry.js";
import type {
  AdvisoryMemoryExecutor,
  DirectMemoryExecutor,
  ExecutionTelemetry,
  MemoryDraft,
  PhaseExecutor,
} from "./types.js";

export const MAB_CAUSAL_SOURCES = [
  "factconsolidation_mh_6k",
  "factconsolidation_mh_32k",
] as const satisfies readonly MabSource[];

export type MabCausalSource = (typeof MAB_CAUSAL_SOURCES)[number];

export const MAB_CAUSAL_ARMS = [
  "raw-direct",
  "semantic-direct",
  "raw-enforced",
  "semantic-enforced",
] as const;

export type MabCausalArm = (typeof MAB_CAUSAL_ARMS)[number];
export type MabCausalFormation = "raw" | "semantic";
export type MabCausalUse = "direct" | "enforced";

export interface MabCausalThresholds {
  confidenceLevel: number;
  maximumFailureRate: number;
  maximumCostUsd: number;
  bootstrapSamples: number;
}

export interface MabCausalManifestRun {
  repetition: number;
  source: MabCausalSource;
  armOrder: MabCausalArm[];
}

export interface MabCausalManifest {
  schemaVersion: 1;
  benchmark: {
    repository: typeof MAB_DATASET_REPOSITORY;
    revision: typeof MAB_DATASET_REVISION;
    parquetSha256: Record<string, string>;
    adapted: true;
  };
  batchId: string;
  createdAt: string;
  evidenceMode: "diagnostic";
  questionSelection: {
    strategy: "explicit-previously-exposed-manifest";
    sourceManifestSha256: string;
    forbiddenManifestSha256: string[];
  };
  questionsPerSource: number;
  repetitions: number;
  chunkTokenLimit: number;
  sources: readonly MabCausalSource[];
  arms: readonly MabCausalArm[];
  streams: MabManifestStream[];
  runs: MabCausalManifestRun[];
  model: MabBatchModel;
  repository: {
    commit: string;
    dirty: boolean;
  };
  source: unknown;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    architecture: string;
  };
  protocol: {
    adapter: "cortex-mab-causal-v1";
    semanticAcquisition: "once-per-source-repetition";
    rawFormation: "exact-immutable-source-chunks";
    directUseMemory: "complete-frozen-store";
    enforcedWakeMemory: "complete-frozen-store";
    enforcedWorkMemory: "wake-selected";
    answerEvidence: "none";
    answerWrites: "prohibited";
    questionIsolation: "fresh-runtime-and-store";
    failureDenominator: "all-planned-questions";
    execution: MabExecutionPolicy;
  };
  thresholds: MabCausalThresholds;
}

export interface MabCausalFreezeOptions {
  manifestPath: string;
  batchId: string;
  streams: readonly MabPreparedStream[];
  exposedQuestionIds: readonly string[];
  exposedManifestSha256: string;
  forbiddenQuestionIds: readonly string[];
  forbiddenManifestSha256: readonly string[];
  questionsPerSource: number;
  repetitions: number;
  model: MabBatchModel;
  repository: MabCausalManifest["repository"];
  source: unknown;
  execution: MabExecutionPolicy;
  thresholds: MabCausalThresholds;
  now?: () => Date;
}

interface FrozenMemory {
  schemaVersion: 1;
  formation: MabCausalFormation;
  memorySha256: string;
  records: MemoryDraft[];
}

export interface MabCausalArmReport {
  schemaVersion: 1;
  source: MabCausalSource;
  repetition: number;
  arm: MabCausalArm;
  formation: MabCausalFormation;
  use: MabCausalUse;
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  inputMemorySha256?: string;
  inputMemoryFileSha256?: string;
  questions: MabQuestionReport[];
  totalQuestions: number;
  completedQuestions: number;
  correct: number;
  accuracy: number;
  errors: number;
  telemetry: ExecutionTelemetry;
}

export interface MabCausalAggregate {
  arm: MabCausalArm;
  reports: number;
  questions: number;
  completed: number;
  correct: number;
  errors: number;
  accuracy: number;
  failureRate: number;
  telemetry: ExecutionTelemetry;
}

export type MabCausalContrastId =
  | "semantic-formation-under-direct-use"
  | "enforced-use-on-raw-memory"
  | "enforced-use-on-semantic-memory"
  | "formation-use-interaction";

export interface MabCausalContrast {
  id: MabCausalContrastId;
  clusters: number;
  questions: number;
  difference: number;
  confidenceLevel: number;
  lower: number;
  upper: number;
}

export interface MabCausalBatchReport {
  schemaVersion: 1;
  batchId: string;
  status: "running" | "completed" | "cost-limited";
  startedAt: string;
  completedAt?: string;
  artifactDirectory: string;
  manifest: MabCausalManifest;
  semanticAcquisitions: {
    source: MabCausalSource;
    repetition: number;
    report: MabAcquisitionReport;
  }[];
  reports: MabCausalArmReport[];
  aggregates: Record<MabCausalArm, MabCausalAggregate>;
  contrasts: MabCausalContrast[];
  checks: {
    inputStoreIdentityMatched: boolean;
    noAnswerEvidence: boolean;
    noAnswerWrites: boolean;
    runComplete: boolean;
    modelMatched: boolean;
    repositoryMatched: boolean;
    sourceMatched: boolean;
    runtimeMatched: boolean;
    failureRateMet: boolean;
    costLimitMet: boolean;
  };
  acquisitionTelemetry: ExecutionTelemetry;
  totalTelemetry: ExecutionTelemetry;
}

export interface MabCausalRunOptions {
  artifactDirectory: string;
  manifest: MabCausalManifest;
  streams: readonly MabPreparedStream[];
  execution: {
    model: MabBatchModel;
    repository: MabCausalManifest["repository"];
    source: unknown;
  };
  createExecutors(
    context: MabExecutorContext,
  ): MabConditionExecutors | Promise<MabConditionExecutors>;
  now?: () => Date;
}

interface MabCausalBudget {
  spentUsd: number;
  maximumUsd: number;
  reservePerExecutionUsd: number;
  stopped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryDraft(value: unknown): value is MemoryDraft {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.kind === "learning" || value.kind === "decision") &&
    typeof value.text === "string" &&
    value.text.length > 0 &&
    typeof value.evidence === "string" &&
    value.evidence.length > 0 &&
    (value.source === "operator" ||
      value.source === "observed" ||
      value.source === "imported")
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function memorySha256(memory: readonly MemoryDraft[]): string {
  return sha256(JSON.stringify(memory));
}

function benchmarkParquetSha256(): Record<string, string> {
  return Object.fromEntries(
    Object.values(MAB_PARQUET_FILES).map((descriptor) => [
      descriptor.split,
      descriptor.sha256,
    ]),
  );
}

export async function readQuestionManifestSelection(
  path: string,
): Promise<{ questionIds: string[]; sha256: string }> {
  const bytes = await readFile(path);
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.streams)) {
    throw new Error("invalid question-source manifest");
  }
  const questionIds = parsed.streams.flatMap((stream) => {
    if (!isRecord(stream) || !Array.isArray(stream.questions)) {
      throw new Error("invalid question-source manifest");
    }
    return stream.questions.map((question) => {
      if (
        !isRecord(question) ||
        typeof question.id !== "string" ||
        question.id.length === 0
      ) {
        throw new Error("invalid question-source manifest");
      }
      return question.id;
    });
  });
  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error("question-source manifest contains duplicate IDs");
  }
  return { questionIds, sha256: sha256(bytes) };
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function validateThresholds(thresholds: MabCausalThresholds): void {
  if (
    !Number.isFinite(thresholds.confidenceLevel) ||
    thresholds.confidenceLevel <= 0 ||
    thresholds.confidenceLevel >= 1
  ) {
    throw new Error("confidenceLevel must be between zero and one");
  }
  if (
    !Number.isFinite(thresholds.maximumFailureRate) ||
    thresholds.maximumFailureRate < 0 ||
    thresholds.maximumFailureRate > 1
  ) {
    throw new Error("maximumFailureRate must be between zero and one");
  }
  if (
    !Number.isFinite(thresholds.maximumCostUsd) ||
    thresholds.maximumCostUsd <= 0
  ) {
    throw new Error("maximumCostUsd must be positive");
  }
  validatePositiveInteger(thresholds.bootstrapSamples, "bootstrapSamples");
}

function armOrder(index: number): MabCausalArm[] {
  const offset = index % MAB_CAUSAL_ARMS.length;
  return [
    ...MAB_CAUSAL_ARMS.slice(offset),
    ...MAB_CAUSAL_ARMS.slice(0, offset),
  ];
}

function frozenQuestion(
  prepared: MabPreparedStream,
  questionId: string,
): {
  id: string;
  promptSha256: string;
  retrievalQuerySha256: string;
} {
  const index = prepared.qaPairIds.indexOf(questionId);
  const question = prepared.questions[index];
  const answers = prepared.answers[index];
  if (index < 0 || !question || !answers) {
    throw new Error(
      `question-source manifest contains an unavailable question for ${prepared.source}`,
    );
  }
  const formatted = selectMabQuestions(
    [prepared],
    prepared.questions.length,
  ).find((candidate) => candidate.qaPairId === questionId);
  if (!formatted) {
    throw new Error(`could not format question for ${prepared.source}`);
  }
  return {
    id: questionId,
    promptSha256: sha256(formatted.prompt),
    retrievalQuerySha256: sha256(formatted.question),
  };
}

export async function freezeMabCausalManifest(
  options: MabCausalFreezeOptions,
): Promise<MabCausalManifest> {
  validatePositiveInteger(options.questionsPerSource, "questionsPerSource");
  validatePositiveInteger(options.repetitions, "repetitions");
  validateThresholds(options.thresholds);
  if (options.repository.dirty) {
    throw new Error("refusing to freeze a dirty Cortex worktree");
  }
  if (!isSha256(options.exposedManifestSha256)) {
    throw new Error("exposed manifest SHA-256 is invalid");
  }
  if (
    options.forbiddenManifestSha256.length === 0 ||
    options.forbiddenManifestSha256.some((hash) => !isSha256(hash))
  ) {
    throw new Error("at least one valid forbidden manifest is required");
  }
  const forbidden = new Set(options.forbiddenQuestionIds);
  const exposed = new Set(options.exposedQuestionIds);
  if (exposed.size !== options.exposedQuestionIds.length) {
    throw new Error("exposed question IDs contain duplicates");
  }
  const availableQuestionIds = new Set(
    options.streams.flatMap((stream) => stream.qaPairIds),
  );
  if (
    options.exposedQuestionIds.some(
      (id) => !availableQuestionIds.has(id),
    )
  ) {
    throw new Error(
      "question-source manifest contains unavailable question IDs",
    );
  }
  const overlap = options.exposedQuestionIds.filter((id) =>
    forbidden.has(id),
  );
  if (overlap.length > 0) {
    throw new Error(
      "exposed question source overlaps the forbidden holdout manifest",
    );
  }
  const preparedBySource = new Map(
    options.streams.map((stream) => [stream.source, stream]),
  );
  const streams = MAB_CAUSAL_SOURCES.map((source): MabManifestStream => {
    const prepared = preparedBySource.get(source);
    if (!prepared) {
      throw new Error(`prepared stream is missing ${source}`);
    }
    const selectedIds = options.exposedQuestionIds.filter((id) =>
      prepared.qaPairIds.includes(id),
    );
    if (selectedIds.length !== options.questionsPerSource) {
      throw new Error(
        `${source} has ${selectedIds.length} exposed questions, expected ${options.questionsPerSource}`,
      );
    }
    return {
      source,
      contextHash: prepared.contextHash,
      chunkCount: prepared.chunks.length,
      chunkSha256: prepared.chunks.map((chunk) => sha256(chunk)),
      questions: selectedIds.map((id) => frozenQuestion(prepared, id)),
    };
  });
  const selectedIds = new Set(
    streams.flatMap((stream) =>
      stream.questions.map((question) => question.id),
    ),
  );
  if ([...selectedIds].some((id) => !exposed.has(id))) {
    throw new Error("frozen questions are absent from the exposed manifest");
  }
  const runs: MabCausalManifestRun[] = [];
  let orderIndex = 0;
  for (
    let repetition = 1;
    repetition <= options.repetitions;
    repetition += 1
  ) {
    for (const source of MAB_CAUSAL_SOURCES) {
      runs.push({
        repetition,
        source,
        armOrder: armOrder(orderIndex),
      });
      orderIndex += 1;
    }
  }
  const manifest: MabCausalManifest = {
    schemaVersion: 1,
    benchmark: {
      repository: MAB_DATASET_REPOSITORY,
      revision: MAB_DATASET_REVISION,
      parquetSha256: benchmarkParquetSha256(),
      adapted: true,
    },
    batchId: options.batchId,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    evidenceMode: "diagnostic",
    questionSelection: {
      strategy: "explicit-previously-exposed-manifest",
      sourceManifestSha256: options.exposedManifestSha256,
      forbiddenManifestSha256: [...options.forbiddenManifestSha256],
    },
    questionsPerSource: options.questionsPerSource,
    repetitions: options.repetitions,
    chunkTokenLimit: MAB_CHUNK_TOKEN_LIMIT,
    sources: MAB_CAUSAL_SOURCES,
    arms: MAB_CAUSAL_ARMS,
    streams,
    runs,
    model: structuredClone(options.model),
    repository: structuredClone(options.repository),
    source: structuredClone(options.source),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    protocol: {
      adapter: "cortex-mab-causal-v1",
      semanticAcquisition: "once-per-source-repetition",
      rawFormation: "exact-immutable-source-chunks",
      directUseMemory: "complete-frozen-store",
      enforcedWakeMemory: "complete-frozen-store",
      enforcedWorkMemory: "wake-selected",
      answerEvidence: "none",
      answerWrites: "prohibited",
      questionIsolation: "fresh-runtime-and-store",
      failureDenominator: "all-planned-questions",
      execution: structuredClone(options.execution),
    },
    thresholds: structuredClone(options.thresholds),
  };
  await writePrivateJsonExclusive(resolve(options.manifestPath), manifest);
  return manifest;
}

function isCausalArm(value: unknown): value is MabCausalArm {
  return (
    typeof value === "string" &&
    MAB_CAUSAL_ARMS.includes(value as MabCausalArm)
  );
}

function isCausalSource(value: unknown): value is MabCausalSource {
  return (
    typeof value === "string" &&
    MAB_CAUSAL_SOURCES.includes(value as MabCausalSource)
  );
}

function isModel(value: unknown): value is MabBatchModel {
  if (!isRecord(value) || !isRecord(value.costPerMillionTokens)) {
    return false;
  }
  return (
    typeof value.provider === "string" &&
    typeof value.requestedId === "string" &&
    typeof value.resolvedId === "string" &&
    typeof value.requestedThinkingLevel === "string" &&
    typeof value.effectiveThinkingLevel === "string" &&
    typeof value.contextWindow === "number" &&
    typeof value.maxOutputTokens === "number" &&
    typeof value.maximumInvocationCostUsd === "number" &&
    Number.isFinite(value.maximumInvocationCostUsd) &&
    value.maximumInvocationCostUsd > 0 &&
    typeof value.costPerMillionTokens.input === "number" &&
    typeof value.costPerMillionTokens.output === "number" &&
    typeof value.costPerMillionTokens.cacheRead === "number" &&
    typeof value.costPerMillionTokens.cacheWrite === "number"
  );
}

function isExecutionPolicy(value: unknown): value is MabExecutionPolicy {
  return (
    isRecord(value) &&
    typeof value.maxAttempts === "number" &&
    typeof value.maxTurns === "number" &&
    typeof value.timeoutMs === "number" &&
    value.wakeIdentitySelection ===
      "model-memory-id-host-active-record-binding" &&
    value.acquisitionWorkMemory === "complete-mounted" &&
    value.answerWorkMemory === "wake-selected" &&
    value.questionIsolation === "fresh-runtime-and-cloned-store" &&
    value.evidenceRetention === "immutable-source-chunks-sha256" &&
    value.evidenceRetrieval === "shared-deterministic-bm25" &&
    value.evidenceCitationSelection ===
      "model-evidence-id-host-reference-binding" &&
    value.evidencePromptProjection === "id-and-text-only" &&
    value.memoryCandidateIdentity ===
      "host-validated-unique-and-insert-only" &&
    value.memoryWriteBinding ===
      "model-candidate-id-host-content-binding" &&
    value.answerMemoryCandidates ===
      "prohibited-without-external-feedback" &&
    value.answerMemoryWrites ===
      "prohibited-without-external-feedback" &&
    value.answerSleepExecution ===
      "deterministic-empty-when-no-candidates" &&
    value.workEvidenceComparison === "structured-competing-claims" &&
    typeof value.evidenceTopK === "number"
  );
}

function isManifestStream(value: unknown): value is MabManifestStream {
  return (
    isRecord(value) &&
    isCausalSource(value.source) &&
    isSha256(value.contextHash) &&
    Number.isInteger(value.chunkCount) &&
    Array.isArray(value.chunkSha256) &&
    value.chunkSha256.length === value.chunkCount &&
    value.chunkSha256.every(isSha256) &&
    Array.isArray(value.questions) &&
    value.questions.every(
      (question) =>
        isRecord(question) &&
        typeof question.id === "string" &&
        isSha256(question.promptSha256) &&
        isSha256(question.retrievalQuerySha256),
    )
  );
}

function isCausalManifest(value: unknown): value is MabCausalManifest {
  if (
    !isRecord(value) ||
    !isRecord(value.benchmark) ||
    !isRecord(value.benchmark.parquetSha256) ||
    !isRecord(value.questionSelection) ||
    !isRecord(value.repository) ||
    !isRecord(value.runtime) ||
    !isRecord(value.protocol) ||
    !isRecord(value.thresholds)
  ) {
    return false;
  }
  const protocol = value.protocol;
  return (
    value.schemaVersion === 1 &&
    value.benchmark.repository === MAB_DATASET_REPOSITORY &&
    value.benchmark.revision === MAB_DATASET_REVISION &&
    value.benchmark.adapted === true &&
    typeof value.batchId === "string" &&
    typeof value.createdAt === "string" &&
    value.evidenceMode === "diagnostic" &&
    value.questionSelection.strategy ===
      "explicit-previously-exposed-manifest" &&
    isSha256(value.questionSelection.sourceManifestSha256) &&
    Array.isArray(value.questionSelection.forbiddenManifestSha256) &&
    value.questionSelection.forbiddenManifestSha256.length > 0 &&
    value.questionSelection.forbiddenManifestSha256.every(isSha256) &&
    Number.isInteger(value.questionsPerSource) &&
    Number.isInteger(value.repetitions) &&
    value.chunkTokenLimit === MAB_CHUNK_TOKEN_LIMIT &&
    Array.isArray(value.sources) &&
    isDeepStrictEqual(value.sources, MAB_CAUSAL_SOURCES) &&
    Array.isArray(value.arms) &&
    isDeepStrictEqual(value.arms, MAB_CAUSAL_ARMS) &&
    Array.isArray(value.streams) &&
    value.streams.every(isManifestStream) &&
    Array.isArray(value.runs) &&
    value.runs.every(
      (run) =>
        isRecord(run) &&
        Number.isInteger(run.repetition) &&
        isCausalSource(run.source) &&
        Array.isArray(run.armOrder) &&
        run.armOrder.every(isCausalArm),
    ) &&
    isModel(value.model) &&
    typeof value.repository.commit === "string" &&
    value.repository.dirty === false &&
    typeof value.runtime.node === "string" &&
    typeof value.runtime.platform === "string" &&
    typeof value.runtime.architecture === "string" &&
    protocol.adapter === "cortex-mab-causal-v1" &&
    protocol.semanticAcquisition === "once-per-source-repetition" &&
    protocol.rawFormation === "exact-immutable-source-chunks" &&
    protocol.directUseMemory === "complete-frozen-store" &&
    protocol.enforcedWakeMemory === "complete-frozen-store" &&
    protocol.enforcedWorkMemory === "wake-selected" &&
    protocol.answerEvidence === "none" &&
    protocol.answerWrites === "prohibited" &&
    protocol.questionIsolation === "fresh-runtime-and-store" &&
    protocol.failureDenominator === "all-planned-questions" &&
    isExecutionPolicy(protocol.execution) &&
    typeof value.thresholds.confidenceLevel === "number" &&
    typeof value.thresholds.maximumFailureRate === "number" &&
    typeof value.thresholds.maximumCostUsd === "number" &&
    typeof value.thresholds.bootstrapSamples === "number"
  );
}

function validateManifestShape(manifest: MabCausalManifest): void {
  validatePositiveInteger(manifest.questionsPerSource, "questionsPerSource");
  validatePositiveInteger(manifest.repetitions, "repetitions");
  validatePositiveInteger(
    manifest.protocol.execution.maxAttempts,
    "maxAttempts",
  );
  validatePositiveInteger(
    manifest.protocol.execution.maxTurns,
    "maxTurns",
  );
  validatePositiveInteger(
    manifest.protocol.execution.timeoutMs,
    "timeoutMs",
  );
  validatePositiveInteger(
    manifest.protocol.execution.evidenceTopK,
    "evidenceTopK",
  );
  validateThresholds(manifest.thresholds);
  if (
    !isDeepStrictEqual(
      manifest.benchmark.parquetSha256,
      benchmarkParquetSha256(),
    )
  ) {
    throw new Error("causal manifest benchmark checksums are invalid");
  }
  if (manifest.questionSelection.forbiddenManifestSha256.length === 0) {
    throw new Error(
      "causal manifest requires a forbidden holdout provenance hash",
    );
  }
  if (manifest.streams.length !== MAB_CAUSAL_SOURCES.length) {
    throw new Error("causal manifest must contain both multi-hop streams");
  }
  const questionIds = manifest.streams.flatMap((stream) =>
    stream.questions.map((question) => question.id),
  );
  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error("causal manifest contains duplicate question IDs");
  }
  for (const source of MAB_CAUSAL_SOURCES) {
    const matchingStreams = manifest.streams.filter(
      (stream) => stream.source === source,
    );
    if (
      matchingStreams.length !== 1 ||
      matchingStreams[0]?.questions.length !==
        manifest.questionsPerSource
    ) {
      throw new Error(`causal manifest stream is invalid for ${source}`);
    }
  }
  const expectedRuns = manifest.repetitions * MAB_CAUSAL_SOURCES.length;
  if (manifest.runs.length !== expectedRuns) {
    throw new Error("causal manifest run count is invalid");
  }
  const keys = new Set<string>();
  for (const run of manifest.runs) {
    if (
      run.repetition < 1 ||
      run.repetition > manifest.repetitions ||
      run.armOrder.length !== MAB_CAUSAL_ARMS.length ||
      new Set(run.armOrder).size !== MAB_CAUSAL_ARMS.length
    ) {
      throw new Error("causal manifest run schedule is invalid");
    }
    const key = `${run.repetition}|${run.source}`;
    if (keys.has(key)) {
      throw new Error("causal manifest contains duplicate run blocks");
    }
    keys.add(key);
  }
}

export async function readMabCausalManifest(
  path: string,
): Promise<MabCausalManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isCausalManifest(parsed)) {
    throw new Error("invalid causal MemoryAgentBench manifest");
  }
  validateManifestShape(parsed);
  return parsed;
}

function armFactors(arm: MabCausalArm): {
  formation: MabCausalFormation;
  use: MabCausalUse;
} {
  return {
    formation: arm.startsWith("raw") ? "raw" : "semantic",
    use: arm.endsWith("direct") ? "direct" : "enforced",
  };
}

async function writeFrozenMemory(
  path: string,
  formation: MabCausalFormation,
  memory: readonly MemoryDraft[],
): Promise<{ memorySha256: string; fileSha256: string }> {
  const frozen: FrozenMemory = {
    schemaVersion: 1,
    formation,
    memorySha256: memorySha256(memory),
    records: memory.map((record) => structuredClone(record)),
  };
  await writePrivateJsonExclusive(path, frozen);
  return {
    memorySha256: frozen.memorySha256,
    fileSha256: sha256(await readFile(path)),
  };
}

async function copyAndReadFrozenMemory(
  sourcePath: string,
  destinationPath: string,
): Promise<{
  frozen: FrozenMemory;
  fileSha256: string;
}> {
  await copyFile(
    sourcePath,
    destinationPath,
    constants.COPYFILE_EXCL,
  );
  await chmod(destinationPath, 0o600);
  const bytes = await readFile(destinationPath);
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    (parsed.formation !== "raw" && parsed.formation !== "semantic") ||
    !isSha256(parsed.memorySha256) ||
    !Array.isArray(parsed.records) ||
    !parsed.records.every(isMemoryDraft)
  ) {
    throw new Error("frozen causal memory is invalid");
  }
  if (memorySha256(parsed.records) !== parsed.memorySha256) {
    throw new Error("frozen causal memory digest does not match");
  }
  return {
    frozen: {
      schemaVersion: 1,
      formation: parsed.formation,
      memorySha256: parsed.memorySha256,
      records: structuredClone(parsed.records),
    },
    fileSha256: sha256(bytes),
  };
}

export class MabCausalCostLimitError extends Error {
  constructor(maximumUsd: number) {
    super(
      `Causal MemoryAgentBench cost limit reached before the next model execution ($${maximumUsd.toFixed(2)})`,
    );
    this.name = "MabCausalCostLimitError";
  }
}

function budgetExecutors(
  executors: MabConditionExecutors,
  budget: MabCausalBudget,
): MabConditionExecutors {
  const run = async <T extends { telemetry: ExecutionTelemetry }>(
    execute: () => Promise<T>,
  ): Promise<T> => {
    if (
      budget.spentUsd + budget.reservePerExecutionUsd >
      budget.maximumUsd
    ) {
      budget.stopped = true;
      throw new MabCausalCostLimitError(budget.maximumUsd);
    }
    try {
      const result = await execute();
      budget.spentUsd += result.telemetry.usage.costUsd;
      return result;
    } catch (error) {
      budget.spentUsd += collectErrorTelemetry(
        error,
        "unknown",
      ).usage.costUsd;
      throw error;
    }
  };
  const directMemoryExecutor: DirectMemoryExecutor = {
    execute(task, memory, evidence) {
      return run(() =>
        executors.directMemoryExecutor.execute(task, memory, evidence),
      );
    },
  };
  const advisoryMemoryExecutor: AdvisoryMemoryExecutor = {
    execute(task, memory, mode, evidence) {
      return run(() =>
        executors.advisoryMemoryExecutor.execute(
          task,
          memory,
          mode,
          evidence,
        ),
      );
    },
  };
  const phaseExecutor: PhaseExecutor = {
    async execute(request) {
      if (
        request.phase === "sleep" &&
        request.writePolicy === "prohibit-unconfirmed" &&
        request.work.memoryCandidates.length === 0
      ) {
        const result = await executors.phaseExecutor.execute(request);
        if (result.telemetry.usage.costUsd !== 0) {
          budget.spentUsd += result.telemetry.usage.costUsd;
          throw new Error(
            "prohibited answer SLEEP unexpectedly incurred model cost",
          );
        }
        return result;
      }
      return run(() => executors.phaseExecutor.execute(request));
    },
  };
  return {
    directMemoryExecutor,
    advisoryMemoryExecutor,
    phaseExecutor,
  };
}

function questionError(
  question: MabQuestion,
  memoryRecords: number,
  model: string,
  timestamp: string,
  error: unknown,
): MabQuestionReport {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Error", message: String(error) };
  return {
    questionId: question.id,
    status: "error",
    startedAt: timestamp,
    completedAt: timestamp,
    correct: false,
    memoryRecordsBefore: memoryRecords,
    memoryRecordsAfter: memoryRecords,
    memoryGrowth: 0,
    retrieval: { query: "", topK: 0, documents: [] },
    telemetry: zeroTelemetry(model),
    telemetryComplete: false,
    error: details,
  };
}

async function initializeQuestionStore(
  path: string,
  memory: readonly MemoryDraft[],
  now: () => Date,
): Promise<AtomicMemoryStore> {
  const store = new AtomicMemoryStore(path, now);
  if (memory.length > 0) {
    await store.applyWrites(
      memory.map((record) => ({
        candidateId: record.id,
        record: structuredClone(record),
      })),
    );
  }
  const mounted = (await store.active()).map(
    ({ id, kind, text, evidence, source }) => ({
      id,
      kind,
      text,
      evidence,
      source,
    }),
  );
  if (memorySha256(mounted) !== memorySha256(memory)) {
    throw new Error(
      "enforced-use memory does not match the frozen input store",
    );
  }
  return store;
}

async function evaluateCausalQuestion(
  options: {
    artifactDirectory: string;
    source: MabCausalSource;
    stream: MabStream;
    question: MabQuestion;
    arm: MabCausalArm;
    repetition: number;
    model: string;
    memory: readonly MemoryDraft[];
    createExecutors: MabCausalRunOptions["createExecutors"];
    now: () => Date;
  },
): Promise<MabQuestionReport> {
  const startedAt = options.now().toISOString();
  const directory = join(
    options.artifactDirectory,
    "questions",
    options.question.id.replaceAll(/[^A-Za-z0-9._-]/g, "_"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { use } = armFactors(options.arm);
  try {
    const condition = use === "direct" ? "regular" : "cortex";
    const executors = await options.createExecutors({
      condition,
      stage: "evaluation",
      streamId: options.stream.id,
      repetition: options.repetition,
      questionId: options.question.id,
      artifactDirectory: directory,
    });
    let output: string;
    let telemetry: ExecutionTelemetry;
    let memoryRecordsAfter = options.memory.length;
    if (use === "direct") {
      const execution = await executors.directMemoryExecutor.execute(
        options.question.prompt,
        structuredClone(options.memory),
        [],
      );
      output = execution.output;
      telemetry = execution.telemetry;
    } else {
      const store = await initializeQuestionStore(
        join(directory, "memory.json"),
        options.memory,
        options.now,
      );
      const controller = new LifecycleController(
        executors.phaseExecutor,
        store,
        new JsonlEventSink(join(directory, "lifecycle.jsonl")),
        options.now,
      );
      const execution = await controller.runSession(
        options.question.prompt,
        {
          mountedMemory: await store.active(),
          evidence: [],
          sleepWrites: "prohibit-unconfirmed",
          workMemory: "wake-selected",
        },
      );
      output = execution.output;
      telemetry = sessionTelemetry([execution], options.model);
      memoryRecordsAfter = (await store.active()).length;
    }
    return {
      questionId: options.question.id,
      status: "completed",
      startedAt,
      completedAt: options.now().toISOString(),
      output,
      correct:
        scoreMabOutput(
          options.source,
          output,
          options.question.answers,
        ).score === 1,
      memoryRecordsBefore: options.memory.length,
      memoryRecordsAfter,
      memoryGrowth: memoryRecordsAfter - options.memory.length,
      retrieval: { query: "", topK: 0, documents: [] },
      telemetry,
      telemetryComplete: true,
    };
  } catch (error) {
    const report = questionError(
      options.question,
      options.memory.length,
      options.model,
      startedAt,
      error,
    );
    return {
      ...report,
      completedAt: options.now().toISOString(),
      telemetry: collectErrorTelemetry(error, options.model),
    };
  }
}

function armReport(
  options: {
    source: MabCausalSource;
    repetition: number;
    arm: MabCausalArm;
    startedAt: string;
    completedAt: string;
    artifactDirectory: string;
    questions: MabQuestionReport[];
    model: string;
    inputMemorySha256?: string;
    inputMemoryFileSha256?: string;
  },
): MabCausalArmReport {
  const { formation, use } = armFactors(options.arm);
  const completedQuestions = options.questions.filter(
    (question) => question.status === "completed",
  ).length;
  const correct = options.questions.filter(
    (question) => question.correct,
  ).length;
  const errors = options.questions.length - completedQuestions;
  return {
    schemaVersion: 1,
    source: options.source,
    repetition: options.repetition,
    arm: options.arm,
    formation,
    use,
    status: errors === 0 ? "completed" : "error",
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    artifactDirectory: options.artifactDirectory,
    ...(options.inputMemorySha256
      ? { inputMemorySha256: options.inputMemorySha256 }
      : {}),
    ...(options.inputMemoryFileSha256
      ? { inputMemoryFileSha256: options.inputMemoryFileSha256 }
      : {}),
    questions: options.questions,
    totalQuestions: options.questions.length,
    completedQuestions,
    correct,
    accuracy:
      options.questions.length === 0
        ? 0
        : correct / options.questions.length,
    errors,
    telemetry: combineTelemetry(
      options.questions.map((question) => question.telemetry),
      options.model,
    ),
  };
}

async function runCausalArm(
  options: {
    blockDirectory: string;
    frozenMemoryPath: string;
    stream: MabStream;
    arm: MabCausalArm;
    repetition: number;
    model: string;
    createExecutors: MabCausalRunOptions["createExecutors"];
    now: () => Date;
  },
): Promise<MabCausalArmReport> {
  const startedAt = options.now().toISOString();
  if (!isCausalSource(options.stream.source)) {
    throw new Error(
      `unsupported causal stream ${options.stream.source}`,
    );
  }
  const source = options.stream.source;
  const artifactDirectory = join(
    options.blockDirectory,
    "arms",
    options.arm,
  );
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  let memory: FrozenMemory;
  let inputMemoryFileSha256: string;
  try {
    const loaded = await copyAndReadFrozenMemory(
      options.frozenMemoryPath,
      join(artifactDirectory, "input-memory.json"),
    );
    memory = loaded.frozen;
    inputMemoryFileSha256 = loaded.fileSha256;
  } catch (error) {
    const questions = options.stream.questions.map((question) =>
      questionError(
        question,
        0,
        options.model,
        options.now().toISOString(),
        error,
      ),
    );
    const report = armReport({
      source: options.stream.source as MabCausalSource,
      repetition: options.repetition,
      arm: options.arm,
      startedAt,
      completedAt: options.now().toISOString(),
      artifactDirectory,
      questions,
      model: options.model,
    });
    await writePrivateJson(join(artifactDirectory, "report.json"), report);
    return report;
  }
  const questions: MabQuestionReport[] = [];
  for (const question of options.stream.questions) {
    questions.push(
      await evaluateCausalQuestion({
        artifactDirectory,
        source,
        stream: options.stream,
        question,
        arm: options.arm,
        repetition: options.repetition,
        model: options.model,
        memory: memory.records,
        createExecutors: options.createExecutors,
        now: options.now,
      }),
    );
  }
  const report = armReport({
    source,
    repetition: options.repetition,
    arm: options.arm,
    startedAt,
    completedAt: options.now().toISOString(),
    artifactDirectory,
    questions,
    model: options.model,
    inputMemorySha256: memory.memorySha256,
    inputMemoryFileSha256,
  });
  await writePrivateJson(join(artifactDirectory, "report.json"), report);
  return report;
}

function acquisitionFailureArm(
  options: {
    blockDirectory: string;
    stream: MabStream;
    arm: MabCausalArm;
    repetition: number;
    model: string;
    error: unknown;
    now: () => Date;
  },
): MabCausalArmReport {
  const timestamp = options.now().toISOString();
  if (!isCausalSource(options.stream.source)) {
    throw new Error(
      `unsupported causal stream ${options.stream.source}`,
    );
  }
  return armReport({
    source: options.stream.source,
    repetition: options.repetition,
    arm: options.arm,
    startedAt: timestamp,
    completedAt: timestamp,
    artifactDirectory: join(
      options.blockDirectory,
      "arms",
      options.arm,
    ),
    questions: options.stream.questions.map((question) =>
      questionError(
        question,
        0,
        options.model,
        timestamp,
        options.error,
      ),
    ),
    model: options.model,
  });
}

function aggregate(
  reports: readonly MabCausalArmReport[],
  arm: MabCausalArm,
  model: string,
): MabCausalAggregate {
  const selected = reports.filter((report) => report.arm === arm);
  const questions = selected.reduce(
    (sum, report) => sum + report.totalQuestions,
    0,
  );
  const completed = selected.reduce(
    (sum, report) => sum + report.completedQuestions,
    0,
  );
  const correct = selected.reduce(
    (sum, report) => sum + report.correct,
    0,
  );
  const errors = selected.reduce(
    (sum, report) => sum + report.errors,
    0,
  );
  return {
    arm,
    reports: selected.length,
    questions,
    completed,
    correct,
    errors,
    accuracy: questions === 0 ? 0 : correct / questions,
    failureRate: questions === 0 ? 0 : errors / questions,
    telemetry: combineTelemetry(
      selected.map((report) => report.telemetry),
      model,
    ),
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seededRandom(seed: string): () => number {
  let state = Number.parseInt(
    sha256(seed).slice(0, 8),
    16,
  );
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(
  sorted: readonly number[],
  quantile: number,
): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(quantile * sorted.length)),
  );
  return sorted[index]!;
}

function contrastValue(
  id: MabCausalContrastId,
  outcomes: Record<MabCausalArm, number>,
): number {
  if (id === "semantic-formation-under-direct-use") {
    return outcomes["semantic-direct"] - outcomes["raw-direct"];
  }
  if (id === "enforced-use-on-raw-memory") {
    return outcomes["raw-enforced"] - outcomes["raw-direct"];
  }
  if (id === "enforced-use-on-semantic-memory") {
    return (
      outcomes["semantic-enforced"] - outcomes["semantic-direct"]
    );
  }
  return (
    outcomes["semantic-enforced"] -
    outcomes["semantic-direct"] -
    outcomes["raw-enforced"] +
    outcomes["raw-direct"]
  );
}

function pairedContrast(
  id: MabCausalContrastId,
  reports: readonly MabCausalArmReport[],
  manifest: MabCausalManifest,
): MabCausalContrast {
  const byKey = new Map(
    reports.map((report) => [
      `${report.source}|${report.repetition}|${report.arm}`,
      report,
    ]),
  );
  const clusterValues: number[] = [];
  let questions = 0;
  for (const run of manifest.runs) {
    const armReports = Object.fromEntries(
      MAB_CAUSAL_ARMS.map((arm) => [
        arm,
        byKey.get(`${run.source}|${run.repetition}|${arm}`),
      ]),
    ) as Record<MabCausalArm, MabCausalArmReport | undefined>;
    if (MAB_CAUSAL_ARMS.some((arm) => !armReports[arm])) {
      continue;
    }
    const byQuestion = Object.fromEntries(
      MAB_CAUSAL_ARMS.map((arm) => [
        arm,
        new Map(
          armReports[arm]!.questions.map((question) => [
            question.questionId,
            Number(question.correct),
          ]),
        ),
      ]),
    ) as Record<MabCausalArm, Map<string, number>>;
    const differences: number[] = [];
    for (const questionId of byQuestion["raw-direct"].keys()) {
      if (
        MAB_CAUSAL_ARMS.some(
          (arm) => !byQuestion[arm].has(questionId),
        )
      ) {
        continue;
      }
      differences.push(
        contrastValue(id, {
          "raw-direct": byQuestion["raw-direct"].get(questionId)!,
          "semantic-direct":
            byQuestion["semantic-direct"].get(questionId)!,
          "raw-enforced":
            byQuestion["raw-enforced"].get(questionId)!,
          "semantic-enforced":
            byQuestion["semantic-enforced"].get(questionId)!,
        }),
      );
    }
    if (differences.length > 0) {
      clusterValues.push(mean(differences));
      questions += differences.length;
    }
  }
  const random = seededRandom(`${manifest.batchId}|${id}`);
  const bootstraps: number[] = [];
  for (
    let sample = 0;
    sample < manifest.thresholds.bootstrapSamples;
    sample += 1
  ) {
    const selected: number[] = [];
    for (let index = 0; index < clusterValues.length; index += 1) {
      selected.push(
        clusterValues[
          Math.floor(random() * clusterValues.length)
        ] ?? 0,
      );
    }
    bootstraps.push(mean(selected));
  }
  bootstraps.sort((left, right) => left - right);
  const alpha = 1 - manifest.thresholds.confidenceLevel;
  return {
    id,
    clusters: clusterValues.length,
    questions,
    difference: mean(clusterValues),
    confidenceLevel: manifest.thresholds.confidenceLevel,
    lower: percentile(bootstraps, alpha / 2),
    upper: percentile(bootstraps, 1 - alpha / 2),
  };
}

function inputStoreIdentityMatched(
  reports: readonly MabCausalArmReport[],
): boolean {
  const byKey = new Map(
    reports.map((report) => [
      `${report.source}|${report.repetition}|${report.arm}`,
      report,
    ]),
  );
  const pairs: [MabCausalArm, MabCausalArm][] = [
    ["raw-direct", "raw-enforced"],
    ["semantic-direct", "semantic-enforced"],
  ];
  const blocks = new Set(
    reports.map(
      (report) => `${report.source}|${report.repetition}`,
    ),
  );
  for (const block of blocks) {
    for (const [leftArm, rightArm] of pairs) {
      const left = byKey.get(`${block}|${leftArm}`);
      const right = byKey.get(`${block}|${rightArm}`);
      if (
        !left ||
        !right ||
        !left.inputMemorySha256 ||
        left.inputMemorySha256 !== right.inputMemorySha256 ||
        !left.inputMemoryFileSha256 ||
        left.inputMemoryFileSha256 !== right.inputMemoryFileSha256
      ) {
        return false;
      }
    }
  }
  return blocks.size > 0;
}

function buildReport(
  options: {
    manifest: MabCausalManifest;
    artifactDirectory: string;
    status: MabCausalBatchReport["status"];
    startedAt: string;
    completedAt?: string;
    acquisitions: MabCausalBatchReport["semanticAcquisitions"];
    reports: MabCausalArmReport[];
    executionMatches: {
      model: boolean;
      repository: boolean;
      source: boolean;
      runtime: boolean;
    };
  },
): MabCausalBatchReport {
  const aggregates = Object.fromEntries(
    MAB_CAUSAL_ARMS.map((arm) => [
      arm,
      aggregate(
        options.reports,
        arm,
        options.manifest.model.resolvedId,
      ),
    ]),
  ) as Record<MabCausalArm, MabCausalAggregate>;
  const acquisitionTelemetry = combineTelemetry(
    options.acquisitions.map((entry) => entry.report.telemetry),
    options.manifest.model.resolvedId,
  );
  const totalTelemetry = combineTelemetry(
    [
      acquisitionTelemetry,
      ...MAB_CAUSAL_ARMS.map(
        (arm) => aggregates[arm].telemetry,
      ),
    ],
    options.manifest.model.resolvedId,
  );
  const plannedReports =
    options.manifest.runs.length * MAB_CAUSAL_ARMS.length;
  const plannedQuestions =
    plannedReports * options.manifest.questionsPerSource;
  const reportedQuestions = options.reports.reduce(
    (sum, report) => sum + report.totalQuestions,
    0,
  );
  const failures = options.reports.reduce(
    (sum, report) => sum + report.errors,
    0,
  );
  return {
    schemaVersion: 1,
    batchId: options.manifest.batchId,
    status: options.status,
    startedAt: options.startedAt,
    ...(options.completedAt
      ? { completedAt: options.completedAt }
      : {}),
    artifactDirectory: options.artifactDirectory,
    manifest: options.manifest,
    semanticAcquisitions: options.acquisitions,
    reports: options.reports,
    aggregates,
    contrasts: [
      "semantic-formation-under-direct-use",
      "enforced-use-on-raw-memory",
      "enforced-use-on-semantic-memory",
      "formation-use-interaction",
    ].map((id) =>
      pairedContrast(
        id as MabCausalContrastId,
        options.reports,
        options.manifest,
      ),
    ),
    checks: {
      inputStoreIdentityMatched: inputStoreIdentityMatched(
        options.reports,
      ),
      noAnswerEvidence: options.reports.every((report) =>
        report.questions.every(
          (question) =>
            question.retrieval.topK === 0 &&
            question.retrieval.documents.length === 0,
        ),
      ),
      noAnswerWrites: options.reports.every((report) =>
        report.questions.every(
          (question) => question.memoryGrowth === 0,
        ),
      ),
      runComplete:
        options.reports.length === plannedReports &&
        reportedQuestions === plannedQuestions,
      modelMatched: options.executionMatches.model,
      repositoryMatched: options.executionMatches.repository,
      sourceMatched: options.executionMatches.source,
      runtimeMatched: options.executionMatches.runtime,
      failureRateMet:
        plannedQuestions === 0 ||
        failures / plannedQuestions <=
          options.manifest.thresholds.maximumFailureRate,
      costLimitMet:
        options.status !== "cost-limited" &&
        totalTelemetry.usage.costUsd <=
          options.manifest.thresholds.maximumCostUsd,
    },
    acquisitionTelemetry,
    totalTelemetry,
  };
}

function validatePreparedStreams(
  manifest: MabCausalManifest,
  streams: readonly MabPreparedStream[],
): Map<MabCausalSource, MabStream> {
  const preparedBySource = new Map(
    streams.map((stream) => [stream.source, stream]),
  );
  const result = new Map<MabCausalSource, MabStream>();
  for (const frozen of manifest.streams) {
    const prepared = preparedBySource.get(frozen.source);
    if (!prepared) {
      throw new Error(`prepared stream is missing ${frozen.source}`);
    }
    try {
      result.set(
        frozen.source as MabCausalSource,
        streamForManifest(prepared, frozen),
      );
    } catch {
      throw new Error(
        `frozen question validation failed for ${frozen.source}`,
      );
    }
  }
  return result;
}

export async function runMabCausalBatch(
  options: MabCausalRunOptions,
): Promise<MabCausalBatchReport> {
  if (!isCausalManifest(options.manifest)) {
    throw new Error("invalid causal MemoryAgentBench manifest");
  }
  validateManifestShape(options.manifest);
  const modelMatched = isDeepStrictEqual(
    options.execution.model,
    options.manifest.model,
  );
  const repositoryMatched = isDeepStrictEqual(
    options.execution.repository,
    options.manifest.repository,
  );
  const sourceMatched = isDeepStrictEqual(
    options.execution.source,
    options.manifest.source,
  );
  const runtimeMatched =
    options.manifest.runtime.node === process.version &&
    options.manifest.runtime.platform === process.platform &&
    options.manifest.runtime.architecture === process.arch;
  if (!modelMatched) {
    throw new Error("execution model does not match causal manifest");
  }
  if (!repositoryMatched) {
    throw new Error(
      "execution repository does not match causal manifest",
    );
  }
  if (!sourceMatched) {
    throw new Error("execution source does not match causal manifest");
  }
  if (!runtimeMatched) {
    throw new Error("runtime does not match causal manifest");
  }
  const streamBySource = validatePreparedStreams(
    options.manifest,
    options.streams,
  );
  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  await writePrivateJson(
    join(artifactDirectory, "manifest.json"),
    options.manifest,
  );
  const startedAt = now().toISOString();
  const acquisitions: MabCausalBatchReport["semanticAcquisitions"] = [];
  const reports: MabCausalArmReport[] = [];
  const budget: MabCausalBudget = {
    spentUsd: 0,
    maximumUsd: options.manifest.thresholds.maximumCostUsd,
    reservePerExecutionUsd:
      options.manifest.model.maximumInvocationCostUsd,
    stopped: false,
  };
  const createExecutors: MabCausalRunOptions["createExecutors"] =
    async (context) =>
      budgetExecutors(
        await options.createExecutors(context),
        budget,
      );

  for (const run of options.manifest.runs) {
    const stream = streamBySource.get(run.source);
    if (!stream) {
      throw new Error(`frozen causal stream is missing ${run.source}`);
    }
    const blockDirectory = join(
      artifactDirectory,
      `repetition-${String(run.repetition).padStart(2, "0")}`,
      run.source,
    );
    await mkdir(blockDirectory, { recursive: true, mode: 0o700 });
    const evidence = await persistMabEvidence(
      blockDirectory,
      stream,
    );
    const rawMemory = createRawMabMemory(evidence.documents);
    const storesDirectory = join(blockDirectory, "stores");
    await mkdir(storesDirectory, { recursive: true, mode: 0o700 });
    const rawPath = join(storesDirectory, "raw.json");
    await writeFrozenMemory(rawPath, "raw", rawMemory);

    const acquisition = await acquireMabMemory(
      {
        artifactDirectory: blockDirectory,
        stream,
        condition: "cortex",
        repetition: run.repetition,
        model: options.manifest.model.resolvedId,
        evidenceTopK:
          options.manifest.protocol.execution.evidenceTopK,
        createExecutors,
        score: () => false,
      },
      evidence,
      now,
    );
    acquisitions.push({
      source: run.source,
      repetition: run.repetition,
      report: acquisition.report,
    });
    const semanticPath = join(storesDirectory, "semantic.json");
    if (acquisition.report.status === "completed") {
      await writeFrozenMemory(
        semanticPath,
        "semantic",
        acquisition.memory,
      );
    }

    for (const arm of run.armOrder) {
      const { formation } = armFactors(arm);
      let report: MabCausalArmReport;
      if (
        formation === "semantic" &&
        acquisition.report.status !== "completed"
      ) {
        report = acquisitionFailureArm({
          blockDirectory,
          stream,
          arm,
          repetition: run.repetition,
          model: options.manifest.model.resolvedId,
          error: new Error(
            "question not run because semantic acquisition failed",
          ),
          now,
        });
        await mkdir(report.artifactDirectory, {
          recursive: true,
          mode: 0o700,
        });
        await writePrivateJson(
          join(report.artifactDirectory, "report.json"),
          report,
        );
      } else {
        report = await runCausalArm({
          blockDirectory,
          frozenMemoryPath:
            formation === "raw" ? rawPath : semanticPath,
          stream,
          arm,
          repetition: run.repetition,
          model: options.manifest.model.resolvedId,
          createExecutors,
          now,
        });
      }
      reports.push(report);
      await writePrivateJson(
        join(artifactDirectory, "partial-report.json"),
        buildReport({
          manifest: options.manifest,
          artifactDirectory,
          status: budget.stopped ? "cost-limited" : "running",
          startedAt,
          acquisitions,
          reports,
          executionMatches: {
            model: modelMatched,
            repository: repositoryMatched,
            source: sourceMatched,
            runtime: runtimeMatched,
          },
        }),
      );
    }
  }
  const status = budget.stopped ? "cost-limited" : "completed";
  const report = buildReport({
    manifest: options.manifest,
    artifactDirectory,
    status,
    startedAt,
    completedAt: now().toISOString(),
    acquisitions,
    reports,
    executionMatches: {
      model: modelMatched,
      repository: repositoryMatched,
      source: sourceMatched,
      runtime: runtimeMatched,
    },
  });
  await writePrivateJson(
    join(artifactDirectory, "batch-report.json"),
    report,
  );
  return report;
}
