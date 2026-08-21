import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { writePrivateJsonExclusive } from "./artifacts.js";

export const LONGMEMEVAL_DATASET = {
  repository: "https://github.com/xiaowu0162/LongMemEval",
  dataset: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned",
  revision: "98d7416c24c778c2fee6e6f3006e7a073259d48f",
  license: "MIT",
} as const;

export const LONGMEMEVAL_QUESTION_TYPES = [
  "single-session-user",
  "single-session-assistant",
  "single-session-preference",
  "temporal-reasoning",
  "knowledge-update",
  "multi-session",
] as const;

export const LONGMEMEVAL_STRATA = [
  ...LONGMEMEVAL_QUESTION_TYPES,
  "abstention",
] as const;

export type LongMemEvalQuestionType =
  (typeof LONGMEMEVAL_QUESTION_TYPES)[number];
export type LongMemEvalStratum = (typeof LONGMEMEVAL_STRATA)[number];

export interface LongMemEvalTurn {
  role: "user" | "assistant";
  content: string;
  has_answer?: boolean;
}

export interface LongMemEvalItem {
  question_id: string;
  question_type: LongMemEvalQuestionType;
  question: string;
  answer: string;
  question_date: string;
  haystack_session_ids: string[];
  haystack_dates: string[];
  haystack_sessions: LongMemEvalTurn[][];
  answer_session_ids: string[];
}

export interface LongMemEvalSourceEvidence {
  file: string;
  bytes: number;
  sha256: string;
  itemCount: number;
}

export interface LongMemEvalPreparedItem {
  stratum: LongMemEvalStratum;
  history: LongMemEvalItem;
  oracle: LongMemEvalItem;
}

export interface LongMemEvalPreparedItemReference {
  questionId: string;
  questionType: LongMemEvalQuestionType;
  stratum: LongMemEvalStratum;
  file: string;
  sha256: string;
}

export interface LongMemEvalPilotManifest {
  schemaVersion: 1;
  benchmark: "longmemeval-cleaned";
  createdAt: string;
  dataset: typeof LONGMEMEVAL_DATASET;
  seed: string;
  itemsPerStratum: number;
  strata: LongMemEvalStratum[];
  historySource: LongMemEvalSourceEvidence;
  oracleSource: LongMemEvalSourceEvidence;
  items: LongMemEvalPreparedItemReference[];
}

export interface LoadedLongMemEvalPilot {
  directory: string;
  manifest: LongMemEvalPilotManifest;
  manifestSha256: string;
  items: LongMemEvalPreparedItem[];
}

export interface PrepareLongMemEvalPilotOptions {
  historyPath: string;
  oraclePath: string;
  outputDirectory: string;
  itemsPerStratum: number;
  seed: string;
  strata?: readonly LongMemEvalStratum[];
  now?: () => Date;
}

interface StreamArrayItem {
  key: number;
  value: unknown;
}

interface RankedItem {
  rank: string;
  item: LongMemEvalItem;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  itemLabel: string,
): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${itemLabel}.${field} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(
  record: Record<string, unknown>,
  field: string,
  itemLabel: string,
): string[] {
  const value = record[field];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`${itemLabel}.${field} must be an array of non-empty strings`);
  }
  return [...value];
}

function requireAnswer(
  record: Record<string, unknown>,
  itemLabel: string,
): string {
  const value = record.answer;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new Error(`${itemLabel}.answer must be a non-empty string or number`);
}

function requireQuestionType(
  value: string,
  itemLabel: string,
): LongMemEvalQuestionType {
  if (!isLongMemEvalQuestionType(value)) {
    throw new Error(`${itemLabel}.question_type is unsupported: ${value}`);
  }
  return value;
}

function isLongMemEvalQuestionType(
  value: string,
): value is LongMemEvalQuestionType {
  return (LONGMEMEVAL_QUESTION_TYPES as readonly string[]).includes(value);
}

function requireSessions(
  record: Record<string, unknown>,
  itemLabel: string,
): LongMemEvalTurn[][] {
  const sessions = record.haystack_sessions;
  if (!Array.isArray(sessions)) {
    throw new Error(`${itemLabel}.haystack_sessions must be an array`);
  }
  return sessions.map((session, sessionIndex) => {
    if (!Array.isArray(session)) {
      throw new Error(
        `${itemLabel}.haystack_sessions[${sessionIndex}] must be an array`,
      );
    }
    return session.map((turn, turnIndex) => {
      if (!isRecord(turn)) {
        throw new Error(
          `${itemLabel}.haystack_sessions[${sessionIndex}][${turnIndex}] must be an object`,
        );
      }
      const role = requireString(
        turn,
        "role",
        `${itemLabel}.haystack_sessions[${sessionIndex}][${turnIndex}]`,
      );
      if (role !== "user" && role !== "assistant") {
        throw new Error(
          `${itemLabel}.haystack_sessions[${sessionIndex}][${turnIndex}].role is unsupported: ${role}`,
        );
      }
      const content = turn.content;
      if (typeof content !== "string") {
        throw new Error(
          `${itemLabel}.haystack_sessions[${sessionIndex}][${turnIndex}].content must be a string`,
        );
      }
      const hasAnswer = turn.has_answer;
      if (hasAnswer !== undefined && typeof hasAnswer !== "boolean") {
        throw new Error(
          `${itemLabel}.haystack_sessions[${sessionIndex}][${turnIndex}].has_answer must be boolean when present`,
        );
      }
      return {
        role,
        content,
        ...(typeof hasAnswer === "boolean"
          ? { has_answer: hasAnswer }
          : {}),
      };
    });
  });
}

export function parseLongMemEvalItem(
  value: unknown,
  itemIndex: number,
): LongMemEvalItem {
  const itemLabel = `item[${itemIndex}]`;
  if (!isRecord(value)) {
    throw new Error(`${itemLabel} must be an object`);
  }
  const questionId = requireString(value, "question_id", itemLabel);
  const questionType = requireQuestionType(
    requireString(value, "question_type", itemLabel),
    itemLabel,
  );
  const sessionIds = requireStringArray(
    value,
    "haystack_session_ids",
    itemLabel,
  );
  const dates = requireStringArray(value, "haystack_dates", itemLabel);
  const sessions = requireSessions(value, itemLabel);
  if (sessionIds.length !== dates.length || sessionIds.length !== sessions.length) {
    throw new Error(
      `${itemLabel} haystack session IDs, dates, and sessions must have equal lengths`,
    );
  }
  const answerSessionIds = requireStringArray(
    value,
    "answer_session_ids",
    itemLabel,
  );
  const knownSessionIds = new Set(sessionIds);
  if (new Set(answerSessionIds).size !== answerSessionIds.length) {
    throw new Error(`${itemLabel}.answer_session_ids contains duplicates`);
  }
  const unknownAnswerIds = answerSessionIds.filter(
    (sessionId) => !knownSessionIds.has(sessionId),
  );
  if (unknownAnswerIds.length > 0) {
    throw new Error(
      `${itemLabel}.answer_session_ids contains unknown sessions: ${unknownAnswerIds.join(", ")}`,
    );
  }
  return {
    question_id: questionId,
    question_type: questionType,
    question: requireString(value, "question", itemLabel),
    answer: requireAnswer(value, itemLabel),
    question_date: requireString(value, "question_date", itemLabel),
    haystack_session_ids: sessionIds,
    haystack_dates: dates,
    haystack_sessions: sessions,
    answer_session_ids: answerSessionIds,
  };
}

function isStreamArrayItem(value: unknown): value is StreamArrayItem {
  return (
    isRecord(value) &&
    typeof value.key === "number" &&
    Object.hasOwn(value, "value")
  );
}

async function scanDataset(
  path: string,
  visit: (item: LongMemEvalItem) => void,
): Promise<LongMemEvalSourceEvidence> {
  const resolvedPath = resolve(path);
  const file = await stat(resolvedPath);
  if (!file.isFile()) throw new Error(`dataset path is not a file: ${resolvedPath}`);
  const digest = createHash("sha256");
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  const source = createReadStream(resolvedPath);
  const items = source
    .pipe(hasher)
    .pipe(streamArray.withParserAsStream());
  let itemCount = 0;
  const questionIds = new Set<string>();
  for await (const streamed of items) {
    if (!isStreamArrayItem(streamed)) {
      throw new Error(`unexpected streaming JSON item in ${basename(resolvedPath)}`);
    }
    const item = parseLongMemEvalItem(streamed.value, streamed.key);
    if (questionIds.has(item.question_id)) {
      throw new Error(
        `${basename(resolvedPath)} contains duplicate question ID: ${item.question_id}`,
      );
    }
    questionIds.add(item.question_id);
    visit(item);
    itemCount += 1;
  }
  return {
    file: basename(resolvedPath),
    bytes: file.size,
    sha256: digest.digest("hex"),
    itemCount,
  };
}

function stratumFor(item: LongMemEvalItem): LongMemEvalStratum {
  return item.question_id.endsWith("_abs")
    ? "abstention"
    : item.question_type;
}

function rank(seed: string, questionId: string): string {
  return createHash("sha256")
    .update(seed)
    .update("\0")
    .update(questionId)
    .digest("hex");
}

function validateStrata(
  strata: readonly LongMemEvalStratum[],
): LongMemEvalStratum[] {
  if (strata.length === 0) throw new Error("at least one stratum is required");
  if (new Set(strata).size !== strata.length) {
    throw new Error("strata must not contain duplicates");
  }
  for (const stratum of strata) {
    if (!(LONGMEMEVAL_STRATA as readonly string[]).includes(stratum)) {
      throw new Error(`unsupported LongMemEval stratum: ${stratum}`);
    }
  }
  return [...strata];
}

function itemDigest(item: LongMemEvalPreparedItem): string {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function validateOracleItem(
  history: LongMemEvalItem,
  oracle: LongMemEvalItem,
): void {
  if (
    oracle.question_id !== history.question_id ||
    oracle.question !== history.question ||
    oracle.answer !== history.answer ||
    oracle.question_type !== history.question_type
  ) {
    throw new Error(
      `oracle item does not match history item: ${history.question_id}`,
    );
  }
  if (
    !sameStringSet(oracle.haystack_session_ids, history.answer_session_ids) ||
    !sameStringSet(oracle.answer_session_ids, history.answer_session_ids)
  ) {
    throw new Error(
      `oracle item must contain exactly the evidence sessions: ${history.question_id}`,
    );
  }
  for (const oracleSessionId of oracle.haystack_session_ids) {
    const oracleIndex = oracle.haystack_session_ids.indexOf(oracleSessionId);
    const oracleContent = JSON.stringify(
      oracle.haystack_sessions[oracleIndex],
    );
    const matchingHistorySession = history.haystack_session_ids.some(
      (historySessionId, historyIndex) =>
        historySessionId === oracleSessionId &&
        JSON.stringify(history.haystack_sessions[historyIndex]) ===
          oracleContent,
    );
    if (!matchingHistorySession) {
      throw new Error(
        `oracle evidence differs from history session ${oracleSessionId}: ${history.question_id}`,
      );
    }
  }
}

function safeQuestionId(questionId: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(questionId)) {
    throw new Error(`question ID cannot be used as a file name: ${questionId}`);
  }
  return questionId;
}

function parseSourceEvidence(
  value: unknown,
  field: string,
): LongMemEvalSourceEvidence {
  if (!isRecord(value)) throw new Error(`manifest.${field} must be an object`);
  const file = requireString(value, "file", `manifest.${field}`);
  const sha256 = requireString(value, "sha256", `manifest.${field}`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`manifest.${field}.sha256 is invalid`);
  }
  const bytes = value.bytes;
  const itemCount = value.itemCount;
  if (!isNonNegativeInteger(bytes)) {
    throw new Error(`manifest.${field}.bytes must be a non-negative integer`);
  }
  if (!isNonNegativeInteger(itemCount)) {
    throw new Error(
      `manifest.${field}.itemCount must be a non-negative integer`,
    );
  }
  return {
    file,
    bytes,
    sha256,
    itemCount,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isLongMemEvalStratum(value: string): value is LongMemEvalStratum {
  return (LONGMEMEVAL_STRATA as readonly string[]).includes(value);
}

export async function prepareLongMemEvalPilot(
  options: PrepareLongMemEvalPilotOptions,
): Promise<LongMemEvalPilotManifest> {
  if (
    !Number.isInteger(options.itemsPerStratum) ||
    options.itemsPerStratum < 1
  ) {
    throw new Error("itemsPerStratum must be a positive integer");
  }
  if (options.seed.length === 0) throw new Error("seed must not be empty");
  const strata = validateStrata(options.strata ?? LONGMEMEVAL_STRATA);
  const selectedByStratum = new Map<LongMemEvalStratum, RankedItem[]>(
    strata.map((stratum) => [stratum, []]),
  );
  const historySource = await scanDataset(options.historyPath, (item) => {
    const stratum = stratumFor(item);
    const selected = selectedByStratum.get(stratum);
    if (!selected) return;
    selected.push({ rank: rank(options.seed, item.question_id), item });
    selected.sort((left, right) => left.rank.localeCompare(right.rank));
    if (selected.length > options.itemsPerStratum) selected.pop();
  });
  for (const stratum of strata) {
    const count = selectedByStratum.get(stratum)?.length ?? 0;
    if (count !== options.itemsPerStratum) {
      throw new Error(
        `stratum ${stratum} contains ${count} selected items; expected ${options.itemsPerStratum}`,
      );
    }
  }

  const selectedHistory = [...selectedByStratum.entries()]
    .flatMap(([stratum, entries]) =>
      entries.map(({ rank: itemRank, item }) => ({
        stratum,
        rank: itemRank,
        item,
      })),
    )
    .sort(
      (left, right) =>
        strata.indexOf(left.stratum) - strata.indexOf(right.stratum) ||
        left.rank.localeCompare(right.rank),
    );
  const selectedIds = new Set(
    selectedHistory.map(({ item }) => item.question_id),
  );
  const oracleById = new Map<string, LongMemEvalItem>();
  const oracleSource = await scanDataset(options.oraclePath, (item) => {
    if (selectedIds.has(item.question_id)) oracleById.set(item.question_id, item);
  });

  const preparedItems = selectedHistory.map((selected) => {
    const oracle = oracleById.get(selected.item.question_id);
    if (!oracle) {
      throw new Error(
        `oracle dataset is missing selected question: ${selected.item.question_id}`,
      );
    }
    validateOracleItem(selected.item, oracle);
    const prepared: LongMemEvalPreparedItem = {
      stratum: selected.stratum,
      history: selected.item,
      oracle,
    };
    const questionId = safeQuestionId(selected.item.question_id);
    const relativePath = `items/${questionId}.json`;
    return {
      prepared,
      reference: {
        questionId,
        questionType: selected.item.question_type,
        stratum: selected.stratum,
        file: relativePath,
        sha256: itemDigest(prepared),
      } satisfies LongMemEvalPreparedItemReference,
    };
  });

  const outputDirectory = resolve(options.outputDirectory);
  const itemsDirectory = join(outputDirectory, "items");
  await mkdir(itemsDirectory, { recursive: true, mode: 0o700 });
  for (const { prepared, reference } of preparedItems) {
    await writePrivateJsonExclusive(
      join(outputDirectory, reference.file),
      prepared,
    );
  }

  const manifest: LongMemEvalPilotManifest = {
    schemaVersion: 1,
    benchmark: "longmemeval-cleaned",
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    dataset: LONGMEMEVAL_DATASET,
    seed: options.seed,
    itemsPerStratum: options.itemsPerStratum,
    strata,
    historySource,
    oracleSource,
    items: preparedItems.map(({ reference }) => reference),
  };
  await writePrivateJsonExclusive(
    join(outputDirectory, "manifest.json"),
    manifest,
  );
  return manifest;
}

export async function loadLongMemEvalPilot(
  directory: string,
): Promise<LoadedLongMemEvalPilot> {
  const resolvedDirectory = resolve(directory);
  const manifestPath = join(resolvedDirectory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const parsedManifest: unknown = JSON.parse(manifestText);
  if (!isRecord(parsedManifest)) throw new Error("manifest must be an object");
  if (
    parsedManifest.schemaVersion !== 1 ||
    parsedManifest.benchmark !== "longmemeval-cleaned"
  ) {
    throw new Error("unsupported LongMemEval manifest");
  }
  if (!Array.isArray(parsedManifest.items)) {
    throw new Error("manifest.items must be an array");
  }
  if (
    !isRecord(parsedManifest.dataset) ||
    parsedManifest.dataset.repository !== LONGMEMEVAL_DATASET.repository ||
    parsedManifest.dataset.dataset !== LONGMEMEVAL_DATASET.dataset ||
    parsedManifest.dataset.revision !== LONGMEMEVAL_DATASET.revision ||
    parsedManifest.dataset.license !== LONGMEMEVAL_DATASET.license
  ) {
    throw new Error("manifest.dataset does not match the supported dataset");
  }
  const createdAt = requireString(parsedManifest, "createdAt", "manifest");
  const seed = requireString(parsedManifest, "seed", "manifest");
  const itemsPerStratum = parsedManifest.itemsPerStratum;
  if (
    !isNonNegativeInteger(itemsPerStratum) ||
    itemsPerStratum < 1
  ) {
    throw new Error("manifest.itemsPerStratum must be a positive integer");
  }
  if (!Array.isArray(parsedManifest.strata)) {
    throw new Error("manifest.strata is invalid");
  }
  const strata = parsedManifest.strata.map((value) => {
    if (typeof value !== "string" || !isLongMemEvalStratum(value)) {
      throw new Error(`manifest.strata contains an unsupported value: ${String(value)}`);
    }
    return value;
  });
  if (new Set(strata).size !== strata.length) {
    throw new Error("manifest.strata contains duplicates");
  }
  const historySource = parseSourceEvidence(
    parsedManifest.historySource,
    "historySource",
  );
  const oracleSource = parseSourceEvidence(
    parsedManifest.oracleSource,
    "oracleSource",
  );

  const references: LongMemEvalPreparedItemReference[] =
    parsedManifest.items.map((value, index) => {
      if (!isRecord(value)) {
        throw new Error(`manifest.items[${index}] must be an object`);
      }
      const questionId = requireString(
        value,
        "questionId",
        `manifest.items[${index}]`,
      );
      const questionType = requireQuestionType(
        requireString(value, "questionType", `manifest.items[${index}]`),
        `manifest.items[${index}]`,
      );
      const stratumValue = requireString(
        value,
        "stratum",
        `manifest.items[${index}]`,
      );
      if (!isLongMemEvalStratum(stratumValue)) {
        throw new Error(
          `manifest.items[${index}].stratum is unsupported: ${stratumValue}`,
        );
      }
      const file = requireString(value, "file", `manifest.items[${index}]`);
      const expectedFile = `items/${safeQuestionId(questionId)}.json`;
      if (file !== expectedFile) {
        throw new Error(
          `manifest.items[${index}].file must be ${expectedFile}`,
        );
      }
      const sha256 = requireString(
        value,
        "sha256",
        `manifest.items[${index}]`,
      );
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        throw new Error(`manifest.items[${index}].sha256 is invalid`);
      }
      return {
        questionId,
        questionType,
        stratum: stratumValue,
        file,
        sha256,
      };
    });
  if (
    new Set(references.map((item) => item.questionId)).size !==
    references.length
  ) {
    throw new Error("manifest contains duplicate question IDs");
  }
  const manifest: LongMemEvalPilotManifest = {
    schemaVersion: 1,
    benchmark: "longmemeval-cleaned",
    createdAt,
    dataset: LONGMEMEVAL_DATASET,
    seed,
    itemsPerStratum,
    strata: [...strata],
    historySource,
    oracleSource,
    items: references,
  };

  const items: LongMemEvalPreparedItem[] = [];
  for (const [index, reference] of references.entries()) {
    const itemText = await readFile(join(resolvedDirectory, reference.file), "utf8");
    const parsedItem: unknown = JSON.parse(itemText);
    if (!isRecord(parsedItem)) {
      throw new Error(`${reference.file} must contain an object`);
    }
    const stratumValue = parsedItem.stratum;
    if (
      typeof stratumValue !== "string" ||
      !isLongMemEvalStratum(stratumValue)
    ) {
      throw new Error(`${reference.file}.stratum is invalid`);
    }
    const prepared: LongMemEvalPreparedItem = {
      stratum: stratumValue,
      history: parseLongMemEvalItem(parsedItem.history, index),
      oracle: parseLongMemEvalItem(parsedItem.oracle, index),
    };
    if (
      prepared.history.question_id !== reference.questionId ||
      prepared.oracle.question_id !== reference.questionId ||
      prepared.history.question_type !== reference.questionType ||
      prepared.stratum !== reference.stratum
    ) {
      throw new Error(`${reference.file} does not match its manifest reference`);
    }
    validateOracleItem(prepared.history, prepared.oracle);
    if (itemDigest(prepared) !== reference.sha256) {
      throw new Error(`${reference.file} failed its SHA-256 check`);
    }
    items.push(prepared);
  }

  return {
    directory: resolvedDirectory,
    manifest,
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
    items,
  };
}
