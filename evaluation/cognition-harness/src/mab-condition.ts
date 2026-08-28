import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { JsonlEventSink, writePrivateJson } from "./artifacts.js";
import { LifecycleController } from "./controller.js";
import { AtomicMemoryStore } from "./memory-store.js";
import {
  assertMabEvidenceCitations,
  loadMabEvidence,
  persistMabEvidence,
  retrieveMabEvidence,
  type MabEvidenceMatch,
  type MabEvidenceSnapshot,
} from "./mab-evidence.js";
import {
  collectErrorTelemetry,
  combineTelemetry,
  sessionTelemetry,
  zeroTelemetry,
} from "./telemetry.js";
import type {
  AdvisoryMemoryExecutor,
  DirectMemoryExecutor,
  EvidenceDocument,
  ExecutionTelemetry,
  MemoryDraft,
  MemoryRecord,
  PhaseExecutor,
  SessionRunResult,
} from "./types.js";

export const MAB_CONDITIONS = ["regular", "advisory", "cortex"] as const;

export type MabCondition = (typeof MAB_CONDITIONS)[number];

export interface MabQuestion {
  id: string;
  prompt: string;
  retrievalQuery: string;
  answers: readonly string[];
  metric: "exact_match" | "substring_exact_match";
}

export interface MabStream {
  id: string;
  source: string;
  competency: "test-time-learning" | "fact-consolidation";
  stratum: string;
  chunks: readonly string[];
  questions: readonly MabQuestion[];
}

export interface MabConditionExecutors {
  directMemoryExecutor: DirectMemoryExecutor;
  advisoryMemoryExecutor: AdvisoryMemoryExecutor;
  phaseExecutor: PhaseExecutor;
}

export interface MabExecutorContext {
  condition: MabCondition;
  stage: "acquisition" | "evaluation";
  streamId: string;
  repetition: number;
  questionId?: string;
  artifactDirectory: string;
}

export interface MabConditionOptions {
  artifactDirectory: string;
  stream: MabStream;
  condition: MabCondition;
  repetition: number;
  model: string;
  evidenceTopK: number;
  createExecutors(
    context: MabExecutorContext,
  ): MabConditionExecutors | Promise<MabConditionExecutors>;
  score(output: string, question: MabQuestion): boolean;
  now?: () => Date;
}

export interface MabAcquisitionReport {
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  chunks: number;
  completedChunks: number;
  memoryRecords: number;
  memorySha256?: string;
  evidenceDocuments: number;
  evidenceSha256?: string;
  telemetry: ExecutionTelemetry;
  telemetryComplete: boolean;
  error?: {
    name: string;
    message: string;
  };
}

export interface MabQuestionReport {
  questionId: string;
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  output?: string;
  correct: boolean;
  memoryRecordsBefore: number;
  memoryRecordsAfter: number;
  memoryGrowth: number;
  retrieval: {
    query: string;
    topK: number;
    documents: {
      id: string;
      path: string;
      sha256: string;
      score: number;
    }[];
  };
  telemetry: ExecutionTelemetry;
  telemetryComplete: boolean;
  error?: {
    name: string;
    message: string;
  };
}

export interface MabConditionReport {
  schemaVersion: 2;
  streamId: string;
  source: string;
  competency: MabStream["competency"];
  stratum: string;
  condition: MabCondition;
  repetition: number;
  status: "completed" | "error";
  startedAt: string;
  completedAt: string;
  artifactDirectory: string;
  acquisition: MabAcquisitionReport;
  questions: MabQuestionReport[];
  totalQuestions: number;
  completedQuestions: number;
  correct: number;
  accuracy: number;
  errors: number;
  telemetry: ExecutionTelemetry;
}

export interface MabAcquisitionResult {
  report: MabAcquisitionReport;
  memory: MemoryDraft[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryDraft(value: unknown): value is MemoryDraft {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "learning" || value.kind === "decision") &&
    typeof value.text === "string" &&
    typeof value.evidence === "string" &&
    (value.source === "operator" ||
      value.source === "observed" ||
      value.source === "imported")
  );
}

async function readPersistedMemory(
  options: MabConditionOptions,
  now: () => Date,
): Promise<MemoryDraft[]> {
  if (options.condition === "cortex") {
    const store = new AtomicMemoryStore(
      join(options.artifactDirectory, "acquisition", "memory.json"),
      now,
    );
    return recordsToDrafts(await store.active());
  }
  const parsed: unknown = JSON.parse(
    await readFile(join(options.artifactDirectory, "memory.json"), "utf8"),
  );
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.records) ||
    !parsed.records.every(isMemoryDraft)
  ) {
    throw new Error("persisted acquisition memory is invalid");
  }
  return structuredClone(parsed.records);
}

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

function memoryDigest(memory: readonly MemoryDraft[]): string {
  return createHash("sha256")
    .update(JSON.stringify(memory))
    .digest("hex");
}

function recordsToDrafts(records: readonly MemoryRecord[]): MemoryDraft[] {
  return records
    .filter((record) => record.status === "active")
    .map(({ id, kind, text, evidence, source }) => ({
      id,
      kind,
      text,
      evidence,
      source,
    }));
}

export function createRawMabMemory(
  evidence: readonly EvidenceDocument[],
): MemoryDraft[] {
  return evidence.map((document) => ({
    id: document.id,
    kind: "learning",
    text: document.text,
    evidence: document.reference,
    source: "imported",
  }));
}

function acquisitionTask(
  stream: MabStream,
  document: EvidenceDocument,
  index: number,
): string {
  const role =
    stream.competency === "test-time-learning"
      ? "classification examples whose numerical labels must be learned for later unseen examples"
      : "a serially ordered knowledge pool in which later numbered facts supersede earlier conflicts";
  return `Acquire observation chunk ${index + 1}/${stream.chunks.length} for a delayed memory evaluation.

This chunk contains ${role}. The future questions and answers are withheld. The source content is supplied as a verified evidence document. Any memory candidate derived from it must select this evidence ID: ${document.id}. The harness binds that ID to its verified path and SHA-256 reference.

Do not answer a future question.`;
}

async function acquireRegular(
  options: MabConditionOptions,
  evidence: MabEvidenceSnapshot,
  now: () => Date,
): Promise<MabAcquisitionResult> {
  const startedAt = now().toISOString();
  const memory = createRawMabMemory(evidence.documents);
  await writePrivateJson(
    join(options.artifactDirectory, "memory.json"),
    { schemaVersion: 1, records: memory },
  );
  return {
    report: {
      status: "completed",
      startedAt,
      completedAt: now().toISOString(),
      chunks: options.stream.chunks.length,
      completedChunks: options.stream.chunks.length,
      memoryRecords: memory.length,
      memorySha256: memoryDigest(memory),
      evidenceDocuments: evidence.documents.length,
      evidenceSha256: evidence.sha256,
      telemetry: zeroTelemetry(options.model),
      telemetryComplete: true,
    },
    memory,
  };
}

async function acquireAdvisory(
  options: MabConditionOptions,
  evidence: MabEvidenceSnapshot,
  now: () => Date,
): Promise<MabAcquisitionResult> {
  const startedAt = now().toISOString();
  const telemetry: ExecutionTelemetry[] = [];
  const memory: MemoryDraft[] = [];
  let completedChunks = 0;
  try {
    const executors = await options.createExecutors({
      condition: options.condition,
      stage: "acquisition",
      streamId: options.stream.id,
      repetition: options.repetition,
      artifactDirectory: options.artifactDirectory,
    });
    for (const [index, document] of evidence.documents.entries()) {
      const execution = await executors.advisoryMemoryExecutor.execute(
        acquisitionTask(options.stream, document, index),
        memory,
        "acquire",
        [document],
      );
      assertMabEvidenceCitations(
        execution.memoryCandidates,
        [document],
        "advisory acquisition memory",
      );
      telemetry.push(execution.telemetry);
      memory.push(...structuredClone(execution.memoryCandidates));
      completedChunks += 1;
    }
    await writePrivateJson(
      join(options.artifactDirectory, "memory.json"),
      { schemaVersion: 1, records: memory },
    );
    return {
      report: {
        status: "completed",
        startedAt,
        completedAt: now().toISOString(),
        chunks: options.stream.chunks.length,
        completedChunks,
        memoryRecords: memory.length,
        memorySha256: memoryDigest(memory),
        evidenceDocuments: evidence.documents.length,
        evidenceSha256: evidence.sha256,
        telemetry: combineTelemetry(telemetry, options.model),
        telemetryComplete: true,
      },
      memory,
    };
  } catch (error) {
    return {
      report: {
        status: "error",
        startedAt,
        completedAt: now().toISOString(),
        chunks: options.stream.chunks.length,
        completedChunks,
        memoryRecords: memory.length,
        ...(memory.length > 0 ? { memorySha256: memoryDigest(memory) } : {}),
        evidenceDocuments: evidence.documents.length,
        evidenceSha256: evidence.sha256,
        telemetry: combineTelemetry(
          [
            ...telemetry,
            collectErrorTelemetry(error, options.model),
          ],
          options.model,
        ),
        telemetryComplete: false,
        error: errorDetails(error),
      },
      memory,
    };
  }
}

async function acquireCortex(
  options: MabConditionOptions,
  evidence: MabEvidenceSnapshot,
  now: () => Date,
): Promise<MabAcquisitionResult> {
  const startedAt = now().toISOString();
  const sessions: SessionRunResult[] = [];
  const directory = join(options.artifactDirectory, "acquisition");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const store = new AtomicMemoryStore(join(directory, "memory.json"), now);
  const events = new JsonlEventSink(join(directory, "lifecycle.jsonl"));
  let controller: LifecycleController | undefined;
  try {
    const executors = await options.createExecutors({
      condition: options.condition,
      stage: "acquisition",
      streamId: options.stream.id,
      repetition: options.repetition,
      artifactDirectory: directory,
    });
    controller = new LifecycleController(
      executors.phaseExecutor,
      store,
      events,
      now,
    );
    for (const [index, document] of evidence.documents.entries()) {
      sessions.push(
        await controller.runSession(
          acquisitionTask(options.stream, document, index),
          {
            mountedMemory: await store.active(),
            evidence: [document],
            workMemory: "complete-mounted",
          },
        ),
      );
    }
    const memory = recordsToDrafts(await store.active());
    return {
      report: {
        status: "completed",
        startedAt,
        completedAt: now().toISOString(),
        chunks: options.stream.chunks.length,
        completedChunks: sessions.length,
        memoryRecords: memory.length,
        memorySha256: memoryDigest(memory),
        evidenceDocuments: evidence.documents.length,
        evidenceSha256: evidence.sha256,
        telemetry: sessionTelemetry(sessions, options.model),
        telemetryComplete: true,
      },
      memory,
    };
  } catch (error) {
    const memory = recordsToDrafts(await store.active().catch(() => []));
    return {
      report: {
        status: "error",
        startedAt,
        completedAt: now().toISOString(),
        chunks: options.stream.chunks.length,
        completedChunks: sessions.length,
        memoryRecords: memory.length,
        ...(memory.length > 0 ? { memorySha256: memoryDigest(memory) } : {}),
        evidenceDocuments: evidence.documents.length,
        evidenceSha256: evidence.sha256,
        telemetry: combineTelemetry(
          [
            sessionTelemetry(sessions, options.model),
            collectErrorTelemetry(error, options.model),
          ],
          options.model,
        ),
        telemetryComplete: false,
        error: errorDetails(error),
      },
      memory,
    };
  }
}

export async function acquireMabMemory(
  options: MabConditionOptions,
  evidence: MabEvidenceSnapshot,
  now: () => Date,
): Promise<MabAcquisitionResult> {
  if (options.condition === "regular") {
    return acquireRegular(options, evidence, now);
  }
  if (options.condition === "advisory") {
    return acquireAdvisory(options, evidence, now);
  }
  return acquireCortex(options, evidence, now);
}

function retrievalReport(
  query: string,
  topK: number,
  matches: readonly MabEvidenceMatch[],
): MabQuestionReport["retrieval"] {
  return {
    query,
    topK,
    documents: matches.map(({ document, score }) => ({
      id: document.id,
      path: document.path,
      sha256: document.sha256,
      score,
    })),
  };
}

async function initializeCortexQuestionStore(
  sourcePath: string,
  destinationPath: string,
  expectedMemory: readonly MemoryDraft[],
  now: () => Date,
): Promise<AtomicMemoryStore> {
  try {
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    await chmod(destinationPath, 0o600);
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") {
      throw error;
    }
    if (expectedMemory.length > 0) {
      throw new Error("persisted Cortex acquisition memory is missing");
    }
    await writePrivateJson(destinationPath, {
      schemaVersion: 1,
      records: [],
    });
  }
  const store = new AtomicMemoryStore(destinationPath, now);
  const clonedMemory = recordsToDrafts(await store.active());
  const expectedSha256 = memoryDigest(expectedMemory);
  const actualSha256 = memoryDigest(clonedMemory);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      "cloned Cortex acquisition memory does not match its persisted digest",
    );
  }
  return store;
}

async function evaluateQuestion(
  options: MabConditionOptions,
  question: MabQuestion,
  memory: readonly MemoryDraft[],
  evidence: MabEvidenceSnapshot,
  now: () => Date,
): Promise<MabQuestionReport> {
  const startedAt = now().toISOString();
  const directory = join(
    options.artifactDirectory,
    "questions",
    question.id.replaceAll(/[^A-Za-z0-9._-]/g, "_"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const matches = retrieveMabEvidence(
    evidence.documents,
    question.retrievalQuery,
    options.evidenceTopK,
  );
  const retrievedEvidence = matches.map((match) => match.document);
  const retrieval = retrievalReport(
    question.retrievalQuery,
    options.evidenceTopK,
    matches,
  );
  const evaluationMemory =
    options.condition === "regular" ? [] : memory;
  try {
    const executors = await options.createExecutors({
      condition: options.condition,
      stage: "evaluation",
      streamId: options.stream.id,
      repetition: options.repetition,
      questionId: question.id,
      artifactDirectory: directory,
    });
    let output: string;
    let telemetry: ExecutionTelemetry;
    let memoryRecordsAfter = evaluationMemory.length;
    if (options.condition === "regular") {
      const execution = await executors.directMemoryExecutor.execute(
        question.prompt,
        evaluationMemory,
        retrievedEvidence,
      );
      output = execution.output;
      telemetry = execution.telemetry;
    } else if (options.condition === "advisory") {
      const execution = await executors.advisoryMemoryExecutor.execute(
        question.prompt,
        memory,
        "answer",
        retrievedEvidence,
      );
      assertMabEvidenceCitations(
        execution.memoryCandidates,
        retrievedEvidence,
        "advisory evaluation memory",
      );
      output = execution.output;
      telemetry = execution.telemetry;
    } else {
      const store = await initializeCortexQuestionStore(
        join(options.artifactDirectory, "acquisition", "memory.json"),
        join(directory, "memory.json"),
        memory,
        now,
      );
      const controller = new LifecycleController(
        executors.phaseExecutor,
        store,
        new JsonlEventSink(join(directory, "lifecycle.jsonl")),
        now,
      );
      const execution = await controller.runSession(question.prompt, {
        mountedMemory: await store.active(),
        evidence: retrievedEvidence,
        sleepWrites: "prohibit-unconfirmed",
        workMemory: "wake-selected",
      });
      output = execution.output;
      telemetry = sessionTelemetry([execution], options.model);
      memoryRecordsAfter = (await store.active()).length;
    }
    return {
      questionId: question.id,
      status: "completed",
      startedAt,
      completedAt: now().toISOString(),
      output,
      correct: options.score(output, question),
      memoryRecordsBefore: evaluationMemory.length,
      memoryRecordsAfter,
      memoryGrowth: memoryRecordsAfter - evaluationMemory.length,
      retrieval,
      telemetry,
      telemetryComplete: true,
    };
  } catch (error) {
    return {
      questionId: question.id,
      status: "error",
      startedAt,
      completedAt: now().toISOString(),
      correct: false,
      memoryRecordsBefore: evaluationMemory.length,
      memoryRecordsAfter: evaluationMemory.length,
      memoryGrowth: 0,
      retrieval,
      telemetry: collectErrorTelemetry(error, options.model),
      telemetryComplete: false,
      error: errorDetails(error),
    };
  }
}

export async function runMabCondition(
  options: MabConditionOptions,
): Promise<MabConditionReport> {
  if (!Number.isInteger(options.repetition) || options.repetition < 1) {
    throw new Error("repetition must be a positive integer");
  }
  if (options.stream.questions.length === 0) {
    throw new Error("stream must contain at least one question");
  }
  if (!Number.isInteger(options.evidenceTopK) || options.evidenceTopK < 1) {
    throw new Error("evidenceTopK must be a positive integer");
  }
  const now = options.now ?? (() => new Date());
  const artifactDirectory = resolve(options.artifactDirectory);
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const startedAt = now().toISOString();
  let acquisition: MabAcquisitionResult;
  let evidence: MabEvidenceSnapshot | undefined;
  try {
    evidence = await persistMabEvidence(artifactDirectory, options.stream);
    acquisition = await acquireMabMemory(
      { ...options, artifactDirectory },
      evidence,
      now,
    );
  } catch (error) {
    acquisition = {
      report: {
        status: "error",
        startedAt,
        completedAt: now().toISOString(),
        chunks: options.stream.chunks.length,
        completedChunks: 0,
        memoryRecords: 0,
        evidenceDocuments: evidence?.documents.length ?? 0,
        ...(evidence ? { evidenceSha256: evidence.sha256 } : {}),
        telemetry: collectErrorTelemetry(error, options.model),
        telemetryComplete: false,
        error: errorDetails(error),
      },
      memory: [],
    };
  }
  if (acquisition.report.status === "completed") {
    try {
      evidence = await loadMabEvidence(artifactDirectory, options.stream);
      acquisition.memory = await readPersistedMemory(
        { ...options, artifactDirectory },
        now,
      );
      assertMabEvidenceCitations(
        acquisition.memory,
        evidence.documents,
        "persisted acquisition memory",
      );
    } catch (error) {
      acquisition.report = {
        ...acquisition.report,
        status: "error",
        completedAt: now().toISOString(),
        telemetry: combineTelemetry(
          [
            acquisition.report.telemetry,
            collectErrorTelemetry(error, options.model),
          ],
          options.model,
        ),
        telemetryComplete: false,
        error: errorDetails(error),
      };
      acquisition.memory = [];
    }
  }
  const questions: MabQuestionReport[] = [];
  if (acquisition.report.status === "completed") {
    for (const question of options.stream.questions) {
      questions.push(
        await evaluateQuestion(
          { ...options, artifactDirectory },
          question,
          acquisition.memory,
          evidence!,
          now,
        ),
      );
    }
  } else {
    for (const question of options.stream.questions) {
      const timestamp = now().toISOString();
      questions.push({
        questionId: question.id,
        status: "error",
        startedAt: timestamp,
        completedAt: timestamp,
        correct: false,
        memoryRecordsBefore: acquisition.memory.length,
        memoryRecordsAfter: acquisition.memory.length,
        memoryGrowth: 0,
        retrieval: {
          query: question.retrievalQuery,
          topK: options.evidenceTopK,
          documents: [],
        },
        telemetry: zeroTelemetry(options.model),
        telemetryComplete: false,
        error: {
          name: "AcquisitionError",
          message: "question not run because acquisition failed",
        },
      });
    }
  }
  const completedQuestions = questions.filter(
    (question) => question.status === "completed",
  ).length;
  const correct = questions.filter((question) => question.correct).length;
  const errors = questions.length - completedQuestions;
  const report: MabConditionReport = {
    schemaVersion: 2,
    streamId: options.stream.id,
    source: options.stream.source,
    competency: options.stream.competency,
    stratum: options.stream.stratum,
    condition: options.condition,
    repetition: options.repetition,
    status:
      acquisition.report.status === "completed" && errors === 0
        ? "completed"
        : "error",
    startedAt,
    completedAt: now().toISOString(),
    artifactDirectory,
    acquisition: acquisition.report,
    questions,
    totalQuestions: questions.length,
    completedQuestions,
    correct,
    accuracy: questions.length === 0 ? 0 : correct / questions.length,
    errors,
    telemetry: combineTelemetry(
      [
        acquisition.report.telemetry,
        ...questions.map((question) => question.telemetry),
      ],
      options.model,
    ),
  };
  await writePrivateJson(join(artifactDirectory, "report.json"), report);
  return report;
}
