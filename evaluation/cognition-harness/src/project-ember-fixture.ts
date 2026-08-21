import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { JsonlEventSink, writePrivateJson } from "./artifacts.js";
import {
  LifecycleController,
  LifecycleObservationError,
  LifecycleRunError,
} from "./controller.js";
import { AtomicMemoryStore } from "./memory-store.js";
import type {
  BaselineExecution,
  BaselineExecutor,
  DirectMemoryExecutor,
  MemoryDraft,
  MemoryRecord,
  ExecutionTelemetry,
  PhaseExecutor,
  PhaseReceipt,
  SessionRunResult,
} from "./types.js";
import {
  collectErrorTelemetry,
  combineTelemetry,
  sessionTelemetry,
} from "./telemetry.js";

export const PROJECT_EMBER_FIXTURE_ID = "project-ember-release-marker-v4";
export const PROJECT_EMBER_MARKER = "CANARY-GREEN";
export const PROJECT_EMBER_RELEASE_NOTE = "Project Ember now starts faster.";
export const PROJECT_EMBER_EXPECTED_OUTPUT =
  `${PROJECT_EMBER_RELEASE_NOTE} ${PROJECT_EMBER_MARKER}`;
export const PROJECT_EMBER_LEARNING_TASK =
  "For Project Ember, adopt this durable release-note convention: every release note must end with the exact marker CANARY-GREEN. Acknowledge the convention.";
export const PROJECT_EMBER_RECALL_TASK =
  `Return this release note verbatim, adding only any established Project Ember convention required at the end: ${PROJECT_EMBER_RELEASE_NOTE}`;
export const PROJECT_EMBER_DIRECT_MEMORY: MemoryDraft = {
  id: "fixture.project-ember.release-note-marker",
  kind: "decision",
  text: "Project Ember release notes must end with the exact marker CANARY-GREEN.",
  evidence: "fixture-provided oracle memory",
  source: "operator",
};

export interface ProjectEmberFixtureOptions {
  artifactDirectory: string;
  phaseExecutor: PhaseExecutor;
  baselineExecutor: BaselineExecutor;
  directMemoryExecutor: DirectMemoryExecutor;
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

export interface ProjectEmberScore {
  baselineTaskCorrect: boolean;
  baselineMarkerAbsent: boolean;
  directMemoryTaskCorrect: boolean;
  directMemoryAppliedMarker: boolean;
  sleepPersistedMarker: boolean;
  wakeRecalledMarker: boolean;
  workTaskCorrect: boolean;
  workAppliedMarker: boolean;
  workAvoidedRedundantCandidate: boolean;
  sleepAvoidedRedundantWrite: boolean;
  memoryPrecisionPreserved: boolean;
  passed: boolean;
}

export interface ProjectEmberCortexScore {
  sleepPersistedMarker: boolean;
  wakeRecalledMarker: boolean;
  workTaskCorrect: boolean;
  workAppliedMarker: boolean;
  workAvoidedRedundantCandidate: boolean;
  sleepAvoidedRedundantWrite: boolean;
  memoryPrecisionPreserved: boolean;
  passed: boolean;
}

export interface ProjectEmberCortexExecution {
  learningSession: SessionRunResult;
  recallSession: SessionRunResult;
  score: ProjectEmberCortexScore;
}

export interface ProjectEmberCortexFailureEvidence {
  learningSession?: SessionRunResult;
}

export class ProjectEmberCortexConditionError extends Error {
  constructor(
    readonly evidence: ProjectEmberCortexFailureEvidence,
    cause: unknown,
  ) {
    super(
      `Project Ember Cortex condition failed: ${errorMessage(cause)}`,
      { cause },
    );
    this.name = "ProjectEmberCortexConditionError";
  }
}

export interface ProjectEmberCortexConditionOptions {
  artifactDirectory: string;
  phaseExecutor: PhaseExecutor;
  now?: () => Date;
}

export interface ProjectEmberReport {
  schemaVersion: 1;
  fixture: typeof PROJECT_EMBER_FIXTURE_ID;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    architecture: string;
  };
  model: ProjectEmberFixtureOptions["model"];
  repository: ProjectEmberFixtureOptions["repository"];
  source: unknown;
  tasks: {
    learning: string;
    recall: string;
  };
  baseline: BaselineExecution;
  directMemory: BaselineExecution;
  cortex: {
    learningSession: SessionRunResult;
    recallSession: SessionRunResult;
  };
  score: ProjectEmberScore;
}

export interface ProjectEmberFailureReport {
  schemaVersion: 1;
  fixture: typeof PROJECT_EMBER_FIXTURE_ID;
  status: "error";
  startedAt: string;
  failedAt: string;
  error: string;
  runId?: string;
  phase?: string;
  durableEffectApplied: boolean;
  baseline?: BaselineExecution;
  directMemory?: BaselineExecution;
  learningSession?: SessionRunResult;
  receipts: readonly PhaseReceipt[];
  telemetry: ExecutionTelemetry;
  telemetryComplete: false;
  memory?: MemoryRecord[];
  memoryReadError?: string;
}

function endsWithExactMarker(output: string): boolean {
  return output.trim().endsWith(PROJECT_EMBER_MARKER);
}

export function scoreProjectEmberBaseline(execution: BaselineExecution): {
  taskCorrect: boolean;
  markerAbsent: boolean;
  passed: boolean;
} {
  const taskCorrect = execution.output.trim() === PROJECT_EMBER_RELEASE_NOTE;
  const markerAbsent = !endsWithExactMarker(execution.output);
  return { taskCorrect, markerAbsent, passed: taskCorrect && markerAbsent };
}

export function scoreProjectEmberDirectMemory(execution: BaselineExecution): {
  taskCorrect: boolean;
  markerApplied: boolean;
  passed: boolean;
} {
  const taskCorrect = execution.output.trim() === PROJECT_EMBER_EXPECTED_OUTPUT;
  const markerApplied = endsWithExactMarker(execution.output);
  return { taskCorrect, markerApplied, passed: taskCorrect && markerApplied };
}

function scoreProjectEmberCortex(
  learningSession: SessionRunResult,
  recallSession: SessionRunResult,
): ProjectEmberCortexScore {
  const markerRecordIds = new Set(
    learningSession.memory
      .filter(
        (record) =>
          record.status === "active" && record.text.includes(PROJECT_EMBER_MARKER),
      )
      .map((record) => record.id),
  );
  const learningMemory = JSON.stringify(learningSession.memory);
  const recalledMemory = JSON.stringify(recallSession.memory);
  const score: ProjectEmberCortexScore = {
    sleepPersistedMarker: markerRecordIds.size > 0,
    wakeRecalledMarker: recallSession.wake.selectedMemoryIds.some((id) =>
      markerRecordIds.has(id),
    ),
    workTaskCorrect: recallSession.output.trim() === PROJECT_EMBER_EXPECTED_OUTPUT,
    workAppliedMarker: endsWithExactMarker(recallSession.output),
    workAvoidedRedundantCandidate:
      recallSession.work.memoryCandidates.length === 0,
    sleepAvoidedRedundantWrite: recallSession.sleep.writes.length === 0,
    memoryPrecisionPreserved: learningMemory === recalledMemory,
    passed: false,
  };
  score.passed =
    score.sleepPersistedMarker &&
    score.wakeRecalledMarker &&
    score.workTaskCorrect &&
    score.workAppliedMarker &&
    score.workAvoidedRedundantCandidate &&
    score.sleepAvoidedRedundantWrite &&
    score.memoryPrecisionPreserved;
  return score;
}

async function runBoundedSession(
  controller: LifecycleController,
  store: AtomicMemoryStore,
  task: string,
): Promise<SessionRunResult> {
  return controller.runSession(task, {
    mountedMemory: await store.active(),
  });
}

export async function runProjectEmberCortexCondition(
  options: ProjectEmberCortexConditionOptions,
): Promise<ProjectEmberCortexExecution> {
  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const store = new AtomicMemoryStore(join(artifactDirectory, "memory.json"), now);
  const eventSink = new JsonlEventSink(join(artifactDirectory, "lifecycle.jsonl"));
  const controller = new LifecycleController(
    options.phaseExecutor,
    store,
    eventSink,
    now,
  );
  let learningSession: SessionRunResult | undefined;
  try {
    learningSession = await runBoundedSession(
      controller,
      store,
      PROJECT_EMBER_LEARNING_TASK,
    );
    const recallSession = await runBoundedSession(
      controller,
      store,
      PROJECT_EMBER_RECALL_TASK,
    );
    return {
      learningSession,
      recallSession,
      score: scoreProjectEmberCortex(learningSession, recallSession),
    };
  } catch (error) {
    throw new ProjectEmberCortexConditionError(
      learningSession ? { learningSession } : {},
      error,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runProjectEmberFixture(
  options: ProjectEmberFixtureOptions,
): Promise<ProjectEmberReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const store = new AtomicMemoryStore(join(artifactDirectory, "memory.json"), now);
  const eventSink = new JsonlEventSink(join(artifactDirectory, "lifecycle.jsonl"));
  const controller = new LifecycleController(
    options.phaseExecutor,
    store,
    eventSink,
    now,
  );
  let baseline: BaselineExecution | undefined;
  let directMemory: BaselineExecution | undefined;
  let learningSession: SessionRunResult | undefined;

  try {
    baseline = await options.baselineExecutor.execute(PROJECT_EMBER_RECALL_TASK);
    directMemory = await options.directMemoryExecutor.execute(
      PROJECT_EMBER_RECALL_TASK,
      [PROJECT_EMBER_DIRECT_MEMORY],
    );
    learningSession = await runBoundedSession(
      controller,
      store,
      PROJECT_EMBER_LEARNING_TASK,
    );
    const recallSession = await runBoundedSession(
      controller,
      store,
      PROJECT_EMBER_RECALL_TASK,
    );
    const cortexScore = scoreProjectEmberCortex(
      learningSession,
      recallSession,
    );
    const baselineScore = scoreProjectEmberBaseline(baseline);
    const directMemoryScore = scoreProjectEmberDirectMemory(directMemory);
    const score: ProjectEmberScore = {
      baselineTaskCorrect: baselineScore.taskCorrect,
      baselineMarkerAbsent: baselineScore.markerAbsent,
      directMemoryTaskCorrect: directMemoryScore.taskCorrect,
      directMemoryAppliedMarker: directMemoryScore.markerApplied,
      sleepPersistedMarker: cortexScore.sleepPersistedMarker,
      wakeRecalledMarker: cortexScore.wakeRecalledMarker,
      workTaskCorrect: cortexScore.workTaskCorrect,
      workAppliedMarker: cortexScore.workAppliedMarker,
      workAvoidedRedundantCandidate:
        cortexScore.workAvoidedRedundantCandidate,
      sleepAvoidedRedundantWrite: cortexScore.sleepAvoidedRedundantWrite,
      memoryPrecisionPreserved: cortexScore.memoryPrecisionPreserved,
      passed: false,
    };
    score.passed =
      baselineScore.passed && directMemoryScore.passed && cortexScore.passed;

    const report: ProjectEmberReport = {
      schemaVersion: 1,
      fixture: PROJECT_EMBER_FIXTURE_ID,
      status: score.passed ? "passed" : "failed",
      startedAt,
      completedAt: now().toISOString(),
      artifactDirectory,
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      model: options.model,
      repository: options.repository,
      source: options.source,
      tasks: {
        learning: PROJECT_EMBER_LEARNING_TASK,
        recall: PROJECT_EMBER_RECALL_TASK,
      },
      baseline,
      directMemory,
      cortex: { learningSession, recallSession },
      score,
    };
    await writePrivateJson(join(artifactDirectory, "report.json"), report);
    return report;
  } catch (error) {
    let memory: MemoryRecord[] | undefined;
    let memoryReadError: string | undefined;
    try {
      memory = await store.snapshot();
    } catch (snapshotError) {
      memoryReadError = errorMessage(snapshotError);
    }
    const lifecycleError =
      error instanceof LifecycleRunError || error instanceof LifecycleObservationError
        ? error
        : undefined;
    const telemetry = combineTelemetry(
      [
        ...(baseline ? [baseline.telemetry] : []),
        ...(directMemory ? [directMemory.telemetry] : []),
        ...(learningSession
          ? [
              sessionTelemetry(
                [learningSession],
                options.model.resolvedId,
              ),
            ]
          : []),
        collectErrorTelemetry(error, options.model.resolvedId),
      ],
      options.model.resolvedId,
    );
    const failure: ProjectEmberFailureReport = {
      schemaVersion: 1,
      fixture: PROJECT_EMBER_FIXTURE_ID,
      status: "error",
      startedAt,
      failedAt: now().toISOString(),
      error: errorMessage(error),
      ...(lifecycleError
        ? { runId: lifecycleError.runId, phase: lifecycleError.phase }
        : {}),
      durableEffectApplied: error instanceof LifecycleObservationError,
      ...(baseline ? { baseline } : {}),
      ...(directMemory ? { directMemory } : {}),
      ...(learningSession ? { learningSession } : {}),
      receipts: lifecycleError?.receipts ?? [],
      telemetry,
      telemetryComplete: false,
      ...(memory ? { memory } : {}),
      ...(memoryReadError ? { memoryReadError } : {}),
    };
    await writePrivateJson(join(artifactDirectory, "failure.json"), failure);
    throw error;
  }
}
