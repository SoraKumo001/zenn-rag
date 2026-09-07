import { describe, expect, it, vi } from "vitest";
import { createEmbeddingProvider } from "../src/providers/factory.js";
import { OllamaEmbeddingProvider } from "../src/providers/ollama.js";
import { OpenAIEmbeddingProvider } from "../src/providers/openai.js";
import type { RagContext } from "../src/config.js";

describe("Embedding Providers", () => {
  describe("OpenAIEmbeddingProvider", () => {
    it("OpenAI互換エンドポイントに正しくリクエストを送信してEmbeddingを取得できる", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
        model: "text-embedding-3-small",
        baseUrl: "https://custom.openai.com/v1",
      });

      const embedding = await provider.getEmbedding("test query");

      expect(embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://custom.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-key",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: "test query",
          }),
        }),
      );

      vi.unstubAllGlobals();
    });

    it("バッチ取得でソートされたEmbedding配列を返す", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 1, embedding: [0.4, 0.5] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({
        model: "text-embedding-3-small",
      });

      const progressCallback = vi.fn();
      const embeddings = await provider.getEmbeddings(
        ["text1", "text2"],
        progressCallback,
      );

      expect(embeddings).toEqual([
        [0.1, 0.2],
        [0.4, 0.5],
      ]);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);

      vi.unstubAllGlobals();
    });
  });

  describe("OllamaEmbeddingProvider", () => {
    it("Ollamaエンドポイントにリクエストを送信してEmbeddingを取得できる", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: [0.7, 0.8, 0.9],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OllamaEmbeddingProvider({
        baseUrl: "http://localhost:11434",
        model: "bge-m3",
      });

      const embedding = await provider.getEmbedding("ollama query");

      expect(embedding).toEqual([0.7, 0.8, 0.9]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "bge-m3",
            prompt: "ollama query",
          }),
        }),
      );

      vi.unstubAllGlobals();
    });
  });

  describe("createEmbeddingProvider factory", () => {
    it("RagContextのprovider設定に応じて適切なプロバイダを返す", () => {
      const mockCtx: RagContext = {
        rootDir: "",
        articlesDir: "",
        vectorDbDir: "",
        manifestPath: "",
        provider: "openai",
        geminiApiKey: "",
        geminiModel: "gemini-embedding-001",
        openaiApiKey: "key",
        openaiModel: "text-embedding-3-small",
        openaiBaseUrl: "http://localhost:1234/v1",
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "bge-m3",
        zennUsername: "testuser",
      };

      const provider = createEmbeddingProvider(mockCtx);
      expect(provider.name).toBe("openai");
      expect(provider.model).toBe("text-embedding-3-small");
    });
  });
});
