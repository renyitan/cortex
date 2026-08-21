import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  writePrivateJsonExclusive,
  writePrivateTextExclusive,
} from "./artifacts.js";
import type { EvidenceDocument, MemoryDraft } from "./types.js";

interface MabEvidenceManifestRecord {
  id: string;
  path: string;
  sha256: string;
}

interface MabEvidenceManifest {
  schemaVersion: 1;
  streamId: string;
  source: string;
  records: MabEvidenceManifestRecord[];
}

export interface MabEvidenceSnapshot {
  documents: EvidenceDocument[];
  sha256: string;
}

export interface MabEvidenceMatch {
  document: EvidenceDocument;
  score: number;
}

export interface MabEvidenceSource {
  id: string;
  source: string;
  chunks: readonly string[];
}

const EVIDENCE_DIRECTORY = "evidence";
const EVIDENCE_MANIFEST = `${EVIDENCE_DIRECTORY}/manifest.json`;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PATH_PATTERN = /^evidence\/chunk-\d{3}\.txt$/;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotDigest(records: readonly MabEvidenceManifestRecord[]): string {
  return digest(JSON.stringify(records));
}

function evidencePath(index: number): string {
  return `${EVIDENCE_DIRECTORY}/chunk-${String(index + 1).padStart(3, "0")}.txt`;
}

function evidenceId(streamId: string, index: number): string {
  return `${streamId}.evidence-${String(index + 1).padStart(3, "0")}`;
}

function evidenceReference(path: string, sha256: string): string {
  return `${path}#sha256=${sha256}`;
}

function evidenceRecords(
  stream: MabEvidenceSource,
): MabEvidenceManifestRecord[] {
  return stream.chunks.map((text, index) => ({
    id: evidenceId(stream.id, index),
    path: evidencePath(index),
    sha256: digest(text),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(value: unknown): MabEvidenceManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.streamId !== "string" ||
    value.streamId.length === 0 ||
    typeof value.source !== "string" ||
    value.source.length === 0 ||
    !Array.isArray(value.records)
  ) {
    throw new Error("invalid MemoryAgentBench evidence manifest");
  }
  const records = value.records.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.path !== "string" ||
      !PATH_PATTERN.test(entry.path) ||
      typeof entry.sha256 !== "string" ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new Error(
        `invalid MemoryAgentBench evidence manifest record ${index}`,
      );
    }
    return {
      id: entry.id,
      path: entry.path,
      sha256: entry.sha256,
    };
  });
  const ids = new Set(records.map((record) => record.id));
  const paths = new Set(records.map((record) => record.path));
  if (ids.size !== records.length || paths.size !== records.length) {
    throw new Error("MemoryAgentBench evidence manifest contains duplicates");
  }
  return {
    schemaVersion: 1,
    streamId: value.streamId,
    source: value.source,
    records,
  };
}

function resolveEvidencePath(root: string, relativePath: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`evidence path escapes its store: ${relativePath}`);
  }
  return resolvedPath;
}

export async function persistMabEvidence(
  artifactDirectory: string,
  stream: MabEvidenceSource,
): Promise<MabEvidenceSnapshot> {
  const root = resolve(artifactDirectory);
  const records = evidenceRecords(stream);
  for (const [index, record] of records.entries()) {
    const text = stream.chunks[index]!;
    if (text.length === 0) {
      throw new Error(`MemoryAgentBench evidence chunk ${index + 1} is empty`);
    }
    await writePrivateTextExclusive(
      resolveEvidencePath(root, record.path),
      text,
    );
  }
  const manifest: MabEvidenceManifest = {
    schemaVersion: 1,
    streamId: stream.id,
    source: stream.source,
    records,
  };
  await writePrivateJsonExclusive(join(root, EVIDENCE_MANIFEST), manifest);
  return loadMabEvidence(root, stream);
}

export async function loadMabEvidence(
  artifactDirectory: string,
  expected?: MabEvidenceSource,
): Promise<MabEvidenceSnapshot> {
  const root = resolve(artifactDirectory);
  const manifest = parseManifest(
    JSON.parse(await readFile(join(root, EVIDENCE_MANIFEST), "utf8")),
  );
  if (expected !== undefined) {
    const expectedRecords = evidenceRecords(expected);
    if (
      manifest.streamId !== expected.id ||
      manifest.source !== expected.source ||
      JSON.stringify(manifest.records) !== JSON.stringify(expectedRecords)
    ) {
      throw new Error(
        "MemoryAgentBench evidence manifest does not match the source stream",
      );
    }
  }
  const documents: EvidenceDocument[] = [];
  for (const record of manifest.records) {
    const text = await readFile(
      resolveEvidencePath(root, record.path),
      "utf8",
    );
    const actualSha256 = digest(text);
    if (actualSha256 !== record.sha256) {
      throw new Error(
        `MemoryAgentBench evidence digest mismatch for ${record.id}: ` +
          `expected ${record.sha256}, received ${actualSha256}`,
      );
    }
    documents.push({
      ...record,
      reference: evidenceReference(record.path, record.sha256),
      text,
    });
  }
  return {
    documents,
    sha256: snapshotDigest(manifest.records),
  };
}

export function assertMabEvidenceCitations(
  memory: readonly MemoryDraft[],
  evidence: readonly EvidenceDocument[],
  label: string,
): void {
  const references = new Set(evidence.map((document) => document.reference));
  const unresolved = memory
    .map((record) => record.evidence)
    .filter((reference) => !references.has(reference));
  if (unresolved.length > 0) {
    throw new Error(
      `${label} contains unresolved evidence citations: ` +
        [...new Set(unresolved)].join(", "),
    );
  }
}

function terms(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function retrieveMabEvidence(
  documents: readonly EvidenceDocument[],
  query: string,
  topK: number,
): MabEvidenceMatch[] {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("MemoryAgentBench evidence topK must be positive");
  }
  if (documents.length === 0) {
    return [];
  }
  const tokenized = documents.map((document) => terms(document.text));
  const averageLength =
    tokenized.reduce((sum, tokens) => sum + tokens.length, 0) /
    tokenized.length;
  const queryTerms = [...new Set(terms(query))];
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      tokenized.filter((tokens) => tokens.includes(term)).length,
    );
  }
  const k1 = 1.2;
  const b = 0.75;
  return documents
    .map((document, index): MabEvidenceMatch => {
      const tokens = tokenized[index] ?? [];
      const frequencies = new Map<string, number>();
      for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }
      let score = 0;
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (frequency === 0) {
          continue;
        }
        const matchingDocuments = documentFrequency.get(term) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 +
            (documents.length - matchingDocuments + 0.5) /
              (matchingDocuments + 0.5),
        );
        const lengthNormalization =
          frequency +
          k1 *
            (1 -
              b +
              b * (tokens.length / Math.max(averageLength, 1)));
        score +=
          inverseDocumentFrequency *
          ((frequency * (k1 + 1)) / lengthNormalization);
      }
      return { document: structuredClone(document), score };
    })
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.id.localeCompare(right.document.id),
    )
    .slice(0, Math.min(topK, documents.length));
}
