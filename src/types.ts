export interface ArticleFrontmatter {
  title: string;
  emoji?: string;
  type?: "tech" | "idea";
  topics?: string[];
  published?: boolean;
  [key: string]: unknown;
}

export interface ArticleChunk {
  id: string;
  slug: string;
  title: string;
  topics: string[];
  heading: string;
  text: string;
  vectorText: string;
  url: string;
  contentHash: string;
  vector?: number[];
}

export interface ManifestEntry {
  fileHash: string;
  lastIndexed: string;
  chunkIds: string[];
}

export interface SyncManifest {
  version: number;
  provider?: string;
  model?: string;
  entries: Record<string, ManifestEntry>; // slug -> ManifestEntry
}

export interface SearchResult {
  id: string;
  slug: string;
  title: string;
  topics: string[];
  heading: string;
  text: string;
  url: string;
  score: number;
}
