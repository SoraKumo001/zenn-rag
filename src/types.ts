export interface ArticleFrontmatter {
  title: string;
  emoji?: string;
  type?: "tech" | "idea";
  topics?: string[];
  published?: boolean;
  [key: string]: unknown;
}

export type ItemType = "article" | "book";

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
  itemType?: ItemType;
  bookSlug?: string;
}

export interface ManifestEntry {
  fileHash: string;
  lastIndexed: string;
  chunkIds: string[];
  itemType?: ItemType;
  bookSlug?: string;
}

export interface SyncManifest {
  version: number;
  provider?: string;
  model?: string;
  entries: Record<string, ManifestEntry>; // key (slug or bookSlug/chapterSlug) -> ManifestEntry
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
  itemType?: ItemType;
  bookSlug?: string;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  topics: string[];
  url: string;
  itemType?: ItemType;
  bookSlug?: string;
}
