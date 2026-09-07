import { SyncService, type SyncOptions } from "../services/sync-service.js";

export async function syncIndex(options: SyncOptions = {}): Promise<void> {
  const service = new SyncService(options.logger);
  await service.sync(options);
}
