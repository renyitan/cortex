import assert from "node:assert/strict";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { PiAgentRunError, PiAgentRunner } from "../src/pi-agent-runner.js";
import {
  PiAdvisoryMemoryExecutor,
  PiBaselineExecutor,
  PiDirectMemoryExecutor,
  PiPhaseExecutor,
} from "../src/pi-executor.js";

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

test("Pi runner rejects a provider response from a different model", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    () => ({
      ...fauxAssistantMessage(
        fauxToolCall("submit_baseline", {
          output: "result",
          summary: "completed",
        }),
        { stopReason: "toolUse" },
      ),
      responseModel: "fallback-model",
    }),
    fauxAssistantMessage(
      fauxToolCall("submit_baseline", {
        output: "retry result",
        summary: "must not run",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 2,
  });
  const baseline = new PiBaselineExecutor(runner, "test");

  await assert.rejects(
    baseline.execute("Return a result."),
    (error: unknown) =>
      error instanceof PiAgentRunError &&
      error.telemetry.model === "fallback-model" &&
      /expected/.test(error.message),
  );
  assert.equal(faux.state.callCount, 1);
});

test("Pi direct-memory executor completes the task with supplied memory", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_baseline", {
        output: "Project Ember now starts faster. CANARY-GREEN",
        summary: "Applied the supplied release-note convention.",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  const directMemory = new PiDirectMemoryExecutor(runner, "test");

  const execution = await directMemory.execute("Write the release note.", [
    {
      id: "ember-marker",
      kind: "decision",
      text: "Project Ember release notes end with CANARY-GREEN.",
      evidence: "operator instruction",
      source: "operator",
    },
  ]);

  assert.equal(
    execution.output,
    "Project Ember now starts faster. CANARY-GREEN",
  );
  assert.equal(execution.telemetry.turns, 1);
  assert.equal(faux.getPendingResponseCount(), 0);
});

test("Pi advisory executor returns voluntary memory candidates", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_advisory", {
        output: "Observation acknowledged.",
        memoryCandidates: [
          {
            id: "banking-example",
            kind: "learning",
            text: "A failed disposable card maps to label 28.",
            evidence: "current observation",
            source: "observed",
          },
        ],
        summary: "Voluntarily captured one learning.",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  const advisory = new PiAdvisoryMemoryExecutor(runner, "test");

  const execution = await advisory.execute(
    "Learn this example.",
    [],
    "acquire",
  );

  assert.equal(execution.output, "Observation acknowledged.");
  assert.equal(execution.memoryCandidates[0]?.id, "banking-example");
  assert.equal(execution.telemetry.turns, 1);
  assert.equal(faux.getPendingResponseCount(), 0);
});
