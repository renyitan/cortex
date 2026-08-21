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
  MemoryRecord,
  PhaseExecutor,
  PhaseReceipt,
  SessionRunResult,
} from "./types.js";

export const PROJECT_EMBER_FIXTURE_ID = "project-ember-release-marker-v1";
export const PROJECT_EMBER_MARKER = "CANARY-GREEN";
export const PROJECT_EMBER_LEARNING_TASK =
  "For Project Ember, adopt this durable release-note convention: every release note must end with the exact marker CANARY-GREEN. Acknowledge the convention.";
export const PROJECT_EMBER_RECALL_TASK =
  "Write one sentence of release notes for Project Ember announcing faster startup. Follow all established Project Ember conventions.";

export interface ProjectEmberFixtureOptions {
  artifactDirectory: string;
  phaseExecutor: PhaseExecutor;
  baselineExecutor: BaselineExecutor;
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
  baselineMarkerAbsent: boolean;
  sleepPersistedMarker: boolean;
  wakeRecalledMarker: boolean;
  workAppliedMarker: boolean;
  passed: boolean;
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
  learningSession?: SessionRunResult;
  receipts: readonly PhaseReceipt[];
  memory?: MemoryRecord[];
  memoryReadError?: string;
}

function endsWithExactMarker(output: string): boolean {
  return output.trim().endsWith(PROJECT_EMBER_MARKER);
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
  let learningSession: SessionRunResult | undefined;

  try {
    baseline = await options.baselineExecutor.execute(PROJECT_EMBER_RECALL_TASK);
    learningSession = await controller.runSession(PROJECT_EMBER_LEARNING_TASK);
    const recallSession = await controller.runSession(PROJECT_EMBER_RECALL_TASK);
    const markerRecordIds = new Set(
      learningSession.memory
        .filter(
          (record) =>
            record.status === "active" && record.text.includes(PROJECT_EMBER_MARKER),
        )
        .map((record) => record.id),
    );
    const score: ProjectEmberScore = {
      baselineMarkerAbsent: !endsWithExactMarker(baseline.output),
      sleepPersistedMarker: markerRecordIds.size > 0,
      wakeRecalledMarker: recallSession.wake.selectedMemoryIds.some((id) =>
        markerRecordIds.has(id),
      ),
      workAppliedMarker: endsWithExactMarker(recallSession.output),
      passed: false,
    };
    score.passed =
      score.baselineMarkerAbsent &&
      score.sleepPersistedMarker &&
      score.wakeRecalledMarker &&
      score.workAppliedMarker;

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
      ...(learningSession ? { learningSession } : {}),
      receipts: lifecycleError?.receipts ?? [],
      ...(memory ? { memory } : {}),
      ...(memoryReadError ? { memoryReadError } : {}),
    };
    await writePrivateJson(join(artifactDirectory, "failure.json"), failure);
    throw error;
  }
}
