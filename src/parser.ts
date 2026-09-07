import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { getArticleUrl } from "./config.js";
import type { ArticleChunk, ArticleFrontmatter } from "./types.js";

export function computeHash(content: string): string {
  return crypto.createHash("md5").update(content, "utf8").digest("hex");
}

/**
 * Markdownを見出し単位でセクションに分割する
 */
export function splitMarkdownIntoSections(
  markdown: string,
): { heading: string; text: string }[] {
  const lines = markdown.split(/\r?\n/);
  const sections: { heading: string; text: string }[] = [];

  const headingStack: { level: number; text: string }[] = [];
  let currentLines: string[] = [];
  let currentHeading = "イントロダクション";

  function saveCurrentSection() {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      sections.push({
        heading: currentHeading,
        text,
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      saveCurrentSection();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text: title });
      currentHeading = headingStack.map((h) => h.text).join(" > ");
    } else {
      currentLines.push(line);
    }
  }

  saveCurrentSection();
  return sections;
}

function splitSectionIfLong(text: string, maxChars = 2000): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current.length > 0 ? `${current}\n\n${p}` : p;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

export interface ParseArticleOptions {
  articleUrl?: string;
}

/**
 * Markdown文字列をパースしてArticleChunk配列に変換する純粋関数
 */
export function parseArticle(
  rawContent: string,
  slug: string,
  options?: ParseArticleOptions,
): {
  slug: string;
  frontmatter: ArticleFrontmatter;
  chunks: ArticleChunk[];
  fileHash: string;
} {
  const fileHash = computeHash(rawContent);
  const parsed = matter(rawContent);
  const frontmatter = parsed.data as ArticleFrontmatter;
  const title = frontmatter.title || slug;
  const topics = Array.isArray(frontmatter.topics) ? frontmatter.topics : [];
  const articleUrl = options?.articleUrl ?? getArticleUrl(slug);

  const sections = splitMarkdownIntoSections(parsed.content);
  const chunks: ArticleChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const subTexts = splitSectionIfLong(section.text);
    for (let i = 0; i < subTexts.length; i++) {
      const text = subTexts[i];
      const partSuffix = subTexts.length > 1 ? ` (Part ${i + 1})` : "";
      const headingWithPart = `${section.heading}${partSuffix}`;

      const vectorText = [
        `記事タイトル: ${title}`,
        topics.length > 0 ? `トピック: ${topics.join(", ")}` : null,
        `見出し: ${headingWithPart}`,
        "",
        text,
      ]
        .filter(Boolean)
        .join("\n");

      chunks.push({
        id: `${slug}#chunk_${chunkIndex++}`,
        slug,
        title,
        topics,
        heading: headingWithPart,
        text,
        vectorText,
        url: articleUrl,
        contentHash: computeHash(text),
      });
    }
  }

  return { slug, frontmatter, chunks, fileHash };
}

/**
 * 1つのMarkdownファイルを読み込んでパースし、複数のArticleChunkに変換する
 */
export async function parseArticleFile(
  filePath: string,
  options?: ParseArticleOptions,
): Promise<{
  slug: string;
  frontmatter: ArticleFrontmatter;
  chunks: ArticleChunk[];
  fileHash: string;
}> {
  const rawContent = await fs.readFile(filePath, "utf-8");
  const slug = path.basename(filePath, path.extname(filePath));
  return parseArticle(rawContent, slug, options);
}
