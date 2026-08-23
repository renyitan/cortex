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

test("Pi phase executor binds a selected evidence ID to its canonical reference", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("submit_work", {
          phase: "work",
          output: "Observation acknowledged.",
          memoryCandidates: [
            {
              id: "mapping",
              kind: "learning",
              text: "A failed disposable card maps to label 28.",
              evidenceId: "evidence-1",
              source: "observed",
            },
          ],
          summary: "Captured one mapping.",
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
    const reference = `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`;

    const execution = await executor.execute({
      phase: "work",
      runId: "run-1",
      task: "Acquire the mapping.",
      recalledMemory: [],
      evidence: [
        {
          id: "evidence-1",
          path: "evidence/chunk-001.txt",
          sha256: "a".repeat(64),
          reference,
          text: "A failed disposable card maps to label 28.",
        },
      ],
      evidenceBinding: "verified-documents",
      existingMemoryIds: [],
      memoryCandidatePolicy: "allow",
      memoryScope: "complete-mounted",
    });

    assert.equal(
      execution.payload.phase === "work"
        ? execution.payload.memoryCandidates[0]?.evidence
        : undefined,
      reference,
    );
    assert.equal(faux.getPendingResponseCount(), 0);
  });

test("Pi phase executor allows repair of an unknown evidence ID before acceptance", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("submit_work", {
          phase: "work",
          output: "Observation acknowledged.",
          memoryCandidates: [
            {
              id: "mapping",
              kind: "learning",
              text: "A failed disposable card maps to label 28.",
              evidenceId: "invented-evidence",
              source: "observed",
            },
          ],
          summary: "Captured one mapping.",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        fauxToolCall("submit_work", {
          phase: "work",
          output: "Observation acknowledged.",
          memoryCandidates: [
            {
              id: "mapping",
              kind: "learning",
              text: "A failed disposable card maps to label 28.",
              evidenceId: "evidence-1",
              source: "observed",
            },
          ],
          summary: "Captured one mapping with verified evidence.",
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
      phase: "work",
      runId: "run-1",
      task: "Acquire the mapping.",
      recalledMemory: [],
      evidence: [
        {
          id: "evidence-1",
          path: "evidence/chunk-001.txt",
          sha256: "a".repeat(64),
          reference: `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`,
          text: "A failed disposable card maps to label 28.",
        },
      ],
      evidenceBinding: "verified-documents",
      existingMemoryIds: [],
      memoryCandidatePolicy: "allow",
      memoryScope: "complete-mounted",
    });

    assert.equal(execution.telemetry.turns, 2);
    assert.equal(
      execution.payload.phase === "work"
        ? execution.payload.memoryCandidates[0]?.evidence
        : undefined,
      `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`,
    );
  });

test("Pi phase executor allows repair of a colliding memory candidate ID", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "Observation acknowledged.",
        memoryCandidates: [
          {
            id: "existing-mapping",
            kind: "learning",
            text: "A failed disposable card maps to label 28.",
            evidenceId: "evidence-1",
            source: "observed",
          },
        ],
        summary: "Used a colliding ID.",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "Observation acknowledged.",
        memoryCandidates: [
          {
            id: "new-mapping",
            kind: "learning",
            text: "A failed disposable card maps to label 28.",
            evidenceId: "evidence-1",
            source: "observed",
          },
        ],
        summary: "Used a new ID.",
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
    phase: "work",
    runId: "run-1",
    task: "Acquire the mapping.",
    recalledMemory: [],
    evidence: [
      {
        id: "evidence-1",
        path: "evidence/chunk-001.txt",
        sha256: "a".repeat(64),
        reference: `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`,
        text: "A failed disposable card maps to label 28.",
      },
    ],
    evidenceBinding: "verified-documents",
    existingMemoryIds: ["existing-mapping"],
    memoryCandidatePolicy: "allow",
    memoryScope: "complete-mounted",
  });

  assert.equal(execution.telemetry.turns, 2);
  assert.equal(
    execution.payload.phase === "work"
      ? execution.payload.memoryCandidates[0]?.id
      : undefined,
    "new-mapping",
  );
});

test("Pi phase executor keeps verified binding when retrieval selects no evidence", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "No evidence supports an answer.",
        memoryCandidates: [
          {
            id: "unsupported",
            kind: "learning",
            text: "An unsupported candidate.",
            evidence: "free-form fallback",
            source: "observed",
          },
        ],
        summary: "Attempted an unsupported write.",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "No evidence supports an answer.",
        memoryCandidates: [],
        summary: "Created no unsupported memory.",
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
    phase: "work",
    runId: "run-1",
    task: "Answer from retrieved evidence.",
    recalledMemory: [],
    evidence: [],
    evidenceBinding: "verified-documents",
    existingMemoryIds: [],
    memoryCandidatePolicy: "allow",
    memoryScope: "complete-mounted",
  });

  assert.equal(execution.telemetry.turns, 2);
  assert.deepEqual(
    execution.payload.phase === "work"
      ? execution.payload.memoryCandidates
      : undefined,
    [],
  );
});

test("Pi phase executor repairs an unconfirmed answer candidate", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "28",
        memoryCandidates: [
          {
            id: "unconfirmed-answer",
            kind: "decision",
            text: "The answer is 28.",
            evidenceId: "evidence-1",
            source: "observed",
          },
        ],
        summary: "Answered and attempted a candidate.",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("submit_work", {
        phase: "work",
        output: "28",
        memoryCandidates: [],
        summary: "Answered without an unconfirmed candidate.",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  const executor = new PiPhaseExecutor({
    runner,
    source: source(),
    fixture: "test",
  });

  const execution = await executor.execute({
    phase: "work",
    runId: "run-1",
    task: "Answer without feedback.",
    recalledMemory: [],
    evidence: [
      {
        id: "evidence-1",
        path: "evidence/chunk-001.txt",
        sha256: "a".repeat(64),
        reference: `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`,
        text: "A failed disposable card maps to label 28.",
      },
    ],
    evidenceBinding: "verified-documents",
    existingMemoryIds: [],
    memoryCandidatePolicy: "prohibit-unconfirmed",
    memoryScope: "complete-mounted",
  });

  assert.equal(execution.telemetry.turns, 2);
  assert.deepEqual(
    execution.payload.phase === "work"
      ? execution.payload.memoryCandidates
      : undefined,
    [],
  );
});

test("Pi phase executor binds selected SLEEP candidates without model copying", async () => {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("submit_sleep", {
          phase: "sleep",
          writes: [{ candidateId: "mapping" }],
          summary: "Persist the mapping.",
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
    const reference = `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`;

    const execution = await executor.execute({
      phase: "sleep",
      runId: "run-1",
      task: "Persist the mapping.",
      mountedMemory: [],
      recalledMemory: [],
      work: {
        phase: "work",
        output: "Observation acknowledged.",
        memoryCandidates: [
          {
            id: "mapping",
            kind: "learning",
            text: "A failed disposable card maps to label 28.",
            evidence: reference,
            source: "observed",
          },
        ],
        summary: "Captured one mapping.",
      },
      writePolicy: "allow",
    });

    assert.equal(
      execution.payload.phase === "sleep"
        ? execution.payload.writes[0]?.record.evidence
        : undefined,
      reference,
    );
    assert.equal(faux.getPendingResponseCount(), 0);
  });

test("Pi phase executor accepts an empty SLEEP selection with no candidates", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_sleep", {
        phase: "sleep",
        writes: [],
        summary: "No durable candidate.",
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
    phase: "sleep",
    runId: "run-1",
    task: "Do not persist anything.",
    mountedMemory: [],
    recalledMemory: [],
    work: {
      phase: "work",
      output: "Done.",
      memoryCandidates: [],
      summary: "No candidate.",
    },
    writePolicy: "allow",
  });

  assert.deepEqual(
    execution.payload.phase === "sleep"
      ? execution.payload.writes
      : undefined,
    [],
  );
  assert.equal(faux.getPendingResponseCount(), 0);
});

test("Pi phase executor completes prohibited empty SLEEP without a model call", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  let sourceLoads = 0;
  const executor = new PiPhaseExecutor({
    runner,
    source: {
      async load(phase) {
        sourceLoads += 1;
        return source().load(phase);
      },
    },
    fixture: "test",
  });

  const execution = await executor.execute({
    phase: "sleep",
    runId: "run-1",
    task: "Answer an unconfirmed question.",
    mountedMemory: [],
    recalledMemory: [],
    work: {
      phase: "work",
      output: "67",
      memoryCandidates: [],
      summary: "Answered from available evidence.",
    },
    writePolicy: "prohibit-unconfirmed",
  });

  assert.deepEqual(execution.payload, {
    phase: "sleep",
    writes: [],
    summary:
      "SLEEP completed deterministically because no memory candidate was eligible to persist.",
  });
  assert.equal(execution.telemetry.attempts, 0);
  assert.equal(execution.telemetry.turns, 0);
  assert.equal(execution.telemetry.usage.totalTokens, 0);
  assert.equal(sourceLoads, 0);
  assert.equal(faux.getPendingResponseCount(), 0);
});

test("Pi phase executor repairs a prohibited SLEEP write", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("submit_sleep", {
        phase: "sleep",
        writes: [{ candidateId: "unconfirmed-answer" }],
        summary: "Attempted to persist the answer.",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("submit_sleep", {
        phase: "sleep",
        writes: [],
        summary: "No externally confirmed learning.",
      }),
      { stopReason: "toolUse" },
    ),
  ]);
  const runner = new PiAgentRunner({
    models,
    model: faux.getModel(),
    maxAttempts: 1,
  });
  const executor = new PiPhaseExecutor({
    runner,
    source: source(),
    fixture: "test",
  });

  const execution = await executor.execute({
    phase: "sleep",
    runId: "run-1",
    task: "Answer an unconfirmed question.",
    mountedMemory: [],
    recalledMemory: [],
    work: {
      phase: "work",
      output: "67",
      memoryCandidates: [
        {
          id: "unconfirmed-answer",
          kind: "decision",
          text: "The answer is 67.",
          evidence: `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`,
          source: "observed",
        },
      ],
      summary: "Answered from available evidence.",
    },
    writePolicy: "prohibit-unconfirmed",
  });

  assert.equal(execution.telemetry.turns, 2);
  assert.deepEqual(
    execution.payload.phase === "sleep"
      ? execution.payload.writes
      : undefined,
    [],
  );
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

test("Pi advisory executor binds selected evidence IDs", async () => {
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
              evidenceId: "evidence-1",
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
    const reference = `evidence/chunk-001.txt#sha256=${"a".repeat(64)}`;

    const execution = await advisory.execute(
      "Learn this example.",
      [],
      "acquire",
      [
        {
          id: "evidence-1",
          path: "evidence/chunk-001.txt",
          sha256: "a".repeat(64),
          reference,
          text: "A failed disposable card maps to label 28.",
        },
      ],
    );

    assert.equal(execution.memoryCandidates[0]?.evidence, reference);
    assert.equal(faux.getPendingResponseCount(), 0);
  });
