#!/usr/bin/env node
import { Command } from "commander";
import { initContext } from "./config.js";
import { syncIndex } from "./commands/index.js";
import { searchCli } from "./commands/search.js";
import { showStatus } from "./commands/status.js";
import { runMcpServer } from "./commands/mcp.js";
import { getLogger } from "./logger.js";

const program = new Command();
const logger = getLogger();

function handleCliAction(action: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await action();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`\n[エラー発生]: ${message}`);
      process.exit(1);
    }
  };
}

program
  .name("zenn-rag")
  .description("Zenn articles Vector DB & RAG toolkit with MCP server")
  .version("0.1.0");

// 1. index
program
  .command("index")
  .description("Zenn記事をベクトル化してVector DBに同期します（差分更新対応）")
  .option("-f, --force", "既存のインデックスを破棄して全件再同期する")
  .option("-w, --watch", "ファイルを監視して変更時に自動で差分同期する")
  .option(
    "-d, --dir <path>",
    "Zennプロジェクトのルートディレクトリ（デフォルト: カレントディレクトリ）",
  )
  .action((options) =>
    handleCliAction(async () => {
      initContext(options.dir);
      await syncIndex({ force: options.force, watch: options.watch });
    })(),
  );

// 2. search
program
  .command("search <query>")
  .description("過去記事から類似セクションをベクトル検索します")
  .option("-l, --limit <number>", "取得件数", (val) => parseInt(val, 10), 5)
  .option("-t, --topic <topic>", "特定のトピック（タグ）で絞り込み")
  .option("-d, --dir <path>", "Zennプロジェクトのルートディレクトリ")
  .action((query, options) =>
    handleCliAction(async () => {
      initContext(options.dir);
      await searchCli(query, { limit: options.limit, topic: options.topic });
    })(),
  );

// 3. status
program
  .command("status")
  .description("現在のインデックス状況や登録済みトピック統計を表示します")
  .option("-d, --dir <path>", "Zennプロジェクトのルートディレクトリ")
  .action((options) =>
    handleCliAction(async () => {
      initContext(options.dir);
      await showStatus();
    })(),
  );

// 4. mcp
program
  .command("mcp")
  .description("Model Context Protocol (MCP) サーバーを起動します（Stdio通信）")
  .option("-d, --dir <path>", "Zennプロジェクトのルートディレクトリ")
  .action((options) =>
    handleCliAction(async () => {
      initContext(options.dir);
      await runMcpServer();
    })(),
  );

program.parse(process.argv);
