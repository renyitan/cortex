import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  JsonlEventSink,
  writePrivateJson,
  writePrivateJsonExclusive,
  writePrivateTextExclusive,
} from "./artifacts.js";
import {
  LifecycleController,
  LifecycleObservationError,
  LifecycleRunError,
  type LifecycleRunProgress,
} from "./controller.js";
import type {
  LoadedLongMemEvalPilot,
  LongMemEvalItem,
  LongMemEvalPreparedItem,
  LongMemEvalStratum,
} from "./longmemeval-dataset.js";
import { AtomicMemoryStore } from "./memory-store.js";
import { Bm25MemoryRetriever } from "./memory-retriever.js";
import {
  collectErrorTelemetry,
  combineTelemetry,
  sessionTelemetry,
} from "./telemetry.js";
import type {
  BaselineExecution,
  BaselineExecutor,
  DirectMemoryExecutor,
  ExecutionTelemetry,
  MemoryDraft,
  PhaseExecutor,
  SessionRunResult,
} from "./types.js";

export const LONGMEMEVAL_CONDITIONS = [
  "stateless",
  "oracle",
  "cortex-bm25",
] as const;

export type LongMemEvalCondition = (typeof LONGMEMEVAL_CONDITIONS)[number];

export interface LongMemEvalExecutors {
  baselineExecutor: BaselineExecutor;
  directMemoryExecutor: DirectMemoryExecutor;
  phaseExecutor: PhaseExecutor;
}

export interface LongMemEvalItemContext {
  itemNumber: number;
  questionId: string;
  artifactDirectory: string;
}

export interface LongMemEvalRunOptions {
  prepared: LoadedLongMemEvalPilot;
  artifactDirectory: string;
  retrievalLimit: number;
  createExecutors(
    context: LongMemEvalItemContext,
  ): Promise<LongMemEvalExecutors> | LongMemEvalExecutors;
  model: {
    provider: string;
    requestedId: string;
    resolvedId: string;
    thinkingLevel: string;
  };
  source: unknown;
  repository: {
    commit?: string;
    dirty?: boolean;
  };
  now?: () => Date;
}

export interface LongMemEvalRetrievalScore {
  goldSessionIds: string[];
  candidateSessionIds: string[];
  selectedSessionIds: string[];
  candidateEvaluated: boolean;
  selectionEvaluated: boolean;
  candidateRecall: number | null;
  selectedRecall: number | null;
  selectedPrecision: number | null;
}

export interface LongMemEvalCortexEvidence {
  importedMemoryCount: number;
  finalMemoryCount: number;
  session: SessionRunResult;
  retrieval: LongMemEvalRetrievalScore;
}

export interface LongMemEvalCortexFailureEvidence {
  importedMemoryCount: number;
  progress?: LifecycleRunProgress;
  retrieval: LongMemEvalRetrievalScore;
}

type LongMemEvalCortexReportEvidence =
  | LongMemEvalCortexEvidence
  | LongMemEvalCortexFailureEvidence;

export interface LongMemEvalConditionReport {
  condition: LongMemEvalCondition;
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  output: string;
  diagnosticNormalizedExactMatch: boolean;
  telemetry: ExecutionTelemetry;
  telemetryComplete: boolean;
  error?: {
    name: string;
    message: string;
  };
  evidence?: BaselineExecution | LongMemEvalCortexReportEvidence;
}

export interface LongMemEvalItemReport {
  schemaVersion: 2;
  benchmark: "longmemeval-cleaned";
  questionId: string;
  questionType: LongMemEvalItem["question_type"];
  stratum: LongMemEvalStratum;
  question: string;
  referenceAnswer: string;
  artifactDirectory: string;
  conditionOrder: LongMemEvalCondition[];
  status: "completed" | "completed-with-errors";
  startedAt: string;
  completedAt: string;
  conditions: Record<LongMemEvalCondition, LongMemEvalConditionReport>;
}

export interface LongMemEvalConditionAggregate {
  items: number;
  completed: number;
  errors: number;
  diagnosticNormalizedExactMatches: number;
  telemetryComplete: number;
  telemetry: ExecutionTelemetry;
  averageLatencyMsPerItem: number;
  averageCostUsdPerItem: number;
}

export interface LongMemEvalRetrievalAggregate {
  answerableCandidateItemsEvaluated: number;
  answerableSelectionItemsEvaluated: number;
  candidateFullRecall: number;
  selectedFullRecall: number;
  meanCandidateRecall: number | null;
  meanSelectedRecall: number | null;
  meanSelectedPrecision: number | null;
  abstentionSelectionItemsEvaluated: number;
  abstentionItemsWithNoSelection: number;
}

export interface LongMemEvalRunManifest {
  schemaVersion: 1;
  benchmark: "longmemeval-cleaned";
  createdAt: string;
  preparedManifestSha256: string;
  preparedDatasetRevision: string;
  questionIds: string[];
  conditionOrders: {
    questionId: string;
    order: LongMemEvalCondition[];
  }[];
  retrieval: {
    strategy: "bm25";
    limit: number;
  };
  model: LongMemEvalRunOptions["model"];
  repository: LongMemEvalRunOptions["repository"];
  source: unknown;
  answerScoring: {
    officialJudgeRun: false;
    diagnosticOnly: "normalized-exact-match";
  };
}

export interface LongMemEvalRunReport {
  schemaVersion: 2;
  benchmark: "longmemeval-cleaned";
  status: "completed" | "completed-with-errors";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  manifest: LongMemEvalRunManifest;
  conditions: Record<LongMemEvalCondition, LongMemEvalConditionAggregate>;
  retrieval: LongMemEvalRetrievalAggregate;
  items: LongMemEvalItemReport[];
}

const CONDITION_ORDERS: readonly (readonly LongMemEvalCondition[])[] = [
  ["stateless", "oracle", "cortex-bm25"],
  ["oracle", "cortex-bm25", "stateless"],
  ["cortex-bm25", "stateless", "oracle"],
];

class LongMemEvalCortexConditionError extends Error {
  constructor(
    cause: unknown,
    readonly evidence: LongMemEvalCortexFailureEvidence,
  ) {
    super(errorDetails(cause).message, { cause });
    this.name = errorDetails(cause).name;
  }
}

function conditionOrder(itemNumber: number): LongMemEvalCondition[] {
  return [...CONDITION_ORDERS[(itemNumber - 1) % CONDITION_ORDERS.length]!];
}

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function longMemEvalTask(item: LongMemEvalItem): string {
  return `Answer this LongMemEval question as of ${item.question_date}.

Question:
${item.question}

Return a concise answer grounded only in supplied information. If the information does not establish an answer, answer "I don't know."`;
}

export function longMemEvalMemoryId(
  sessionId: string,
  occurrence = 0,
): string {
  return `lme-${createHash("sha256")
    .update(sessionId)
    .update("\0")
    .update(String(occurrence))
    .digest("hex")
    .slice(0, 24)}`;
}

function sessionText(
  item: LongMemEvalItem,
  sessionIndex: number,
): string {
  const date = item.haystack_dates[sessionIndex];
  const turns = item.haystack_sessions[sessionIndex];
  if (!item.haystack_session_ids[sessionIndex] || !date || !turns) {
    throw new Error(
      `LongMemEval session arrays are misaligned for ${item.question_id}`,
    );
  }
  return [
    "Historical conversation:",
    `Session date: ${date}`,
    ...turns.map(
      (turn) => `${turn.role === "user" ? "USER" : "ASSISTANT"}: ${turn.content}`,
    ),
  ].join("\n");
}

function memoryDrafts(item: LongMemEvalItem): MemoryDraft[] {
  const occurrences = new Map<string, number>();
  return item.haystack_session_ids.map((sessionId, index) => {
    const occurrence = occurrences.get(sessionId) ?? 0;
    occurrences.set(sessionId, occurrence + 1);
    return {
      id: longMemEvalMemoryId(sessionId, occurrence),
      kind: "learning",
      text: [
        sessionText(item, index),
        `Session occurrence: ${occurrence + 1}`,
      ].join("\n"),
      evidence: `Imported LongMemEval history record occurrence ${occurrence + 1}`,
      source: "imported",
    };
  });
}

function scoreRetrieval(
  item: LongMemEvalItem,
  candidateMemoryIds: readonly string[],
  selectedMemoryIds: readonly string[],
  candidateEvaluated = true,
  selectionEvaluated = true,
): LongMemEvalRetrievalScore {
  const occurrences = new Map<string, number>();
  const memoryToSession = new Map<string, string>();
  for (const sessionId of item.haystack_session_ids) {
    const occurrence = occurrences.get(sessionId) ?? 0;
    occurrences.set(sessionId, occurrence + 1);
    memoryToSession.set(
      longMemEvalMemoryId(sessionId, occurrence),
      sessionId,
    );
  }
  const candidateSessionIds = [
    ...new Set(
      candidateMemoryIds.flatMap((memoryId) => {
        const sessionId = memoryToSession.get(memoryId);
        return sessionId ? [sessionId] : [];
      }),
    ),
  ];
  const selectedSessionIds = [
    ...new Set(
      selectedMemoryIds.flatMap((memoryId) => {
        const sessionId = memoryToSession.get(memoryId);
        return sessionId ? [sessionId] : [];
      }),
    ),
  ];
  const gold = new Set(item.answer_session_ids);
  const candidateHits = candidateSessionIds.filter((sessionId) =>
    gold.has(sessionId),
  ).length;
  const selectedHits = selectedSessionIds.filter((sessionId) =>
    gold.has(sessionId),
  ).length;
  return {
    goldSessionIds: [...item.answer_session_ids],
    candidateSessionIds,
    selectedSessionIds,
    candidateEvaluated,
    selectionEvaluated,
    candidateRecall:
      !candidateEvaluated || gold.size === 0
        ? null
        : candidateHits / gold.size,
    selectedRecall:
      !selectionEvaluated || gold.size === 0 ? null : selectedHits / gold.size,
    selectedPrecision:
      !selectionEvaluated
        ? null
        : selectedSessionIds.length === 0
        ? gold.size === 0
          ? 1
          : 0
        : selectedHits / selectedSessionIds.length,
  };
}

async function runCortexCondition(
  item: LongMemEvalItem,
  executor: PhaseExecutor,
  artifactDirectory: string,
  retrievalLimit: number,
  now: () => Date,
  model: string,
): Promise<{
  output: string;
  telemetry: ExecutionTelemetry;
  evidence: LongMemEvalCortexEvidence;
}> {
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const store = new AtomicMemoryStore(join(artifactDirectory, "memory.json"), now);
  const drafts = memoryDrafts(item);
  await store.applyWrites(
    drafts.map((draft) => ({ candidateId: draft.id, record: draft })),
  );
  const controller = new LifecycleController(
    executor,
    store,
    new JsonlEventSink(join(artifactDirectory, "lifecycle.jsonl")),
    now,
    undefined,
    new Bm25MemoryRetriever({ limit: retrievalLimit }),
  );
  let session: SessionRunResult;
  try {
    session = await controller.runSession(longMemEvalTask(item));
  } catch (error) {
    const progress =
      error instanceof LifecycleRunError ||
      error instanceof LifecycleObservationError
        ? error.progress
        : undefined;
    throw new LongMemEvalCortexConditionError(error, {
      importedMemoryCount: drafts.length,
      ...(progress ? { progress } : {}),
      retrieval: scoreRetrieval(
        item,
        progress?.retrieval.candidates.map(
          (candidate) => candidate.memoryId,
        ) ?? [],
        progress?.wake?.selectedMemoryIds ?? [],
        progress !== undefined,
        progress?.wake !== undefined,
      ),
    });
  }
  return {
    output: session.output,
    telemetry: sessionTelemetry([session], model),
    evidence: {
      importedMemoryCount: drafts.length,
      finalMemoryCount: session.memory.length,
      session,
      retrieval: scoreRetrieval(
        item,
        session.retrieval.candidates.map((candidate) => candidate.memoryId),
        session.wake.selectedMemoryIds,
      ),
    },
  };
}

async function captureCondition<T>(
  condition: LongMemEvalCondition,
  item: LongMemEvalItem,
  model: string,
  now: () => Date,
  execute: () => Promise<T>,
  summarize: (value: T) => {
    output: string;
    telemetry: ExecutionTelemetry;
    evidence: BaselineExecution | LongMemEvalCortexEvidence;
  },
): Promise<LongMemEvalConditionReport> {
  const startedAt = now().toISOString();
  try {
    const summary = summarize(await execute());
    return {
      condition,
      status: "completed",
      startedAt,
      completedAt: now().toISOString(),
      output: summary.output,
      diagnosticNormalizedExactMatch:
        normalized(summary.output) === normalized(item.answer),
      telemetry: summary.telemetry,
      telemetryComplete: true,
      evidence: summary.evidence,
    };
  } catch (error) {
    return {
      condition,
      status: "error",
      startedAt,
      completedAt: now().toISOString(),
      output: "",
      diagnosticNormalizedExactMatch: false,
      telemetry: collectErrorTelemetry(error, model),
      telemetryComplete: false,
      error: errorDetails(error),
      ...(error instanceof LongMemEvalCortexConditionError
        ? { evidence: error.evidence }
        : {}),
    };
  }
}

function initializationFailure(
  condition: LongMemEvalCondition,
  error: unknown,
  model: string,
  timestamp: string,
): LongMemEvalConditionReport {
  return {
    condition,
    status: "error",
    startedAt: timestamp,
    completedAt: timestamp,
    output: "",
    diagnosticNormalizedExactMatch: false,
    telemetry: collectErrorTelemetry(error, model),
    telemetryComplete: false,
    error: errorDetails(error),
  };
}

async function runItem(
  options: LongMemEvalRunOptions,
  preparedItem: LongMemEvalPreparedItem,
  root: string,
  itemNumber: number,
  now: () => Date,
): Promise<LongMemEvalItemReport> {
  const item = preparedItem.history;
  if (!/^[A-Za-z0-9_.-]+$/.test(item.question_id)) {
    throw new Error(
      `question ID cannot be used as an artifact path: ${item.question_id}`,
    );
  }
  const artifactDirectory = join(root, "items", item.question_id);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const order = conditionOrder(itemNumber);
  const startedAt = now().toISOString();
  let executors: LongMemEvalExecutors;
  try {
    executors = await options.createExecutors({
      itemNumber,
      questionId: item.question_id,
      artifactDirectory,
    });
  } catch (error) {
    const timestamp = now().toISOString();
    const conditions = Object.fromEntries(
      LONGMEMEVAL_CONDITIONS.map((condition) => [
        condition,
        initializationFailure(
          condition,
          error,
          options.model.resolvedId,
          timestamp,
        ),
      ]),
    ) as Record<LongMemEvalCondition, LongMemEvalConditionReport>;
    const report: LongMemEvalItemReport = {
      schemaVersion: 2,
      benchmark: "longmemeval-cleaned",
      questionId: item.question_id,
      questionType: item.question_type,
      stratum: preparedItem.stratum,
      question: item.question,
      referenceAnswer: item.answer,
      artifactDirectory,
      conditionOrder: order,
      status: "completed-with-errors",
      startedAt,
      completedAt: timestamp,
      conditions,
    };
    await writePrivateJson(join(artifactDirectory, "report.json"), report);
    return report;
  }

  const conditions = {} as Record<
    LongMemEvalCondition,
    LongMemEvalConditionReport
  >;
  for (const condition of order) {
    if (condition === "stateless") {
      conditions[condition] = await captureCondition(
        condition,
        item,
        options.model.resolvedId,
        now,
        () => executors.baselineExecutor.execute(longMemEvalTask(item)),
        (execution) => ({
          output: execution.output,
          telemetry: execution.telemetry,
          evidence: execution,
        }),
      );
    } else if (condition === "oracle") {
      conditions[condition] = await captureCondition(
        condition,
        item,
        options.model.resolvedId,
        now,
        () =>
          executors.directMemoryExecutor.execute(
            longMemEvalTask(preparedItem.oracle),
            memoryDrafts(preparedItem.oracle),
          ),
        (execution) => ({
          output: execution.output,
          telemetry: execution.telemetry,
          evidence: execution,
        }),
      );
    } else {
      conditions[condition] = await captureCondition(
        condition,
        item,
        options.model.resolvedId,
        now,
        () =>
          runCortexCondition(
            item,
            executors.phaseExecutor,
            join(artifactDirectory, "cortex"),
            options.retrievalLimit,
            now,
            options.model.resolvedId,
          ),
        (execution) => execution,
      );
    }
  }

  const report: LongMemEvalItemReport = {
    schemaVersion: 2,
    benchmark: "longmemeval-cleaned",
    questionId: item.question_id,
    questionType: item.question_type,
    stratum: preparedItem.stratum,
    question: item.question,
    referenceAnswer: item.answer,
    artifactDirectory,
    conditionOrder: order,
    status: LONGMEMEVAL_CONDITIONS.some(
      (condition) => conditions[condition].status === "error",
    )
      ? "completed-with-errors"
      : "completed",
    startedAt,
    completedAt: now().toISOString(),
    conditions,
  };
  await writePrivateJson(join(artifactDirectory, "report.json"), report);
  return report;
}

function aggregateCondition(
  reports: readonly LongMemEvalItemReport[],
  condition: LongMemEvalCondition,
  model: string,
): LongMemEvalConditionAggregate {
  const conditionReports = reports.map((report) => report.conditions[condition]);
  const telemetry = combineTelemetry(
    conditionReports.map((report) => report.telemetry),
    model,
  );
  return {
    items: conditionReports.length,
    completed: conditionReports.filter((report) => report.status === "completed")
      .length,
    errors: conditionReports.filter((report) => report.status === "error").length,
    diagnosticNormalizedExactMatches: conditionReports.filter(
      (report) => report.diagnosticNormalizedExactMatch,
    ).length,
    telemetryComplete: conditionReports.filter(
      (report) => report.telemetryComplete,
    ).length,
    telemetry,
    averageLatencyMsPerItem:
      conditionReports.length === 0
        ? 0
        : telemetry.latencyMs / conditionReports.length,
    averageCostUsdPerItem:
      conditionReports.length === 0
        ? 0
        : telemetry.usage.costUsd / conditionReports.length,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateRetrieval(
  reports: readonly LongMemEvalItemReport[],
): LongMemEvalRetrievalAggregate {
  const evaluated = reports.flatMap((report) => {
    const condition = report.conditions["cortex-bm25"];
    if (
      !condition.evidence ||
      !("retrieval" in condition.evidence)
    ) {
      return [];
    }
    return [{ stratum: report.stratum, retrieval: condition.evidence.retrieval }];
  });
  const answerable = evaluated.filter(
    ({ stratum, retrieval }) =>
      stratum !== "abstention" && retrieval.candidateEvaluated,
  );
  const answerableSelections = answerable.filter(
    ({ retrieval }) => retrieval.selectionEvaluated,
  );
  const abstentionSelections = evaluated.filter(
    ({ stratum, retrieval }) =>
      stratum === "abstention" && retrieval.selectionEvaluated,
  );
  return {
    answerableCandidateItemsEvaluated: answerable.length,
    answerableSelectionItemsEvaluated: answerableSelections.length,
    candidateFullRecall: answerable.filter(
      ({ retrieval }) => retrieval.candidateRecall === 1,
    ).length,
    selectedFullRecall: answerableSelections.filter(
      ({ retrieval }) => retrieval.selectedRecall === 1,
    ).length,
    meanCandidateRecall: mean(
      answerable.flatMap(({ retrieval }) =>
        retrieval.candidateRecall === null ? [] : [retrieval.candidateRecall],
      ),
    ),
    meanSelectedRecall: mean(
      answerableSelections.flatMap(({ retrieval }) =>
        retrieval.selectedRecall === null ? [] : [retrieval.selectedRecall],
      ),
    ),
    meanSelectedPrecision: mean(
      answerable.flatMap(({ retrieval }) =>
        retrieval.selectedPrecision === null
          ? []
          : [retrieval.selectedPrecision],
      ),
    ),
    abstentionSelectionItemsEvaluated: abstentionSelections.length,
    abstentionItemsWithNoSelection: abstentionSelections.filter(
      ({ retrieval }) => retrieval.selectedSessionIds.length === 0,
    ).length,
  };
}

function hypotheses(
  reports: readonly LongMemEvalItemReport[],
  condition: LongMemEvalCondition,
): string {
  return `${reports
    .map((report) =>
      JSON.stringify({
        question_id: report.questionId,
        hypothesis: report.conditions[condition].output,
      }),
    )
    .join("\n")}\n`;
}

export async function runLongMemEvalPilot(
  options: LongMemEvalRunOptions,
): Promise<LongMemEvalRunReport> {
  if (!Number.isInteger(options.retrievalLimit) || options.retrievalLimit < 1) {
    throw new Error("retrievalLimit must be a positive integer");
  }
  if (options.prepared.items.length === 0) {
    throw new Error("prepared LongMemEval pilot contains no items");
  }

  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const startedAt = now().toISOString();
  const manifest: LongMemEvalRunManifest = {
    schemaVersion: 1,
    benchmark: "longmemeval-cleaned",
    createdAt: startedAt,
    preparedManifestSha256: options.prepared.manifestSha256,
    preparedDatasetRevision: options.prepared.manifest.dataset.revision,
    questionIds: options.prepared.items.map(
      (prepared) => prepared.history.question_id,
    ),
    conditionOrders: options.prepared.items.map((prepared, index) => ({
      questionId: prepared.history.question_id,
      order: conditionOrder(index + 1),
    })),
    retrieval: { strategy: "bm25", limit: options.retrievalLimit },
    model: options.model,
    repository: options.repository,
    source: options.source,
    answerScoring: {
      officialJudgeRun: false,
      diagnosticOnly: "normalized-exact-match",
    },
  };
  await writePrivateJsonExclusive(
    join(artifactDirectory, "run-manifest.json"),
    manifest,
  );

  const reports: LongMemEvalItemReport[] = [];
  for (const [index, prepared] of options.prepared.items.entries()) {
    reports.push(
      await runItem(options, prepared, artifactDirectory, index + 1, now),
    );
  }

  const hypothesesDirectory = join(artifactDirectory, "hypotheses");
  await mkdir(hypothesesDirectory, { recursive: true, mode: 0o700 });
  for (const condition of LONGMEMEVAL_CONDITIONS) {
    await writePrivateTextExclusive(
      join(hypothesesDirectory, `${condition}.jsonl`),
      hypotheses(reports, condition),
    );
  }

  const conditionAggregates = Object.fromEntries(
    LONGMEMEVAL_CONDITIONS.map((condition) => [
      condition,
      aggregateCondition(reports, condition, options.model.resolvedId),
    ]),
  ) as Record<LongMemEvalCondition, LongMemEvalConditionAggregate>;
  const report: LongMemEvalRunReport = {
    schemaVersion: 2,
    benchmark: "longmemeval-cleaned",
    status: reports.some((item) => item.status === "completed-with-errors")
      ? "completed-with-errors"
      : "completed",
    startedAt,
    completedAt: now().toISOString(),
    artifactDirectory,
    manifest,
    conditions: conditionAggregates,
    retrieval: aggregateRetrieval(reports),
    items: reports,
  };
  await writePrivateJson(join(artifactDirectory, "report.json"), report);
  return report;
}
