import fs from "node:fs/promises";
import path from "node:path";
import { getActiveModel, getContext } from "../config.js";
import { ArticleVectorStore } from "../store.js";
import type { SyncManifest } from "../types.js";

function renderProgressBar(current: number, total: number, width = 30): string {
  if (total === 0) return `[${"-".repeat(width)}] 0.0%`;
  const percent = Math.min(100, Math.max(0, (current / total) * 100));
  const filled = Math.round((width * percent) / 100);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent.toFixed(1)}%`;
}

export async function showStatus(): Promise<void> {
  const ctx = getContext();
  const active = getActiveModel();

  console.log("=== Zenn RAG インデックス状況 ===");
  console.log(`対象フォルダ: ${ctx.rootDir}`);
  console.log(`現在の設定:   ${active.provider} (${active.model})\n`);

  let articleFiles: string[] = [];
  try {
    const entries = await fs.readdir(ctx.articlesDir);
    articleFiles = entries.filter((f) => f.endsWith(".md"));
  } catch {
    // articlesDir未作成
  }

  let bookFiles: string[] = [];
  try {
    const bookDirs = await fs.readdir(ctx.booksDir, { withFileTypes: true });
    for (const d of bookDirs) {
      if (d.isDirectory()) {
        const chFiles = await fs.readdir(path.join(ctx.booksDir, d.name));
        for (const ch of chFiles) {
          if (ch.endsWith(".md")) {
            bookFiles.push(`${d.name}/${ch}`);
          }
        }
      }
    }
  } catch {
    // booksDir未作成
  }

  const totalFiles = articleFiles.length + bookFiles.length;
  if (totalFiles === 0) {
    console.error("記事または本のディレクトリが見つかりません。");
    return;
  }

  let manifest: SyncManifest = { version: 1, entries: {} };
  try {
    const raw = await fs.readFile(ctx.manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch {
    // まだ未作成
  }

  const indexedTargets = Object.keys(manifest.entries);
  const indexedCount = indexedTargets.length;

  let indexedChunks = 0;
  for (const entry of Object.values(manifest.entries)) {
    indexedChunks += entry.chunkIds?.length || 0;
  }

  const avgChunksPerItem = indexedCount > 0 ? indexedChunks / indexedCount : 5;
  const estimatedTotalChunks =
    indexedCount === totalFiles
      ? indexedChunks
      : Math.max(indexedChunks, Math.round(avgChunksPerItem * totalFiles));

  console.log(`■ コンテンツの進捗:`);
  console.log(`  ${renderProgressBar(indexedCount, totalFiles)}`);
  console.log(
    `  完了: ${indexedCount} / ${totalFiles} ファイル (記事: ${articleFiles.length}, 本チャプター: ${bookFiles.length})\n`,
  );

  console.log(`■ チャンクの進捗:`);
  console.log(`  ${renderProgressBar(indexedChunks, estimatedTotalChunks)}`);
  console.log(
    `  完了: ${indexedChunks} / ${
      indexedCount === totalFiles
        ? `${indexedChunks}`
        : `約 ${estimatedTotalChunks}`
    } チャンク\n`,
  );

  if (indexedCount > 0) {
    const recent = Object.entries(manifest.entries)
      .sort(
        (a, b) =>
          new Date(b[1].lastIndexed).getTime() -
          new Date(a[1].lastIndexed).getTime(),
      )
      .slice(0, 3);

    console.log(`■ 直近にインデックスされた記事:`);
    for (const [slug, entry] of recent) {
      const dateStr = new Date(entry.lastIndexed).toLocaleTimeString();
      console.log(
        `  - [${dateStr}] ${slug} (${entry.chunkIds.length} チャンク)`,
      );
    }
    console.log();
  }

  try {
    const store = new ArticleVectorStore();
    const topics = await store.getAllTopics();
    const topicEntries = Object.entries(topics).sort((a, b) => b[1] - a[1]);

    if (topicEntries.length > 0) {
      console.log(`■ 登録済みトピック (上位10件):`);
      const top10 = topicEntries.slice(0, 10);
      for (const [topic, count] of top10) {
        console.log(`  - ${topic}: ${count} 記事`);
      }
      console.log(`  (他 全 ${topicEntries.length} トピック)`);
    }
  } catch {
    // スキップ
  }

  console.log(`\n${"=".repeat(45)}`);
  if (indexedCount < totalFiles) {
    console.log(
      "💡 インデックスが未完了です。`zenn-rag index` で同期できます。",
    );
  } else {
    console.log("🎉 全コンテンツのインデックス同期が完了しています！");
  }
}
