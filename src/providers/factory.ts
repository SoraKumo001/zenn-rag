import { getContext, type RagContext } from "../config.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { OllamaEmbeddingProvider } from "./ollama.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import type { IEmbeddingProvider } from "./types.js";

export function createEmbeddingProvider(
  customCtx?: RagContext,
): IEmbeddingProvider {
  const ctx = customCtx ?? getContext();

  switch (ctx.provider) {
    case "openai":
      return new OpenAIEmbeddingProvider({
        apiKey: ctx.openaiApiKey,
        model: ctx.openaiModel,
        baseUrl: ctx.openaiBaseUrl,
      });

    case "ollama":
      return new OllamaEmbeddingProvider({
        baseUrl: ctx.ollamaBaseUrl,
        model: ctx.ollamaModel,
      });

    case "gemini":
    default:
      return new GeminiEmbeddingProvider({
        apiKey: ctx.geminiApiKey,
        model: ctx.geminiModel,
      });
  }
}
