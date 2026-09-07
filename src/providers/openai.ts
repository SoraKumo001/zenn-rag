import type { IEmbeddingProvider } from "./types.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  batchSize?: number;
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly batchSize: number;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey || (options.baseUrl ? "lm-studio" : "");
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(
      /\/+$/,
      "",
    );
    this.batchSize = options.batchSize ?? 25;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey || "lm-studio"}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Embedding APIエラー (${res.status}): ${errorText}`);
    }

    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  }

  async getEmbeddings(
    texts: string[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey || "lm-studio"}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Embedding APIエラー (${res.status}): ${errorText}`);
      }

      const json = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(item.embedding);
      }

      if (onProgress) {
        onProgress(results.length, texts.length);
      }
    }

    return results;
  }
}
