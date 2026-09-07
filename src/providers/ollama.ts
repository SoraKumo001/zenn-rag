import type { IEmbeddingProvider } from "./types.js";

export interface OllamaProviderOptions {
  baseUrl?: string;
  model: string;
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OllamaProviderOptions) {
    this.model = options.model;
    this.baseUrl = (options.baseUrl || "http://localhost:11434").replace(
      /\/+$/,
      "",
    );
  }

  async getEmbedding(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama Embeddingエラー (${res.status}): ${errorText}`);
    }

    const json = (await res.json()) as { embedding: number[] };
    return json.embedding;
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
    }
    return results;
  }
}
