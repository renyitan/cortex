import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LosslessFormationExecutor,
  formationFailureKind,
  type LosslessFormationRunner,
} from "../src/lossless-formation-executor.js";
import {
  createLosslessMemoryBundle,
  observationSha256,
  type LosslessObservation,
} from "../src/lossless-memory.js";
import type {
  PiToolRunResult,
  PiToolRunSpec,
} from "../src/pi-agent-runner.js";
import { PiAgentRunError } from "../src/pi-agent-runner.js";
import { collectErrorTelemetry } from "../src/telemetry.js";
import { emptyTelemetry } from "../src/types.js";

function observation(ordinal: number, text: string): LosslessObservation {
  const authoredAt = `2025-0${ordinal}-01T00:00:00Z`;
  return {
    id: `stream-test-observation-0${ordinal}`,
    authoredAt,
    text,
    sha256: observationSha256(authoredAt, text),
  };
}

class ScriptedFormationRunner implements LosslessFormationRunner {
  readonly prompts: string[] = [];
  calls = 0;

  constructor(
    private readonly receipts: readonly {
      candidates: {
        kind: "decision" | "procedure" | "preference";
        subjectKey: string;
        statement: string;
        scope:
          | { level: "global"; key: null }
          | {
              level: "organization" | "team" | "project" | "workflow";
              key: string;
            };
        supersedesClaimIds: string[];
      }[];
    }[],
    private readonly costUsd = 0,
  ) {}

  async run<TValue>(
    spec: PiToolRunSpec<TValue>,
  ): Promise<PiToolRunResult<TValue>> {
    this.prompts.push(spec.userPrompt);
    const receipt = this.receipts[this.calls];
    this.calls += 1;
    if (!receipt) throw new Error("missing scripted receipt");
    let accepted: TValue | undefined;
    const tool = spec.createTool((value) => {
      accepted = value;
    });
    await tool.execute(`call-${this.calls}`, receipt);
    if (accepted === undefined) throw new Error("tool did not accept receipt");
    const telemetry = emptyTelemetry("scripted");
    telemetry.usage.costUsd = this.costUsd;
    return {
      value: accepted,
      telemetry,
    };
  }
}

test("uses one fresh receipt per observation and never exposes future content", async () => {
  const first = observation(1, "Atlas approved route alpha.");
  const second = observation(2, "Atlas later approved route beta.");
  const runner = new ScriptedFormationRunner([
    {
      candidates: [
        {
          kind: "decision",
          subjectKey: "release-route",
          statement: first.text,
          scope: { level: "team", key: "atlas-team" },
          supersedesClaimIds: [],
        },
      ],
    },
    {
      candidates: [
        {
          kind: "decision",
          subjectKey: "release-route",
          statement: second.text,
          scope: { level: "team", key: "atlas-team" },
          supersedesClaimIds: ["stream-test-formed-01-01"],
        },
      ],
    },
  ]);
  const executor = new LosslessFormationExecutor({
    runner,
    contextWindow: 100_000,
    maxOutputTokens: 1_000,
    countTokens: (text) => text.length,
  });

  const firstReceipt = await executor.executeObservation(
    createLosslessMemoryBundle("stream-test"),
    first,
    1,
  );
  const secondReceipt = await executor.executeObservation(
    firstReceipt.bundle,
    second,
    1,
  );

  assert.equal(runner.calls, 2);
  assert.equal(runner.prompts[0]!.includes(second.text), false);
  assert.equal(runner.prompts[0]!.includes("targetQuery"), false);
  assert.equal(runner.prompts[0]!.includes("requiredActionIds"), false);
  assert.equal(runner.prompts[1]!.includes(first.text), true);
  assert.equal(secondReceipt.bundle.observations.length, 2);
  assert.equal(secondReceipt.bundle.claims.length, 2);
  assert.deepEqual(secondReceipt.bundle.claims[1]!.supersedesClaimIds, [
    "stream-test-formed-01-01",
  ]);
});

test("preflights the complete request and refuses context overflow", async () => {
  const runner = new ScriptedFormationRunner([{ candidates: [] }]);
  const executor = new LosslessFormationExecutor({
    runner,
    contextWindow: 2,
    maxOutputTokens: 1,
    countTokens: () => 2,
  });
  await assert.rejects(
    executor.executeObservation(
      createLosslessMemoryBundle("stream-test"),
      observation(1, "No room."),
      1,
    ),
    /exceeds model context/,
  );
  assert.equal(runner.calls, 0);
});

test("classifies a provider model mismatch as an integrity failure", () => {
  assert.equal(
    formationFailureKind(
      new PiAgentRunError(
        "Provider returned model fallback; expected frozen",
        emptyTelemetry("fallback"),
      ),
    ),
    "integrity",
  );
});

test("preserves paid telemetry when host supersession validation rejects a receipt", async () => {
  const first = observation(1, "Atlas approved route alpha.");
  const second = observation(2, "Atlas project approved route beta.");
  const runner = new ScriptedFormationRunner(
    [
      {
        candidates: [
          {
            kind: "decision",
            subjectKey: "release-route",
            statement: first.text,
            scope: { level: "team", key: "atlas-team" },
            supersedesClaimIds: [],
          },
        ],
      },
      {
        candidates: [
          {
            kind: "decision",
            subjectKey: "release-route",
            statement: second.text,
            scope: { level: "project", key: "atlas-project" },
            supersedesClaimIds: ["stream-test-formed-01-01"],
          },
        ],
      },
    ],
    0.125,
  );
  const executor = new LosslessFormationExecutor({
    runner,
    contextWindow: 100_000,
    maxOutputTokens: 1_000,
    countTokens: (text) => text.length,
  });
  const firstReceipt = await executor.executeObservation(
    createLosslessMemoryBundle("stream-test"),
    first,
    1,
  );

  await assert.rejects(
    executor.executeObservation(firstReceipt.bundle, second, 1),
    (error: unknown) => {
      assert.ok(error instanceof PiAgentRunError);
      assert.match(error.message, /Host rejected formation candidate batch/);
      assert.equal(formationFailureKind(error), "condition");
      assert.equal(
        collectErrorTelemetry(error, "scripted").usage.costUsd,
        0.125,
      );
      return true;
    },
  );
});
