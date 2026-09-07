import fs from "node:fs/promises";
import { connect, type Connection, type Table } from "@lancedb/lancedb";
import { getContext } from "./config.js";
import type { ArticleChunk, SearchResult } from "./types.js";

const TABLE_NAME = "article_chunks";

export interface DBRecord {
  id: string;
  slug: string;
  title: string;
  topics: string;
  heading: string;
  text: string;
  url: string;
  contentHash: string;
  vector: number[];
  itemType: string;
  bookSlug: string;
  [key: string]: unknown;
}

function chunkToRecord(chunk: ArticleChunk): DBRecord {
  if (!chunk.vector) {
    throw new Error(`Chunk ${chunk.id} にベクトルが含まれていません`);
  }
  return {
    id: chunk.id,
    slug: chunk.slug,
    title: chunk.title,
    topics: chunk.topics.join(", "),
    heading: chunk.heading,
    text: chunk.text,
    url: chunk.url,
    contentHash: chunk.contentHash,
    vector: chunk.vector,
    itemType: chunk.itemType || "article",
    bookSlug: chunk.bookSlug || "",
  };
}

function rowToSearchResult(
  row: Record<string, unknown>,
  score: number,
): SearchResult {
  const topicsStr = (row.topics as string) || "";
  const topics = topicsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const itemType = (row.itemType as "article" | "book") || "article";
  const bookSlug = (row.bookSlug as string) || undefined;

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    topics,
    heading: String(row.heading),
    text: String(row.text),
    url: String(row.url),
    score,
    itemType,
    bookSlug: bookSlug || undefined,
  };
}

export class ArticleVectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;

  private async getDb(): Promise<Connection> {
    if (!this.db) {
      const ctx = getContext();
      await fs.mkdir(ctx.vectorDbDir, { recursive: true });
      this.db = await connect(ctx.vectorDbDir);
    }
    return this.db;
  }

  async init(): Promise<void> {
    await this.getTable();
  }

  async resetTable(): Promise<void> {
    const db = await this.getDb();
    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      await db.dropTable(TABLE_NAME);
    }
    this.table = null;
  }

  async getVectorDimension(): Promise<number | null> {
    const table = await this.getTable();
    if (!table) return null;

    try {
      const rows = await table.query().limit(1).toArray();
      const vec = rows[0]?.vector as { length?: number } | undefined;
      if (typeof vec?.length === "number") {
        return vec.length;
      }
    } catch {
      // テーブルが空などの場合はnull
    }
    return null;
  }

  async getTable(): Promise<Table | null> {
    if (this.table) {
      return this.table;
    }
    const db = await this.getDb();
    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      this.table = await db.openTable(TABLE_NAME);
      return this.table;
    }
    return null;
  }

  private async getOrCreateTable(sampleData: DBRecord[]): Promise<Table> {
    const db = await this.getDb();
    const tables = await db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await db.openTable(TABLE_NAME);
    } else {
      this.table = await db.createTable(TABLE_NAME, sampleData);
    }
    return this.table;
  }

  async addChunks(chunks: ArticleChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const records: DBRecord[] = chunks.map(chunkToRecord);
    const table = await this.getTable();
    if (!table) {
      await this.getOrCreateTable(records);
    } else {
      await table.add(records);
    }
  }

  async deleteBySlug(slug: string): Promise<void> {
    const table = await this.getTable();
    if (!table) return;

    try {
      await table.delete(`slug = '${slug}'`);
    } catch {
      // 削除エラーは許容
    }
  }

  async search(
    queryVector: number[],
    options: { limit?: number; topic?: string } = {},
  ): Promise<SearchResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    const limit = options.limit || 5;
    let query = table
      .vectorSearch(queryVector)
      .distanceType("cosine")
      .limit(limit);

    if (options.topic) {
      query = query.where(`topics LIKE '%${options.topic}%'`);
    }

    const rawResults = await query.toArray();

    return rawResults.map((row) => {
      const distance = (row._distance as number) ?? 0;
      const score = Math.max(0, 1 - distance);
      return rowToSearchResult(row as Record<string, unknown>, score);
    });
  }

  async getAllTopics(): Promise<Record<string, number>> {
    const table = await this.getTable();
    if (!table) return {};

    const rows = await table.query().select(["topics", "slug"]).toArray();
    const topicCounts: Record<string, Set<string>> = {};

    for (const row of rows) {
      const topicsStr = (row.topics as string) || "";
      const slug = String(row.slug);
      const topics = topicsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of topics) {
        if (!topicCounts[t]) topicCounts[t] = new Set();
        topicCounts[t].add(slug);
      }
    }

    const result: Record<string, number> = {};
    for (const [topic, slugs] of Object.entries(topicCounts)) {
      result[topic] = slugs.size;
    }
    return result;
  }

  async getArticleChunks(slug: string): Promise<SearchResult[]> {
    const table = await this.getTable();
    if (!table) return [];

    const rows = await table.query().where(`slug = '${slug}'`).toArray();
    return rows.map((row) =>
      rowToSearchResult(row as Record<string, unknown>, 1.0),
    );
  }
}
