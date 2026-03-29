import { createLogger } from '@/lib/logger';
import { indexedDbStorageAdapter } from '@/lib/storage/adapters/indexeddb';
import { serverStorageClient } from '@/lib/storage/server-client';
import type { StorageAdapter } from '@/lib/storage/types';
import type {
  ChatSessionRecord,
  ImageFileRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

const log = createLogger('ServerStorage');

async function withServerReadFallback<T>(
  label: string,
  remote: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await remote();
  } catch (error) {
    log.warn(`服务端读取失败，已回退本地缓存: ${label}`, error);
    return fallback();
  }
}

async function withServerWriteCache(
  label: string,
  remote: () => Promise<void>,
  cache: () => Promise<void>,
): Promise<void> {
  try {
    await remote();
  } catch (error) {
    await cache().catch(() => {});
    log.warn(`服务端写入失败，已保留本地缓存: ${label}`, error);
    throw error;
  }
  await cache();
}

async function cacheStageSnapshot(stageId: string): Promise<void> {
  const [stage, scenes, chats, playback, outlines, media] = await Promise.all([
    serverStorageClient.getStageRecord(stageId),
    serverStorageClient.listScenesByStageId(stageId),
    serverStorageClient.listChatSessionsByStageId(stageId),
    serverStorageClient.getPlaybackStateRecord(stageId),
    serverStorageClient.getStageOutlinesRecord(stageId),
    serverStorageClient.listMediaFilesByStageId(stageId),
  ]);

  if (stage) {
    await indexedDbStorageAdapter.saveStageRecord(stage);
  }
  await indexedDbStorageAdapter.replaceScenesByStageId(stageId, scenes);
  await indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, chats);
  if (playback) {
    await indexedDbStorageAdapter.savePlaybackStateRecord(playback);
  } else {
    await indexedDbStorageAdapter.deletePlaybackStateRecord(stageId);
  }
  if (outlines) {
    await indexedDbStorageAdapter.saveStageOutlinesRecord(outlines);
  } else {
    await indexedDbStorageAdapter.deleteStageOutlinesRecord(stageId);
  }
  await indexedDbStorageAdapter.deleteMediaFilesByStageId(stageId);
  for (const record of media) {
    await indexedDbStorageAdapter.saveMediaFileRecord(record);
  }
}

export const serverStorageAdapter: StorageAdapter = {
  async saveStageRecord(record: StageRecord): Promise<void> {
    await withServerWriteCache(
      `saveStageRecord:${record.id}`,
      () => serverStorageClient.saveStageRecord(record),
      () => indexedDbStorageAdapter.saveStageRecord(record),
    );
  },

  async getStageRecord(stageId: string): Promise<StageRecord | undefined> {
    const local = await indexedDbStorageAdapter.getStageRecord(stageId);
    return withServerReadFallback(
      `getStageRecord:${stageId}`,
      async () => {
        const record = await serverStorageClient.getStageRecord(stageId);
        if (record) {
          await indexedDbStorageAdapter.saveStageRecord(record);
          return record;
        }
        return local;
      },
      async () => local,
    );
  },

  async deleteStageRecord(stageId: string): Promise<void> {
    await serverStorageClient.deleteStageRecord(stageId);
    await indexedDbStorageAdapter.deleteStageRecord(stageId);
  },

  async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
    const local = await indexedDbStorageAdapter.listStageRecordsByUpdatedAtDesc();
    return withServerReadFallback(
      'listStageRecordsByUpdatedAtDesc',
      async () => {
        const records = await serverStorageClient.listStageRecordsByUpdatedAtDesc();
        if (records.length === 0 && local.length > 0) {
          return local;
        }
        await Promise.all(records.map((record) => indexedDbStorageAdapter.saveStageRecord(record)));
        return records;
      },
      async () => local,
    );
  },

  async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
    await withServerWriteCache(
      `replaceScenesByStageId:${stageId}`,
      () => serverStorageClient.replaceScenesByStageId(stageId, records),
      () => indexedDbStorageAdapter.replaceScenesByStageId(stageId, records),
    );
  },

  async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
    const local = await indexedDbStorageAdapter.listScenesByStageId(stageId);
    return withServerReadFallback(
      `listScenesByStageId:${stageId}`,
      async () => {
        const records = await serverStorageClient.listScenesByStageId(stageId);
        if (records.length === 0 && local.length > 0) {
          return local;
        }
        await indexedDbStorageAdapter.replaceScenesByStageId(stageId, records);
        return records;
      },
      async () => local,
    );
  },

  async countScenesByStageId(stageId: string): Promise<number> {
    const local = await indexedDbStorageAdapter.countScenesByStageId(stageId);
    return withServerReadFallback(
      `countScenesByStageId:${stageId}`,
      async () => {
        const count = await serverStorageClient.countScenesByStageId(stageId);
        return count === 0 && local > 0 ? local : count;
      },
      async () => local,
    );
  },

  async deleteScenesByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteScenesByStageId(stageId);
    await indexedDbStorageAdapter.deleteScenesByStageId(stageId);
  },

  async replaceChatSessionsByStageId(
    stageId: string,
    records: ChatSessionRecord[],
  ): Promise<void> {
    await withServerWriteCache(
      `replaceChatSessionsByStageId:${stageId}`,
      () => serverStorageClient.replaceChatSessionsByStageId(stageId, records),
      () => indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, records),
    );
  },

  async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
    const local = await indexedDbStorageAdapter.listChatSessionsByStageId(stageId);
    return withServerReadFallback(
      `listChatSessionsByStageId:${stageId}`,
      async () => {
        const records = await serverStorageClient.listChatSessionsByStageId(stageId);
        if (records.length === 0 && local.length > 0) {
          return local;
        }
        await indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, records);
        return records;
      },
      async () => local,
    );
  },

  async deleteChatSessionsByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteChatSessionsByStageId(stageId);
    await indexedDbStorageAdapter.deleteChatSessionsByStageId(stageId);
  },

  async savePlaybackStateRecord(
    record: PlaybackStateRecord & { sceneId?: string },
  ): Promise<void> {
    await withServerWriteCache(
      `savePlaybackStateRecord:${record.stageId}`,
      () => serverStorageClient.savePlaybackStateRecord(record),
      () => indexedDbStorageAdapter.savePlaybackStateRecord(record),
    );
  },

  async getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined> {
    const local = await indexedDbStorageAdapter.getPlaybackStateRecord(stageId);
    return withServerReadFallback(
      `getPlaybackStateRecord:${stageId}`,
      async () => {
        const record = await serverStorageClient.getPlaybackStateRecord(stageId);
        if (record) {
          await indexedDbStorageAdapter.savePlaybackStateRecord(record);
          return record;
        }
        return local;
      },
      async () => local,
    );
  },

  async deletePlaybackStateRecord(stageId: string): Promise<void> {
    await serverStorageClient.deletePlaybackStateRecord(stageId);
    await indexedDbStorageAdapter.deletePlaybackStateRecord(stageId);
  },

  async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
    await withServerWriteCache(
      `saveStageOutlinesRecord:${record.stageId}`,
      () => serverStorageClient.saveStageOutlinesRecord(record),
      () => indexedDbStorageAdapter.saveStageOutlinesRecord(record),
    );
  },

  async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined> {
    const local = await indexedDbStorageAdapter.getStageOutlinesRecord(stageId);
    return withServerReadFallback(
      `getStageOutlinesRecord:${stageId}`,
      async () => {
        const record = await serverStorageClient.getStageOutlinesRecord(stageId);
        if (record) {
          await indexedDbStorageAdapter.saveStageOutlinesRecord(record);
          return record;
        }
        return local;
      },
      async () => local,
    );
  },

  async deleteStageOutlinesRecord(stageId: string): Promise<void> {
    await serverStorageClient.deleteStageOutlinesRecord(stageId);
    await indexedDbStorageAdapter.deleteStageOutlinesRecord(stageId);
  },

  async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
    await withServerWriteCache(
      `saveMediaFileRecord:${record.stageId}:${record.id}`,
      () => serverStorageClient.saveMediaFileRecord(record),
      () => indexedDbStorageAdapter.saveMediaFileRecord(record),
    );
  },

  async listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
    const local = await indexedDbStorageAdapter.listMediaFilesByStageId(stageId);
    return withServerReadFallback(
      `listMediaFilesByStageId:${stageId}`,
      async () => {
        const records = await serverStorageClient.listMediaFilesByStageId(stageId);
        if (records.length === 0 && local.length > 0) {
          return local;
        }
        await indexedDbStorageAdapter.deleteMediaFilesByStageId(stageId);
        await Promise.all(records.map((record) => indexedDbStorageAdapter.saveMediaFileRecord(record)));
        return records;
      },
      async () => local,
    );
  },

  async deleteMediaFilesByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteMediaFilesByStageId(stageId);
    await indexedDbStorageAdapter.deleteMediaFilesByStageId(stageId);
  },

  async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
    await withServerWriteCache(
      `saveImageFileRecord:${record.id}`,
      () => serverStorageClient.saveImageFileRecord(record),
      () => indexedDbStorageAdapter.saveImageFileRecord(record),
    );
  },

  async getImageFileRecord(id: string): Promise<ImageFileRecord | undefined> {
    const local = await indexedDbStorageAdapter.getImageFileRecord(id);
    return withServerReadFallback(
      `getImageFileRecord:${id}`,
      async () => {
        const record = await serverStorageClient.getImageFileRecord(id);
        if (record) {
          await indexedDbStorageAdapter.saveImageFileRecord(record);
          return record;
        }
        return local;
      },
      async () => local,
    );
  },

  async listImageFileRecords(): Promise<ImageFileRecord[]> {
    const local = await indexedDbStorageAdapter.listImageFileRecords();
    return withServerReadFallback(
      'listImageFileRecords',
      async () => {
        const records = await serverStorageClient.listImageFileRecords();
        return records.length === 0 && local.length > 0 ? local : records;
      },
      async () => local,
    );
  },

  async deleteImageFileRecord(id: string): Promise<void> {
    await serverStorageClient.deleteImageFileRecord(id);
    await indexedDbStorageAdapter.deleteImageFileRecord(id);
  },

  async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
    await serverStorageClient.deleteImageFileRecordsBefore(createdAt);
    await indexedDbStorageAdapter.deleteImageFileRecordsBefore(createdAt);
  },
};

export async function refreshServerStageCache(stageId: string): Promise<void> {
  await cacheStageSnapshot(stageId);
}
