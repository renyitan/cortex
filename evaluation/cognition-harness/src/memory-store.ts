import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { MemoryDraft, MemoryRecord, MemoryWrite } from "./types.js";

interface StoredMemory {
  schemaVersion: 1;
  records: MemoryRecord[];
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must not be empty`);
  }
}

function validateDraft(draft: MemoryDraft): void {
  assertNonEmpty(draft.id, "record.id");
  assertNonEmpty(draft.text, "record.text");
  assertNonEmpty(draft.evidence, "record.evidence");
  if (!["learning", "decision"].includes(draft.kind)) {
    throw new Error(`unsupported memory kind: ${String(draft.kind)}`);
  }
  if (!["operator", "observed", "imported"].includes(draft.source)) {
    throw new Error(`unsupported memory source: ${String(draft.source)}`);
  }
}

function validateTimestamp(value: string, field: string): void {
  const parsed = typeof value === "string" ? new Date(value) : undefined;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
}

function parseStoredMemory(raw: string): StoredMemory {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("memory store must contain an object");
  }
  const candidate = parsed as Partial<StoredMemory>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records)) {
    throw new Error("unsupported memory store schema");
  }
  for (const record of candidate.records) {
    validateDraft(record);
    if (!["active", "retired"].includes(record.status)) {
      throw new Error(`unsupported memory status: ${String(record.status)}`);
    }
    validateTimestamp(record.createdAt, "record.createdAt");
    validateTimestamp(record.updatedAt, "record.updatedAt");
  }
  return { schemaVersion: 1, records: candidate.records };
}

export class AtomicMemoryStore {
  constructor(
    private readonly path: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(): Promise<MemoryRecord[]> {
    return structuredClone((await this.read()).records);
  }

  async active(): Promise<MemoryRecord[]> {
    return (await this.snapshot()).filter((record) => record.status === "active");
  }

  async applyWrites(writes: readonly MemoryWrite[]): Promise<MemoryRecord[]> {
    if (writes.length === 0) {
      return this.snapshot();
    }

    const duplicateCandidateIds = new Set<string>();
    const seenCandidateIds = new Set<string>();
    const duplicateRecordIds = new Set<string>();
    const seenRecordIds = new Set<string>();
    for (const write of writes) {
      assertNonEmpty(write.candidateId, "write.candidateId");
      validateDraft(write.record);
      if (seenCandidateIds.has(write.candidateId)) duplicateCandidateIds.add(write.candidateId);
      if (seenRecordIds.has(write.record.id)) duplicateRecordIds.add(write.record.id);
      seenCandidateIds.add(write.candidateId);
      seenRecordIds.add(write.record.id);
    }
    if (duplicateCandidateIds.size > 0) {
      throw new Error(`duplicate candidate writes: ${[...duplicateCandidateIds].join(", ")}`);
    }
    if (duplicateRecordIds.size > 0) {
      throw new Error(`duplicate record writes: ${[...duplicateRecordIds].join(", ")}`);
    }

    const current = await this.read();
    const records = new Map(current.records.map((record) => [record.id, record]));
    const collisions = writes
      .map((write) => write.record.id)
      .filter((recordId) => records.has(recordId));
    if (collisions.length > 0) {
      throw new Error(`memory writes are insert-only: ${collisions.join(", ")}`);
    }
    const timestamp = this.now().toISOString();
    for (const write of writes) {
      records.set(write.record.id, {
        ...write.record,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const next: StoredMemory = {
      schemaVersion: 1,
      records: [...records.values()].sort((left, right) => left.id.localeCompare(right.id)),
    };
    await this.write(next);
    return structuredClone(next.records);
  }

  private async read(): Promise<StoredMemory> {
    try {
      return parseStoredMemory(await readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: 1, records: [] };
      }
      throw error;
    }
  }

  private async write(value: StoredMemory): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, this.path);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
