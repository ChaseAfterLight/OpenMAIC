import { createLogger } from '@/lib/logger';
import { indexedDbStorageAdapter } from '@/lib/storage/adapters/indexeddb';
import { getHybridSyncState, setHybridSyncState } from '@/lib/storage/hybrid-sync';
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

const log = createLogger('HybridStorage');
const STAGE_SYNC_DELAY_MS = 800;
const IMAGE_SYNC_DELAY_MS = 500;

const stageSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const stageSyncQueue = new Map<string, Promise<void>>();
const imageSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const imageSyncQueue = new Map<string, Promise<void>>();

function queueStageSync(stageId: string, reason: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const current = stageSyncTimers.get(stageId);
  if (current) {
    clearTimeout(current);
  }
  setHybridSyncState(stageId, 'pending', `待同步: ${reason}`);
  stageSyncTimers.set(
    stageId,
    setTimeout(() => {
      stageSyncTimers.delete(stageId);
      const previous = stageSyncQueue.get(stageId) ?? Promise.resolve();
      const next = previous
        .catch(() => {})
        .then(async () => {
          await syncStageToServer(stageId, reason);
        })
        .finally(() => {
          if (stageSyncQueue.get(stageId) === next) {
            stageSyncQueue.delete(stageId);
          }
        });
      stageSyncQueue.set(stageId, next);
      void next;
    }, STAGE_SYNC_DELAY_MS),
  );
}

function queueImageSync(id: string, reason: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const current = imageSyncTimers.get(id);
  if (current) {
    clearTimeout(current);
  }
  imageSyncTimers.set(
    id,
    setTimeout(() => {
      imageSyncTimers.delete(id);
      const previous = imageSyncQueue.get(id) ?? Promise.resolve();
      const next = previous
        .catch(() => {})
        .then(async () => {
          await syncImageToServer(id, reason);
        })
        .finally(() => {
          if (imageSyncQueue.get(id) === next) {
            imageSyncQueue.delete(id);
          }
        });
      imageSyncQueue.set(id, next);
      void next;
    }, IMAGE_SYNC_DELAY_MS),
  );
}

async function syncStageToServer(stageId: string, reason: string): Promise<void> {
  try {
    const [stage, scenes, chats, playback, outlines, media] = await Promise.all([
      indexedDbStorageAdapter.getStageRecord(stageId),
      indexedDbStorageAdapter.listScenesByStageId(stageId),
      indexedDbStorageAdapter.listChatSessionsByStageId(stageId),
      indexedDbStorageAdapter.getPlaybackStateRecord(stageId),
      indexedDbStorageAdapter.getStageOutlinesRecord(stageId),
      indexedDbStorageAdapter.listMediaFilesByStageId(stageId),
    ]);

    if (!stage) {
      await serverStorageClient.deleteStageRecord(stageId);
      setHybridSyncState(stageId, 'synced', '本地删除已同步到服务端');
      return;
    }

    await serverStorageClient.saveStageRecord(stage);
    await Promise.all([
      serverStorageClient.replaceScenesByStageId(stageId, scenes),
      serverStorageClient.replaceChatSessionsByStageId(stageId, chats),
      playback
        ? serverStorageClient.savePlaybackStateRecord(playback)
        : serverStorageClient.deletePlaybackStateRecord(stageId),
      outlines
        ? serverStorageClient.saveStageOutlinesRecord(outlines)
        : serverStorageClient.deleteStageOutlinesRecord(stageId),
    ]);
    await serverStorageClient.deleteMediaFilesByStageId(stageId);
    for (const record of media) {
      await serverStorageClient.saveMediaFileRecord(record);
    }
    setHybridSyncState(stageId, 'synced', `同步成功: ${reason}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setHybridSyncState(stageId, 'failed', message);
    log.warn(`课堂 ${stageId} 同步失败 (${reason})`, error);
  }
}

async function syncImageToServer(id: string, reason: string): Promise<void> {
  try {
    const record = await indexedDbStorageAdapter.getImageFileRecord(id);
    if (record) {
      await serverStorageClient.saveImageFileRecord(record);
      return;
    }
    await serverStorageClient.deleteImageFileRecord(id);
  } catch (error) {
    log.warn(`图片引用 ${id} 同步失败 (${reason})`, error);
  }
}

async function refreshStageFromServer(stageId: string): Promise<void> {
  const currentState = getHybridSyncState(stageId);
  if (currentState && currentState.status !== 'synced') {
    return;
  }
  try {
    const stage = await serverStorageClient.getStageRecord(stageId);
    if (!stage) {
      return;
    }
    const [scenes, chats, playback, outlines, media] = await Promise.all([
      serverStorageClient.listScenesByStageId(stageId),
      serverStorageClient.listChatSessionsByStageId(stageId),
      serverStorageClient.getPlaybackStateRecord(stageId),
      serverStorageClient.getStageOutlinesRecord(stageId),
      serverStorageClient.listMediaFilesByStageId(stageId),
    ]);
    await indexedDbStorageAdapter.saveStageRecord(stage);
    await indexedDbStorageAdapter.replaceScenesByStageId(stageId, scenes);
    await indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, chats);
    if (playback) {
      await indexedDbStorageAdapter.savePlaybackStateRecord(playback);
    }
    if (outlines) {
      await indexedDbStorageAdapter.saveStageOutlinesRecord(outlines);
    }
    await indexedDbStorageAdapter.deleteMediaFilesByStageId(stageId);
    for (const record of media) {
      await indexedDbStorageAdapter.saveMediaFileRecord(record);
    }
    setHybridSyncState(stageId, 'synced', '已与服务端对齐');
  } catch (error) {
    log.warn(`服务端对齐失败，继续使用本地缓存: ${stageId}`, error);
  }
}

async function getLocalFirstStageRecord(stageId: string): Promise<StageRecord | undefined> {
  const local = await indexedDbStorageAdapter.getStageRecord(stageId);
  if (local) {
    void refreshStageFromServer(stageId);
    return local;
  }
  try {
    const remote = await serverStorageClient.getStageRecord(stageId);
    if (remote) {
      await indexedDbStorageAdapter.saveStageRecord(remote);
      setHybridSyncState(stageId, 'synced', '首次从服务端恢复成功');
    }
    return remote;
  } catch (error) {
    log.warn(`服务端读取失败，且本地无缓存: ${stageId}`, error);
    return undefined;
  }
}

export const hybridStorageAdapter: StorageAdapter = {
  async saveStageRecord(record: StageRecord): Promise<void> {
    await indexedDbStorageAdapter.saveStageRecord(record);
    queueStageSync(record.id, '保存课堂');
  },

  async getStageRecord(stageId: string): Promise<StageRecord | undefined> {
    return getLocalFirstStageRecord(stageId);
  },

  async deleteStageRecord(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deleteStageRecord(stageId);
    queueStageSync(stageId, '删除课堂');
  },

  async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
    const local = await indexedDbStorageAdapter.listStageRecordsByUpdatedAtDesc();
    if (local.length > 0) {
      void (async () => {
        try {
          const remote = await serverStorageClient.listStageRecordsByUpdatedAtDesc();
          await Promise.all(remote.map((record) => indexedDbStorageAdapter.saveStageRecord(record)));
        } catch (error) {
          log.warn('服务端课堂列表刷新失败，继续使用本地列表', error);
        }
      })();
      return local;
    }

    try {
      const remote = await serverStorageClient.listStageRecordsByUpdatedAtDesc();
      await Promise.all(remote.map((record) => indexedDbStorageAdapter.saveStageRecord(record)));
      return remote;
    } catch (error) {
      log.warn('服务端课堂列表读取失败', error);
      return local;
    }
  },

  async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
    await indexedDbStorageAdapter.replaceScenesByStageId(stageId, records);
    queueStageSync(stageId, '保存场景');
  },

  async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
    const local = await indexedDbStorageAdapter.listScenesByStageId(stageId);
    if (local.length > 0) {
      void refreshStageFromServer(stageId);
      return local;
    }
    try {
      const remote = await serverStorageClient.listScenesByStageId(stageId);
      await indexedDbStorageAdapter.replaceScenesByStageId(stageId, remote);
      return remote;
    } catch (error) {
      log.warn(`服务端场景读取失败，且本地无缓存: ${stageId}`, error);
      return local;
    }
  },

  async countScenesByStageId(stageId: string): Promise<number> {
    const localCount = await indexedDbStorageAdapter.countScenesByStageId(stageId);
    if (localCount > 0) {
      return localCount;
    }
    try {
      return await serverStorageClient.countScenesByStageId(stageId);
    } catch (error) {
      log.warn(`服务端场景计数失败: ${stageId}`, error);
      return localCount;
    }
  },

  async deleteScenesByStageId(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deleteScenesByStageId(stageId);
    queueStageSync(stageId, '删除场景');
  },

  async replaceChatSessionsByStageId(
    stageId: string,
    records: ChatSessionRecord[],
  ): Promise<void> {
    await indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, records);
    queueStageSync(stageId, '保存聊天记录');
  },

  async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
    const local = await indexedDbStorageAdapter.listChatSessionsByStageId(stageId);
    if (local.length > 0) {
      void refreshStageFromServer(stageId);
      return local;
    }
    try {
      const remote = await serverStorageClient.listChatSessionsByStageId(stageId);
      await indexedDbStorageAdapter.replaceChatSessionsByStageId(stageId, remote);
      return remote;
    } catch (error) {
      log.warn(`服务端聊天读取失败，且本地无缓存: ${stageId}`, error);
      return local;
    }
  },

  async deleteChatSessionsByStageId(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deleteChatSessionsByStageId(stageId);
    queueStageSync(stageId, '删除聊天记录');
  },

  async savePlaybackStateRecord(
    record: PlaybackStateRecord & { sceneId?: string },
  ): Promise<void> {
    await indexedDbStorageAdapter.savePlaybackStateRecord(record);
    queueStageSync(record.stageId, '保存播放状态');
  },

  async getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined> {
    const local = await indexedDbStorageAdapter.getPlaybackStateRecord(stageId);
    if (local) {
      void refreshStageFromServer(stageId);
      return local;
    }
    try {
      const remote = await serverStorageClient.getPlaybackStateRecord(stageId);
      if (remote) {
        await indexedDbStorageAdapter.savePlaybackStateRecord(remote);
      }
      return remote;
    } catch (error) {
      log.warn(`服务端播放状态读取失败: ${stageId}`, error);
      return local;
    }
  },

  async deletePlaybackStateRecord(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deletePlaybackStateRecord(stageId);
    queueStageSync(stageId, '删除播放状态');
  },

  async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
    await indexedDbStorageAdapter.saveStageOutlinesRecord(record);
    queueStageSync(record.stageId, '保存大纲');
  },

  async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined> {
    const local = await indexedDbStorageAdapter.getStageOutlinesRecord(stageId);
    if (local) {
      void refreshStageFromServer(stageId);
      return local;
    }
    try {
      const remote = await serverStorageClient.getStageOutlinesRecord(stageId);
      if (remote) {
        await indexedDbStorageAdapter.saveStageOutlinesRecord(remote);
      }
      return remote;
    } catch (error) {
      log.warn(`服务端大纲读取失败: ${stageId}`, error);
      return local;
    }
  },

  async deleteStageOutlinesRecord(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deleteStageOutlinesRecord(stageId);
    queueStageSync(stageId, '删除大纲');
  },

  async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
    await indexedDbStorageAdapter.saveMediaFileRecord(record);
    queueStageSync(record.stageId, '保存媒体引用');
  },

  async listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
    const local = await indexedDbStorageAdapter.listMediaFilesByStageId(stageId);
    if (local.length > 0) {
      void refreshStageFromServer(stageId);
      return local;
    }
    try {
      const remote = await serverStorageClient.listMediaFilesByStageId(stageId);
      for (const record of remote) {
        await indexedDbStorageAdapter.saveMediaFileRecord(record);
      }
      return remote;
    } catch (error) {
      log.warn(`服务端媒体读取失败: ${stageId}`, error);
      return local;
    }
  },

  async deleteMediaFilesByStageId(stageId: string): Promise<void> {
    await indexedDbStorageAdapter.deleteMediaFilesByStageId(stageId);
    queueStageSync(stageId, '删除媒体引用');
  },

  async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
    await indexedDbStorageAdapter.saveImageFileRecord(record);
    queueImageSync(record.id, '保存文件引用');
  },

  async getImageFileRecord(id: string): Promise<ImageFileRecord | undefined> {
    const local = await indexedDbStorageAdapter.getImageFileRecord(id);
    if (local) {
      void syncImageToServer(id, '后台补传文件引用');
      return local;
    }
    try {
      const remote = await serverStorageClient.getImageFileRecord(id);
      if (remote) {
        await indexedDbStorageAdapter.saveImageFileRecord(remote);
      }
      return remote;
    } catch (error) {
      log.warn(`服务端文件引用读取失败: ${id}`, error);
      return local;
    }
  },

  async listImageFileRecords(): Promise<ImageFileRecord[]> {
    const local = await indexedDbStorageAdapter.listImageFileRecords();
    if (local.length > 0) {
      return local;
    }
    try {
      const remote = await serverStorageClient.listImageFileRecords();
      return remote;
    } catch (error) {
      log.warn('服务端文件引用列表读取失败', error);
      return local;
    }
  },

  async deleteImageFileRecord(id: string): Promise<void> {
    await indexedDbStorageAdapter.deleteImageFileRecord(id);
    queueImageSync(id, '删除文件引用');
  },

  async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
    const local = await indexedDbStorageAdapter.listImageFileRecords();
    await indexedDbStorageAdapter.deleteImageFileRecordsBefore(createdAt);
    for (const record of local.filter((item) => item.createdAt < createdAt)) {
      queueImageSync(record.id, '清理过期文件引用');
    }
  },
};
