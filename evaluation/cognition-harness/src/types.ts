export const PHASES = ["wake", "work", "sleep", "curate"] as const;

export type Phase = (typeof PHASES)[number];
export type MemoryKind = "learning" | "decision";
export type MemorySource = "operator" | "observed" | "imported";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  text: string;
  evidence: string;
  source: MemorySource;
  status: "active" | "retired";
  createdAt: string;
  updatedAt: string;
}

export interface MemoryDraft {
  id: string;
  kind: MemoryKind;
  text: string;
  evidence: string;
  source: MemorySource;
}

export interface MemoryCandidate extends MemoryDraft {}

export interface MemoryWrite {
  candidateId: string;
  record: MemoryDraft;
}

export interface CurateProposal {
  recordId: string;
  action: "keep" | "update" | "retire";
  reason: string;
  replacement?: MemoryDraft;
}

interface PhaseRequestBase {
  runId: string;
  task: string;
}

export interface WakeRequest extends PhaseRequestBase {
  phase: "wake";
  memory: readonly MemoryRecord[];
}

export interface WorkRequest extends PhaseRequestBase {
  phase: "work";
  recalledMemory: readonly MemoryRecord[];
}

export interface SleepRequest extends PhaseRequestBase {
  phase: "sleep";
  mountedMemory: readonly MemoryRecord[];
  recalledMemory: readonly MemoryRecord[];
  work: WorkPayload;
}

export interface CurateRequest extends PhaseRequestBase {
  phase: "curate";
  memory: readonly MemoryRecord[];
}

export type PhaseRequest = WakeRequest | WorkRequest | SleepRequest | CurateRequest;

export interface WakePayload {
  phase: "wake";
  selectedMemoryIds: string[];
  summary: string;
}

export interface WorkPayload {
  phase: "work";
  output: string;
  memoryCandidates: MemoryCandidate[];
  summary: string;
}

export interface SleepPayload {
  phase: "sleep";
  writes: MemoryWrite[];
  summary: string;
}

export interface CuratePayload {
  phase: "curate";
  proposals: CurateProposal[];
  summary: string;
}

export type PhasePayload = WakePayload | WorkPayload | SleepPayload | CuratePayload;

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ExecutionTelemetry {
  attempts: number;
  turns: number;
  latencyMs: number;
  model: string;
  usage: UsageSummary;
}

export interface PhaseExecution {
  payload: PhasePayload;
  telemetry: ExecutionTelemetry;
}

export interface PhaseExecutor {
  execute(request: PhaseRequest): Promise<PhaseExecution>;
}

export interface BaselineExecution {
  output: string;
  telemetry: ExecutionTelemetry;
}

export interface BaselineExecutor {
  execute(task: string): Promise<BaselineExecution>;
}

export interface DirectMemoryExecutor {
  execute(
    task: string,
    memory: readonly MemoryDraft[],
  ): Promise<BaselineExecution>;
}

export interface PhaseReceipt {
  runId: string;
  phase: Phase;
  sequence: number;
  status: "ok";
  startedAt: string;
  completedAt: string;
  summary: string;
  telemetry: ExecutionTelemetry;
}

export type RunEvent =
  | {
      type: "phase.started";
      runId: string;
      phase: Phase;
      sequence: number;
      timestamp: string;
    }
  | {
      type: "phase.completed";
      receipt: PhaseReceipt;
    }
  | {
      type: "phase.failed";
      runId: string;
      phase: Phase;
      sequence: number;
      timestamp: string;
      error: string;
    }
  | {
      type: "memory.committed";
      runId: string;
      phase: "sleep";
      timestamp: string;
      recordIds: string[];
    };

export interface SessionRunResult {
  runId: string;
  task: string;
  output: string;
  wake: WakePayload;
  work: WorkPayload;
  sleep: SleepPayload;
  curate?: CuratePayload;
  receipts: PhaseReceipt[];
  memory: MemoryRecord[];
}

export function emptyUsage(): UsageSummary {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };
}

export function emptyTelemetry(model = "scripted"): ExecutionTelemetry {
  return {
    attempts: 1,
    turns: 1,
    latencyMs: 0,
    model,
    usage: emptyUsage(),
  };
}
