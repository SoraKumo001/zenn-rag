import { getEmbedding } from "../embedder.js";
import { ArticleVectorStore } from "../store.js";
import type { SearchResult } from "../types.js";

export async function searchArticles(
  query: string,
  options: { limit?: number; topic?: string } = {},
): Promise<SearchResult[]> {
  const queryVector = await getEmbedding(query);
  const store = new ArticleVectorStore();
  return store.search(queryVector, options);
}

export async function searchCli(
  query: string,
  options: { limit?: number; topic?: string } = {},
): Promise<void> {
  const limit = options.limit || 5;
  const topic = options.topic;

  console.log(
    `\n🔍 検索クエリ: "${query}"${topic ? ` (トピック: ${topic})` : ""}`,
  );
  console.log("ベクトル生成中...");

  const results = await searchArticles(query, { limit, topic });

  if (results.length === 0) {
    console.log(
      "\n該当する記事が見つかりませんでした。まだインデックスを作成していない場合は `zenn-rag index` を実行してください。",
    );
    return;
  }

  console.log(`\n検索結果 (${results.length} 件):\n${"=".repeat(60)}`);

  results.forEach((res, idx) => {
    const scorePct = (res.score * 100).toFixed(1);
    console.log(`\n[${idx + 1}] スコア: ${scorePct}% | ${res.title}`);
    console.log(`    見出し: ${res.heading}`);
    console.log(`    URL:    ${res.url}`);
    if (res.topics.length > 0) {
      console.log(`    タグ:   ${res.topics.join(", ")}`);
    }
    console.log(`    抜粋:`);
    const preview = res.text
      .split("\n")
      .slice(0, 4)
      .map((line) => `      ${line}`)
      .join("\n");
    console.log(preview);
  });
  console.log(`\n${"=".repeat(60)}\n`);
}
