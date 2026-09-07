import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SyncService } from "../src/services/sync-service.js";
import { SilentLogger } from "../src/logger.js";
import type { SyncManifest } from "../src/types.js";

describe("SyncService", () => {
  let tempDir: string;
  let service: SyncService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zenn-rag-test-"));
    service = new SyncService(new SilentLogger());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadManifest & saveManifest", () => {
    it("マニフェストファイルが存在しない場合は空のデフォルトを返す", async () => {
      const manifestPath = path.join(tempDir, "manifest.json");
      const manifest = await service.loadManifest(manifestPath);

      expect(manifest).toEqual({ version: 1, entries: {} });
    });

    it("マニフェストを正しく保存して読み込める", async () => {
      const manifestPath = path.join(tempDir, "manifest.json");
      const sampleManifest: SyncManifest = {
        version: 1,
        provider: "openai",
        model: "text-embedding-3-small",
        entries: {
          "article-1": {
            fileHash: "hash123",
            lastIndexed: "2026-09-07T00:00:00Z",
            chunkIds: ["article-1#chunk_0"],
          },
        },
      };

      await service.saveManifest(manifestPath, sampleManifest);
      const loaded = await service.loadManifest(manifestPath);

      expect(loaded).toEqual(sampleManifest);
    });
  });
});
