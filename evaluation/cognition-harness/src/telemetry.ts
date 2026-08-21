import {
  LifecycleObservationError,
  LifecycleRunError,
} from "./controller.js";
import { PiAgentRunError } from "./pi-agent-runner.js";
import {
  emptyUsage,
  type ExecutionTelemetry,
  type SessionRunResult,
  type UsageSummary,
} from "./types.js";

function addUsage(target: UsageSummary, source: UsageSummary): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.totalTokens += source.totalTokens;
  target.costUsd += source.costUsd;
}

export function zeroTelemetry(model: string): ExecutionTelemetry {
  return {
    attempts: 0,
    turns: 0,
    latencyMs: 0,
    model,
    usage: emptyUsage(),
  };
}

export function combineTelemetry(
  telemetry: readonly ExecutionTelemetry[],
  model: string,
): ExecutionTelemetry {
  const combined = zeroTelemetry(model);
  const observedModels = new Set(
    telemetry
      .filter((item) => item.attempts > 0)
      .map((item) => item.model),
  );
  if (observedModels.size === 1) {
    combined.model = [...observedModels][0]!;
  } else if (observedModels.size > 1) {
    combined.model = `mixed:${[...observedModels].sort().join(",")}`;
  }
  for (const item of telemetry) {
    combined.attempts += item.attempts;
    combined.turns += item.turns;
    combined.latencyMs += item.latencyMs;
    addUsage(combined.usage, item.usage);
  }
  return combined;
}

export function sessionTelemetry(
  sessions: readonly SessionRunResult[],
  model: string,
): ExecutionTelemetry {
  return combineTelemetry(
    sessions.flatMap((session) =>
      session.receipts.map((receipt) => receipt.telemetry),
    ),
    model,
  );
}

export function collectErrorTelemetry(
  error: unknown,
  model: string,
  seen = new Set<unknown>(),
): ExecutionTelemetry {
  if (error === null || seen.has(error)) return zeroTelemetry(model);
  seen.add(error);

  const parts: ExecutionTelemetry[] = [];
  if (error instanceof PiAgentRunError) parts.push(error.telemetry);
  if (
    error instanceof LifecycleRunError ||
    error instanceof LifecycleObservationError
  ) {
    parts.push(...error.receipts.map((receipt) => receipt.telemetry));
    if (error.currentTelemetry) parts.push(error.currentTelemetry);
  }
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      parts.push(collectErrorTelemetry(nested, model, seen));
    }
  }
  if (error instanceof Error && error.cause !== undefined) {
    parts.push(collectErrorTelemetry(error.cause, model, seen));
  }
  return combineTelemetry(parts, model);
}
