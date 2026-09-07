import { describe, expect, it } from "vitest";
import {
  computeHash,
  extractParagraphs,
  parseArticle,
  parseBookChapter,
  splitMarkdownIntoSections,
  splitSectionIfLong,
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

  describe("extractParagraphs (コードブロック保護)", () => {
    it("コードブロック内の空行で段落が分割されないこと", () => {
      const markdown = `前の段落テキスト

\`\`\`typescript
const a = 1;

const b = 2;
function hello() {
  return "world";
}
\`\`\`

後ろの段落テキスト`;

      const paragraphs = extractParagraphs(markdown);
      expect(paragraphs.length).toBe(3);
      expect(paragraphs[0]).toBe("前の段落テキスト");
      expect(paragraphs[1]).toContain("const a = 1;\n\nconst b = 2;");
      expect(paragraphs[2]).toBe("後ろの段落テキスト");
    });

    it("~~~ 形式のフェンスでもコードブロックが保護されること", () => {
      const markdown = `~~~bash
echo "step 1"

echo "step 2"
~~~`;
      const paragraphs = extractParagraphs(markdown);
      expect(paragraphs.length).toBe(1);
      expect(paragraphs[0]).toContain('echo "step 1"\n\necho "step 2"');
    });
  });

  describe("splitSectionIfLong", () => {
    it("maxChars以下の場合は分割されないこと", () => {
      const text = "短いテキスト";
      const chunks = splitSectionIfLong(text, 100);
      expect(chunks).toEqual(["短いテキスト"]);
    });

    it("長いテキストがコードブロックを壊さずに分割されること", () => {
      const p1 = "A".repeat(80);
      const codeBlock = "```ts\n" + "console.log('test');\n\n" + "```";
      const fullText = `${p1}\n\n${codeBlock}`;

      const chunks = splitSectionIfLong(fullText, 90);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(p1);
      expect(chunks[1]).toBe(codeBlock);
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
      expect(result.chunks[0].itemType).toBe("article");
      expect(result.chunks[0].vectorText).toContain(
        "記事タイトル: テスト記事のタイトル",
      );
      expect(result.chunks[0].url).toBe(
        "https://zenn.dev/test/articles/test-article",
      );

      // chunk 1: 第一章
      expect(result.chunks[1].id).toBe("test-article#chunk_1");
      expect(result.chunks[1].heading).toBe("第一章");
      expect(result.chunks[1].text).toBe("第一章の内容です。");
      expect(result.chunks[1].itemType).toBe("article");
    });
  });

  describe("parseBookChapter", () => {
    it("本のチャプターから正しいChunkとURLを生成する", () => {
      const markdown = `---
title: "第1章: 環境構築"
---

Dockerのセットアップを行います。
`;
      const result = parseBookChapter(markdown, "my-awesome-book", "01.setup", {
        articleUrl:
          "https://zenn.dev/myuser/books/my-awesome-book/viewer/01.setup",
      });

      expect(result.slug).toBe("my-awesome-book/01.setup");
      expect(result.bookSlug).toBe("my-awesome-book");
      expect(result.chunks.length).toBe(1);

      const chunk = result.chunks[0];
      expect(chunk.id).toBe("my-awesome-book/01.setup#chunk_0");
      expect(chunk.itemType).toBe("book");
      expect(chunk.bookSlug).toBe("my-awesome-book");
      expect(chunk.title).toBe("my-awesome-book: 第1章: 環境構築");
      expect(chunk.url).toBe(
        "https://zenn.dev/myuser/books/my-awesome-book/viewer/01.setup",
      );
      expect(chunk.vectorText).toContain("本: my-awesome-book");
      expect(chunk.vectorText).toContain("チャプター: 第1章: 環境構築");
    });
  });
});
