import { createEmbeddingProvider } from "./providers/factory.js";
import type { IEmbeddingProvider } from "./providers/types.js";

export * from "./providers/types.js";
export * from "./providers/gemini.js";
export * from "./providers/openai.js";
export * from "./providers/ollama.js";
export * from "./providers/factory.js";

let defaultProvider: IEmbeddingProvider | null = null;

export function getDefaultEmbeddingProvider(): IEmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = createEmbeddingProvider();
  }
  return defaultProvider;
}

export function resetDefaultEmbeddingProvider(): void {
  defaultProvider = null;
}

/**
 * テキストのEmbeddingベクトルを生成する（後方互換ラッパー）
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const provider = getDefaultEmbeddingProvider();
  return provider.getEmbedding(text);
}

/**
 * 複数テキストのEmbeddingベクトルを一括生成する（後方互換ラッパー）
 */
export async function getEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  const provider = getDefaultEmbeddingProvider();
  return provider.getEmbeddings(texts, onProgress);
}
