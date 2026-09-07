import { GoogleGenAI } from "@google/genai";
import { sleep } from "./base.js";
import type { IEmbeddingProvider } from "./types.js";

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  maxRetries?: number;
  delayBetweenRequestsMs?: number;
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly delayBetweenRequestsMs: number;
  private client: GoogleGenAI | null = null;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) {
      throw new Error(
        "GEMINI_API_KEY が設定されていません。\n" +
          ".env に GEMINI_API_KEY=<your-key> を設定するか、\n" +
          "または EMBEDDING_PROVIDER=openai を指定して OPENAI_API_KEY を設定してください。",
      );
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.maxRetries = options.maxRetries ?? 5;
    this.delayBetweenRequestsMs = options.delayBetweenRequestsMs ?? 650;
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const ai = this.getClient();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await ai.models.embedContent({
          model: this.model,
          contents: text,
        });

        const embedding =
          response.embeddings?.[0]?.values ||
          (response as unknown as { embedding?: { values: number[] } })
            .embedding?.values;

        if (!embedding || embedding.length === 0) {
          throw new Error(
            "Gemini Embeddingの生成に失敗しました: 空のベクトルが返されました",
          );
        }
        return embedding;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          errorMsg.includes("429") ||
          errorMsg.includes("RESOURCE_EXHAUSTED") ||
          errorMsg.includes("quota");

        if (isRateLimit && attempt <= this.maxRetries) {
          const match =
            errorMsg.match(/retry in ([0-9.]+)s/i) ||
            errorMsg.match(/retryDelay["':\s]+([0-9.]+)s/i);
          let waitMs = 3000 * Math.pow(1.5, attempt);
          if (match && match[1]) {
            waitMs = Math.ceil(parseFloat(match[1])) * 1000 + 1000;
          }

          console.warn(
            `\n[Gemini レートリミット待機] Quota制限のため ${Math.round(
              waitMs / 1000,
            )} 秒待機して再試行します (${attempt}/${this.maxRetries})...`,
          );
          await sleep(waitMs);
          continue;
        }

        throw err;
      }
    }

    throw new Error(
      `Gemini Embedding生成が ${this.maxRetries} 回の再試行後に失敗しました`,
    );
  }

  async getEmbeddings(
    texts: string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const vector = await this.getEmbedding(texts[i]);
      results.push(vector);

      if (onProgress) {
        onProgress(i + 1, texts.length);
      }
      if (i + 1 < texts.length) {
        await sleep(this.delayBetweenRequestsMs);
      }
    }

    return results;
  }
}
