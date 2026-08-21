import type {
  BaselineExecution,
  BaselineExecutor,
  ExecutionTelemetry,
  Phase,
  PhaseExecution,
  PhaseExecutor,
  PhasePayload,
  PhaseRequest,
} from "./types.js";
import { emptyTelemetry } from "./types.js";

export type ScriptedPhaseStep =
  | {
      phase: Phase;
      payload: PhasePayload;
      telemetry?: ExecutionTelemetry;
    }
  | {
      phase: Phase;
      error: Error;
    };

export class ScriptedPhaseExecutor implements PhaseExecutor {
  readonly calls: PhaseRequest[] = [];

  constructor(private readonly steps: ScriptedPhaseStep[]) {}

  async execute(request: PhaseRequest): Promise<PhaseExecution> {
    this.calls.push(structuredClone(request));
    const step = this.steps.shift();
    if (!step) throw new Error(`no scripted response for ${request.phase}`);
    if (step.phase !== request.phase) {
      throw new Error(`expected scripted ${step.phase}, received ${request.phase}`);
    }
    if ("error" in step) throw step.error;
    return {
      payload: structuredClone(step.payload),
      telemetry: step.telemetry ?? emptyTelemetry(),
    };
  }

  assertExhausted(): void {
    if (this.steps.length > 0) {
      throw new Error(`${this.steps.length} scripted phase steps were not used`);
    }
  }
}

export class ScriptedBaselineExecutor implements BaselineExecutor {
  readonly calls: string[] = [];

  constructor(private readonly outputs: string[]) {}

  async execute(task: string): Promise<BaselineExecution> {
    this.calls.push(task);
    const output = this.outputs.shift();
    if (output === undefined) throw new Error("no scripted baseline response");
    return { output, telemetry: emptyTelemetry() };
  }

  assertExhausted(): void {
    if (this.outputs.length > 0) {
      throw new Error(`${this.outputs.length} scripted baseline outputs were not used`);
    }
  }
}
