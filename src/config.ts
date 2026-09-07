import path from "node:path";
import dotenv from "dotenv";

export type EmbeddingProvider = "gemini" | "openai" | "ollama";

export interface RagContext {
  rootDir: string;
  articlesDir: string;
  booksDir: string;
  vectorDbDir: string;
  manifestPath: string;
  provider: EmbeddingProvider;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  zennUsername: string;
}

let currentContext: RagContext | null = null;

export function detectProvider(): EmbeddingProvider {
  const explicit =
    process.env.EMBEDDING_PROVIDER?.toLowerCase() as EmbeddingProvider;
  if (explicit === "gemini" || explicit === "openai" || explicit === "ollama") {
    return explicit;
  }
  if (
    process.env.OPENAI_BASE_URL ||
    (process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY)
  ) {
    return "openai";
  }
  if (process.env.OLLAMA_BASE_URL) {
    return "ollama";
  }
  return "gemini";
}

export function initContext(targetDir?: string): RagContext {
  const rootDir = path.resolve(process.cwd(), targetDir || ".");
  const envPath = path.join(rootDir, ".env");

  // 対象プロジェクトの .env を優先ロード（quiet: true でstdout汚染を防止）
  dotenv.config({ path: envPath, quiet: true });

  const provider = detectProvider();
  const vectorDbRel = process.env.VECTOR_DB_DIR || ".vectordb";
  const vectorDbDir = path.resolve(rootDir, vectorDbRel);

  const commonBaseUrl = process.env.BASE_URL || process.env.EMBEDDING_BASE_URL;
  const commonModel = process.env.EMBEDDING_MODEL;
  const commonApiKey = process.env.API_KEY || process.env.EMBEDDING_API_KEY;

  currentContext = {
    rootDir,
    articlesDir: path.resolve(rootDir, "articles"),
    booksDir: path.resolve(rootDir, "books"),
    vectorDbDir,
    manifestPath: path.resolve(vectorDbDir, "manifest.json"),
    provider,

    // Google Gemini
    geminiApiKey: process.env.GEMINI_API_KEY || commonApiKey || "",
    geminiModel:
      process.env.GEMINI_EMBEDDING_MODEL ||
      commonModel ||
      "gemini-embedding-001",

    // OpenAI / OpenAI-compatible (LM Studio等)
    openaiApiKey:
      process.env.OPENAI_API_KEY ||
      commonApiKey ||
      (process.env.OPENAI_BASE_URL || commonBaseUrl ? "lm-studio" : ""),
    openaiModel:
      process.env.OPENAI_EMBEDDING_MODEL ||
      commonModel ||
      "text-embedding-3-small",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || commonBaseUrl || undefined,

    // Ollama
    ollamaBaseUrl:
      process.env.OLLAMA_BASE_URL || commonBaseUrl || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_EMBEDDING_MODEL || commonModel || "bge-m3",

    // Common
    zennUsername: process.env.ZENN_USERNAME || "",
  };

  return currentContext;
}

export function getContext(): RagContext {
  if (!currentContext) {
    return initContext();
  }
  return currentContext;
}

export function resetContext(): void {
  currentContext = null;
}

export function getActiveModel(): {
  provider: EmbeddingProvider;
  model: string;
} {
  const ctx = getContext();
  switch (ctx.provider) {
    case "openai":
      return { provider: "openai", model: ctx.openaiModel };
    case "ollama":
      return { provider: "ollama", model: ctx.ollamaModel };
    case "gemini":
    default:
      return { provider: "gemini", model: ctx.geminiModel };
  }
}

export function getArticleUrl(slug: string): string {
  const ctx = getContext();
  const username = ctx.zennUsername ? `${ctx.zennUsername}/` : "";
  return `https://zenn.dev/${username}articles/${slug}`;
}

export function getBookChapterUrl(
  bookSlug: string,
  chapterSlug: string,
): string {
  const ctx = getContext();
  const username = ctx.zennUsername ? `${ctx.zennUsername}/` : "";
  return `https://zenn.dev/${username}books/${bookSlug}/viewer/${chapterSlug}`;
}
