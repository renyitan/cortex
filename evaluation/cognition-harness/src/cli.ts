#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  clampThinkingLevel,
  type AuthEvent,
  type AuthPrompt,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  CortexSourceLoader,
  type CortexSourceSnapshot,
} from "./cortex-source.js";
import {
  defaultCredentialPath,
  PrivateFileCredentialStore,
} from "./credential-store.js";
import {
  createGitHubCopilotModels,
  createGitHubCopilotRuntime,
  resolveGitHubCopilotModel,
  type GitHubCopilotModelContext,
} from "./pi-executor.js";
import { JsonlPiTraceSink } from "./pi-trace.js";
import {
  countMabTokens,
  isMabSource,
  loadPreparedMabStreams,
  scoreMabOutput,
  selectMabQuestions,
  type MabPreparedStream,
  type MabSource,
} from "./mab-adapter.js";
import {
  defaultMabThresholds,
  freezeMabManifest,
  readMabQuestionIds,
  readMabManifest,
  runMabBatch,
  type MabBatchModel,
  type MabExecutionPolicy,
} from "./mab-batch.js";
import {
  MAB_CONDITIONS,
  runMabCondition,
  type MabCondition,
  type MabExecutorContext,
  type MabStream,
} from "./mab-condition.js";
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
const DEFAULT_MAB_DATA_DIRECTORY = join(
  HARNESS_ROOT,
  "data",
  "memory-agent-bench",
);
const DEFAULT_MAB_RUNS_ROOT = join(DEFAULT_RUNS_ROOT, "memory-agent-bench");
const DEFAULT_MAB_EXECUTION: MabExecutionPolicy = {
  maxAttempts: 2,
  maxTurns: 3,
  timeoutMs: 300_000,
  workMemory: "complete-mounted",
  questionIsolation: "fresh-runtime-and-cloned-store",
  evidenceRetention: "immutable-source-chunks-sha256",
  evidenceRetrieval: "shared-deterministic-bm25",
  evidenceCitationSelection: "model-evidence-id-host-reference-binding",
  evidencePromptProjection: "id-and-text-only",
  memoryCandidateIdentity: "host-validated-unique-and-insert-only",
  memoryWriteBinding: "model-candidate-id-host-content-binding",
  answerMemoryCandidates: "prohibited-without-external-feedback",
  answerMemoryWrites: "prohibited-without-external-feedback",
  evidenceTopK: 10,
};
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
  npm run harness -- mab prepare [--data-dir <path>]
  npm run harness -- mab smoke [--condition cortex] [--source factconsolidation_sh_6k] [--questions 1] [--model gpt-5-mini] [--thinking low]
  npm run harness -- mab freeze [--questions 100] [--repetitions 3] [--exclude-manifest <path>] [--maximum-cost-usd 25] [--manifest <path>] [--model gpt-5-mini] [--thinking low]
  npm run harness -- mab run --manifest <path> [--data-dir <path>] [--runs-dir <path>]

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

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value`);
    }
    values.push(value);
  }
  return values;
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

function positiveIntegerOptionOrDefault(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = option(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function positiveNumberOptionOrDefault(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = option(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive`);
  }
  return value;
}

function mabConditionOption(args: readonly string[]): MabCondition {
  const condition = option(args, "--condition") ?? "cortex";
  const matched = MAB_CONDITIONS.find((candidate) => candidate === condition);
  if (!matched) {
    throw new Error(
      `--condition must be one of ${MAB_CONDITIONS.join(", ")}`,
    );
  }
  return matched;
}

function mabSourceOption(args: readonly string[]): MabSource {
  const source = option(args, "--source") ?? "factconsolidation_sh_6k";
  if (!isMabSource(source)) {
    throw new Error(`unsupported MemoryAgentBench source: ${source}`);
  }
  return source;
}

function mabModel(
  requestedId: string,
  requestedThinkingLevel: ModelThinkingLevel,
  context: GitHubCopilotModelContext,
  execution: MabExecutionPolicy = DEFAULT_MAB_EXECUTION,
): MabBatchModel {
  const rates = [
    context.model.cost,
    ...(context.model.cost.tiers ?? []),
  ];
  const costPerMillionTokens = {
    input: Math.max(...rates.map((rate) => rate.input)),
    output: Math.max(...rates.map((rate) => rate.output)),
    cacheRead: Math.max(...rates.map((rate) => rate.cacheRead)),
    cacheWrite: Math.max(...rates.map((rate) => rate.cacheWrite)),
  };
  return {
    provider: PROVIDER,
    requestedId,
    resolvedId: context.model.id,
    requestedThinkingLevel,
    effectiveThinkingLevel: clampThinkingLevel(
      context.model,
      requestedThinkingLevel,
    ),
    contextWindow: context.model.contextWindow,
    maxOutputTokens: context.model.maxTokens,
    costPerMillionTokens,
    maximumInvocationCostUsd:
      ((context.model.contextWindow *
        (costPerMillionTokens.input +
          costPerMillionTokens.cacheRead +
          costPerMillionTokens.cacheWrite) +
        context.model.maxTokens * costPerMillionTokens.output) /
        1_000_000) *
      execution.maxAttempts *
      execution.maxTurns,
  };
}

function toMabStream(
  prepared: MabPreparedStream,
  questionsPerStream: number,
): MabStream {
  const questions = selectMabQuestions(
    [prepared],
    questionsPerStream,
  ).map((question) => ({
    id: question.qaPairId,
    prompt: question.prompt,
    retrievalQuery: question.question,
    answers: question.answers,
    metric: question.metric,
  }));
  return {
    id: prepared.source,
    source: prepared.source,
    competency: prepared.task,
    stratum:
      prepared.hop === null
        ? prepared.stratum
        : `${prepared.stratum}-${prepared.hop}`,
    chunks: prepared.chunks,
    questions,
  };
}

function mabRuntimeFactory(
  credentials: PrivateFileCredentialStore,
  modelId: string,
  thinkingLevel: ModelThinkingLevel,
  source: CortexSourceSnapshot,
  execution: MabExecutionPolicy = DEFAULT_MAB_EXECUTION,
  modelContext?: GitHubCopilotModelContext,
): (context: MabExecutorContext) => ReturnType<typeof createGitHubCopilotRuntime> {
  let shared = modelContext;
  return async (context) => {
    shared ??= await resolveGitHubCopilotModel(credentials, modelId);
    return createGitHubCopilotRuntime({
      credentials,
      modelId,
      modelContext: shared,
      thinkingLevel,
      maxAttempts: execution.maxAttempts,
      maxTurns: execution.maxTurns,
      timeoutMs: execution.timeoutMs,
      trace: new JsonlPiTraceSink(
        join(context.artifactDirectory, "agent-trace.jsonl"),
      ),
      source,
      fixture: `memory-agent-bench/${context.streamId}`,
    });
  };
}

async function requiredRepositoryState(
  repositoryRoot: string,
): Promise<{ commit: string; dirty: boolean }> {
  const state = await repositoryState(repositoryRoot);
  if (state.commit === undefined || state.dirty === undefined) {
    throw new Error("could not determine the Cortex repository state");
  }
  return { commit: state.commit, dirty: state.dirty };
}

function printMabStreams(streams: readonly MabPreparedStream[]): void {
  for (const stream of streams) {
    const tokens = stream.chunks.reduce(
      (sum, chunk) => sum + countMabTokens(chunk),
      0,
    );
    console.log(
      `${stream.source}\t${stream.chunks.length} chunks\t${tokens} tokens\t${stream.questions.length} questions`,
    );
  }
}

async function mabCommand(args: readonly string[]): Promise<void> {
  const action = args[0];
  if (!action || !["prepare", "smoke", "freeze", "run"].includes(action)) {
    throw new Error("usage: mab prepare|smoke|freeze|run [options]");
  }
  const dataDirectory = resolve(
    option(args, "--data-dir") ?? DEFAULT_MAB_DATA_DIRECTORY,
  );
  const streams = await loadPreparedMabStreams({
    cacheDirectory: dataDirectory,
  });
  printMabStreams(streams);
  if (action === "prepare") {
    console.log(`Prepared data: ${relative(process.cwd(), dataDirectory)}`);
    return;
  }

  const sourceLoader = new CortexSourceLoader();
  const source = await sourceLoader.snapshot();
  const sourceManifest = source.manifest();
  const credentials = new PrivateFileCredentialStore();

  if (action === "smoke") {
    const condition = mabConditionOption(args);
    const selectedSource = mabSourceOption(args);
    const questions = positiveIntegerOptionOrDefault(
      args,
      "--questions",
      1,
    );
    const modelId = option(args, "--model") ?? "gpt-5-mini";
    const thinking = option(args, "--thinking") ?? "low";
    if (!isThinkingLevel(thinking)) {
      throw new Error(`invalid thinking level: ${thinking}`);
    }
    const prepared = streams.find(
      (stream) => stream.source === selectedSource,
    );
    if (!prepared) {
      throw new Error(`prepared stream is missing ${selectedSource}`);
    }
    const artifactDirectory = runDirectory(
      join(DEFAULT_MAB_RUNS_ROOT, "smoke"),
    );
    const createExecutors = mabRuntimeFactory(
      credentials,
      modelId,
      thinking,
      source,
    );
    const report = await runMabCondition({
      artifactDirectory,
      stream: toMabStream(prepared, questions),
      condition,
      repetition: 1,
      model: modelId,
      evidenceTopK: DEFAULT_MAB_EXECUTION.evidenceTopK,
      createExecutors,
      score(output, question) {
        return scoreMabOutput(
          selectedSource,
          output,
          question.answers,
        ).score === 1;
      },
    });
    console.log(
      `Smoke: ${condition} ${report.correct}/${report.totalQuestions} correct, ${report.errors} errors, $${report.telemetry.usage.costUsd.toFixed(6)}`,
    );
    console.log(
      `Artifacts: ${relative(process.cwd(), artifactDirectory) || artifactDirectory}`,
    );
    if (report.status !== "completed") process.exitCode = 1;
    return;
  }

  if (action === "freeze") {
    const questionsPerStream = positiveIntegerOptionOrDefault(
      args,
      "--questions",
      100,
    );
    const repetitions = positiveIntegerOptionOrDefault(
      args,
      "--repetitions",
      3,
    );
    const modelId = option(args, "--model") ?? "gpt-5-mini";
    const thinking = option(args, "--thinking") ?? "low";
    if (!isThinkingLevel(thinking)) {
      throw new Error(`invalid thinking level: ${thinking}`);
    }
    const modelContext = await resolveGitHubCopilotModel(
      credentials,
      modelId,
    );
    const repository = await requiredRepositoryState(
      sourceLoader.repositoryRoot,
    );
    if (repository.dirty) {
      throw new Error(
        "refusing to freeze against a dirty Cortex worktree; commit the harness first",
      );
    }
    const batchId = `mab-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const manifestPath = resolve(
      option(args, "--manifest") ??
        join(DEFAULT_MAB_RUNS_ROOT, "manifests", `${batchId}.json`),
    );
    const excludedQuestionIds = (
      await Promise.all(
        optionValues(args, "--exclude-manifest").map((path) =>
          readMabQuestionIds(resolve(path)),
        ),
      )
    ).flat();
    const thresholds = {
      ...defaultMabThresholds(),
      maximumCostUsd: positiveNumberOptionOrDefault(
        args,
        "--maximum-cost-usd",
        25,
      ),
    };
    const manifest = await freezeMabManifest({
      manifestPath,
      batchId,
      streams,
      questionsPerStream,
      excludedQuestionIds,
      repetitions,
      model: mabModel(
        modelId,
        thinking,
        modelContext,
        DEFAULT_MAB_EXECUTION,
      ),
      repository,
      source: sourceManifest,
      execution: DEFAULT_MAB_EXECUTION,
      thresholds,
    });
    console.log(
      `Frozen manifest: ${relative(process.cwd(), manifestPath) || manifestPath}`,
    );
    console.log(
      `${manifest.runs.length} source repetitions, ${manifest.questionsPerStream} questions per stream, $${manifest.thresholds.maximumCostUsd.toFixed(2)} cap`,
    );
    if (manifest.questionSelection.excludedQuestionIds.length > 0) {
      console.log(
        `Excluded ${manifest.questionSelection.excludedQuestionIds.length} previously used question IDs`,
      );
    }
    return;
  }

  const manifestPath = option(args, "--manifest");
  if (!manifestPath) {
    throw new Error("mab run requires --manifest <path>");
  }
  const manifest = await readMabManifest(resolve(manifestPath));
  if (!isThinkingLevel(manifest.model.requestedThinkingLevel)) {
    throw new Error(
      `frozen thinking level is unsupported: ${manifest.model.requestedThinkingLevel}`,
    );
  }
  if (!isThinkingLevel(manifest.model.effectiveThinkingLevel)) {
    throw new Error(
      `frozen effective thinking level is unsupported: ${manifest.model.effectiveThinkingLevel}`,
    );
  }
  const modelContext = await resolveGitHubCopilotModel(
    credentials,
    manifest.model.requestedId,
  );
  const execution = {
    model: mabModel(
      manifest.model.requestedId,
      manifest.model.requestedThinkingLevel,
      modelContext,
      manifest.protocol.execution,
    ),
    repository: await requiredRepositoryState(sourceLoader.repositoryRoot),
    source: sourceManifest,
  };
  const artifactDirectory = runDirectory(
    resolve(option(args, "--runs-dir") ?? DEFAULT_MAB_RUNS_ROOT),
  );
  const report = await runMabBatch({
    artifactDirectory,
    manifest,
    streams,
    execution,
    createExecutors: mabRuntimeFactory(
      credentials,
      manifest.model.requestedId,
      manifest.model.effectiveThinkingLevel,
      source,
      manifest.protocol.execution,
      modelContext,
    ),
  });
  console.log(
    `Artifacts: ${relative(process.cwd(), artifactDirectory) || artifactDirectory}`,
  );
  for (const condition of MAB_CONDITIONS) {
    const aggregate = report.aggregates[condition];
    console.log(
      `${condition}: ${aggregate.correct}/${aggregate.questions} correct, ${aggregate.errors} errors, $${aggregate.telemetry.usage.costUsd.toFixed(6)}`,
    );
  }
  for (const contrast of report.contrasts) {
    console.log(
      `cortex - ${contrast.comparator}: ${(contrast.difference * 100).toFixed(1)} pp, ${(contrast.confidenceLevel * 100).toFixed(0)}% CI [${(contrast.lower * 100).toFixed(1)}, ${(contrast.upper * 100).toFixed(1)}]`,
    );
  }
  console.log(`Result: ${report.criteria.supported ? "SUPPORTED" : "NOT SUPPORTED"}`);
  if (report.status !== "completed") process.exitCode = 1;
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
  const sourceLoader = new CortexSourceLoader();
  const source = await sourceLoader.snapshot();
  const sourceManifest = source.manifest();
  const repository = await repositoryState(sourceLoader.repositoryRoot);

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
  if (command === "fixture") return fixtureCommand(args);
  if (command === "mab") return mabCommand(args);
  throw new Error(`unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
