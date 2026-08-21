import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AssistantMessage,
  ToolResultMessage,
} from "@earendil-works/pi-ai";

export interface PiTraceContext {
  condition: "baseline" | "cortex";
  fixture: string;
  runId?: string;
  phase?: string;
}

export type PiTraceEvent =
  | {
      type: "agent.input";
      timestamp: string;
      context: PiTraceContext;
      attempt: number;
      model: string;
      systemPrompt: string;
      userPrompt: string;
      toolNames: string[];
    }
  | {
      type: "agent.turn";
      timestamp: string;
      context: PiTraceContext;
      attempt: number;
      turn: number;
      message: AssistantMessage;
      toolResults: ToolResultMessage[];
    }
  | {
      type: "agent.attempt_failed";
      timestamp: string;
      context: PiTraceContext;
      attempt: number;
      error: string;
    };

export interface PiTraceSink {
  append(event: PiTraceEvent): Promise<void>;
}

export class NullPiTraceSink implements PiTraceSink {
  async append(_event: PiTraceEvent): Promise<void> {}
}

export class JsonlPiTraceSink implements PiTraceSink {
  constructor(private readonly path: string) {}

  async append(event: PiTraceEvent): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(event)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
