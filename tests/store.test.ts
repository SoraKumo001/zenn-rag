import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initContext } from "../src/config.js";
import { ArticleVectorStore } from "../src/store.js";
import type { ArticleChunk } from "../src/types.js";

describe("ArticleVectorStore", () => {
  let tempDir: string;
  let store: ArticleVectorStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zenn-rag-store-test-"));
    initContext(tempDir);
    store = new ArticleVectorStore();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleChunks: ArticleChunk[] = [
    {
      id: "art-1#chunk_0",
      slug: "art-1",
      title: "React入門と基礎",
      topics: ["react", "typescript"],
      heading: "はじめに",
      text: "Reactのコンポーネントについての基礎を解説します。",
      vectorText: "React入門と基礎 はじめに Reactのコンポーネントについての基礎を解説します。",
      url: "https://zenn.dev/user/articles/art-1",
      contentHash: "hash1",
      vector: [0.1, 0.2, 0.3],
      itemType: "article",
    },
    {
      id: "art-1#chunk_1",
      slug: "art-1",
      title: "React入門と基礎",
      topics: ["react", "typescript"],
      heading: "フックの使い方",
      text: "useStateとuseEffectの基本です。",
      vectorText: "React入門と基礎 フックの使い方 useStateとuseEffectの基本です。",
      url: "https://zenn.dev/user/articles/art-1",
      contentHash: "hash2",
      vector: [0.15, 0.25, 0.35],
      itemType: "article",
    },
    {
      id: "art-2#chunk_0",
      slug: "art-2",
      title: "Cloudflare Workersのサイズ制限緩和",
      topics: ["cloudflare", "workers"],
      heading: "制限緩和について",
      text: "64MiBまでサイズ制限が拡大されました。",
      vectorText: "Cloudflare Workersのサイズ制限緩和 制限緩和について 64MiBまでサイズ制限が拡大されました。",
      url: "https://zenn.dev/user/articles/art-2",
      contentHash: "hash3",
      vector: [0.8, 0.1, 0.0],
      itemType: "article",
    },
  ];

  describe("listArticles", () => {
    it("重複するスラッグを集約して記事一覧を返す", async () => {
      await store.addChunks(sampleChunks);
      const articles = await store.listArticles();

      expect(articles).toHaveLength(2);
      expect(articles.map((a) => a.slug)).toEqual(["art-1", "art-2"]);
      expect(articles[0].title).toBe("React入門と基礎");
      expect(articles[0].topics).toEqual(["react", "typescript"]);
    });

    it("トピックで絞り込みができる", async () => {
      await store.addChunks(sampleChunks);
      const reactArticles = await store.listArticles({ topic: "react" });

      expect(reactArticles).toHaveLength(1);
      expect(reactArticles[0].slug).toBe("art-1");

      const cfArticles = await store.listArticles({ topic: "cloudflare" });
      expect(cfArticles).toHaveLength(1);
      expect(cfArticles[0].slug).toBe("art-2");
    });

    it("件数制限（limit）が効く", async () => {
      await store.addChunks(sampleChunks);
      const limited = await store.listArticles({ limit: 1 });

      expect(limited).toHaveLength(1);
    });
  });

  describe("search with keyword", () => {
    it("keywordフィルタで特定キーワードを含むチャンクのみに絞り込める", async () => {
      await store.addChunks(sampleChunks);
      const queryVector = [0.1, 0.2, 0.3];
      const results = await store.search(queryVector, {
        limit: 5,
        keyword: "サイズ制限",
      });

      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe("art-2");
      expect(results[0].text).toContain("サイズ制限");
    });
  });
});
