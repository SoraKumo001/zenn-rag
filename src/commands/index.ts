import { SyncService, type SyncOptions } from "../services/sync-service.js";

export interface CliSyncOptions extends SyncOptions {
  watch?: boolean;
}

export async function syncIndex(options: CliSyncOptions = {}): Promise<void> {
  const service = new SyncService(options.logger);
  if (options.watch) {
    await service.watch(options);
  } else {
    await service.sync(options);
  }
}
