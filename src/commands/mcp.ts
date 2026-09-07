import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getEmbedding } from "../embedder.js";
import { McpLogger, setLogger } from "../logger.js";
import { ArticleVectorStore } from "../store.js";

export async function runMcpServer(): Promise<void> {
  setLogger(new McpLogger());

  const server = new McpServer({
    name: "zenn-rag",
    version: "0.1.0",
  });

  const store = new ArticleVectorStore();

  // 1. 過去記事の類似セクション検索ツール
  server.tool(
    "search_articles",
    "Zennの過去記事からクエリに関連するセクションをベクトル検索します。新しい記事の執筆時に、過去の知見やコード例、関連記事のURLを探すために使用します。",
    {
      query: z
        .string()
        .describe(
          "検索したい内容（例: 'Next.js App RouterのServer Actions実装例', 'Cloudflare Workers WASM'）",
        ),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("取得件数（デフォルト: 5）"),
      topic: z
        .string()
        .optional()
        .describe("トピック名による絞り込み（例: 'nextjs', 'cloudflare'）"),
    },
    async ({ query, limit, topic }) => {
      try {
        const queryVector = await getEmbedding(query);
        const results = await store.search(queryVector, { limit, topic });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "関連する記事は見つかりませんでした。まだインデックスを作成していない場合は `zenn-rag index` を実行してください。",
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            const score = (r.score * 100).toFixed(1);
            return [
              `### [${i + 1}] ${r.title} (類似度: ${score}%)`,
              `- **見出し**: ${r.heading}`,
              `- **URL**: ${r.url}`,
              `- **トピック**: ${r.topics.join(", ") || "なし"}`,
              "",
              "```markdown",
              r.text,
              "```",
            ].join("\n");
          })
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# 過去記事の検索結果 (クエリ: "${query}")\n\n${formatted}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text", text: `検索中にエラーが発生しました: ${msg}` },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. 指定スラッグの記事セクション一覧取得ツール
  server.tool(
    "get_article",
    "指定したスラッグ（ファイル名）の記事の全セクションと内容を取得します。",
    {
      slug: z.string().describe("記事のスラッグ（例: 'cloudflare-scale-up'）"),
    },
    async ({ slug }) => {
      try {
        const chunks = await store.getArticleChunks(slug);
        if (chunks.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `記事 '${slug}' のデータが見つかりませんでした。`,
              },
            ],
          };
        }

        const title = chunks[0].title;
        const url = chunks[0].url;
        const topics = chunks[0].topics.join(", ");

        const body = chunks
          .map((c) => `## ${c.heading}\n\n${c.text}`)
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# ${title}\n- URL: ${url}\n- トピック: ${topics}\n\n${body}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `記事の取得中にエラーが発生しました: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. 登録済みトピック一覧取得ツール
  server.tool(
    "list_topics",
    "蓄積されている過去記事の全トピック（タグ）と各トピックの記事数を取得します。",
    {},
    async () => {
      try {
        const topicCounts = await store.getAllTopics();
        const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) {
          return {
            content: [
              { type: "text", text: "登録されているトピックがありません。" },
            ],
          };
        }

        const list = sorted
          .map(([topic, count]) => `- **${topic}**: ${count} 記事`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `# 過去記事のトピック一覧 (全 ${sorted.length} 種類)\n\n${list}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `トピック取得中にエラーが発生しました: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 4. 執筆支援: 関連記事・本の推薦リンク生成ツール
  server.tool(
    "suggest_related_links",
    "執筆中の記事テキストや構想メモから、関連記事や本チャプターを推薦し、Markdownリンク形式で提示します。記事の内部リンクや引用の作成に便利です。",
    {
      text: z.string().describe("執筆中の文章、段落、または構想メモ"),
      limit: z
        .number()
        .optional()
        .default(3)
        .describe("提案するリンクの最大件数（デフォルト: 3）"),
    },
    async ({ text, limit }) => {
      try {
        const queryVector = await getEmbedding(text);
        const results = await store.search(queryVector, { limit });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "関連する過去記事または本が見つかりませんでした。",
              },
            ],
          };
        }

        const links = results
          .map((r) => {
            const score = (r.score * 100).toFixed(1);
            const excerpt = r.text.slice(0, 120).replace(/\n+/g, " ");
            return `- [${r.title} - ${r.heading}](${r.url}) (類似度: ${score}%)\n  > 関連箇所: ${excerpt}...`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `### 執筆支援: 推薦リンク一覧\n\n${links}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `リンク提案中にエラーが発生しました: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 5. インデックス同期実行ツール
  server.tool(
    "sync_index",
    "Zenn記事および本のインデックスを差分同期（再ベクトル化）します。執筆直後の記事を即座にAIエディタの検索対象に反映させるために使用します。",
    {
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("trueを指定すると全件強制再同期"),
    },
    async ({ force }) => {
      try {
        const { SyncService } = await import("../services/sync-service.js");
        const syncService = new SyncService(new McpLogger());
        const result = await syncService.sync({ force });
        return {
          content: [
            {
              type: "text",
              text: `インデックス同期が正常に完了しました。\n- 全体ファイル数: ${result.totalFiles}\n- 更新ファイル数: ${result.processedArticles}\n- 総チャンク数: ${result.totalChunks}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `インデックス同期中にエラーが発生しました: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
