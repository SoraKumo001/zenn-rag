import fs from "node:fs/promises";
import path from "node:path";
import { getActiveModel, getContext } from "../config.js";
import { getEmbedding, getEmbeddings } from "../embedder.js";
import { computeHash, parseArticleFile } from "../parser.js";
import { ArticleVectorStore } from "../store.js";
import type { SyncManifest } from "../types.js";
import { getLogger, type Logger } from "../logger.js";

export interface SyncOptions {
  force?: boolean;
  logger?: Logger;
}

export interface SyncResult {
  totalFiles: number;
  processedArticles: number;
  totalChunks: number;
  isReset: boolean;
}

export class SyncService {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? getLogger();
  }

  async loadManifest(manifestPath: string): Promise<SyncManifest> {
    try {
      const raw = await fs.readFile(manifestPath, "utf-8");
      return JSON.parse(raw) as SyncManifest;
    } catch {
      return { version: 1, entries: {} };
    }
  }

  async saveManifest(
    manifestPath: string,
    manifest: SyncManifest,
  ): Promise<void> {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  }

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const logger = options.logger ?? this.logger;
    const ctx = getContext();
    const active = getActiveModel();

    logger.info("=== Zenn 記事インデックス同期 ===");
    logger.info(`プロバイダ:       ${active.provider}`);
    logger.info(`Embeddingモデル:  ${active.model}`);
    logger.info(`記事ディレクトリ: ${ctx.articlesDir}`);
    logger.info(`Vector DB保存先:  ${ctx.vectorDbDir}\n`);

    let manifest = await this.loadManifest(ctx.manifestPath);
    const store = new ArticleVectorStore();
    await store.init();

    logger.write("Embeddingモデルの接続と次元数を確認中... ");
    const testVector = await getEmbedding("health check");
    const currentDim = testVector.length;
    logger.info(`OK (${currentDim}次元)`);

    const dbDim = await store.getVectorDimension();
    const hasExistingEntries = Object.keys(manifest.entries).length > 0;
    const isDimensionMismatch = dbDim !== null && dbDim !== currentDim;
    const isModelChanged =
      !manifest.model ||
      manifest.provider !== active.provider ||
      manifest.model !== active.model ||
      isDimensionMismatch;

    let isReset = false;

    if (options.force || isDimensionMismatch) {
      isReset = true;
      if (isDimensionMismatch) {
        logger.info(`\n[ベクトルの次元数不一致を検知]`);
        logger.info(`  既存DB: ${dbDim}次元`);
        logger.info(`  新モデル: ${currentDim}次元`);
        logger.info(
          `  ベクトルの次元数が異なるため、Vector DBとマニフェストを自動リセットして全件再インデックスします。\n`,
        );
      } else {
        logger.info(
          "[強制再インデックス] 既存のVector DBとマニフェストをリセットします...\n",
        );
      }
      await store.resetTable();
      manifest = {
        version: 1,
        provider: active.provider,
        model: active.model,
        entries: {},
      };
    } else if (hasExistingEntries && isModelChanged) {
      isReset = true;
      logger.info(`\n[プロバイダ / モデル変更を検知]`);
      logger.info(
        `  前回: ${manifest.provider || "未記録"} (${manifest.model || "未記録"})`,
      );
      logger.info(`  今回: ${active.provider} (${active.model})`);
      logger.info(
        `  ベクトルの形式が異なるため、Vector DBを自動リセットして全件再インデックスします。\n`,
      );

      await store.resetTable();
      manifest = {
        version: 1,
        provider: active.provider,
        model: active.model,
        entries: {},
      };
    } else {
      manifest.provider = active.provider;
      manifest.model = active.model;
    }

    let allFiles: string[] = [];
    try {
      const entries = await fs.readdir(ctx.articlesDir);
      allFiles = entries.filter((f) => f.endsWith(".md"));
    } catch (err) {
      logger.error("記事ディレクトリが見つかりません:", ctx.articlesDir);
      throw err;
    }

    const currentSlugs = new Set(allFiles.map((f) => path.basename(f, ".md")));

    // 削除された記事をDBから除去
    for (const manifestSlug of Object.keys(manifest.entries)) {
      if (!currentSlugs.has(manifestSlug)) {
        logger.info(`[削除検知] ${manifestSlug} をDBから削除しています...`);
        await store.deleteBySlug(manifestSlug);
        delete manifest.entries[manifestSlug];
      }
    }

    // 変更または未処理の記事を抽出
    const toProcess: string[] = [];
    for (const file of allFiles) {
      const filePath = path.join(ctx.articlesDir, file);
      const slug = path.basename(file, ".md");
      const content = await fs.readFile(filePath, "utf-8");
      const currentHash = computeHash(content);

      const prevEntry = manifest.entries[slug];
      if (!prevEntry || prevEntry.fileHash !== currentHash || options.force) {
        toProcess.push(filePath);
      }
    }

    if (toProcess.length === 0) {
      logger.info("全記事がすでに最新状態です。更新の必要はありません。");
      return {
        totalFiles: allFiles.length,
        processedArticles: 0,
        totalChunks: 0,
        isReset,
      };
    }

    logger.info(
      `対象記事数: ${toProcess.length} 件 / 全 ${allFiles.length} 件`,
    );

    const allNewChunks: {
      slug: string;
      fileHash: string;
      chunks: Awaited<ReturnType<typeof parseArticleFile>>["chunks"];
    }[] = [];

    for (const filePath of toProcess) {
      const parsed = await parseArticleFile(filePath);
      allNewChunks.push(parsed);
    }

    const totalChunks = allNewChunks.reduce(
      (acc, cur) => acc + cur.chunks.length,
      0,
    );
    logger.info(`総チャンク数: ${totalChunks} 個`);
    logger.info(
      `ベクトル埋め込みを生成中 (${active.provider} / ${active.model})...\n`,
    );

    let processedChunks = 0;
    for (const item of allNewChunks) {
      logger.write(`- [${item.slug}] (${item.chunks.length} chunks)... `);

      if (item.chunks.length === 0) {
        logger.info("本文なし（スキップ）");
        continue;
      }

      const textsToEmbed = item.chunks.map((c) => c.vectorText);
      const vectors = await getEmbeddings(textsToEmbed);

      for (let i = 0; i < item.chunks.length; i++) {
        item.chunks[i].vector = vectors[i];
      }

      await store.deleteBySlug(item.slug);
      await store.addChunks(item.chunks);

      manifest.entries[item.slug] = {
        fileHash: item.fileHash,
        lastIndexed: new Date().toISOString(),
        chunkIds: item.chunks.map((c) => c.id),
      };
      await this.saveManifest(ctx.manifestPath, manifest);

      processedChunks += item.chunks.length;
      logger.info(`完了 (${processedChunks}/${totalChunks})`);
    }

    logger.info("\nインデックス同期が正常に完了しました！");

    return {
      totalFiles: allFiles.length,
      processedArticles: toProcess.length,
      totalChunks,
      isReset,
    };
  }
}
