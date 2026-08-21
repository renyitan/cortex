import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  clampThinkingLevel,
  type Api,
  type AssistantMessage,
  type Model,
  type Models,
  type ModelThinkingLevel,
  type Usage,
} from "@earendil-works/pi-ai";
import {
  NullPiTraceSink,
  type PiTraceContext,
  type PiTraceSink,
} from "./pi-trace.js";
import type { ExecutionTelemetry, UsageSummary } from "./types.js";
import { emptyUsage } from "./types.js";

export interface PiAgentRunnerOptions {
  models: Models;
  model: Model<Api>;
  thinkingLevel?: ModelThinkingLevel;
  maxAttempts?: number;
  maxTurns?: number;
  timeoutMs?: number;
  trace?: PiTraceSink;
  now?: () => Date;
}

export interface PiToolRunSpec<TValue> {
  systemPrompt: string;
  userPrompt: string;
  traceContext: PiTraceContext;
  createTool(accept: (value: TValue) => void): AgentTool;
}

export interface PiToolRunResult<TValue> {
  value: TValue;
  telemetry: ExecutionTelemetry;
}

export class PiAgentRunError extends Error {
  constructor(
    message: string,
    readonly telemetry: ExecutionTelemetry,
  ) {
    super(message);
    this.name = "PiAgentRunError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return (
    !!message &&
    typeof message === "object" &&
    "role" in message &&
    message.role === "assistant"
  );
}

function addUsage(summary: UsageSummary, usage: Usage): void {
  summary.inputTokens += usage.input;
  summary.outputTokens += usage.output;
  summary.cacheReadTokens += usage.cacheRead;
  summary.cacheWriteTokens += usage.cacheWrite;
  summary.totalTokens += usage.totalTokens;
  summary.costUsd += usage.cost.total;
}

function telemetry(
  attempts: number,
  turns: number,
  latencyMs: number,
  model: string,
  usage: UsageSummary,
): ExecutionTelemetry {
  return { attempts, turns, latencyMs, model, usage };
}

export class PiAgentRunner {
  private readonly models: Models;
  private readonly model: Model<Api>;
  private readonly thinkingLevel: ModelThinkingLevel;
  private readonly maxAttempts: number;
  private readonly maxTurns: number;
  private readonly timeoutMs: number;
  private readonly trace: PiTraceSink;
  private readonly now: () => Date;

  constructor(options: PiAgentRunnerOptions) {
    this.models = options.models;
    this.model = options.model;
    this.thinkingLevel = clampThinkingLevel(
      options.model,
      options.thinkingLevel ?? "low",
    );
    this.maxAttempts = options.maxAttempts ?? 2;
    this.maxTurns = options.maxTurns ?? 3;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.trace = options.trace ?? new NullPiTraceSink();
    this.now = options.now ?? (() => new Date());

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
    if (!Number.isInteger(this.maxTurns) || this.maxTurns < 1) {
      throw new Error("maxTurns must be a positive integer");
    }
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be positive");
    }
  }

  async run<TValue>(spec: PiToolRunSpec<TValue>): Promise<PiToolRunResult<TValue>> {
    const startedAt = Date.now();
    const usage = emptyUsage();
    let turns = 0;
    let responseModel = this.model.id;
    let lastError = "model did not submit a completion receipt";

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let accepted: TValue | undefined;
      let acceptedCount = 0;
      let attemptTurns = 0;
      let attemptError: string | undefined;
      let timedOut = false;
      const tool = spec.createTool((value) => {
        acceptedCount += 1;
        if (acceptedCount > 1) {
          throw new Error("model submitted more than one valid completion receipt");
        }
        accepted = structuredClone(value);
      });
      const agent = new Agent({
        initialState: {
          systemPrompt: spec.systemPrompt,
          model: this.model,
          thinkingLevel: this.thinkingLevel,
          tools: [tool],
        },
        streamFn: this.models.streamSimple.bind(this.models),
        toolExecution: "sequential",
        shouldStopAfterTurn: () =>
          accepted !== undefined || attemptTurns >= this.maxTurns,
      });

      agent.subscribe(async (event) => {
        if (event.type !== "turn_end" || !isAssistantMessage(event.message)) return;
        turns += 1;
        attemptTurns += 1;
        responseModel = event.message.responseModel ?? event.message.model;
        addUsage(usage, event.message.usage);
        await this.trace.append({
          type: "agent.turn",
          timestamp: this.now().toISOString(),
          context: spec.traceContext,
          attempt,
          turn: attemptTurns,
          message: event.message,
          toolResults: event.toolResults,
        });
      });

      await this.trace.append({
        type: "agent.input",
        timestamp: this.now().toISOString(),
        context: spec.traceContext,
        attempt,
        model: this.model.id,
        systemPrompt: spec.systemPrompt,
        userPrompt: spec.userPrompt,
        toolNames: [tool.name],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        agent.abort();
      }, this.timeoutMs);
      timer.unref();
      try {
        await agent.prompt(spec.userPrompt);
      } catch (error) {
        attemptError = errorMessage(error);
      } finally {
        clearTimeout(timer);
      }
      if (!attemptError && responseModel !== this.model.id) {
        throw new PiAgentRunError(
          `Provider returned model ${responseModel}; expected ${this.model.id}`,
          telemetry(
            attempt,
            turns,
            Date.now() - startedAt,
            responseModel,
            usage,
          ),
        );
      }

      if (!attemptError && !timedOut && accepted !== undefined && acceptedCount === 1) {
        return {
          value: accepted,
          telemetry: telemetry(
            attempt,
            turns,
            Date.now() - startedAt,
            responseModel,
            usage,
          ),
        };
      }

      lastError =
        attemptError ??
        (timedOut
          ? `attempt timed out after ${this.timeoutMs}ms`
          : agent.state.errorMessage ??
            (acceptedCount > 1
              ? "model submitted more than one valid completion receipt"
              : "model did not submit a completion receipt"));
      await this.trace.append({
        type: "agent.attempt_failed",
        timestamp: this.now().toISOString(),
        context: spec.traceContext,
        attempt,
        error: lastError,
      });
    }

    throw new PiAgentRunError(
      `Pi agent failed after ${this.maxAttempts} attempts: ${lastError}`,
      telemetry(
        this.maxAttempts,
        turns,
        Date.now() - startedAt,
        responseModel,
        usage,
      ),
    );
  }
}
