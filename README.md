# zenn-rag

[![npm version](https://img.shields.io/npm/v/zenn-rag.svg)](https://www.npmjs.com/package/zenn-rag)
[![npm downloads](https://img.shields.io/npm/dm/zenn-rag.svg)](https://www.npmjs.com/package/zenn-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io/)

Zenn 記事・本リポジトリのための **Vector DB & RAG（検索・執筆支援）ツールキット**。
Markdown記事・チャプターを見出し単位でベクトル化し、CLI検索および **Model Context Protocol (MCP)** サーバー経由でエディタやAIアシスタント（Cursor、Claude、Antigravityなど）と連携できます。

---

## 主な機能

- **コードブロック保護付き階層チャンキング**: Frontmatterメタデータ（タイトル・トピック）と見出し（H1〜H3）の階層構造を保持し、コードブロックを途中で切断せずにベクトル化
- **Zenn 記事（Articles）＆ 本（Books）の双方に対応**: `articles/*.md` に加え、`books/<book-slug>/*.md` の各チャプターも自動認識してインデックス
- **自動同期（ウォッチモード）**: `index --watch` でファイル保存時にバックグラウンドで即時差分同期
- **マルチプロバイダー対応**:
  - **OpenAI / LM Studio / LocalAI**: 高速バッチEmbedding（`text-embedding-bge-m3`, `text-embedding-3-small` など）
  - **Google Gemini**: レートリミット制御・自動リトライ付き（`gemini-embedding-001`）
  - **Ollama**: ローカルオフライン実行（`bge-m3` など）
- **高速・サーバーレスVector DB**: Apache Arrowベースの **LanceDB** を採用し、コサイン類似度で高精度検索
- **スマート差分同期**: ファイルのMD5ハッシュで変更を検知し、新規・更新された記事・本チャプターのみを数秒で同期
- **モデル変更の自動検知**: モデルや次元数が変わった場合は自動でテーブルをリセット＆再構築
- **MCP サーバー標準搭載**: `zenn-rag mcp` でAIエディタから過去記事を参照・引用・リンク推薦・インデックス更新が可能

---

## インストール

```bash
# グローバルインストール
pnpm add -g zenn-rag
# またはプロジェクトに追加
pnpm add -D zenn-rag
```

または `npx` で即座に実行できます：

```bash
npx zenn-rag --help
```

---

## 設定（.env）

Zenn プロジェクトのルートディレクトリに `.env` を配置します（`.env.example` 参照）。
本ツールではプロバイダを切り替えても同じ環境変数名（`BASE_URL`, `EMBEDDING_MODEL`, `API_KEY`）で直感的に設定できます。

### 共通環境変数一覧

| 環境変数名           |  必須  | デフォルト値                          | 説明                                                                    |
| :------------------- | :----: | :------------------------------------ | :---------------------------------------------------------------------- |
| `EMBEDDING_PROVIDER` |  任意  | `gemini` または APIキー等から自動判別 | 使用するプロバイダ (`openai` \| `ollama` \| `gemini`)                   |
| `BASE_URL`           |  任意  | プロバイダ依存                        | エンドポイントURL（LM Studio や Ollama 利用時に指定）                   |
| `EMBEDDING_MODEL`    |  任意  | プロバイダ依存                        | 使用する埋め込みモデル名                                                |
| `API_KEY`            | 条件付 | -                                     | APIキー（Gemini, OpenAI利用時に必須。LM Studio等は任意文字列で可）      |
| `ZENN_USERNAME`      |  任意  | -                                     | 記事URL生成用ユーザー名 (`https://zenn.dev/[username]/articles/[slug]`) |
| `VECTOR_DB_DIR`      |  任意  | `.vectordb`                           | Vector DB (LanceDB) のデータ保存ディレクトリ                            |

> 💡 **Tip**: 従来の `OPENAI_BASE_URL` や `GEMINI_API_KEY`, `OLLAMA_EMBEDDING_MODEL` などのプロバイダ別環境変数もそのまま利用可能です（個別設定がある場合はそちらが優先されます）。

---

### 代表的なプロバイダ設定例

#### 1. LM Studio（OpenAI 互換ローカルサーバー / 推奨）

完全ローカルで高速・無料にベクトル化できます。

```env
EMBEDDING_PROVIDER=openai
BASE_URL=http://localhost:1234/v1
EMBEDDING_MODEL=text-embedding-bge-m3
API_KEY=lm-studio

ZENN_USERNAME=your_zenn_id
VECTOR_DB_DIR=.vectordb
```

#### 2. Ollama（完全ローカル・オフライン）

```env
EMBEDDING_PROVIDER=ollama
BASE_URL=http://localhost:11434
EMBEDDING_MODEL=bge-m3

ZENN_USERNAME=your_zenn_id
VECTOR_DB_DIR=.vectordb
```

#### 3. Google Gemini（クラウド）

Google AI Studio で取得した無料〜従量課金の API キーを使用します。

```env
EMBEDDING_PROVIDER=gemini
API_KEY=AIzaSy...
EMBEDDING_MODEL=gemini-embedding-001

ZENN_USERNAME=your_zenn_id
```

#### 4. OpenAI API（クラウド）

```env
EMBEDDING_PROVIDER=openai
API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small

ZENN_USERNAME=your_zenn_id
```

---

## コマンド一覧

### 1. インデックス同期（差分更新・自動同期）

```bash
# 変更・新規コンテンツのみ差分同期
npx zenn-rag index

# ファイルを監視し、保存時に自動で差分同期（ウォッチモード）
npx zenn-rag index --watch

# 全記事・本を強制再同期
npx zenn-rag index --force

# 対象ディレクトリを指定する場合
npx zenn-rag index --dir /path/to/zenn-repo
```

### 2. 過去記事・本の検索（CLI）

```bash
# 基本検索
npx zenn-rag search "Cloudflare Workers WASM"

# 取得件数とトピック絞り込み
npx zenn-rag search "App Router キャッシュ" --limit 3 --topic nextjs
```

### 3. 進捗・トピック統計の確認

```bash
npx zenn-rag status
```

### 4. MCPサーバー起動

```bash
npx zenn-rag mcp
```

---

## おすすめ npm scripts 設定

Zenn プロジェクトの `package.json` に以下を登録しておくと、日々の執筆や検索を短いコマンドで手軽に実行できます：

```json
{
  "scripts": {
    "rag:sync": "zenn-rag index",
    "rag:watch": "zenn-rag index --watch",
    "rag:status": "zenn-rag status",
    "rag:search": "zenn-rag search",
    "rag:mcp": "zenn-rag mcp"
  }
}
```

#### よく使う実行例

```bash
# 執筆中に裏で自動同期（保存時に即時差分更新されるため推奨）
pnpm run rag:watch

# 過去記事・本を検索（引数を渡して実行）
pnpm run rag:search "Cloudflare Workers WASM"

# 現在のインデックス進捗・トピック集計を確認
pnpm run rag:status
```

---

## MCP（AIエディタ連携）設定

Antigravity、Claude Desktop、Cursor などの MCP 設定ファイル（`mcpServers`）に以下を追加します：

### macOS / Linux の場合

```json
{
  "mcpServers": {
    "zenn-rag": {
      "command": "npx",
      "args": ["-y", "zenn-rag", "mcp"],
      "cwd": "/Users/username/path/to/zenn-repo"
    }
  }
}
```

### Windows の場合

Windows では `cwd` のパス区切りに **スラッシュ `/`** または **二重エスケープ `\\`** を使用します：

```json
{
  "mcpServers": {
    "zenn-rag": {
      "command": "npx",
      "args": ["-y", "zenn-rag", "mcp"],
      "cwd": "C:/prog/zenn-repo"
    }
  }
}
```

> 💡 **Windows での注意点**:
>
> - **パスの書き方**: JSON 内では `"C:/prog/zenn-repo"`（スラッシュ推奨）または `"C:\\prog\\zenn-repo"`（バックスラッシュ2重）で指定してください。単体の `\` は JSON パースエラーになります。
> - **`npx` が見つからない場合**: 一部のエディタ（Claude Desktop 等）で `npx` 実行時に `ENOENT` エラーが出る場合は、以下のように `cmd.exe` 経由で実行してください：
>   ```json
>   "command": "cmd.exe",
>   "args": ["/c", "npx", "-y", "zenn-rag", "mcp"]
>   ```

### 提供ツール

- **`search_articles`**: 自然言語でクエリに類似する過去記事・本チャプターのセクション・スコア・URLを検索
- **`suggest_related_links`**: 執筆中の文章やメモから、引用・内部リンクすべき関連記事や本をMarkdownリンク形式で推薦
- **`get_article`**: スラッグを指定して記事・チャプター全体の構成や内容を取得
- **`list_topics`**: 蓄積されたコンテンツの全トピックと件数を集計
- **`sync_index`**: AIエディタ内から直接インデックスの差分更新を実行

---

## ライブラリとしての利用

```typescript
import {
  searchArticles,
  syncIndex,
  ArticleVectorStore,
  initContext,
} from "zenn-rag";

// コンテキストの初期化
initContext("/path/to/zenn-repo");

// 検索実行
const results = await searchArticles("React Server Actions", { limit: 3 });
console.log(results);
```

---

## 開発

```bash
# 依存パッケージのインストール
pnpm install

# ビルド（TypeScript 公式コンパイラ tsc で dist/ に出力）
pnpm run build

# テスト実行
pnpm test

# ウォッチモード（ビルド / テスト）
pnpm run dev
pnpm run test:watch
```

---

## ライセンス

MIT
