import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { getEncoding } from "js-tiktoken";

export const MAB_DATASET_REVISION =
  "7ea066982b140a19337e17e60d45d4076e042faf";
export const MAB_DATASET_REPOSITORY = "ai-hyz/MemoryAgentBench";
export const MAB_CHUNK_TOKEN_LIMIT = 4096;

export const MAB_SELECTED_SOURCES = [
  "icl_banking77_5900shot_balance",
  "factconsolidation_mh_6k",
  "factconsolidation_mh_32k",
  "factconsolidation_sh_6k",
  "factconsolidation_sh_32k",
] as const;

export type MabSource = (typeof MAB_SELECTED_SOURCES)[number];
export type MabSplit = "Test_Time_Learning" | "Conflict_Resolution";
export type MabTask = "test-time-learning" | "fact-consolidation";
export type MabStratum = "banking77" | "6k" | "32k";
export type MabHop = "single-hop" | "multi-hop" | null;
export type MabMetric = "exact_match" | "substring_exact_match";

export interface MabParquetDescriptor {
  split: MabSplit;
  path: string;
  sha256: string;
}

export const MAB_PARQUET_FILES: Readonly<
  Record<MabSplit, MabParquetDescriptor>
> = {
  Test_Time_Learning: {
    split: "Test_Time_Learning",
    path: "data/Test_Time_Learning-00000-of-00001.parquet",
    sha256:
      "5338753be48f925d03318eed66117286e3489025fabe050a547bd086cd7d79c0",
  },
  Conflict_Resolution: {
    split: "Conflict_Resolution",
    path: "data/Conflict_Resolution-00000-of-00001.parquet",
    sha256:
      "24d5c3f09ce0ce15625cb9f8a98f44f0d864ca6c94d7b4ad04eb697ca3a5ff45",
  },
};

export interface MabRowMetadata {
  source: string;
  qa_pair_ids: string[];
  [key: string]: unknown;
}

export interface MabDatasetRow {
  context: string;
  questions: string[];
  answers: string[][];
  metadata: MabRowMetadata;
}

export interface MabPreparedStream {
  source: MabSource;
  task: MabTask;
  stratum: MabStratum;
  hop: MabHop;
  contextHash: string;
  chunks: string[];
  questions: string[];
  answers: string[][];
  qaPairIds: string[];
}

export interface MabSelectedQuestion {
  source: MabSource;
  task: MabTask;
  stratum: MabStratum;
  hop: MabHop;
  contextHash: string;
  questionIndex: number;
  question: string;
  answers: string[];
  qaPairId: string;
  metric: MabMetric;
  prompt: string;
}

export interface MabScore {
  metric: MabMetric;
  score: 0 | 1;
  rawScore: 0 | 1;
  parsedScore: 0 | 1;
  parsedOutput: string;
}

export interface CacheMabParquetOptions {
  cacheDirectory: string;
  split: MabSplit;
  fetchImpl?: typeof globalThis.fetch;
}

export interface LoadMabOptions {
  cacheDirectory: string;
  fetchImpl?: typeof globalThis.fetch;
  maxChunkTokens?: number;
}

interface MabSourceDescriptor {
  task: MabTask;
  stratum: MabStratum;
  hop: MabHop;
}

const MAB_SOURCE_DESCRIPTORS: Readonly<
  Record<MabSource, MabSourceDescriptor>
> = {
  icl_banking77_5900shot_balance: {
    task: "test-time-learning",
    stratum: "banking77",
    hop: null,
  },
  factconsolidation_mh_6k: {
    task: "fact-consolidation",
    stratum: "6k",
    hop: "multi-hop",
  },
  factconsolidation_mh_32k: {
    task: "fact-consolidation",
    stratum: "32k",
    hop: "multi-hop",
  },
  factconsolidation_sh_6k: {
    task: "fact-consolidation",
    stratum: "6k",
    hop: "single-hop",
  },
  factconsolidation_sh_32k: {
    task: "fact-consolidation",
    stratum: "32k",
    hop: "single-hop",
  },
};

const MAB_SPLITS = [
  "Test_Time_Learning",
  "Conflict_Resolution",
] as const satisfies readonly MabSplit[];
const ROW_COLUMNS = ["answers", "context", "metadata", "questions"] as const;
const TOKENIZER = getEncoding("o200k_base");
const ASCII_PUNCTUATION = new Set(
  "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, location: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${location} must be an array of strings`);
  }
  return [...value];
}

function answerGroups(value: unknown, location: string): string[][] {
  if (!Array.isArray(value)) {
    throw new Error(`${location} must be an array`);
  }
  return value.map((entry, index) => {
    const answers = stringArray(entry, `${location}[${index}]`);
    if (answers.length === 0 || answers.some((answer) => answer.length === 0)) {
      throw new Error(`${location}[${index}] must contain a non-empty answer`);
    }
    return answers;
  });
}

export function isMabSource(value: string): value is MabSource {
  return (MAB_SELECTED_SOURCES as readonly string[]).includes(value);
}

function sourceDescriptor(source: MabSource): MabSourceDescriptor {
  return MAB_SOURCE_DESCRIPTORS[source];
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function digest(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function writePrivateAtomic(path: string, data: Uint8Array): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function pinnedParquetUrl(descriptor: MabParquetDescriptor): string {
  return (
    `https://huggingface.co/datasets/${MAB_DATASET_REPOSITORY}/resolve/` +
    `${MAB_DATASET_REVISION}/${descriptor.path}?download=true`
  );
}

export async function sha256MabFile(path: string): Promise<string> {
  return digest(await readFile(path));
}

export async function verifyMabParquetSha256(
  path: string,
  expectedSha256: string,
): Promise<void> {
  const actualSha256 = await sha256MabFile(path);
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(
      `MemoryAgentBench parquet SHA-256 mismatch for ${path}: ` +
        `expected ${expectedSha256}, received ${actualSha256}`,
    );
  }
}

export async function cachePinnedMabParquet(
  options: CacheMabParquetOptions,
): Promise<string> {
  const descriptor = MAB_PARQUET_FILES[options.split];
  const revisionDirectory = join(
    resolve(options.cacheDirectory),
    MAB_DATASET_REVISION,
  );
  await privateDirectory(resolve(options.cacheDirectory));
  await privateDirectory(revisionDirectory);
  const path = join(revisionDirectory, basename(descriptor.path));

  try {
    const file = await stat(path);
    if (file.isFile() && (await sha256MabFile(path)) === descriptor.sha256) {
      await chmod(path, 0o600);
      return path;
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to download MemoryAgentBench");
  }
  const response = await fetchImpl(pinnedParquetUrl(descriptor));
  if (!response.ok) {
    throw new Error(
      `Failed to download MemoryAgentBench ${options.split}: ` +
        `${response.status} ${response.statusText}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = digest(bytes);
  if (actualSha256 !== descriptor.sha256) {
    throw new Error(
      `MemoryAgentBench parquet SHA-256 mismatch for ${options.split}: ` +
        `expected ${descriptor.sha256}, received ${actualSha256}`,
    );
  }
  await writePrivateAtomic(path, bytes);
  await verifyMabParquetSha256(path, descriptor.sha256);
  return path;
}

export function validateMabRow(value: unknown, rowIndex = 0): MabDatasetRow {
  const location = `MemoryAgentBench row ${rowIndex}`;
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object`);
  }
  const columns = Object.keys(value).sort();
  if (
    columns.length !== ROW_COLUMNS.length ||
    columns.some((column, index) => column !== ROW_COLUMNS[index])
  ) {
    throw new Error(
      `${location} must contain exactly the columns ` +
        "context, questions, answers, metadata",
    );
  }
  if (typeof value.context !== "string" || value.context.length === 0) {
    throw new Error(`${location}.context must be a non-empty string`);
  }
  const questions = stringArray(value.questions, `${location}.questions`);
  const answers = answerGroups(value.answers, `${location}.answers`);
  if (!isRecord(value.metadata)) {
    throw new Error(`${location}.metadata must be an object`);
  }
  if (typeof value.metadata.source !== "string") {
    throw new Error(`${location}.metadata.source must be a string`);
  }
  const qaPairIds = stringArray(
    value.metadata.qa_pair_ids,
    `${location}.metadata.qa_pair_ids`,
  );
  if (
    questions.length === 0 ||
    questions.length !== answers.length ||
    questions.length !== qaPairIds.length
  ) {
    throw new Error(
      `${location} questions, answers, and metadata.qa_pair_ids ` +
        "must have the same non-zero length",
    );
  }
  return {
    context: value.context,
    questions,
    answers,
    metadata: {
      ...value.metadata,
      source: value.metadata.source,
      qa_pair_ids: qaPairIds,
    },
  };
}

export async function parseMabParquet(path: string): Promise<MabDatasetRow[]> {
  const file = await asyncBufferFromFile(path);
  const parsed: unknown = await parquetReadObjects({ file });
  if (!Array.isArray(parsed)) {
    throw new Error(`MemoryAgentBench parquet ${path} did not contain rows`);
  }
  return parsed.map((row, index) => validateMabRow(row, index));
}

export async function loadPinnedMabRows(
  options: Omit<LoadMabOptions, "maxChunkTokens">,
): Promise<MabDatasetRow[]> {
  const rows: MabDatasetRow[] = [];
  for (const split of MAB_SPLITS) {
    const path = await cachePinnedMabParquet({
      cacheDirectory: options.cacheDirectory,
      split,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    rows.push(...(await parseMabParquet(path)));
  }
  return rows;
}

export function countMabTokens(text: string): number {
  return TOKENIZER.encode(text).length;
}

function splitOversizedUnit(unit: string, maxTokens: number): string[] {
  const tokens = TOKENIZER.encode(unit);
  if (tokens.length <= maxTokens) {
    return [unit];
  }
  const parts: string[] = [];
  for (let index = 0; index < tokens.length; index += maxTokens) {
    parts.push(TOKENIZER.decode(tokens.slice(index, index + maxTokens)));
  }
  return parts;
}

function packSemanticUnits(
  units: readonly string[],
  separator: string,
  maxTokens: number,
): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    for (const part of splitOversizedUnit(unit, maxTokens)) {
      const candidate = current.length === 0 ? part : `${current}${separator}${part}`;
      if (countMabTokens(candidate) <= maxTokens) {
        current = candidate;
      } else {
        if (current.length > 0) {
          chunks.push(current);
        }
        current = part;
      }
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function semanticContextUnits(
  source: MabSource,
  context: string,
): { units: string[]; separator: string } {
  if (source === "icl_banking77_5900shot_balance") {
    return {
      units: context
        .trim()
        .split(/\r?\n[ \t]*\r?\n+/)
        .map((unit) => unit.trim())
        .filter((unit) => unit.length > 0),
      separator: "\n\n",
    };
  }
  return {
    units: context
      .trim()
      .split(/\r?\n/)
      .map((unit) => unit.trim())
      .filter((unit) => unit.length > 0),
    separator: "\n",
  };
}

export function chunkMabContext(
  source: MabSource,
  context: string,
  maxTokens = MAB_CHUNK_TOKEN_LIMIT,
): string[] {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new Error("maxTokens must be a positive integer");
  }
  const semantic = semanticContextUnits(source, context);
  const chunks = packSemanticUnits(
    semantic.units,
    semantic.separator,
    maxTokens,
  );
  if (chunks.some((chunk) => countMabTokens(chunk) > maxTokens)) {
    throw new Error("MemoryAgentBench chunk exceeded its token limit");
  }
  return chunks;
}

export function hashMabContext(context: string): string {
  return digest(context);
}

export function flattenMabAnswers(value: readonly unknown[]): string[] {
  const flattened: string[] = [];
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      flattened.push(entry);
      return;
    }
    if (!Array.isArray(entry)) {
      throw new Error("MemoryAgentBench answers may only contain strings or arrays");
    }
    for (const nested of entry) {
      visit(nested);
    }
  };
  for (const entry of value) {
    visit(entry);
  }
  return flattened;
}

export function filterSelectedMabRows(
  rows: readonly unknown[],
): MabDatasetRow[] {
  return rows
    .map((row, index) => validateMabRow(row, index))
    .filter((row) => isMabSource(row.metadata.source));
}

export function prepareMabStreams(
  rows: readonly unknown[],
  maxChunkTokens = MAB_CHUNK_TOKEN_LIMIT,
): MabPreparedStream[] {
  const selected = filterSelectedMabRows(rows);
  const bySource = new Map<MabSource, MabDatasetRow>();
  for (const row of selected) {
    const source = row.metadata.source;
    if (!isMabSource(source)) {
      continue;
    }
    if (bySource.has(source)) {
      throw new Error(`Duplicate MemoryAgentBench stream for source ${source}`);
    }
    bySource.set(source, row);
  }
  return MAB_SELECTED_SOURCES.flatMap((source) => {
    const row = bySource.get(source);
    if (!row) {
      return [];
    }
    const descriptor = sourceDescriptor(source);
    return [
      {
        source,
        task: descriptor.task,
        stratum: descriptor.stratum,
        hop: descriptor.hop,
        contextHash: hashMabContext(row.context),
        chunks: chunkMabContext(source, row.context, maxChunkTokens),
        questions: [...row.questions],
        answers: row.answers.map((answers) => [...answers]),
        qaPairIds: [...row.metadata.qa_pair_ids],
      },
    ];
  });
}

export async function loadPreparedMabStreams(
  options: LoadMabOptions,
): Promise<MabPreparedStream[]> {
  const rows = await loadPinnedMabRows(options);
  return prepareMabStreams(
    rows,
    options.maxChunkTokens ?? MAB_CHUNK_TOKEN_LIMIT,
  );
}

function evenlySpacedIndices(length: number, count: number): number[] {
  if (count >= length) {
    return Array.from({ length }, (_, index) => index);
  }
  if (count === 1) {
    return [0];
  }
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / (count - 1)),
  );
}

export function selectMabQuestions(
  streams: readonly MabPreparedStream[],
  countPerStream: number,
): MabSelectedQuestion[] {
  if (!Number.isInteger(countPerStream) || countPerStream < 0) {
    throw new Error("countPerStream must be a non-negative integer");
  }
  return streams.flatMap((stream) =>
    evenlySpacedIndices(stream.questions.length, countPerStream).map(
      (questionIndex) => ({
        source: stream.source,
        task: stream.task,
        stratum: stream.stratum,
        hop: stream.hop,
        contextHash: stream.contextHash,
        questionIndex,
        question: stream.questions[questionIndex]!,
        answers: [...stream.answers[questionIndex]!],
        qaPairId: stream.qaPairIds[questionIndex]!,
        metric: mabMetricForSource(stream.source),
        prompt: formatMabQueryPrompt(
          stream.source,
          stream.questions[questionIndex]!,
        ),
      }),
    ),
  );
}

export function formatMabQueryPrompt(
  source: MabSource,
  question: string,
): string {
  const normalizedQuestion = question.trim();
  if (source === "icl_banking77_5900shot_balance") {
    return (
      "Use the provided mapping from the context to numerical label to assign a numerical label to the context. Return only the numeric label continuation, without a label prefix or any other text. " +
      `\n\n${normalizedQuestion}`
    );
  }
  return (
    "Pretend you are a knowledge management system. Each fact in the knowledge pool is provided with a serial number at the beginning, and the newer fact has larger serial number. \n" +
    " You need to solve the conflicts of facts in the knowledge pool by finding the newest fact with larger serial number. You need to answer a question based on this rule. You should give a very concise answer without saying other words for the question **only** from the knowledge pool you have memorized rather than the real facts in real world. \n\n" +
    "For example:\n\n [Knowledge Pool] \n\n Question: Based on the provided Knowledge Pool, what is the name of the current president of Russia? \n" +
    "Answer: Donald Trump \n\n Now Answer the Question: Based on the provided Knowledge Pool, " +
    `${normalizedQuestion} \nAnswer:`
  );
}

export function normalizeMabAnswer(value: string): string {
  const withoutPunctuation = [...value.toLowerCase()]
    .filter((character) => !ASCII_PUNCTUATION.has(character))
    .join("");
  return withoutPunctuation
    .replace(/\b(?:a|an|the)\b/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseMabOutput(
  output: string,
  answerPrefix = "Answer:",
): string {
  const escapedPrefix = answerPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixed = new RegExp(
    `(?:${escapedPrefix})(.*)(?:\\r?\\n|$)`,
    "i",
  ).exec(output);
  const extracted = prefixed?.[1] ?? /^(.*)(?:\r?\n|$)/.exec(output)?.[1] ?? "";
  return extracted
    .trim()
    .replace(new RegExp(`^${escapedPrefix}`, "i"), "")
    .trim();
}

export function exactMabMatch(
  prediction: string,
  groundTruth: string,
): boolean {
  return normalizeMabAnswer(prediction) === normalizeMabAnswer(groundTruth);
}

export function substringExactMabMatch(
  prediction: string,
  groundTruth: string,
): boolean {
  return normalizeMabAnswer(prediction).includes(
    normalizeMabAnswer(groundTruth),
  );
}

export function mabMetricForSource(source: MabSource): MabMetric {
  return source === "icl_banking77_5900shot_balance"
    ? "exact_match"
    : "substring_exact_match";
}

export function scoreMabOutput(
  source: MabSource,
  output: string,
  answers: readonly unknown[],
): MabScore {
  const groundTruths = flattenMabAnswers(answers);
  if (
    groundTruths.length === 0 ||
    groundTruths.some((answer) => answer.length === 0)
  ) {
    throw new Error("At least one non-empty MemoryAgentBench answer is required");
  }
  const metric = mabMetricForSource(source);
  const scorePrediction =
    metric === "exact_match" ? exactMabMatch : substringExactMabMatch;
  const parsedOutput = parseMabOutput(output);
  const rawScore = groundTruths.some((answer) => scorePrediction(output, answer))
    ? 1
    : 0;
  const parsedScore = groundTruths.some((answer) =>
    scorePrediction(parsedOutput, answer),
  )
    ? 1
    : 0;
  return {
    metric,
    score:
      source === "icl_banking77_5900shot_balance"
        ? parsedScore
        : rawScore === 1 || parsedScore === 1
          ? 1
          : 0,
    rawScore,
    parsedScore,
    parsedOutput,
  };
}
