import fs from "node:fs/promises";
import { watch as fsWatch } from "node:fs";
import path from "node:path";
import { getActiveModel, getContext } from "../config.js";
import { getEmbedding, getEmbeddings } from "../embedder.js";
import {
  computeHash,
  parseArticleFile,
  parseBookChapterFile,
} from "../parser.js";
import { ArticleVectorStore } from "../store.js";
import type { ArticleChunk, ItemType, SyncManifest } from "../types.js";
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

interface ContentTarget {
  filePath: string;
  slug: string; // 記事: slug, 本: bookSlug/chapterSlug
  itemType: ItemType;
  bookSlug?: string;
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
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  /**
   * articles/ および books/ から対象 Markdown ファイルを走査
   */
  private async scanContentTargets(
    articlesDir: string,
    booksDir: string,
  ): Promise<ContentTarget[]> {
    const targets: ContentTarget[] = [];
    let hasFoundAnyDir = false;

    // 1. articles/
    try {
      const entries = await fs.readdir(articlesDir);
      hasFoundAnyDir = true;
      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const slug = path.basename(entry, ".md");
          targets.push({
            filePath: path.join(articlesDir, entry),
            slug,
            itemType: "article",
          });
        }
      }
    } catch {
      // articles/ がない場合スキップ
    }

    // 2. books/
    try {
      const bookEntries = await fs.readdir(booksDir, { withFileTypes: true });
      hasFoundAnyDir = true;
      for (const bookEntry of bookEntries) {
        if (bookEntry.isDirectory()) {
          const bookSlug = bookEntry.name;
          const bookDirPath = path.join(booksDir, bookSlug);
          try {
            const chapterFiles = await fs.readdir(bookDirPath);
            for (const chFile of chapterFiles) {
              if (chFile.endsWith(".md")) {
                const chSlug = path.basename(chFile, ".md");
                targets.push({
                  filePath: path.join(bookDirPath, chFile),
                  slug: `${bookSlug}/${chSlug}`,
                  itemType: "book",
                  bookSlug,
                });
              }
            }
          } catch {
            // チャプター読み込みエラーはスキップ
          }
        }
      }
    } catch {
      // books/ がない場合スキップ
    }

    if (!hasFoundAnyDir) {
      throw new Error(
        `記事または本ディレクトリが見つかりません (articles: ${articlesDir}, books: ${booksDir})`,
      );
    }

    return targets;
  }

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const logger = options.logger ?? this.logger;
    const ctx = getContext();
    const active = getActiveModel();

    logger.info("=== Zenn 記事 / 本 インデックス同期 ===");
    logger.info(`プロバイダ:       ${active.provider}`);
    logger.info(`Embeddingモデル:  ${active.model}`);
    logger.info(`記事ディレクトリ: ${ctx.articlesDir}`);
    logger.info(`本ディレクトリ:   ${ctx.booksDir}`);
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

    let targets: ContentTarget[] = [];
    try {
      targets = await this.scanContentTargets(ctx.articlesDir, ctx.booksDir);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      throw err;
    }

    const currentSlugs = new Set(targets.map((t) => t.slug));

    // 削除されたコンテンツをDBから除去
    for (const manifestSlug of Object.keys(manifest.entries)) {
      if (!currentSlugs.has(manifestSlug)) {
        logger.info(`[削除検知] ${manifestSlug} をDBから削除しています...`);
        await store.deleteBySlug(manifestSlug);
        delete manifest.entries[manifestSlug];
      }
    }

    // 変更または未処理のファイルを抽出
    const toProcess: ContentTarget[] = [];
    for (const target of targets) {
      const content = await fs.readFile(target.filePath, "utf-8");
      const currentHash = computeHash(content);

      const prevEntry = manifest.entries[target.slug];
      if (!prevEntry || prevEntry.fileHash !== currentHash || options.force) {
        toProcess.push(target);
      }
    }

    if (toProcess.length === 0) {
      logger.info("全コンテンツがすでに最新状態です。更新の必要はありません。");
      return {
        totalFiles: targets.length,
        processedArticles: 0,
        totalChunks: 0,
        isReset,
      };
    }

    logger.info(`対象ファイル数: ${toProcess.length} 件 / 全 ${targets.length} 件`);

    const allNewChunks: {
      slug: string;
      fileHash: string;
      itemType: ItemType;
      bookSlug?: string;
      chunks: ArticleChunk[];
    }[] = [];

    for (const target of toProcess) {
      if (target.itemType === "book" && target.bookSlug) {
        const parsed = await parseBookChapterFile(
          target.filePath,
          target.bookSlug,
        );
        allNewChunks.push({
          slug: target.slug,
          fileHash: parsed.fileHash,
          itemType: "book",
          bookSlug: target.bookSlug,
          chunks: parsed.chunks,
        });
      } else {
        const parsed = await parseArticleFile(target.filePath);
        allNewChunks.push({
          slug: target.slug,
          fileHash: parsed.fileHash,
          itemType: "article",
          chunks: parsed.chunks,
        });
      }
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
      const typeLabel = item.itemType === "book" ? "[Book]" : "[Article]";
      logger.write(
        `- ${typeLabel} ${item.slug} (${item.chunks.length} chunks)... `,
      );

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
        itemType: item.itemType,
        bookSlug: item.bookSlug,
      };
      await this.saveManifest(ctx.manifestPath, manifest);

      processedChunks += item.chunks.length;
      logger.info(`完了 (${processedChunks}/${totalChunks})`);
    }

    logger.info("\nインデックス同期が正常に完了しました！");

    return {
      totalFiles: targets.length,
      processedArticles: toProcess.length,
      totalChunks,
      isReset,
    };
  }

  /**
   * ファイル保存を監視して自動同期するウォッチモード
   */
  async watch(options: SyncOptions = {}): Promise<void> {
    const logger = options.logger ?? this.logger;
    const ctx = getContext();

    // 初回同期を実行
    logger.info("[ウォッチモード起動] 初回インデックス同期を実行します...");
    try {
      await this.sync(options);
    } catch (err) {
      logger.error("初回同期に失敗しました:", err);
    }

    logger.info("\n👀 ファイル変更を監視中... (終了するには Ctrl+C を押してください)");

    let debounceTimer: NodeJS.Timeout | null = null;
    let isSyncing = false;

    const triggerSync = (filename?: string | null) => {
      if (filename && !filename.endsWith(".md")) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        if (isSyncing) return;
        isSyncing = true;
        try {
          logger.info(`\n[変更検知: ${filename || "ファイル"}] 差分同期を開始...`);
          await this.sync(options);
          logger.info("👀 ファイル変更を監視中...");
        } catch (err) {
          logger.error("自動同期中にエラーが発生しました:", err);
        } finally {
          isSyncing = false;
        }
      }, 1500);
    };

    // articles/ の監視
    try {
      fsWatch(ctx.articlesDir, { recursive: true }, (_, filename) => {
        triggerSync(filename);
      });
      logger.info(`- 監視中: ${ctx.articlesDir}`);
    } catch {
      // ディレクトリ未作成なら無視
    }

    // books/ の監視
    try {
      fsWatch(ctx.booksDir, { recursive: true }, (_, filename) => {
        triggerSync(filename);
      });
      logger.info(`- 監視中: ${ctx.booksDir}`);
    } catch {
      // ディレクトリ未作成なら無視
    }

    // プロセスを維持
    await new Promise(() => {});
  }
}
