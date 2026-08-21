import { randomUUID } from "node:crypto";
import {
  NullEventSink,
  type EventSink,
} from "./artifacts.js";
import { AtomicMemoryStore } from "./memory-store.js";
import type {
  CuratePayload,
  CurateRequest,
  EvidenceDocument,
  ExecutionTelemetry,
  MemoryCandidate,
  MemoryRecord,
  Phase,
  PhaseExecution,
  PhaseExecutor,
  PhasePayload,
  PhaseReceipt,
  PhaseRequest,
  SessionRunResult,
  SleepPayload,
  SleepRequest,
  WakePayload,
  WakeRequest,
  WorkPayload,
  WorkRequest,
} from "./types.js";

export interface LifecycleRunProgress {
  runId: string;
  task: string;
  mountedMemory: readonly MemoryRecord[];
  wake?: WakePayload;
  work?: WorkPayload;
}

export interface LifecycleSessionOptions {
  mountedMemory: readonly MemoryRecord[];
  evidence?: readonly EvidenceDocument[];
  allowedEvidenceReferences?: readonly string[];
  curate?: boolean;
  workMemory?: "wake-selected" | "complete-mounted";
}

export class LifecycleRunError extends Error {
  progress?: LifecycleRunProgress;

  constructor(
    readonly runId: string,
    readonly phase: Phase,
    readonly receipts: readonly PhaseReceipt[],
    cause: unknown,
    readonly currentTelemetry?: ExecutionTelemetry,
  ) {
    super(`Cortex ${phase.toUpperCase()} failed: ${errorMessage(cause)}`, { cause });
    this.name = "LifecycleRunError";
  }
}

export class LifecycleObservationError extends Error {
  progress?: LifecycleRunProgress;

  constructor(
    readonly runId: string,
    readonly phase: Phase,
    readonly receipts: readonly PhaseReceipt[],
    cause: unknown,
    readonly currentTelemetry?: ExecutionTelemetry,
  ) {
    super(
      `Cortex ${phase.toUpperCase()} committed its durable effect, but observation failed: ${errorMessage(cause)}`,
      { cause },
    );
    this.name = "LifecycleObservationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwWithProgress(
  error: unknown,
  phase: Phase,
  receipts: readonly PhaseReceipt[],
  progress: LifecycleRunProgress,
): never {
  if (
    error instanceof LifecycleRunError ||
    error instanceof LifecycleObservationError
  ) {
    error.progress = structuredClone(progress);
    throw error;
  }
  const wrapped = new LifecycleRunError(
    progress.runId,
    phase,
    structuredClone(receipts),
    error,
  );
  wrapped.progress = structuredClone(progress);
  throw wrapped;
}

function requireDistinct(values: readonly string[], field: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${field} contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function validateWake(payload: PhasePayload, memory: readonly MemoryRecord[]): WakePayload {
  if (payload.phase !== "wake") throw new Error(`expected wake payload, received ${payload.phase}`);
  requireDistinct(payload.selectedMemoryIds, "selectedMemoryIds");
  const activeIds = new Set(memory.filter((record) => record.status === "active").map((record) => record.id));
  const unknown = payload.selectedMemoryIds.filter((id) => !activeIds.has(id));
  if (unknown.length > 0) throw new Error(`WAKE selected unknown memory: ${unknown.join(", ")}`);
  return payload;
}

function sameMemoryRecord(
  left: MemoryRecord,
  right: MemoryRecord,
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.text === right.text &&
    left.evidence === right.evidence &&
    left.source === right.source &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function validateMountedMemory(
  mountedMemory: readonly MemoryRecord[],
  storedMemory: readonly MemoryRecord[],
): MemoryRecord[] {
  requireDistinct(
    mountedMemory.map((record) => record.id),
    "mountedMemory.id",
  );
  const activeMemory = storedMemory.filter((record) => record.status === "active");
  const activeById = new Map(activeMemory.map((record) => [record.id, record]));
  const unknown = mountedMemory
    .map((record) => record.id)
    .filter((recordId) => !activeById.has(recordId));
  if (unknown.length > 0) {
    throw new Error(
      `mountedMemory contains records outside the active store: ${unknown.join(", ")}`,
    );
  }
  const mountedIds = new Set(mountedMemory.map((record) => record.id));
  const omitted = activeMemory
    .map((record) => record.id)
    .filter((recordId) => !mountedIds.has(recordId));
  if (omitted.length > 0) {
    throw new Error(
      `mountedMemory must contain every active record: ${omitted.join(", ")}`,
    );
  }
  for (const mounted of mountedMemory) {
    const stored = activeById.get(mounted.id);
    if (!stored || !sameMemoryRecord(mounted, stored)) {
      throw new Error(
        `mountedMemory must preserve the stored record exactly: ${mounted.id}`,
      );
    }
  }
  return structuredClone(activeMemory);
}

function validateWork(
  payload: PhasePayload,
  allowedEvidenceReferences?: readonly string[],
): WorkPayload {
  if (payload.phase !== "work") throw new Error(`expected work payload, received ${payload.phase}`);
  if (payload.output.trim().length === 0) throw new Error("WORK output must not be empty");
  requireDistinct(
    payload.memoryCandidates.map((candidate) => candidate.id),
    "memoryCandidates",
  );
  if (allowedEvidenceReferences !== undefined) {
    const allowed = new Set(allowedEvidenceReferences);
    const unresolved = payload.memoryCandidates
      .map((candidate) => candidate.evidence)
      .filter((evidence) => !allowed.has(evidence));
    if (unresolved.length > 0) {
      throw new Error(
        `WORK produced unresolved evidence citations: ${[...new Set(unresolved)].join(", ")}`,
      );
    }
  }
  return payload;
}

function validateSleep(
  payload: PhasePayload,
  candidates: readonly MemoryCandidate[],
  existingMemory: readonly MemoryRecord[],
): SleepPayload {
  if (payload.phase !== "sleep") throw new Error(`expected sleep payload, received ${payload.phase}`);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const existingIds = new Set(existingMemory.map((record) => record.id));
  const unsupported = payload.writes
    .map((write) => write.candidateId)
    .filter((candidateId) => !candidatesById.has(candidateId));
  if (unsupported.length > 0) {
    throw new Error(`SLEEP wrote unsupported candidates: ${[...new Set(unsupported)].join(", ")}`);
  }
  requireDistinct(
    payload.writes.map((write) => write.candidateId),
    "sleep.writes.candidateId",
  );
  for (const write of payload.writes) {
    const candidate = candidatesById.get(write.candidateId);
    if (!candidate) continue;
    if (write.record.id !== write.candidateId) {
      throw new Error(`SLEEP record id must match its candidate id: ${write.candidateId}`);
    }
    if (existingIds.has(write.record.id)) {
      throw new Error(`SLEEP cannot replace existing memory: ${write.record.id}`);
    }
    if (
      write.record.kind !== candidate.kind ||
      write.record.text !== candidate.text ||
      write.record.evidence !== candidate.evidence ||
      write.record.source !== candidate.source
    ) {
      throw new Error(`SLEEP write must preserve candidate content: ${write.candidateId}`);
    }
  }
  return payload;
}

function validateCurate(payload: PhasePayload, memory: readonly MemoryRecord[]): CuratePayload {
  if (payload.phase !== "curate") throw new Error(`expected curate payload, received ${payload.phase}`);
  const ids = new Set(memory.map((record) => record.id));
  const unknown = payload.proposals
    .map((proposal) => proposal.recordId)
    .filter((recordId) => !ids.has(recordId));
  if (unknown.length > 0) {
    throw new Error(`CURATE proposed changes to unknown records: ${[...new Set(unknown)].join(", ")}`);
  }
  requireDistinct(
    payload.proposals.map((proposal) => proposal.recordId),
    "curate.proposals.recordId",
  );
  for (const proposal of payload.proposals) {
    if (proposal.action === "update" && proposal.replacement === undefined) {
      throw new Error(`CURATE update requires a replacement: ${proposal.recordId}`);
    }
    if (proposal.action !== "update" && proposal.replacement !== undefined) {
      throw new Error(`CURATE ${proposal.action} cannot include a replacement: ${proposal.recordId}`);
    }
  }
  return payload;
}

export class LifecycleController {
  private sequence = 0;

  constructor(
    private readonly executor: PhaseExecutor,
    private readonly store: AtomicMemoryStore,
    private readonly sink: EventSink = new NullEventSink(),
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async runSession(
    task: string,
    options: LifecycleSessionOptions,
  ): Promise<SessionRunResult> {
    if (task.trim().length === 0) throw new Error("task must not be empty");

    this.sequence = 0;
    const runId = this.idFactory();
    const receipts: PhaseReceipt[] = [];
    const memoryBeforeRun = await this.store.snapshot();
    const mountedMemory = validateMountedMemory(
      options.mountedMemory,
      memoryBeforeRun,
    );

    const wakeRequest: WakeRequest = {
      phase: "wake",
      runId,
      task,
      memory: mountedMemory,
    };
    const wakeExecution = await this.perform(
      wakeRequest,
      receipts,
      (payload) => validateWake(payload, mountedMemory),
    ).catch((error: unknown) =>
      throwWithProgress(
        error,
        "wake",
        receipts,
        {
          runId,
          task,
          mountedMemory,
        },
      ),
    );
    const wake = wakeExecution.payload;
    const recalledIds = new Set(wake.selectedMemoryIds);
    const recalledMemory = mountedMemory.filter((record) =>
      recalledIds.has(record.id),
    );
    const workMemory =
      options.workMemory === "complete-mounted"
        ? mountedMemory
        : recalledMemory;

    const workRequest: WorkRequest = {
      phase: "work",
      runId,
      task,
      recalledMemory: workMemory,
      evidence: structuredClone(options.evidence ?? []),
      memoryScope: options.workMemory ?? "wake-selected",
    };
    const workExecution = await this.perform(
      workRequest,
      receipts,
      (payload) =>
        validateWork(payload, options.allowedEvidenceReferences),
    ).catch((error: unknown) =>
      throwWithProgress(
        error,
        "work",
        receipts,
        {
          runId,
          task,
          mountedMemory,
          wake,
        },
      ),
    );
    const work = workExecution.payload;

    const sleepRequest: SleepRequest = {
      phase: "sleep",
      runId,
      task,
      mountedMemory,
      recalledMemory,
      work,
    };
    const sleepExecution = await this.perform(
      sleepRequest,
      receipts,
      (payload) => validateSleep(payload, work.memoryCandidates, memoryBeforeRun),
      (payload) => this.store.applyWrites(payload.writes),
      async (_memoryAfterSleep, payload) => {
        if (payload.writes.length > 0) {
          await this.sink.append({
            type: "memory.committed",
            runId,
            phase: "sleep",
            timestamp: this.now().toISOString(),
            recordIds: payload.writes.map((write) => write.record.id),
          });
        }
      },
    ).catch((error: unknown) =>
      throwWithProgress(
        error,
        "sleep",
        receipts,
        {
          runId,
          task,
          mountedMemory,
          wake,
          work,
        },
      ),
    );
    const sleep = sleepExecution.payload;
    const memoryAfterSleep = sleepExecution.finalized;

    let curate: CuratePayload | undefined;
    if (options.curate === true) {
      const curateRequest: CurateRequest = {
        phase: "curate",
        runId,
        task,
        memory: memoryAfterSleep,
      };
      const curateExecution = await this.perform(
        curateRequest,
        receipts,
        (payload) => validateCurate(payload, memoryAfterSleep),
      );
      curate = curateExecution.payload;
    }

    return {
      runId,
      task,
      output: work.output,
      wake,
      work,
      sleep,
      ...(curate ? { curate } : {}),
      receipts,
      memory: await this.store.snapshot(),
    };
  }

  private async perform<TPayload extends PhasePayload>(
    request: PhaseRequest,
    receipts: PhaseReceipt[],
    validate: (payload: PhasePayload) => TPayload,
  ): Promise<PhaseExecution & { payload: TPayload; finalized: undefined }>;
  private async perform<TPayload extends PhasePayload, TFinalized>(
    request: PhaseRequest,
    receipts: PhaseReceipt[],
    validate: (payload: PhasePayload) => TPayload,
    finalize: (payload: TPayload) => Promise<TFinalized>,
    observeFinalized?: (finalized: TFinalized, payload: TPayload) => Promise<void>,
  ): Promise<PhaseExecution & { payload: TPayload; finalized: TFinalized }>;
  private async perform<TPayload extends PhasePayload, TFinalized>(
    request: PhaseRequest,
    receipts: PhaseReceipt[],
    validate: (payload: PhasePayload) => TPayload,
    finalize?: (payload: TPayload) => Promise<TFinalized>,
    observeFinalized?: (finalized: TFinalized, payload: TPayload) => Promise<void>,
  ): Promise<PhaseExecution & { payload: TPayload; finalized: TFinalized | undefined }> {
    const sequence = ++this.sequence;
    const startedAt = this.now().toISOString();
    let durableEffectApplied = false;
    let currentTelemetry: ExecutionTelemetry | undefined;
    try {
      await this.sink.append({
        type: "phase.started",
        runId: request.runId,
        phase: request.phase,
        sequence,
        timestamp: startedAt,
      });
      const execution = await this.executor.execute(request);
      currentTelemetry = execution.telemetry;
      if (execution.payload.phase !== request.phase) {
        throw new Error(`executor returned ${execution.payload.phase} during ${request.phase}`);
      }
      const payload = validate(execution.payload);
      const finalized = await finalize?.(payload);
      durableEffectApplied = finalize !== undefined;
      if (finalized !== undefined && observeFinalized) {
        await observeFinalized(finalized, payload);
      }
      const receipt: PhaseReceipt = {
        runId: request.runId,
        phase: request.phase,
        sequence,
        status: "ok",
        startedAt,
        completedAt: this.now().toISOString(),
        summary: payload.summary,
        telemetry: execution.telemetry,
      };
      await this.sink.append({ type: "phase.completed", receipt });
      receipts.push(receipt);
      return { ...execution, payload, finalized };
    } catch (error) {
      if (durableEffectApplied) {
        throw new LifecycleObservationError(
          request.runId,
          request.phase,
          structuredClone(receipts),
          error,
          currentTelemetry,
        );
      }
      try {
        await this.sink.append({
          type: "phase.failed",
          runId: request.runId,
          phase: request.phase,
          sequence,
          timestamp: this.now().toISOString(),
          error: errorMessage(error),
        });
      } catch (observationError) {
        throw new LifecycleRunError(
          request.runId,
          request.phase,
          structuredClone(receipts),
          new AggregateError(
            [error, observationError],
            "phase failure and failure observation both failed",
          ),
          currentTelemetry,
        );
      }
      throw new LifecycleRunError(
        request.runId,
        request.phase,
        structuredClone(receipts),
        error,
        currentTelemetry,
      );
    }
  }
}
