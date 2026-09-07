import { describe, expect, it } from "vitest";
import {
  computeHash,
  parseArticle,
  splitMarkdownIntoSections,
} from "../src/parser.js";

describe("parser", () => {
  describe("computeHash", () => {
    it("同一の入力に対して同じMD5ハッシュを返す", () => {
      const hash1 = computeHash("hello world");
      const hash2 = computeHash("hello world");
      const hash3 = computeHash("different text");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toHaveLength(32);
    });
  });

  describe("splitMarkdownIntoSections", () => {
    it("見出しのないテキストをイントロダクションとして分割する", () => {
      const text = "これはイントロダクションです。\nまだ見出しはありません。";
      const sections = splitMarkdownIntoSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].heading).toBe("イントロダクション");
      expect(sections[0].text).toContain("これはイントロダクションです。");
    });

    it("階層的な見出し（H1 > H2 > H3）を正しく構築する", () => {
      const markdown = `
# 大見出し1
本文1

## 中見出し1-1
本文1-1

### 小見出し1-1-1
本文1-1-1

## 中見出し1-2
本文1-2
`;
      const sections = splitMarkdownIntoSections(markdown);

      expect(sections.length).toBe(4);
      expect(sections[0].heading).toBe("大見出し1");
      expect(sections[0].text).toBe("本文1");

      expect(sections[1].heading).toBe("大見出し1 > 中見出し1-1");
      expect(sections[1].text).toBe("本文1-1");

      expect(sections[2].heading).toBe(
        "大見出し1 > 中見出し1-1 > 小見出し1-1-1",
      );
      expect(sections[2].text).toBe("本文1-1-1");

      expect(sections[3].heading).toBe("大見出し1 > 中見出し1-2");
      expect(sections[3].text).toBe("本文1-2");
    });
  });

  describe("parseArticle", () => {
    it("Frontmatterと見出しからChunkとメタデータを正しく生成する", () => {
      const markdown = `---
title: "テスト記事のタイトル"
emoji: "🚀"
type: "tech"
topics: ["typescript", "vitest"]
published: true
---

はじめに

## 第一章
第一章の内容です。
`;
      const result = parseArticle(markdown, "test-article", {
        articleUrl: "https://zenn.dev/test/articles/test-article",
      });

      expect(result.slug).toBe("test-article");
      expect(result.frontmatter.title).toBe("テスト記事のタイトル");
      expect(result.frontmatter.topics).toEqual(["typescript", "vitest"]);
      expect(result.chunks.length).toBe(2);

      // chunk 0: イントロダクション
      expect(result.chunks[0].id).toBe("test-article#chunk_0");
      expect(result.chunks[0].heading).toBe("イントロダクション");
      expect(result.chunks[0].title).toBe("テスト記事のタイトル");
      expect(result.chunks[0].topics).toEqual(["typescript", "vitest"]);
      expect(result.chunks[0].text).toBe("はじめに");
      expect(result.chunks[0].vectorText).toContain(
        "記事タイトル: テスト記事のタイトル",
      );
      expect(result.chunks[0].vectorText).toContain(
        "トピック: typescript, vitest",
      );
      expect(result.chunks[0].url).toBe(
        "https://zenn.dev/test/articles/test-article",
      );

      // chunk 1: 第一章
      expect(result.chunks[1].id).toBe("test-article#chunk_1");
      expect(result.chunks[1].heading).toBe("第一章");
      expect(result.chunks[1].text).toBe("第一章の内容です。");
    });
  });
});
