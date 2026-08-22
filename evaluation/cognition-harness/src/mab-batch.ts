import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  MAB_CHUNK_TOKEN_LIMIT,
  MAB_DATASET_REPOSITORY,
  MAB_DATASET_REVISION,
  MAB_PARQUET_FILES,
  MAB_SELECTED_SOURCES,
  scoreMabOutput,
  selectMabQuestions,
  type MabPreparedStream,
  type MabSelectedQuestion,
  type MabSource,
} from "./mab-adapter.js";
import {
  MAB_CONDITIONS,
  runMabCondition,
  type MabCondition,
  type MabConditionExecutors,
  type MabConditionReport,
  type MabExecutorContext,
  type MabQuestion,
  type MabStream,
} from "./mab-condition.js";
import {
  writePrivateJson,
  writePrivateJsonExclusive,
} from "./artifacts.js";
import { collectErrorTelemetry, combineTelemetry } from "./telemetry.js";
import type {
  AdvisoryMemoryExecutor,
  DirectMemoryExecutor,
  ExecutionTelemetry,
  PhaseExecutor,
} from "./types.js";

export interface MabBatchModel {
  provider: string;
  requestedId: string;
  resolvedId: string;
  requestedThinkingLevel: string;
  effectiveThinkingLevel: string;
  contextWindow: number;
  maxOutputTokens: number;
  costPerMillionTokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  maximumInvocationCostUsd: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface MabExecutionPolicy {
  maxAttempts: number;
  maxTurns: number;
  timeoutMs: number;
  workMemory: "complete-mounted";
  questionIsolation: "fresh-runtime-and-cloned-store";
  evidenceRetention: "immutable-source-chunks-sha256";
  evidenceRetrieval: "shared-deterministic-bm25";
  evidenceCitationSelection: "model-evidence-id-host-reference-binding";
  evidencePromptProjection: "id-and-text-only";
  memoryCandidateIdentity: "host-validated-unique-and-insert-only";
  memoryWriteBinding: "model-candidate-id-host-content-binding";
  answerMemoryCandidates: "prohibited-without-external-feedback";
  answerMemoryWrites: "prohibited-without-external-feedback";
  workEvidenceComparison: "structured-competing-claims";
  evidenceTopK: number;
}

export interface MabBatchThresholds {
  minimumAccuracyImprovement: number;
  confidenceLevel: number;
  maximumConditionFailureRate: number;
  maximumCostUsd: number;
  bootstrapSamples: number;
}

export interface MabManifestStream {
  source: MabSource;
  contextHash: string;
  chunkCount: number;
  chunkSha256: string[];
  questions: {
    id: string;
    promptSha256: string;
    retrievalQuerySha256: string;
  }[];
}

export interface MabManifestRun {
  repetition: number;
  source: MabSource;
  conditionOrder: MabCondition[];
}

export interface MabBatchManifest {
  schemaVersion: 7;
  benchmark: {
    repository: typeof MAB_DATASET_REPOSITORY;
    revision: typeof MAB_DATASET_REVISION;
    parquetSha256: Record<string, string>;
    adapted: true;
  };
  batchId: string;
  createdAt: string;
  evidenceMode: "confirmatory" | "instrumentation";
  questionsPerStream: number;
  questionSelection: {
    strategy: "evenly-spaced-after-exclusions";
    excludedQuestionIds: string[];
  };
  repetitions: number;
  chunkTokenLimit: number;
  conditions: readonly MabCondition[];
  streams: MabManifestStream[];
  runs: MabManifestRun[];
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
    adapter: "cortex-mab-v7";
    chunking: "semantic-units-o200k_base";
    scoring: "memory-agent-bench-upstream-compatible";
    execution: MabExecutionPolicy;
  };
  thresholds: MabBatchThresholds;
}

export interface MabFreezeOptions {
  manifestPath: string;
  batchId: string;
  streams: readonly MabPreparedStream[];
  questionsPerStream: number;
  excludedQuestionIds?: readonly string[];
  repetitions: number;
  model: MabBatchModel;
  repository: MabBatchManifest["repository"];
  source: unknown;
  execution: MabExecutionPolicy;
  thresholds: MabBatchThresholds;
  now?: () => Date;
}

export interface MabRunOptions {
  artifactDirectory: string;
  manifest: MabBatchManifest;
  streams: readonly MabPreparedStream[];
  execution: {
    model: MabBatchModel;
    repository: MabBatchManifest["repository"];
    source: unknown;
  };
  createExecutors(
    context: MabExecutorContext,
  ): MabConditionExecutors | Promise<MabConditionExecutors>;
  now?: () => Date;
}

export interface MabConditionAggregate {
  condition: MabCondition;
  reports: number;
  questions: number;
  completed: number;
  correct: number;
  errors: number;
  accuracy: number;
  failureRate: number;
  telemetry: ExecutionTelemetry;
}

export interface MabPairedContrast {
  treatment: "cortex";
  comparator: "regular" | "advisory";
  clusters: number;
  questions: number;
  difference: number;
  confidenceLevel: number;
  lower: number;
  upper: number;
}

export interface MabBatchReport {
  schemaVersion: 2;
  batchId: string;
  status: "completed" | "failed" | "cost-limit";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  manifest: MabBatchManifest;
  reports: MabConditionReport[];
  aggregates: Record<MabCondition, MabConditionAggregate>;
  bySource: Record<string, Record<MabCondition, MabConditionAggregate>>;
  contrasts: MabPairedContrast[];
  criteria: {
    cortexBeatsRegular: boolean;
    cortexBeatsAdvisory: boolean;
    minimumEffectMet: boolean;
    competencyBreadthMet: boolean;
    failureRateMet: boolean;
    costLimitMet: boolean;
    runComplete: boolean;
    modelMatched: boolean;
    sharedEvidenceAccessMatched: boolean;
    confirmatoryProtocolMet: boolean;
    supported: boolean;
  };
}

const CONDITION_ORDERS: readonly (readonly MabCondition[])[] = [
  ["regular", "advisory", "cortex"],
  ["advisory", "cortex", "regular"],
  ["cortex", "regular", "advisory"],
];

function conditionOrder(index: number): MabCondition[] {
  return [...CONDITION_ORDERS[index % CONDITION_ORDERS.length]!];
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function validateThresholds(thresholds: MabBatchThresholds): void {
  if (
    thresholds.minimumAccuracyImprovement < 0 ||
    thresholds.minimumAccuracyImprovement > 1
  ) {
    throw new Error("minimumAccuracyImprovement must be between zero and one");
  }
  if (thresholds.confidenceLevel <= 0 || thresholds.confidenceLevel >= 1) {
    throw new Error("confidenceLevel must be between zero and one");
  }
  if (
    thresholds.maximumConditionFailureRate < 0 ||
    thresholds.maximumConditionFailureRate > 1
  ) {
    throw new Error("maximumConditionFailureRate must be between zero and one");
  }
  if (
    !Number.isFinite(thresholds.maximumCostUsd) ||
    thresholds.maximumCostUsd <= 0
  ) {
    throw new Error("maximumCostUsd must be positive");
  }
  validatePositiveInteger(thresholds.bootstrapSamples, "bootstrapSamples");
}

function selectedBySource(
  streams: readonly MabPreparedStream[],
  questionsPerStream: number,
  excludedQuestionIds: ReadonlySet<string>,
): Map<MabSource, MabSelectedQuestion[]> {
  const selected = selectMabQuestions(
    streams,
    questionsPerStream,
    excludedQuestionIds,
  );
  const bySource = new Map<MabSource, MabSelectedQuestion[]>();
  for (const question of selected) {
    const existing = bySource.get(question.source) ?? [];
    existing.push(question);
    bySource.set(question.source, existing);
  }
  return bySource;
}

function assertCompleteSources(streams: readonly MabPreparedStream[]): void {
  const sources = new Set(streams.map((stream) => stream.source));
  if (sources.size !== streams.length) {
    throw new Error("prepared MemoryAgentBench streams contain duplicate sources");
  }
  const missing = MAB_SELECTED_SOURCES.filter((source) => !sources.has(source));
  if (missing.length > 0) {
    throw new Error(
      `prepared MemoryAgentBench streams are missing: ${missing.join(", ")}`,
    );
  }
}

export async function freezeMabManifest(
  options: MabFreezeOptions,
): Promise<MabBatchManifest> {
  validatePositiveInteger(options.questionsPerStream, "questionsPerStream");
  validatePositiveInteger(options.repetitions, "repetitions");
  validateThresholds(options.thresholds);
  assertCompleteSources(options.streams);
  const excludedQuestionIds = [
    ...new Set(options.excludedQuestionIds ?? []),
  ].sort();
  const excludedQuestionIdSet = new Set(excludedQuestionIds);
  const availableQuestionIds = new Set(
    options.streams.flatMap((stream) => stream.qaPairIds),
  );
  const unknownExcludedQuestionIds = excludedQuestionIds.filter(
    (id) => !availableQuestionIds.has(id),
  );
  if (unknownExcludedQuestionIds.length > 0) {
    throw new Error(
      `excluded question IDs are not in the prepared streams: ${unknownExcludedQuestionIds.join(", ")}`,
    );
  }
  for (const stream of options.streams) {
    const availableQuestions = stream.qaPairIds.filter(
      (id) => !excludedQuestionIdSet.has(id),
    ).length;
    if (availableQuestions < options.questionsPerStream) {
      throw new Error(
        `${stream.source} has ${availableQuestions} questions after exclusions, fewer than the requested ${options.questionsPerStream}`,
      );
    }
  }
  const now = options.now ?? (() => new Date());
  const bySource = selectedBySource(
    options.streams,
    options.questionsPerStream,
    excludedQuestionIdSet,
  );
  const evidenceMode =
    options.repetitions >= 3 &&
    options.streams.every(
      (stream) => stream.questions.length === options.questionsPerStream,
    )
      ? "confirmatory"
      : "instrumentation";
  let orderIndex = 0;
  const runs: MabManifestRun[] = [];
  for (
    let repetition = 1;
    repetition <= options.repetitions;
    repetition += 1
  ) {
    for (const source of MAB_SELECTED_SOURCES) {
      runs.push({
        repetition,
        source,
        conditionOrder: conditionOrder(orderIndex),
      });
      orderIndex += 1;
    }
  }
  const manifest: MabBatchManifest = {
    schemaVersion: 7,
    benchmark: {
      repository: MAB_DATASET_REPOSITORY,
      revision: MAB_DATASET_REVISION,
      parquetSha256: Object.fromEntries(
        Object.values(MAB_PARQUET_FILES).map((descriptor) => [
          descriptor.split,
          descriptor.sha256,
        ]),
      ),
      adapted: true,
    },
    batchId: options.batchId,
    createdAt: now().toISOString(),
    evidenceMode,
    questionsPerStream: options.questionsPerStream,
    questionSelection: {
      strategy: "evenly-spaced-after-exclusions",
      excludedQuestionIds,
    },
    repetitions: options.repetitions,
    chunkTokenLimit: MAB_CHUNK_TOKEN_LIMIT,
    conditions: MAB_CONDITIONS,
    streams: MAB_SELECTED_SOURCES.map((source) => {
      const stream = options.streams.find((entry) => entry.source === source);
      if (!stream) {
        throw new Error(`missing prepared stream ${source}`);
      }
      return {
        source,
        contextHash: stream.contextHash,
        chunkCount: stream.chunks.length,
        chunkSha256: stream.chunks.map(sha256),
        questions: (bySource.get(source) ?? []).map((question) => ({
          id: question.qaPairId,
          promptSha256: sha256(question.prompt),
          retrievalQuerySha256: sha256(question.question),
        })),
      };
    }),
    runs,
    model: options.model,
    repository: options.repository,
    source: structuredClone(options.source),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    protocol: {
      adapter: "cortex-mab-v7",
      chunking: "semantic-units-o200k_base",
      scoring: "memory-agent-bench-upstream-compatible",
      execution: structuredClone(options.execution),
    },
    thresholds: structuredClone(options.thresholds),
  };
  await writePrivateJsonExclusive(resolve(options.manifestPath), manifest);
  return manifest;
}

function validateManifestStreams(
  manifest: MabBatchManifest,
  streams: readonly MabPreparedStream[],
): void {
  validatePositiveInteger(manifest.questionsPerStream, "questionsPerStream");
  validatePositiveInteger(manifest.repetitions, "repetitions");
  if (
    manifest.evidenceMode === "confirmatory" &&
    (manifest.repetitions < 3 ||
      streams.some(
        (stream) =>
          stream.questions.length !== manifest.questionsPerStream,
      ))
  ) {
    throw new Error(
      "confirmatory manifests require at least three repetitions and every question",
    );
  }
  if (manifest.chunkTokenLimit !== MAB_CHUNK_TOKEN_LIMIT) {
    throw new Error("manifest chunk token limit does not match this adapter");
  }
  const expectedHashes = Object.fromEntries(
    Object.values(MAB_PARQUET_FILES).map((descriptor) => [
      descriptor.split,
      descriptor.sha256,
    ]),
  );
  if (
    !isDeepStrictEqual(manifest.benchmark.parquetSha256, expectedHashes)
  ) {
    throw new Error("manifest parquet hashes do not match this adapter");
  }
  const manifestSources = new Set(
    manifest.streams.map((stream) => stream.source),
  );
  if (
    manifestSources.size !== MAB_SELECTED_SOURCES.length ||
    manifest.streams.length !== MAB_SELECTED_SOURCES.length ||
    MAB_SELECTED_SOURCES.some((source) => !manifestSources.has(source))
  ) {
    throw new Error("manifest must contain each selected source exactly once");
  }
  if (
    manifest.runs.length !==
    manifest.repetitions * MAB_SELECTED_SOURCES.length
  ) {
    throw new Error("manifest run count does not match repetitions and sources");
  }
  const streamBySource = new Map(
    streams.map((stream) => [stream.source, stream]),
  );
  const excludedQuestionIds = new Set(
    manifest.questionSelection.excludedQuestionIds,
  );
  if (
    excludedQuestionIds.size !==
    manifest.questionSelection.excludedQuestionIds.length
  ) {
    throw new Error("manifest contains duplicate excluded question IDs");
  }
  const availableQuestionIds = new Set(
    streams.flatMap((stream) => stream.qaPairIds),
  );
  if (
    manifest.questionSelection.excludedQuestionIds.some(
      (id) => !availableQuestionIds.has(id),
    )
  ) {
    throw new Error("manifest excludes an unknown question ID");
  }
  for (const frozen of manifest.streams) {
    const prepared = streamBySource.get(frozen.source);
    if (!prepared) {
      throw new Error(`prepared stream is missing ${frozen.source}`);
    }
    if (
      prepared.contextHash !== frozen.contextHash ||
      prepared.chunks.length !== frozen.chunkCount ||
      !isDeepStrictEqual(prepared.chunks.map(sha256), frozen.chunkSha256)
    ) {
      throw new Error(`prepared stream changed for ${frozen.source}`);
    }
    const questionIds = frozen.questions.map((question) => question.id);
    if (
      questionIds.length !== manifest.questionsPerStream ||
      new Set(questionIds).size !== questionIds.length ||
      questionIds.some(
        (id) =>
          excludedQuestionIds.has(id) ||
          !prepared.qaPairIds.includes(id),
      )
    ) {
      throw new Error(`manifest questions are invalid for ${frozen.source}`);
    }
    streamForManifest(prepared, frozen);
  }
  for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
    for (const source of MAB_SELECTED_SOURCES) {
      const matches = manifest.runs.filter(
        (run) => run.repetition === repetition && run.source === source,
      );
      if (matches.length !== 1) {
        throw new Error(
          `manifest must contain one run for repetition ${repetition}, source ${source}`,
        );
      }
      const order = matches[0]!.conditionOrder;
      if (
        order.length !== MAB_CONDITIONS.length ||
        new Set(order).size !== MAB_CONDITIONS.length ||
        MAB_CONDITIONS.some((condition) => !order.includes(condition))
      ) {
        throw new Error(
          `manifest has an invalid condition order for repetition ${repetition}, source ${source}`,
        );
      }
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMabSource(value: unknown): value is MabSource {
  return (
    typeof value === "string" &&
    (MAB_SELECTED_SOURCES as readonly string[]).includes(value)
  );
}

function isMabCondition(value: unknown): value is MabCondition {
  return (
    typeof value === "string" &&
    (MAB_CONDITIONS as readonly string[]).includes(value)
  );
}

function isMabManifest(value: unknown): value is MabBatchManifest {
  if (!isRecord(value)) {
    return false;
  }
  const benchmark = value.benchmark;
  const model = value.model;
  const repository = value.repository;
  const runtime = value.runtime;
  const protocol = value.protocol;
  const questionSelection = value.questionSelection;
  const thresholds = value.thresholds;
  return (
    value.schemaVersion === 7 &&
    typeof value.batchId === "string" &&
    typeof value.createdAt === "string" &&
    (value.evidenceMode === "confirmatory" ||
      value.evidenceMode === "instrumentation") &&
    typeof value.questionsPerStream === "number" &&
    isRecord(questionSelection) &&
    questionSelection.strategy ===
      "evenly-spaced-after-exclusions" &&
    isStringArray(questionSelection.excludedQuestionIds) &&
    typeof value.repetitions === "number" &&
    typeof value.chunkTokenLimit === "number" &&
    Array.isArray(value.conditions) &&
    value.conditions.every(isMabCondition) &&
    Array.isArray(value.streams) &&
    value.streams.every(
      (stream) =>
        isRecord(stream) &&
        isMabSource(stream.source) &&
        typeof stream.contextHash === "string" &&
        typeof stream.chunkCount === "number" &&
        isStringArray(stream.chunkSha256) &&
        Array.isArray(stream.questions) &&
        stream.questions.every(
          (question) =>
            isRecord(question) &&
            typeof question.id === "string" &&
            typeof question.promptSha256 === "string" &&
            typeof question.retrievalQuerySha256 === "string",
        ),
    ) &&
    Array.isArray(value.runs) &&
    value.runs.every(
      (run) =>
        isRecord(run) &&
        typeof run.repetition === "number" &&
        isMabSource(run.source) &&
        Array.isArray(run.conditionOrder) &&
        run.conditionOrder.every(isMabCondition),
    ) &&
    isRecord(benchmark) &&
    benchmark.repository === MAB_DATASET_REPOSITORY &&
    benchmark.revision === MAB_DATASET_REVISION &&
    isRecord(model) &&
    typeof model.provider === "string" &&
    typeof model.requestedId === "string" &&
    typeof model.resolvedId === "string" &&
    typeof model.requestedThinkingLevel === "string" &&
    typeof model.effectiveThinkingLevel === "string" &&
    typeof model.contextWindow === "number" &&
    typeof model.maxOutputTokens === "number" &&
    isRecord(model.costPerMillionTokens) &&
    typeof model.costPerMillionTokens.input === "number" &&
    typeof model.costPerMillionTokens.output === "number" &&
    typeof model.costPerMillionTokens.cacheRead === "number" &&
    typeof model.costPerMillionTokens.cacheWrite === "number" &&
    typeof model.maximumInvocationCostUsd === "number" &&
    isRecord(repository) &&
    typeof repository.commit === "string" &&
    typeof repository.dirty === "boolean" &&
    "source" in value &&
    isRecord(runtime) &&
    typeof runtime.node === "string" &&
    typeof runtime.platform === "string" &&
    typeof runtime.architecture === "string" &&
    isRecord(protocol) &&
    protocol.adapter === "cortex-mab-v7" &&
    protocol.chunking === "semantic-units-o200k_base" &&
    protocol.scoring === "memory-agent-bench-upstream-compatible" &&
    isRecord(protocol.execution) &&
    typeof protocol.execution.maxAttempts === "number" &&
    typeof protocol.execution.maxTurns === "number" &&
    typeof protocol.execution.timeoutMs === "number" &&
    protocol.execution.workMemory === "complete-mounted" &&
    protocol.execution.questionIsolation ===
      "fresh-runtime-and-cloned-store" &&
    protocol.execution.evidenceRetention ===
      "immutable-source-chunks-sha256" &&
    protocol.execution.evidenceRetrieval ===
      "shared-deterministic-bm25" &&
    protocol.execution.evidenceCitationSelection ===
      "model-evidence-id-host-reference-binding" &&
    protocol.execution.evidencePromptProjection === "id-and-text-only" &&
    protocol.execution.memoryCandidateIdentity ===
      "host-validated-unique-and-insert-only" &&
    protocol.execution.memoryWriteBinding ===
      "model-candidate-id-host-content-binding" &&
    protocol.execution.answerMemoryCandidates ===
      "prohibited-without-external-feedback" &&
    protocol.execution.answerMemoryWrites ===
      "prohibited-without-external-feedback" &&
    protocol.execution.workEvidenceComparison ===
      "structured-competing-claims" &&
    typeof protocol.execution.evidenceTopK === "number" &&
    isRecord(thresholds) &&
    typeof thresholds.minimumAccuracyImprovement === "number" &&
    typeof thresholds.confidenceLevel === "number" &&
    typeof thresholds.maximumConditionFailureRate === "number" &&
    typeof thresholds.maximumCostUsd === "number" &&
    typeof thresholds.bootstrapSamples === "number"
  );
}

export async function readMabQuestionIds(path: string): Promise<string[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.streams)) {
    throw new Error("invalid MemoryAgentBench manifest question list");
  }
  const questionIds = parsed.streams.flatMap((stream) => {
    if (!isRecord(stream) || !Array.isArray(stream.questions)) {
      throw new Error("invalid MemoryAgentBench manifest question list");
    }
    return stream.questions.map((question) => {
      if (
        !isRecord(question) ||
        typeof question.id !== "string" ||
        question.id.length === 0
      ) {
        throw new Error("invalid MemoryAgentBench manifest question list");
      }
      return question.id;
    });
  });
  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error(
      "MemoryAgentBench manifest question list contains duplicates",
    );
  }
  return questionIds;
}

export async function readMabManifest(
  path: string,
): Promise<MabBatchManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isMabManifest(parsed)) {
    throw new Error("invalid MemoryAgentBench manifest");
  }
  const manifest = parsed;
  if (
    manifest.conditions.join(",") !== MAB_CONDITIONS.join(",")
  ) {
    throw new Error("MemoryAgentBench manifest does not match this harness");
  }
  if (
    manifest.streams.some(
      (stream) =>
        !isStringArray(stream.chunkSha256) ||
        stream.chunkSha256.length !== stream.chunkCount ||
        stream.chunkSha256.some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
        stream.questions.length !== manifest.questionsPerStream ||
        stream.questions.some(
          (question) =>
            !/^[a-f0-9]{64}$/.test(question.promptSha256) ||
            !/^[a-f0-9]{64}$/.test(question.retrievalQuerySha256),
        ),
    )
  ) {
    throw new Error("MemoryAgentBench manifest has invalid question IDs");
  }
  validateThresholds(manifest.thresholds);
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
  if (
    !Number.isFinite(manifest.model.maximumInvocationCostUsd) ||
    manifest.model.maximumInvocationCostUsd <= 0
  ) {
    throw new Error("maximumInvocationCostUsd must be positive");
  }
  if (
    manifest.evidenceMode === "confirmatory" &&
    (manifest.repetitions < 3 ||
      manifest.streams.some((stream) => stream.questions.length !== 100))
  ) {
    throw new Error(
      "confirmatory manifests require at least three repetitions and all 100 questions per stream",
    );
  }
  return manifest;
}

function streamForManifest(
  prepared: MabPreparedStream,
  manifest: MabManifestStream,
): MabStream {
  if (prepared.contextHash !== manifest.contextHash) {
    throw new Error(`context hash changed for ${prepared.source}`);
  }
  if (prepared.chunks.length !== manifest.chunkCount) {
    throw new Error(`chunk count changed for ${prepared.source}`);
  }
  const currentChunkSha256 = prepared.chunks.map(sha256);
  if (!isDeepStrictEqual(currentChunkSha256, manifest.chunkSha256)) {
    throw new Error(`evidence chunks changed for ${prepared.source}`);
  }
  const questions = manifest.questions.map((frozen): MabQuestion => {
    const index = prepared.qaPairIds.indexOf(frozen.id);
    if (index < 0) {
      throw new Error(
        `question ${frozen.id} is absent from ${prepared.source}`,
      );
    }
    const question = prepared.questions[index];
    const answers = prepared.answers[index];
    if (!question || !answers) {
      throw new Error(`question data is incomplete for ${frozen.id}`);
    }
    const selected = selectMabQuestions([prepared], prepared.questions.length)
      .find((entry) => entry.qaPairId === frozen.id);
    if (!selected) {
      throw new Error(`could not format question ${frozen.id}`);
    }
    if (
      sha256(selected.prompt) !== frozen.promptSha256 ||
      sha256(selected.question) !== frozen.retrievalQuerySha256
    ) {
      throw new Error(
        `question inputs changed for ${prepared.source}:${frozen.id}`,
      );
    }
    return {
      id: frozen.id,
      prompt: selected.prompt,
      retrievalQuery: selected.question,
      answers: [...answers],
      metric: selected.metric,
    };
  });
  return {
    id: prepared.source,
    source: prepared.source,
    competency: prepared.task,
    stratum:
      prepared.hop === null
        ? prepared.stratum
        : `${prepared.stratum}-${prepared.hop}`,
    chunks: [...prepared.chunks],
    questions,
  };
}

function aggregate(
  reports: readonly MabConditionReport[],
  condition: MabCondition,
  model: string,
): MabConditionAggregate {
  const selected = reports.filter((report) => report.condition === condition);
  const questions = selected.reduce(
    (sum, report) => sum + report.totalQuestions,
    0,
  );
  const completed = selected.reduce(
    (sum, report) => sum + report.completedQuestions,
    0,
  );
  const correct = selected.reduce((sum, report) => sum + report.correct, 0);
  const errors = selected.reduce((sum, report) => sum + report.errors, 0);
  return {
    condition,
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

interface ClusterDifference {
  key: string;
  differences: number[];
}

function clusterDifferences(
  reports: readonly MabConditionReport[],
  comparator: "regular" | "advisory",
): ClusterDifference[] {
  const byReport = new Map(
    reports.map((report) => [
      `${report.source}|${report.repetition}|${report.condition}`,
      report,
    ]),
  );
  const clusters: ClusterDifference[] = [];
  for (const cortex of reports.filter(
    (report) => report.condition === "cortex",
  )) {
    const comparison = byReport.get(
      `${cortex.source}|${cortex.repetition}|${comparator}`,
    );
    if (!comparison) {
      continue;
    }
    const comparisonByQuestion = new Map(
      comparison.questions.map((question) => [question.questionId, question]),
    );
    const differences = cortex.questions.flatMap((question) => {
      const other = comparisonByQuestion.get(question.questionId);
      if (!other) {
        return [];
      }
      return [Number(question.correct) - Number(other.correct)];
    });
    if (differences.length > 0) {
      clusters.push({
        key: `${cortex.source}|${cortex.repetition}`,
        differences,
      });
    }
  }
  return clusters;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seededRandom(seed: string): () => number {
  let state = Number.parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(quantile * sorted.length)),
  );
  return sorted[index]!;
}

function pairedContrast(
  reports: readonly MabConditionReport[],
  comparator: "regular" | "advisory",
  manifest: MabBatchManifest,
): MabPairedContrast {
  const clusters = clusterDifferences(reports, comparator);
  const clusterMeans = clusters.map((cluster) => mean(cluster.differences));
  const random = seededRandom(`${manifest.batchId}|${comparator}`);
  const bootstraps: number[] = [];
  for (
    let sample = 0;
    sample < manifest.thresholds.bootstrapSamples;
    sample += 1
  ) {
    const selected: number[] = [];
    for (let index = 0; index < clusterMeans.length; index += 1) {
      selected.push(
        clusterMeans[Math.floor(random() * clusterMeans.length)] ?? 0,
      );
    }
    bootstraps.push(mean(selected));
  }
  bootstraps.sort((left, right) => left - right);
  const alpha = 1 - manifest.thresholds.confidenceLevel;
  return {
    treatment: "cortex",
    comparator,
    clusters: clusters.length,
    questions: clusters.reduce(
      (sum, cluster) => sum + cluster.differences.length,
      0,
    ),
    difference: mean(clusterMeans),
    confidenceLevel: manifest.thresholds.confidenceLevel,
    lower: percentile(bootstraps, alpha / 2),
    upper: percentile(bootstraps, 1 - alpha / 2),
  };
}

function competencyBreadth(
  reports: readonly MabConditionReport[],
): boolean {
  const groups = [
    reports.filter(
      (report) => report.competency === "test-time-learning",
    ),
    reports.filter(
      (report) => report.competency === "fact-consolidation",
    ),
    reports.filter((report) => report.stratum.startsWith("6k-")),
    reports.filter((report) => report.stratum.startsWith("32k-")),
  ];
  return groups.every((relevant) => {
    const cortex = aggregate(relevant, "cortex", "aggregate").accuracy;
    const regular = aggregate(relevant, "regular", "aggregate").accuracy;
    const advisory = aggregate(relevant, "advisory", "aggregate").accuracy;
    return (
      relevant.length > 0 &&
      cortex > regular &&
      cortex > advisory
    );
  });
}

function totalCost(reports: readonly MabConditionReport[]): number {
  return reports.reduce(
    (sum, report) => sum + report.telemetry.usage.costUsd,
    0,
  );
}

function sharedEvidenceAccessMatched(
  reports: readonly MabConditionReport[],
): boolean {
  const byReport = new Map(
    reports.map((report) => [
      `${report.source}|${report.repetition}|${report.condition}`,
      report,
    ]),
  );
  for (const regular of reports.filter(
    (report) => report.condition === "regular",
  )) {
    const advisory = byReport.get(
      `${regular.source}|${regular.repetition}|advisory`,
    );
    const cortex = byReport.get(
      `${regular.source}|${regular.repetition}|cortex`,
    );
    if (!advisory || !cortex) {
      return false;
    }
    if (
      regular.questions.length !== advisory.questions.length ||
      regular.questions.length !== cortex.questions.length
    ) {
      return false;
    }
    if (
      regular.acquisition.evidenceSha256 === undefined ||
      regular.acquisition.evidenceSha256 !==
        advisory.acquisition.evidenceSha256 ||
      regular.acquisition.evidenceSha256 !==
        cortex.acquisition.evidenceSha256
    ) {
      return false;
    }
    const advisoryQuestions = new Map(
      advisory.questions.map((question) => [
        question.questionId,
        question.retrieval,
      ]),
    );
    const cortexQuestions = new Map(
      cortex.questions.map((question) => [
        question.questionId,
        question.retrieval,
      ]),
    );
    for (const question of regular.questions) {
      if (
        !isDeepStrictEqual(
          question.retrieval,
          advisoryQuestions.get(question.questionId),
        ) ||
        !isDeepStrictEqual(
          question.retrieval,
          cortexQuestions.get(question.questionId),
        )
      ) {
        return false;
      }
    }
  }
  return reports.some((report) => report.condition === "regular");
}

interface MabBudget {
  spentUsd: number;
  maximumUsd: number;
  reservePerInvocationUsd: number;
  stopped: boolean;
}

export class MabCostLimitError extends Error {
  constructor(maximumUsd: number) {
    super(
      `MemoryAgentBench cost limit reached before the next model call ($${maximumUsd.toFixed(2)})`,
    );
    this.name = "MabCostLimitError";
  }
}

function budgetedExecutors(
  executors: MabConditionExecutors,
  budget: MabBudget,
): MabConditionExecutors {
  const beforeCall = (): void => {
    if (
      budget.spentUsd + budget.reservePerInvocationUsd >
      budget.maximumUsd
    ) {
      budget.stopped = true;
      throw new MabCostLimitError(budget.maximumUsd);
    }
  };
  const afterCall = (telemetry: ExecutionTelemetry): void => {
    budget.spentUsd += telemetry.usage.costUsd;
  };
  const run = async <T extends { telemetry: ExecutionTelemetry }>(
    execute: () => Promise<T>,
  ): Promise<T> => {
    beforeCall();
    try {
      const result = await execute();
      afterCall(result.telemetry);
      return result;
    } catch (error) {
      afterCall(collectErrorTelemetry(error, "unknown"));
      throw error;
    }
  };
  const directMemoryExecutor: DirectMemoryExecutor = {
    async execute(task, memory, evidence) {
      return run(() =>
        executors.directMemoryExecutor.execute(task, memory, evidence),
      );
    },
  };
  const advisoryMemoryExecutor: AdvisoryMemoryExecutor = {
    async execute(task, memory, mode, evidence) {
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
      return run(() => executors.phaseExecutor.execute(request));
    },
  };
  return {
    directMemoryExecutor,
    advisoryMemoryExecutor,
    phaseExecutor,
  };
}

export async function runMabBatch(
  options: MabRunOptions,
): Promise<MabBatchReport> {
  assertCompleteSources(options.streams);
  validateManifestStreams(options.manifest, options.streams);
  if (!isDeepStrictEqual(options.execution.model, options.manifest.model)) {
    throw new Error("execution model does not match the frozen manifest");
  }
  if (
    !isDeepStrictEqual(
      options.execution.repository,
      options.manifest.repository,
    )
  ) {
    throw new Error("repository state does not match the frozen manifest");
  }
  if (!isDeepStrictEqual(options.execution.source, options.manifest.source)) {
    throw new Error("Cortex source does not match the frozen manifest");
  }
  if (
    options.manifest.runtime.node !== process.version ||
    options.manifest.runtime.platform !== process.platform ||
    options.manifest.runtime.architecture !== process.arch
  ) {
    throw new Error("runtime does not match the frozen manifest");
  }
  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const startedAt = now().toISOString();
  const manifestBySource = new Map(
    options.manifest.streams.map((stream) => [stream.source, stream]),
  );
  const preparedBySource = new Map(
    options.streams.map((stream) => [stream.source, stream]),
  );
  const reports: MabConditionReport[] = [];
  const budget: MabBudget = {
    spentUsd: 0,
    maximumUsd: options.manifest.thresholds.maximumCostUsd,
    reservePerInvocationUsd:
      options.manifest.model.maximumInvocationCostUsd,
    stopped: false,
  };
  let costLimited = false;
  for (const run of options.manifest.runs) {
    const prepared = preparedBySource.get(run.source);
    const manifestStream = manifestBySource.get(run.source);
    if (!prepared || !manifestStream) {
      throw new Error(`missing frozen stream ${run.source}`);
    }
    const stream = streamForManifest(prepared, manifestStream);
    for (const condition of run.conditionOrder) {
      const directory = join(
        artifactDirectory,
        `repetition-${String(run.repetition).padStart(2, "0")}`,
        run.source,
        condition,
      );
      reports.push(
        await runMabCondition({
          artifactDirectory: directory,
          stream,
          condition,
          repetition: run.repetition,
          model: options.manifest.model.resolvedId,
          evidenceTopK:
            options.manifest.protocol.execution.evidenceTopK,
          async createExecutors(context) {
            return budgetedExecutors(
              await options.createExecutors(context),
              budget,
            );
          },
          score(output, question) {
            return (
              scoreMabOutput(
                run.source,
                output,
                question.answers,
              ).score === 1
            );
          },
          now,
        }),
      );
      await writePrivateJson(
        join(artifactDirectory, "partial-report.json"),
        {
          schemaVersion: 2,
          batchId: options.manifest.batchId,
          reports,
        },
      );
      if (
        budget.stopped ||
        budget.spentUsd >= options.manifest.thresholds.maximumCostUsd
      ) {
        costLimited = true;
        break;
      }
    }
    if (costLimited) {
      break;
    }
  }
  const aggregates = Object.fromEntries(
    MAB_CONDITIONS.map((condition) => [
      condition,
      aggregate(reports, condition, options.manifest.model.resolvedId),
    ]),
  ) as Record<MabCondition, MabConditionAggregate>;
  const bySource = Object.fromEntries(
    MAB_SELECTED_SOURCES.map((source) => {
      const selected = reports.filter((report) => report.source === source);
      return [
        source,
        Object.fromEntries(
          MAB_CONDITIONS.map((condition) => [
            condition,
            aggregate(
              selected,
              condition,
              options.manifest.model.resolvedId,
            ),
          ]),
        ),
      ];
    }),
  ) as Record<string, Record<MabCondition, MabConditionAggregate>>;
  const contrasts = [
    pairedContrast(reports, "regular", options.manifest),
    pairedContrast(reports, "advisory", options.manifest),
  ];
  const regular = contrasts[0]!;
  const advisory = contrasts[1]!;
  const minimumEffectMet =
    regular.difference >=
      options.manifest.thresholds.minimumAccuracyImprovement &&
    advisory.difference >=
      options.manifest.thresholds.minimumAccuracyImprovement;
  const costLimitMet =
    !costLimited &&
    totalCost(reports) <= options.manifest.thresholds.maximumCostUsd;
  const runComplete =
    !costLimited &&
    reports.length ===
      options.manifest.runs.length * MAB_CONDITIONS.length;
  const criteria = {
    cortexBeatsRegular: regular.lower > 0,
    cortexBeatsAdvisory: advisory.lower > 0,
    minimumEffectMet,
    competencyBreadthMet: competencyBreadth(reports),
    failureRateMet: MAB_CONDITIONS.every(
      (condition) =>
        aggregates[condition].failureRate <=
        options.manifest.thresholds.maximumConditionFailureRate,
    ),
    costLimitMet,
    runComplete,
    modelMatched: reports.every(
      (report) =>
        report.telemetry.model === options.manifest.model.resolvedId,
    ),
    sharedEvidenceAccessMatched:
      sharedEvidenceAccessMatched(reports),
    confirmatoryProtocolMet:
      options.manifest.evidenceMode === "confirmatory",
    supported: false,
  };
  criteria.supported =
    criteria.cortexBeatsRegular &&
    criteria.cortexBeatsAdvisory &&
    criteria.minimumEffectMet &&
    criteria.competencyBreadthMet &&
    criteria.failureRateMet &&
    criteria.costLimitMet &&
    criteria.runComplete &&
    criteria.modelMatched &&
    criteria.sharedEvidenceAccessMatched &&
    criteria.confirmatoryProtocolMet;
  const executionValid =
    criteria.runComplete &&
    criteria.failureRateMet &&
    criteria.costLimitMet &&
    criteria.modelMatched &&
    criteria.sharedEvidenceAccessMatched;
  const report: MabBatchReport = {
    schemaVersion: 2,
    batchId: options.manifest.batchId,
    status: costLimited
      ? "cost-limit"
      : executionValid
        ? "completed"
        : "failed",
    startedAt,
    completedAt: now().toISOString(),
    artifactDirectory,
    manifest: options.manifest,
    reports,
    aggregates,
    bySource,
    contrasts,
    criteria,
  };
  await writePrivateJson(
    join(artifactDirectory, "batch-report.json"),
    report,
  );
  return report;
}

export function defaultMabThresholds(): MabBatchThresholds {
  return {
    minimumAccuracyImprovement: 0.05,
    confidenceLevel: 0.95,
    maximumConditionFailureRate: 0.05,
    maximumCostUsd: 25,
    bootstrapSamples: 10_000,
  };
}

export function mabBatchDirectory(root: string, batchId: string): string {
  return resolve(root, basename(batchId));
}
