#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  AuthEvent,
  AuthPrompt,
  ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import { CortexSourceLoader } from "./cortex-source.js";
import {
  defaultCredentialPath,
  PrivateFileCredentialStore,
} from "./credential-store.js";
import {
  createGitHubCopilotModels,
  createGitHubCopilotRuntime,
} from "./pi-executor.js";
import { JsonlPiTraceSink } from "./pi-trace.js";
import {
  loadLongMemEvalPilot,
  prepareLongMemEvalPilot,
} from "./longmemeval-dataset.js";
import { runLongMemEvalPilot } from "./longmemeval-runner.js";
import {
  projectEmberTrialId,
  runProjectEmberBatch,
} from "./project-ember-batch.js";
import {
  PROJECT_EMBER_FIXTURE_ID,
  runProjectEmberFixture,
} from "./project-ember-fixture.js";

const executeFile = promisify(execFile);
const PROVIDER = "github-copilot";
const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RUNS_ROOT = join(HARNESS_ROOT, "runs");
const THINKING_LEVELS: ReadonlySet<string> = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function isThinkingLevel(value: string): value is ModelThinkingLevel {
  return THINKING_LEVELS.has(value);
}

function printHelp(): void {
  console.log(`Cortex cognition harness

Usage:
  npm run harness -- auth login github-copilot [--domain github.com]
  npm run harness -- auth status
  npm run harness -- auth logout github-copilot
  npm run harness -- models list
  npm run harness -- fixture run [--model gpt-5-mini] [--thinking low] [--runs-dir <path>]
  npm run harness -- fixture batch --trials <count> [--model gpt-5-mini] [--thinking low] [--runs-dir <path>]
  npm run harness -- benchmark prepare longmemeval --history <path> --oracle <path> --output <path> [--items-per-stratum 3] [--seed <text>]
  npm run harness -- benchmark run longmemeval --prepared <path> [--question-id <id>] [--retrieval-limit 10] [--model gpt-5-mini] [--thinking low] [--runs-dir <path>]

Environment:
  CORTEX_HARNESS_AUTH_FILE  Override the external credential file
  CORTEX_REPO_ROOT          Override the Cortex repository root

Credentials default to:
  ${defaultCredentialPath()}

Run artifacts default to:
  ${DEFAULT_RUNS_ROOT}`);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function answerPrompt(
  prompt: AuthPrompt,
  readline: ReturnType<typeof createInterface>,
): Promise<string> {
  prompt.signal?.throwIfAborted();
  if (prompt.type === "secret") {
    throw new Error("this login flow requested an unsupported secret prompt");
  }
  if (prompt.type === "select") {
    console.log(`\n${prompt.message}`);
    prompt.options.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.label}`);
    });
    const raw = await readline.question(`Enter number (1-${prompt.options.length}): `);
    const selected = prompt.options[Number.parseInt(raw, 10) - 1];
    if (!selected) throw new Error("invalid selection");
    return selected.id;
  }
  const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : "";
  return readline.question(`${prompt.message}${placeholder}: `);
}

function notifyAuth(event: AuthEvent): void {
  switch (event.type) {
    case "auth_url":
      console.log(`\nOpen this URL in your browser:\n${event.url}`);
      if (event.instructions) console.log(event.instructions);
      break;
    case "device_code":
      console.log(`\nOpen this URL in your browser:\n${event.verificationUri}`);
      console.log(`Enter code: ${event.userCode}`);
      break;
    case "info":
    case "progress":
      console.log(event.message);
      break;
  }
}

async function authCommand(args: readonly string[]): Promise<void> {
  const credentials = new PrivateFileCredentialStore();
  const models = createGitHubCopilotModels(credentials);
  const action = args[0];

  if (action === "status") {
    const entries = await credentials.list();
    const configured = entries.some((entry) => entry.providerId === PROVIDER);
    const auth = await models.checkAuth(PROVIDER);
    console.log(`Credential file: ${credentials.path}`);
    console.log(`GitHub Copilot: ${configured && auth ? `configured (${auth.type})` : "not configured"}`);
    return;
  }

  if (action === "logout") {
    if (args[1] !== PROVIDER) throw new Error(`expected provider ${PROVIDER}`);
    await models.logout(PROVIDER);
    console.log(`Removed ${PROVIDER} credentials from ${credentials.path}`);
    return;
  }

  if (action !== "login" || args[1] !== PROVIDER) {
    throw new Error(`usage: auth login|logout ${PROVIDER}, or auth status`);
  }
  const domain = option(args, "--domain");

  const abort = new AbortController();
  const onInterrupt = () => abort.abort(new Error("login cancelled"));
  process.once("SIGINT", onInterrupt);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await models.login(PROVIDER, "oauth", {
      signal: abort.signal,
      prompt: (prompt) => {
        if (
          domain !== undefined &&
          prompt.type === "text" &&
          prompt.message.startsWith("GitHub Enterprise URL/domain")
        ) {
          return Promise.resolve(domain === "github.com" ? "" : domain);
        }
        return answerPrompt(prompt, readline);
      },
      notify: notifyAuth,
    });
    console.log(`\nGitHub Copilot credentials saved to ${credentials.path}`);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    readline.close();
  }
}

async function modelsCommand(args: readonly string[]): Promise<void> {
  if (args[0] !== "list") throw new Error("usage: models list");
  const credentials = new PrivateFileCredentialStore();
  const models = createGitHubCopilotModels(credentials);
  const available = await models.getAvailable(PROVIDER);
  if (available.length === 0) {
    throw new Error(`no Pi models available; run auth login ${PROVIDER}`);
  }
  for (const model of [...available].sort((left, right) => left.id.localeCompare(right.id))) {
    console.log(`${model.id}\t${model.name}`);
  }
}

async function repositoryState(repositoryRoot: string): Promise<{
  commit?: string;
  dirty?: boolean;
}> {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    executeFile("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
    executeFile("git", ["status", "--porcelain"], { cwd: repositoryRoot }),
  ]);
  return { commit: commit.trim(), dirty: status.trim().length > 0 };
}

function runDirectory(root: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(root, `${timestamp}-${randomUUID().slice(0, 8)}`);
}

function positiveIntegerOption(args: readonly string[], name: string): number {
  const raw = option(args, name);
  if (raw === undefined) throw new Error(`${name} is required`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requiredOption(args: readonly string[], name: string): string {
  const value = option(args, name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

async function benchmarkCommand(args: readonly string[]): Promise<void> {
  const [action, benchmark] = args;
  if (benchmark !== "longmemeval") {
    throw new Error("usage: benchmark prepare|run longmemeval [options]");
  }
  if (action === "prepare") {
    const rawItemsPerStratum = option(args, "--items-per-stratum") ?? "3";
    const itemsPerStratum = Number(rawItemsPerStratum);
    if (!Number.isInteger(itemsPerStratum) || itemsPerStratum < 1) {
      throw new Error("--items-per-stratum must be a positive integer");
    }
    const manifest = await prepareLongMemEvalPilot({
      historyPath: requiredOption(args, "--history"),
      oraclePath: requiredOption(args, "--oracle"),
      outputDirectory: requiredOption(args, "--output"),
      itemsPerStratum,
      seed: option(args, "--seed") ?? "cortex-longmemeval-pilot-v1",
    });
    console.log(`Prepared ${manifest.items.length} fixed LongMemEval items.`);
    console.log(`History SHA-256: ${manifest.historySource.sha256}`);
    console.log(`Oracle SHA-256: ${manifest.oracleSource.sha256}`);
    return;
  }
  if (action !== "run") {
    throw new Error("usage: benchmark prepare|run longmemeval [options]");
  }

  const modelId = option(args, "--model") ?? "gpt-5-mini";
  const thinking = option(args, "--thinking") ?? "low";
  if (!isThinkingLevel(thinking)) {
    throw new Error(`invalid thinking level: ${thinking}`);
  }
  const retrievalLimit = Number(option(args, "--retrieval-limit") ?? "10");
  if (!Number.isInteger(retrievalLimit) || retrievalLimit < 1) {
    throw new Error("--retrieval-limit must be a positive integer");
  }
  const loadedPrepared = await loadLongMemEvalPilot(
    requiredOption(args, "--prepared"),
  );
  const questionId = option(args, "--question-id");
  const prepared = questionId
    ? {
        ...loadedPrepared,
        items: loadedPrepared.items.filter(
          (item) => item.history.question_id === questionId,
        ),
      }
    : loadedPrepared;
  if (prepared.items.length === 0) {
    if (questionId) {
      throw new Error(`prepared LongMemEval pilot has no question ${questionId}`);
    }
    throw new Error("prepared LongMemEval pilot contains no items");
  }
  const runsRoot = resolve(option(args, "--runs-dir") ?? DEFAULT_RUNS_ROOT);
  const artifactDirectory = runDirectory(runsRoot);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const credentials = new PrivateFileCredentialStore();
  const source = new CortexSourceLoader();
  const firstQuestionId = prepared.items[0]!.history.question_id;
  const firstRuntime = await createGitHubCopilotRuntime({
    credentials,
    modelId,
    thinkingLevel: thinking,
    trace: new JsonlPiTraceSink(
      join(
        artifactDirectory,
        "items",
        firstQuestionId,
        "agent-trace.jsonl",
      ),
    ),
    source,
    fixture: `longmemeval:${firstQuestionId}`,
  });
  const report = await runLongMemEvalPilot({
    prepared,
    artifactDirectory,
    retrievalLimit,
    async createExecutors(context) {
      if (context.itemNumber === 1) return firstRuntime;
      const runtime = await createGitHubCopilotRuntime({
        credentials,
        modelId,
        thinkingLevel: thinking,
        trace: new JsonlPiTraceSink(
          join(context.artifactDirectory, "agent-trace.jsonl"),
        ),
        source,
        fixture: `longmemeval:${context.questionId}`,
      });
      if (runtime.model.id !== firstRuntime.model.id) {
        throw new Error(
          `resolved model changed during the run: ${firstRuntime.model.id} -> ${runtime.model.id}`,
        );
      }
      return runtime;
    },
    model: {
      provider: PROVIDER,
      requestedId: modelId,
      resolvedId: firstRuntime.model.id,
      thinkingLevel: thinking,
    },
    source: await source.manifest(),
    repository: await repositoryState(source.repositoryRoot),
  });
  console.log(
    `Artifacts: ${relative(process.cwd(), artifactDirectory) || artifactDirectory}`,
  );
  for (const [condition, aggregate] of Object.entries(report.conditions)) {
    console.log(
      `${condition}: ${aggregate.completed}/${aggregate.items} completed, ${aggregate.errors} errors, $${aggregate.telemetry.usage.costUsd.toFixed(6)}`,
    );
  }
  console.log(
    `Cortex candidate full recall: ${report.retrieval.candidateFullRecall}/${report.retrieval.answerableCandidateItemsEvaluated}`,
  );
  console.log(
    "Answer outputs are diagnostic only until scored with the official LongMemEval evaluator.",
  );
  if (report.status === "completed-with-errors") process.exitCode = 1;
}

async function fixtureCommand(args: readonly string[]): Promise<void> {
  const action = args[0];
  if (action !== "run" && action !== "batch") {
    throw new Error("usage: fixture run|batch [options]");
  }
  const modelId = option(args, "--model") ?? "gpt-5-mini";
  const thinking = option(args, "--thinking") ?? "low";
  if (!isThinkingLevel(thinking)) {
    throw new Error(`invalid thinking level: ${thinking}`);
  }
  const runsRoot = resolve(option(args, "--runs-dir") ?? DEFAULT_RUNS_ROOT);
  const artifactDirectory = runDirectory(runsRoot);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });

  const credentials = new PrivateFileCredentialStore();
  const source = new CortexSourceLoader();
  const sourceManifest = await source.manifest();
  const repository = await repositoryState(source.repositoryRoot);

  if (action === "batch") {
    const trialCount = positiveIntegerOption(args, "--trials");
    const firstTrialDirectory = join(
      artifactDirectory,
      projectEmberTrialId(1, trialCount),
    );
    const firstRuntime = await createGitHubCopilotRuntime({
      credentials,
      modelId,
      thinkingLevel: thinking,
      trace: new JsonlPiTraceSink(
        join(firstTrialDirectory, "agent-trace.jsonl"),
      ),
      source,
      fixture: PROJECT_EMBER_FIXTURE_ID,
    });
    const report = await runProjectEmberBatch({
      artifactDirectory,
      batchId: basename(artifactDirectory),
      trialCount,
      async createExecutors(context) {
        const runtime =
          context.trialNumber === 1
            ? firstRuntime
            : await createGitHubCopilotRuntime({
                credentials,
                modelId,
                thinkingLevel: thinking,
                trace: new JsonlPiTraceSink(
                  join(context.artifactDirectory, "agent-trace.jsonl"),
                ),
                source,
                fixture: PROJECT_EMBER_FIXTURE_ID,
              });
        return runtime;
      },
      model: {
        provider: PROVIDER,
        requestedId: modelId,
        resolvedId: firstRuntime.model.id,
        thinkingLevel: thinking,
      },
      source: sourceManifest,
      repository,
    });
    console.log(
      `Artifacts: ${relative(process.cwd(), artifactDirectory) || artifactDirectory}`,
    );
    for (const [condition, aggregate] of Object.entries(report.aggregates)) {
      console.log(
        `${condition}: ${aggregate.passed}/${aggregate.trials} passed, ${aggregate.errors} errors, $${aggregate.telemetry.usage.costUsd.toFixed(6)}, ${aggregate.telemetry.latencyMs} ms`,
      );
    }
    console.log(`Result: ${report.status === "passed" ? "PASS" : "FAIL"}`);
    if (report.status !== "passed") process.exitCode = 1;
    return;
  }

  const runtime = await createGitHubCopilotRuntime({
    credentials,
    modelId,
    thinkingLevel: thinking,
    trace: new JsonlPiTraceSink(join(artifactDirectory, "agent-trace.jsonl")),
    source,
    fixture: PROJECT_EMBER_FIXTURE_ID,
  });
  const report = await runProjectEmberFixture({
    artifactDirectory,
    phaseExecutor: runtime.phaseExecutor,
    baselineExecutor: runtime.baselineExecutor,
    directMemoryExecutor: runtime.directMemoryExecutor,
    model: {
      provider: PROVIDER,
      requestedId: modelId,
      resolvedId: runtime.model.id,
      thinkingLevel: thinking,
    },
    source: sourceManifest,
    repository,
  });

  console.log(`Artifacts: ${relative(process.cwd(), artifactDirectory) || artifactDirectory}`);
  console.log(`Baseline task correct: ${report.score.baselineTaskCorrect ? "yes" : "no"}`);
  console.log(`Baseline marker absent: ${report.score.baselineMarkerAbsent ? "yes" : "no"}`);
  console.log(
    `Direct memory task correct: ${report.score.directMemoryTaskCorrect ? "yes" : "no"}`,
  );
  console.log(
    `Direct memory applied marker: ${report.score.directMemoryAppliedMarker ? "yes" : "no"}`,
  );
  console.log(`SLEEP persisted marker: ${report.score.sleepPersistedMarker ? "yes" : "no"}`);
  console.log(`WAKE recalled marker: ${report.score.wakeRecalledMarker ? "yes" : "no"}`);
  console.log(`WORK task correct: ${report.score.workTaskCorrect ? "yes" : "no"}`);
  console.log(`WORK applied marker: ${report.score.workAppliedMarker ? "yes" : "no"}`);
  console.log(
    `WORK avoided redundant candidate: ${report.score.workAvoidedRedundantCandidate ? "yes" : "no"}`,
  );
  console.log(
    `SLEEP avoided redundant write: ${report.score.sleepAvoidedRedundantWrite ? "yes" : "no"}`,
  );
  console.log(
    `Memory precision preserved: ${report.score.memoryPrecisionPreserved ? "yes" : "no"}`,
  );
  console.log(`Result: ${report.score.passed ? "PASS" : "FAIL"}`);
  if (!report.score.passed) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "auth") return authCommand(args);
  if (command === "models") return modelsCommand(args);
  if (command === "benchmark") return benchmarkCommand(args);
  if (command === "fixture") return fixtureCommand(args);
  throw new Error(`unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
