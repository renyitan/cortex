import type {
  MemoryRetrievalRequest,
  MemoryRetrievalResult,
  MemoryRetriever,
  MemoryRecord,
} from "./types.js";

export class AllActiveMemoryRetriever implements MemoryRetriever {
  async retrieve(
    request: MemoryRetrievalRequest,
  ): Promise<MemoryRetrievalResult> {
    return {
      strategy: "all-active",
      candidates: request.memory.map((record) => ({
        memoryId: record.id,
        score: 0,
      })),
    };
  }
}

export interface Bm25MemoryRetrieverOptions {
  limit?: number;
  k1?: number;
  b?: number;
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function searchableText(record: MemoryRecord): string {
  return [
    record.id.replaceAll("-", " "),
    record.kind,
    record.text,
    record.evidence,
    record.source,
  ].join(" ");
}

export class Bm25MemoryRetriever implements MemoryRetriever {
  private readonly limit: number;
  private readonly k1: number;
  private readonly b: number;

  constructor(options: Bm25MemoryRetrieverOptions = {}) {
    this.limit = options.limit ?? 20;
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
    if (!Number.isInteger(this.limit) || this.limit < 1) {
      throw new Error("BM25 limit must be a positive integer");
    }
    if (!Number.isFinite(this.k1) || this.k1 <= 0) {
      throw new Error("BM25 k1 must be positive");
    }
    if (!Number.isFinite(this.b) || this.b < 0 || this.b > 1) {
      throw new Error("BM25 b must be between 0 and 1");
    }
  }

  async retrieve(
    request: MemoryRetrievalRequest,
  ): Promise<MemoryRetrievalResult> {
    if (request.memory.length === 0) {
      return { strategy: "bm25", candidates: [] };
    }

    const queryTerms = [...new Set(tokens(request.task))];
    const documents = request.memory.map((record) => {
      const documentTokens = tokens(searchableText(record));
      const frequencies = new Map<string, number>();
      for (const token of documentTokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }
      return { record, length: documentTokens.length, frequencies };
    });
    const averageLength =
      documents.reduce((sum, document) => sum + document.length, 0) /
      documents.length;
    const documentFrequency = new Map<string, number>();
    for (const term of queryTerms) {
      documentFrequency.set(
        term,
        documents.filter((document) => document.frequencies.has(term)).length,
      );
    }

    const candidates = documents
      .map((document) => {
        let score = 0;
        for (const term of queryTerms) {
          const frequency = document.frequencies.get(term) ?? 0;
          if (frequency === 0) continue;
          const matchingDocuments = documentFrequency.get(term) ?? 0;
          const inverseDocumentFrequency = Math.log(
            1 +
              (documents.length - matchingDocuments + 0.5) /
                (matchingDocuments + 0.5),
          );
          const lengthNormalization =
            averageLength === 0
              ? 1
              : 1 -
                this.b +
                this.b * (document.length / averageLength);
          score +=
            inverseDocumentFrequency *
            ((frequency * (this.k1 + 1)) /
              (frequency + this.k1 * lengthNormalization));
        }
        return { memoryId: document.record.id, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.memoryId.localeCompare(right.memoryId),
      )
      .slice(0, this.limit);

    return { strategy: "bm25", candidates };
  }
}
