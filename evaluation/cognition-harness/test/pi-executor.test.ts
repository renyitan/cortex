import assert from "node:assert/strict";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { PiAgentRunError, PiAgentRunner } from "../src/pi-agent-runner.js";
import { PiBaselineExecutor, PiPhaseExecutor } from "../src/pi-executor.js";

function source() {
  return {
    async load(phase: "wake" | "work" | "sleep" | "curate") {
      return {
        phase,
        files: ["fixture.md"],
        digest: "fixture-digest",
        content: "Fixture Cortex source.",
      };
    },
  };
}

test("Pi phase executor accepts exactly one schema-valid completion tool receipt", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_wake", {
        phase: "wake",
        selectedMemoryIds: [],
        summary: "No relevant memory.",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  const executor = new PiPhaseExecutor({ runner, source: source(), fixture: "test" });

  const execution = await executor.execute({
    phase: "wake",
    runId: "run-1",
    task: "Do the task.",
    memory: [],
  });

  assert.deepEqual(execution.payload, {
    phase: "wake",
    selectedMemoryIds: [],
    summary: "No relevant memory.",
  });
  assert.equal(execution.telemetry.attempts, 1);
  assert.equal(execution.telemetry.turns, 1);
  assert.equal(faux.getPendingResponseCount(), 0);
});

test("Pi runner bounds attempts when the model never submits a receipt", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage("No tool call."),
    fauxAssistantMessage("Still no tool call."),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 2,
    maxTurns: 1,
  });
  const baseline = new PiBaselineExecutor(runner, "test");

  await assert.rejects(
    baseline.execute("Return a result."),
    (error: unknown) =>
      error instanceof PiAgentRunError &&
      error.telemetry.attempts === 2 &&
      error.telemetry.turns === 2,
  );
  assert.equal(faux.state.callCount, 2);
});
