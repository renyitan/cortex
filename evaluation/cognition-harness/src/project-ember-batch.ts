import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  writePrivateJson,
  writePrivateJsonExclusive,
} from "./artifacts.js";
import {
  PROJECT_EMBER_DIRECT_MEMORY,
  PROJECT_EMBER_FIXTURE_ID,
  PROJECT_EMBER_RECALL_TASK,
  runProjectEmberCortexCondition,
  scoreProjectEmberBaseline,
  scoreProjectEmberDirectMemory,
  ProjectEmberCortexConditionError,
  type ProjectEmberCortexFailureEvidence,
  type ProjectEmberCortexExecution,
} from "./project-ember-fixture.js";
import {
  type BaselineExecution,
  type BaselineExecutor,
  type DirectMemoryExecutor,
  type ExecutionTelemetry,
  type PhaseExecutor,
} from "./types.js";
import {
  collectErrorTelemetry,
  combineTelemetry,
  sessionTelemetry,
} from "./telemetry.js";

export const PROJECT_EMBER_CONDITIONS = [
  "stateless",
  "direct-memory",
  "cortex",
] as const;

export type ProjectEmberCondition = (typeof PROJECT_EMBER_CONDITIONS)[number];

export interface ProjectEmberTrialExecutors {
  baselineExecutor: BaselineExecutor;
  directMemoryExecutor: DirectMemoryExecutor;
  phaseExecutor: PhaseExecutor;
}

export interface ProjectEmberTrialContext {
  trialNumber: number;
  trialId: string;
  batchId: string;
  artifactDirectory: string;
}

export interface ProjectEmberBatchOptions {
  artifactDirectory: string;
  batchId: string;
  trialCount: number;
  createExecutors(
    context: ProjectEmberTrialContext,
  ): Promise<ProjectEmberTrialExecutors> | ProjectEmberTrialExecutors;
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

export interface ProjectEmberConditionReport {
  condition: ProjectEmberCondition;
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  passed: boolean;
  checks: Record<string, boolean>;
  telemetry: ExecutionTelemetry;
  telemetryComplete: boolean;
  output?: string;
  error?: {
    name: string;
    message: string;
  };
  evidence?:
    | BaselineExecution
    | ProjectEmberCortexExecution
    | ProjectEmberCortexFailureEvidence;
}

export interface ProjectEmberTrialReport {
  schemaVersion: 1;
  fixture: typeof PROJECT_EMBER_FIXTURE_ID;
  trialNumber: number;
  trialId: string;
  batchId: string;
  artifactDirectory: string;
  conditionOrder: ProjectEmberCondition[];
  status: "passed" | "failed" | "error";
  startedAt: string;
  completedAt: string;
  model: ProjectEmberBatchOptions["model"];
  repository: ProjectEmberBatchOptions["repository"];
  source: unknown;
  conditions: Record<ProjectEmberCondition, ProjectEmberConditionReport>;
}

export interface ProjectEmberConditionAggregate {
  trials: number;
  completed: number;
  errors: number;
  passed: number;
  passRate: number;
  telemetryComplete: number;
  checksPassed: Record<string, number>;
  telemetry: ExecutionTelemetry;
  averageLatencyMsPerTrial: number;
  averageCostUsdPerTrial: number;
}

export interface ProjectEmberBatchReport {
  schemaVersion: 1;
  fixture: typeof PROJECT_EMBER_FIXTURE_ID;
  batchId: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  manifest: ProjectEmberBatchManifest;
  aggregates: Record<ProjectEmberCondition, ProjectEmberConditionAggregate>;
  trials: ProjectEmberTrialReport[];
}

export interface ProjectEmberBatchManifest {
  schemaVersion: 1;
  fixture: typeof PROJECT_EMBER_FIXTURE_ID;
  batchId: string;
  createdAt: string;
  trialCount: number;
  conditions: readonly ProjectEmberCondition[];
  conditionOrders: {
    trialId: string;
    order: ProjectEmberCondition[];
  }[];
  model: ProjectEmberBatchOptions["model"];
  repository: ProjectEmberBatchOptions["repository"];
  source: unknown;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    architecture: string;
  };
}

const CONDITION_ORDERS: readonly (readonly ProjectEmberCondition[])[] = [
  ["stateless", "direct-memory", "cortex"],
  ["direct-memory", "cortex", "stateless"],
  ["cortex", "stateless", "direct-memory"],
];

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

function cortexTelemetry(execution: ProjectEmberCortexExecution): ExecutionTelemetry {
  return sessionTelemetry(
    [execution.learningSession, execution.recallSession],
    execution.recallSession.receipts.at(-1)?.telemetry.model ?? "unknown",
  );
}

function checksWithoutPassed(
  score: object & { passed: boolean },
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(score).filter(([name]) => name !== "passed"),
  );
}

async function captureCondition<T>(
  condition: ProjectEmberCondition,
  model: string,
  now: () => Date,
  execute: () => Promise<T>,
  summarize: (result: T) => {
    output: string;
    score: object & { passed: boolean };
    telemetry: ExecutionTelemetry;
    evidence: BaselineExecution | ProjectEmberCortexExecution;
  },
): Promise<ProjectEmberConditionReport> {
  const startedAt = now().toISOString();
  try {
    const result = await execute();
    const summary = summarize(result);
    return {
      condition,
      status: "completed",
      startedAt,
      completedAt: now().toISOString(),
      passed: summary.score.passed,
      checks: checksWithoutPassed(summary.score),
      telemetry: summary.telemetry,
      telemetryComplete: true,
      output: summary.output,
      evidence: summary.evidence,
    };
  } catch (error) {
    const errorTelemetry = collectErrorTelemetry(error, model);
    const learningSession =
      error instanceof ProjectEmberCortexConditionError
        ? error.evidence.learningSession
        : undefined;
    return {
      condition,
      status: "error",
      startedAt,
      completedAt: now().toISOString(),
      passed: false,
      checks: {},
      telemetry: learningSession
        ? combineTelemetry(
            [
              sessionTelemetry(
                [learningSession],
                learningSession.receipts.at(-1)?.telemetry.model ?? model,
              ),
              errorTelemetry,
            ],
            model,
          )
        : errorTelemetry,
      telemetryComplete: false,
      error: errorDetails(error),
      ...(error instanceof ProjectEmberCortexConditionError
        ? { evidence: error.evidence }
        : {}),
    };
  }
}

function initializationFailure(
  condition: ProjectEmberCondition,
  error: unknown,
  model: string,
  timestamp: string,
): ProjectEmberConditionReport {
  return {
    condition,
    status: "error",
    startedAt: timestamp,
    completedAt: timestamp,
    passed: false,
    checks: {},
    telemetry: collectErrorTelemetry(error, model),
    telemetryComplete: false,
    error: errorDetails(error),
  };
}

export function projectEmberTrialId(
  trialNumber: number,
  trialCount: number,
): string {
  const width = Math.max(3, String(trialCount).length);
  return `trial-${String(trialNumber).padStart(width, "0")}`;
}

function conditionOrder(trialNumber: number): ProjectEmberCondition[] {
  return [...CONDITION_ORDERS[(trialNumber - 1) % CONDITION_ORDERS.length]!];
}

async function runTrial(
  options: ProjectEmberBatchOptions,
  root: string,
  trialNumber: number,
  now: () => Date,
): Promise<ProjectEmberTrialReport> {
  const id = projectEmberTrialId(trialNumber, options.trialCount);
  const artifactDirectory = join(root, id);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const order = conditionOrder(trialNumber);
  const startedAt = now().toISOString();
  let executors: ProjectEmberTrialExecutors;
  try {
    executors = await options.createExecutors({
      trialNumber,
      trialId: id,
      batchId: options.batchId,
      artifactDirectory,
    });
  } catch (error) {
    const timestamp = now().toISOString();
    const conditions = Object.fromEntries(
      PROJECT_EMBER_CONDITIONS.map((condition) => [
        condition,
        initializationFailure(
          condition,
          error,
          options.model.resolvedId,
          timestamp,
        ),
      ]),
    ) as Record<ProjectEmberCondition, ProjectEmberConditionReport>;
    const report: ProjectEmberTrialReport = {
      schemaVersion: 1,
      fixture: PROJECT_EMBER_FIXTURE_ID,
      trialNumber,
      trialId: id,
      batchId: options.batchId,
      artifactDirectory,
      conditionOrder: order,
      status: "error",
      startedAt,
      completedAt: timestamp,
      model: options.model,
      repository: options.repository,
      source: options.source,
      conditions,
    };
    await writePrivateJson(join(artifactDirectory, "report.json"), report);
    return report;
  }

  const conditions = {} as Record<
    ProjectEmberCondition,
    ProjectEmberConditionReport
  >;
  for (const condition of order) {
    if (condition === "stateless") {
      conditions[condition] = await captureCondition(
        condition,
        options.model.resolvedId,
        now,
        () => executors.baselineExecutor.execute(PROJECT_EMBER_RECALL_TASK),
        (execution) => ({
          output: execution.output,
          score: scoreProjectEmberBaseline(execution),
          telemetry: execution.telemetry,
          evidence: execution,
        }),
      );
    } else if (condition === "direct-memory") {
      conditions[condition] = await captureCondition(
        condition,
        options.model.resolvedId,
        now,
        () =>
          executors.directMemoryExecutor.execute(PROJECT_EMBER_RECALL_TASK, [
            PROJECT_EMBER_DIRECT_MEMORY,
          ]),
        (execution) => ({
          output: execution.output,
          score: scoreProjectEmberDirectMemory(execution),
          telemetry: execution.telemetry,
          evidence: execution,
        }),
      );
    } else {
      conditions[condition] = await captureCondition(
        condition,
        options.model.resolvedId,
        now,
        () =>
          runProjectEmberCortexCondition({
            artifactDirectory: join(artifactDirectory, "cortex"),
            phaseExecutor: executors.phaseExecutor,
            now,
          }),
        (execution) => ({
          output: execution.recallSession.output,
          score: execution.score,
          telemetry: cortexTelemetry(execution),
          evidence: execution,
        }),
      );
    }
  }

  const conditionReports = PROJECT_EMBER_CONDITIONS.map(
    (condition) => conditions[condition],
  );
  const status = conditionReports.some((report) => report.status === "error")
    ? "error"
    : conditionReports.every((report) => report.passed)
      ? "passed"
      : "failed";
  const report: ProjectEmberTrialReport = {
    schemaVersion: 1,
    fixture: PROJECT_EMBER_FIXTURE_ID,
    trialNumber,
    trialId: id,
    batchId: options.batchId,
    artifactDirectory,
    conditionOrder: order,
    status,
    startedAt,
    completedAt: now().toISOString(),
    model: options.model,
    repository: options.repository,
    source: options.source,
    conditions,
  };
  await writePrivateJson(join(artifactDirectory, "report.json"), report);
  return report;
}

function aggregateCondition(
  trials: readonly ProjectEmberTrialReport[],
  condition: ProjectEmberCondition,
  model: string,
): ProjectEmberConditionAggregate {
  const reports = trials.map((trial) => trial.conditions[condition]);
  const checksPassed: Record<string, number> = {};
  for (const report of reports) {
    for (const [check, passed] of Object.entries(report.checks)) {
      checksPassed[check] = (checksPassed[check] ?? 0) + (passed ? 1 : 0);
    }
  }
  const telemetry = combineTelemetry(
    reports.map((report) => report.telemetry),
    model,
  );
  return {
    trials: reports.length,
    completed: reports.filter((report) => report.status === "completed").length,
    errors: reports.filter((report) => report.status === "error").length,
    passed: reports.filter((report) => report.passed).length,
    passRate:
      reports.length === 0
        ? 0
        : reports.filter((report) => report.passed).length / reports.length,
    telemetryComplete: reports.filter((report) => report.telemetryComplete).length,
    checksPassed,
    telemetry,
    averageLatencyMsPerTrial:
      reports.length === 0 ? 0 : telemetry.latencyMs / reports.length,
    averageCostUsdPerTrial:
      reports.length === 0 ? 0 : telemetry.usage.costUsd / reports.length,
  };
}

export async function runProjectEmberBatch(
  options: ProjectEmberBatchOptions,
): Promise<ProjectEmberBatchReport> {
  if (!Number.isInteger(options.trialCount) || options.trialCount < 1) {
    throw new Error("trialCount must be a positive integer");
  }
  if (options.batchId.trim().length === 0) {
    throw new Error("batchId must not be empty");
  }

  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const startedAt = now().toISOString();
  const manifest: ProjectEmberBatchManifest = {
    schemaVersion: 1,
    fixture: PROJECT_EMBER_FIXTURE_ID,
    batchId: options.batchId,
    createdAt: startedAt,
    trialCount: options.trialCount,
    conditions: PROJECT_EMBER_CONDITIONS,
    conditionOrders: Array.from({ length: options.trialCount }, (_, index) => {
      const trialNumber = index + 1;
      return {
        trialId: projectEmberTrialId(trialNumber, options.trialCount),
        order: conditionOrder(trialNumber),
      };
    }),
    model: options.model,
    repository: options.repository,
    source: options.source,
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
  };
  await writePrivateJsonExclusive(
    join(artifactDirectory, "manifest.json"),
    manifest,
  );

  const trials: ProjectEmberTrialReport[] = [];
  for (let trialNumber = 1; trialNumber <= options.trialCount; trialNumber += 1) {
    trials.push(await runTrial(options, artifactDirectory, trialNumber, now));
  }

  const aggregates = Object.fromEntries(
    PROJECT_EMBER_CONDITIONS.map((condition) => [
      condition,
      aggregateCondition(trials, condition, options.model.resolvedId),
    ]),
  ) as Record<ProjectEmberCondition, ProjectEmberConditionAggregate>;
  const report: ProjectEmberBatchReport = {
    schemaVersion: 1,
    fixture: PROJECT_EMBER_FIXTURE_ID,
    batchId: options.batchId,
    status: trials.every((trial) => trial.status === "passed")
      ? "passed"
      : "failed",
    startedAt,
    completedAt: now().toISOString(),
    artifactDirectory,
    manifest,
    aggregates,
    trials,
  };
  await writePrivateJson(join(artifactDirectory, "batch-report.json"), report);
  return report;
}
