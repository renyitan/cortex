import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rm,
} from "node:fs/promises";
import { dirname } from "node:path";

export const LOSSLESS_SCHEMA_VERSION = 1 as const;
export const MAX_CANDIDATES_PER_OBSERVATION = 8;
export const MAX_FORMED_CLAIMS_PER_STREAM = 96;
export const MAX_BUNDLE_BYTES = 64 * 1024;
export const MAX_SUBJECT_KEY_BYTES = 64;
export const MAX_STATEMENT_BYTES = 512;
export const MAX_SCOPE_KEY_BYTES = 128;
export const MAX_SUPERSEDES_PER_CLAIM = 4;

const SHA256 = /^[a-f0-9]{64}$/;
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UTC =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;

export const CLAIM_KINDS = ["decision", "procedure", "preference"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const SCOPE_LEVELS = [
  "global",
  "organization",
  "team",
  "project",
  "workflow",
] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export interface ClaimScope {
  level: ScopeLevel;
  key: string | null;
}

export interface LosslessObservation {
  id: string;
  authoredAt: string;
  text: string;
  sha256: string;
}

export interface DerivedClaim {
  id: string;
  kind: ClaimKind;
  subjectKey: string;
  statement: string;
  scope: ClaimScope;
  effectiveAt: string;
  evidenceIds: [string];
  supersedesClaimIds: string[];
}

export interface LosslessMemoryBundle {
  schemaVersion: typeof LOSSLESS_SCHEMA_VERSION;
  streamId: string;
  observations: LosslessObservation[];
  claims: DerivedClaim[];
  observationSetSha256: string;
  claimSetSha256: string;
}

export interface FormationCandidate {
  kind: ClaimKind;
  subjectKey: string;
  statement: string;
  scope: ClaimScope;
  supersedesClaimIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function canonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON does not support non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  throw new Error(`canonical JSON does not support ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

export function observationSha256(
  authoredAt: string,
  text: string,
): string {
  return sha256Text(`${authoredAt}\n${text}`);
}

export function observationSetSha256(
  observations: readonly LosslessObservation[],
): string {
  return sha256Canonical(observations);
}

export function claimSetSha256(claims: readonly DerivedClaim[]): string {
  return sha256Canonical(claims);
}

export function isCanonicalUtcTimestamp(value: string): boolean {
  if (!CANONICAL_UTC.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  return new Date(milliseconds).toISOString().replace(".000Z", "Z") === value;
}

function requireString(
  value: unknown,
  field: string,
  options: { nonEmpty?: boolean; maxBytes?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  if (options.nonEmpty && value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
  if (
    options.maxBytes !== undefined &&
    Buffer.byteLength(value, "utf8") > options.maxBytes
  ) {
    throw new Error(`${field} exceeds ${options.maxBytes} UTF-8 bytes`);
  }
  return value;
}

function requireCanonicalTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (!isCanonicalUtcTimestamp(timestamp)) {
    throw new Error(
      `${field} must be a canonical UTC timestamp YYYY-MM-DDTHH:MM:SSZ`,
    );
  }
  return timestamp;
}

function requireKebabCase(
  value: unknown,
  field: string,
  maxBytes: number,
): string {
  const result = requireString(value, field, { nonEmpty: true, maxBytes });
  if (!KEBAB_CASE.test(result)) {
    throw new Error(`${field} must be canonical kebab-case`);
  }
  return result;
}

function requireStringArray(
  value: unknown,
  field: string,
  maximumLength?: number,
): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  if (maximumLength !== undefined && value.length > maximumLength) {
    throw new Error(`${field} may contain at most ${maximumLength} entries`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${field} must not contain duplicates`);
  }
  return [...value];
}

function parseScope(value: unknown, field: string): ClaimScope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["level", "key"]) ||
    typeof value.level !== "string" ||
    !(SCOPE_LEVELS as readonly string[]).includes(value.level)
  ) {
    throw new Error(`${field} is invalid`);
  }
  const level = value.level as ScopeLevel;
  if (level === "global") {
    if (value.key !== null) {
      throw new Error(`${field}.key must be null for global scope`);
    }
    return { level, key: null };
  }
  const key = requireKebabCase(
    value.key,
    `${field}.key`,
    MAX_SCOPE_KEY_BYTES,
  );
  return { level, key };
}

export function parseLosslessObservation(
  value: unknown,
  field = "observation",
): LosslessObservation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "authoredAt", "text", "sha256"])
  ) {
    throw new Error(`${field} fields do not match the observation schema`);
  }
  const id = requireString(value.id, `${field}.id`, { nonEmpty: true });
  const authoredAt = requireCanonicalTimestamp(
    value.authoredAt,
    `${field}.authoredAt`,
  );
  const text = requireString(value.text, `${field}.text`, { nonEmpty: true });
  const digest = requireString(value.sha256, `${field}.sha256`);
  if (!SHA256.test(digest)) {
    throw new Error(`${field}.sha256 must be a lowercase SHA-256 digest`);
  }
  if (digest !== observationSha256(authoredAt, text)) {
    throw new Error(`${field} observation digest mismatch`);
  }
  return { id, authoredAt, text, sha256: digest };
}

export function parseFormationCandidate(
  value: unknown,
  field = "candidate",
): FormationCandidate {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "kind",
      "subjectKey",
      "statement",
      "scope",
      "supersedesClaimIds",
    ])
  ) {
    throw new Error(`${field} fields do not match the candidate schema`);
  }
  if (
    typeof value.kind !== "string" ||
    !(CLAIM_KINDS as readonly string[]).includes(value.kind)
  ) {
    throw new Error(`${field}.kind is invalid`);
  }
  return {
    kind: value.kind as ClaimKind,
    subjectKey: requireKebabCase(
      value.subjectKey,
      `${field}.subjectKey`,
      MAX_SUBJECT_KEY_BYTES,
    ),
    statement: requireString(value.statement, `${field}.statement`, {
      nonEmpty: true,
      maxBytes: MAX_STATEMENT_BYTES,
    }),
    scope: parseScope(value.scope, `${field}.scope`),
    supersedesClaimIds: requireStringArray(
      value.supersedesClaimIds,
      `${field}.supersedesClaimIds`,
      MAX_SUPERSEDES_PER_CLAIM,
    ),
  };
}

export function parseDerivedClaim(
  value: unknown,
  field = "claim",
): DerivedClaim {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "kind",
      "subjectKey",
      "statement",
      "scope",
      "effectiveAt",
      "evidenceIds",
      "supersedesClaimIds",
    ])
  ) {
    throw new Error(`${field} fields do not match the claim schema`);
  }
  const candidate = parseFormationCandidate(
    {
      kind: value.kind,
      subjectKey: value.subjectKey,
      statement: value.statement,
      scope: value.scope,
      supersedesClaimIds: value.supersedesClaimIds,
    },
    field,
  );
  const evidenceIds = requireStringArray(
    value.evidenceIds,
    `${field}.evidenceIds`,
    1,
  );
  if (evidenceIds.length !== 1 || evidenceIds[0]!.length === 0) {
    throw new Error(`${field}.evidenceIds must contain exactly one ID`);
  }
  return {
    id: requireString(value.id, `${field}.id`, { nonEmpty: true }),
    ...candidate,
    effectiveAt: requireCanonicalTimestamp(
      value.effectiveAt,
      `${field}.effectiveAt`,
    ),
    evidenceIds: [evidenceIds[0]!],
  };
}

function sameScope(left: ClaimScope, right: ClaimScope): boolean {
  return left.level === right.level && left.key === right.key;
}

function assertNoSupersessionCycle(claims: readonly DerivedClaim[]): void {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new Error(`supersession cycle detected at ${id}`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const claim = byId.get(id);
    if (claim) {
      for (const superseded of claim.supersedesClaimIds) {
        visit(superseded);
      }
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const claim of claims) visit(claim.id);
}

export function validateLosslessMemoryBundle(
  bundle: LosslessMemoryBundle,
): void {
  if (bundle.schemaVersion !== LOSSLESS_SCHEMA_VERSION) {
    throw new Error("unsupported lossless memory schema");
  }
  requireString(bundle.streamId, "streamId", { nonEmpty: true });
  if (bundle.claims.length > MAX_FORMED_CLAIMS_PER_STREAM) {
    throw new Error(
      `bundle exceeds ${MAX_FORMED_CLAIMS_PER_STREAM} formed claims`,
    );
  }

  const observationIds = new Set<string>();
  const observationsById = new Map<string, LosslessObservation>();
  let previousObservationTime = Number.NEGATIVE_INFINITY;
  for (const [index, rawObservation] of bundle.observations.entries()) {
    const observation = parseLosslessObservation(
      rawObservation,
      `observations[${index}]`,
    );
    if (observationIds.has(observation.id)) {
      throw new Error(`duplicate observation ID: ${observation.id}`);
    }
    observationIds.add(observation.id);
    observationsById.set(observation.id, observation);
    const time = Date.parse(observation.authoredAt);
    if (time <= previousObservationTime) {
      throw new Error("observations must be in strict chronological order");
    }
    previousObservationTime = time;
  }

  const claimIds = new Set<string>();
  const claimIndexes = new Map<string, number>();
  const parsedClaims = bundle.claims.map((rawClaim, index) => {
    const claim = parseDerivedClaim(rawClaim, `claims[${index}]`);
    if (claimIds.has(claim.id)) {
      throw new Error(`duplicate claim ID: ${claim.id}`);
    }
    claimIds.add(claim.id);
    claimIndexes.set(claim.id, index);
    const observation = observationsById.get(claim.evidenceIds[0]);
    if (!observation) {
      throw new Error(
        `claim ${claim.id} references unknown observation ${claim.evidenceIds[0]}`,
      );
    }
    if (claim.effectiveAt !== observation.authoredAt) {
      throw new Error(
        `claim ${claim.id} effectiveAt must equal its evidence timestamp`,
      );
    }
    return claim;
  });

  for (const [index, claim] of parsedClaims.entries()) {
    for (const supersededId of claim.supersedesClaimIds) {
      const supersededIndex = claimIndexes.get(supersededId);
      if (supersededIndex === undefined) {
        throw new Error(
          `claim ${claim.id} supersedes unknown claim ${supersededId}`,
        );
      }
      if (supersededIndex >= index) {
        throw new Error(
          `claim ${claim.id} may supersede only an earlier claim`,
        );
      }
      const superseded = parsedClaims[supersededIndex]!;
      if (
        Date.parse(superseded.effectiveAt) >= Date.parse(claim.effectiveAt)
      ) {
        throw new Error(
          `claim ${claim.id} may supersede only an earlier-effective claim`,
        );
      }
      if (
        superseded.kind !== claim.kind ||
        superseded.subjectKey !== claim.subjectKey ||
        !sameScope(superseded.scope, claim.scope)
      ) {
        throw new Error(
          `claim ${claim.id} may supersede only the same kind, subject, and exact scope`,
        );
      }
    }
  }
  assertNoSupersessionCycle(parsedClaims);

  const expectedObservationDigest = observationSetSha256(bundle.observations);
  if (bundle.observationSetSha256 !== expectedObservationDigest) {
    throw new Error("observationSetSha256 mismatch");
  }
  const expectedClaimDigest = claimSetSha256(bundle.claims);
  if (bundle.claimSetSha256 !== expectedClaimDigest) {
    throw new Error("claimSetSha256 mismatch");
  }
  if (Buffer.byteLength(canonicalJson(bundle), "utf8") > MAX_BUNDLE_BYTES) {
    throw new Error(`bundle exceeds ${MAX_BUNDLE_BYTES} UTF-8 bytes`);
  }
}

export function parseLosslessMemoryBundle(
  value: unknown,
): LosslessMemoryBundle {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "streamId",
      "observations",
      "claims",
      "observationSetSha256",
      "claimSetSha256",
    ]) ||
    value.schemaVersion !== LOSSLESS_SCHEMA_VERSION ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.claims)
  ) {
    throw new Error("invalid lossless memory bundle");
  }
  const bundle: LosslessMemoryBundle = {
    schemaVersion: LOSSLESS_SCHEMA_VERSION,
    streamId: requireString(value.streamId, "streamId", { nonEmpty: true }),
    observations: value.observations.map((observation, index) =>
      parseLosslessObservation(observation, `observations[${index}]`),
    ),
    claims: value.claims.map((claim, index) =>
      parseDerivedClaim(claim, `claims[${index}]`),
    ),
    observationSetSha256: requireString(
      value.observationSetSha256,
      "observationSetSha256",
    ),
    claimSetSha256: requireString(value.claimSetSha256, "claimSetSha256"),
  };
  if (
    !SHA256.test(bundle.observationSetSha256) ||
    !SHA256.test(bundle.claimSetSha256)
  ) {
    throw new Error("bundle digests must be lowercase SHA-256 values");
  }
  validateLosslessMemoryBundle(bundle);
  return structuredClone(bundle);
}

export function createLosslessMemoryBundle(
  streamId: string,
): LosslessMemoryBundle {
  requireString(streamId, "streamId", { nonEmpty: true });
  return {
    schemaVersion: LOSSLESS_SCHEMA_VERSION,
    streamId,
    observations: [],
    claims: [],
    observationSetSha256: observationSetSha256([]),
    claimSetSha256: claimSetSha256([]),
  };
}

export function bundleFromEvidence(
  streamId: string,
  observations: readonly LosslessObservation[],
  claims: readonly DerivedClaim[],
): LosslessMemoryBundle {
  const bundle: LosslessMemoryBundle = {
    schemaVersion: LOSSLESS_SCHEMA_VERSION,
    streamId,
    observations: structuredClone([...observations]),
    claims: structuredClone([...claims]),
    observationSetSha256: observationSetSha256(observations),
    claimSetSha256: claimSetSha256(claims),
  };
  validateLosslessMemoryBundle(bundle);
  return bundle;
}

export function formedClaimId(
  streamId: string,
  observationOrdinal: number,
  candidateOrdinal: number,
): string {
  if (!Number.isInteger(observationOrdinal) || observationOrdinal < 1) {
    throw new Error("observationOrdinal must be a positive integer");
  }
  if (!Number.isInteger(candidateOrdinal) || candidateOrdinal < 1) {
    throw new Error("candidateOrdinal must be a positive integer");
  }
  return `${streamId}-formed-${String(observationOrdinal).padStart(2, "0")}-${String(candidateOrdinal).padStart(2, "0")}`;
}

export function appendObservationBatch(
  current: LosslessMemoryBundle,
  rawObservation: LosslessObservation,
  rawCandidates: readonly FormationCandidate[],
): LosslessMemoryBundle {
  const bundle = parseLosslessMemoryBundle(current);
  const observation = parseLosslessObservation(rawObservation);
  if (rawCandidates.length > MAX_CANDIDATES_PER_OBSERVATION) {
    throw new Error(
      `an observation may produce at most ${MAX_CANDIDATES_PER_OBSERVATION} candidates`,
    );
  }
  if (bundle.observations.some((entry) => entry.id === observation.id)) {
    throw new Error(`duplicate observation ID: ${observation.id}`);
  }
  const previousObservation = bundle.observations.at(-1);
  if (
    previousObservation &&
    Date.parse(observation.authoredAt) <=
      Date.parse(previousObservation.authoredAt)
  ) {
    throw new Error("new observation must follow existing chronology");
  }

  const existingClaims = new Map(
    bundle.claims.map((claim) => [claim.id, claim]),
  );
  const candidates = rawCandidates.map((candidate, index) =>
    parseFormationCandidate(candidate, `candidates[${index}]`),
  );
  const observationOrdinal = bundle.observations.length + 1;
  const claims = candidates.map((candidate, index): DerivedClaim => {
    for (const supersededId of candidate.supersedesClaimIds) {
      const superseded = existingClaims.get(supersededId);
      if (!superseded) {
        throw new Error(
          `candidate ${index + 1} supersedes unknown or ineligible claim ${supersededId}`,
        );
      }
      if (
        superseded.kind !== candidate.kind ||
        superseded.subjectKey !== candidate.subjectKey ||
        !sameScope(superseded.scope, candidate.scope)
      ) {
        throw new Error(
          `candidate ${index + 1} supersedes a claim with a different kind, subject, or scope`,
        );
      }
    }
    return {
      id: formedClaimId(bundle.streamId, observationOrdinal, index + 1),
      ...candidate,
      effectiveAt: observation.authoredAt,
      evidenceIds: [observation.id],
    };
  });

  const next = bundleFromEvidence(
    bundle.streamId,
    [...bundle.observations, observation],
    [...bundle.claims, ...claims],
  );
  if (next.claims.length > MAX_FORMED_CLAIMS_PER_STREAM) {
    throw new Error(
      `bundle exceeds ${MAX_FORMED_CLAIMS_PER_STREAM} formed claims`,
    );
  }
  return next;
}

async function ensureOwnerOnlyDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const details = await lstat(path);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error(`artifact directory is not a regular directory: ${path}`);
  }
  await chmod(path, 0o700);
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishPrivateFile(
  path: string,
  value: string | Uint8Array,
  allowIdenticalRetry: boolean,
): Promise<void> {
  const directory = dirname(path);
  await ensureOwnerOnlyDirectory(directory);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }

  let published = false;
  try {
    await link(temporaryPath, path);
    published = true;
    await rm(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    if (
      allowIdenticalRetry &&
      !published &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      const [existing, proposed] = await Promise.all([
        readFile(path),
        readFile(temporaryPath),
      ]);
      await rm(temporaryPath);
      await syncDirectory(directory);
      if (existing.equals(proposed)) {
        return;
      }
    }
    if (published) {
      try {
        await rm(path);
        await rm(temporaryPath, { force: true });
        await syncDirectory(directory);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `atomic publication failed and rollback was incomplete: ${path}`,
        );
      }
    } else {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

export async function publishPrivateFileWriteOnce(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  await publishPrivateFile(path, value, true);
}

export async function claimPrivateFileWriteOnce(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  await publishPrivateFile(path, value, false);
}

export async function publishPrivateJsonWriteOnce(
  path: string,
  value: unknown,
): Promise<void> {
  await publishPrivateFileWriteOnce(path, canonicalJson(value));
}
