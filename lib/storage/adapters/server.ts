import { serverStorageClient } from '@/lib/storage/server-client';
import type { StorageAdapter } from '@/lib/storage/types';
import type {
  ChatSessionRecord,
  ImageFileRecord,
  LessonPackVersionRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

// Server mode is intentionally server-only: no IndexedDB mirroring, no fallback cache.
export const serverStorageAdapter: StorageAdapter = {
  async saveStageRecord(record: StageRecord): Promise<void> {
    await serverStorageClient.saveStageRecord(record);
  },

  async getStageRecord(stageId: string): Promise<StageRecord | undefined> {
    return serverStorageClient.getStageRecord(stageId);
  },

  async deleteStageRecord(stageId: string): Promise<void> {
    await serverStorageClient.deleteStageRecord(stageId);
  },

  async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
    return serverStorageClient.listStageRecordsByUpdatedAtDesc();
  },

  async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
    await serverStorageClient.replaceScenesByStageId(stageId, records);
  },

  async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
    return serverStorageClient.listScenesByStageId(stageId);
  },

  async countScenesByStageId(stageId: string): Promise<number> {
    return serverStorageClient.countScenesByStageId(stageId);
  },

  async deleteScenesByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteScenesByStageId(stageId);
  },

  async replaceChatSessionsByStageId(
    stageId: string,
    records: ChatSessionRecord[],
  ): Promise<void> {
    await serverStorageClient.replaceChatSessionsByStageId(stageId, records);
  },

  async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
    return serverStorageClient.listChatSessionsByStageId(stageId);
  },

  async deleteChatSessionsByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteChatSessionsByStageId(stageId);
  },

  async savePlaybackStateRecord(
    record: PlaybackStateRecord & { sceneId?: string },
  ): Promise<void> {
    await serverStorageClient.savePlaybackStateRecord(record);
  },

  async getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined> {
    return serverStorageClient.getPlaybackStateRecord(stageId);
  },

  async deletePlaybackStateRecord(stageId: string): Promise<void> {
    await serverStorageClient.deletePlaybackStateRecord(stageId);
  },

  async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
    await serverStorageClient.saveStageOutlinesRecord(record);
  },

  async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined> {
    return serverStorageClient.getStageOutlinesRecord(stageId);
  },

  async deleteStageOutlinesRecord(stageId: string): Promise<void> {
    await serverStorageClient.deleteStageOutlinesRecord(stageId);
  },

  async saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
    await serverStorageClient.saveLessonPackVersionRecord(record);
  },

  async getLessonPackVersionRecord(
    stageId: string,
    versionId: string,
  ): Promise<LessonPackVersionRecord | undefined> {
    return serverStorageClient.getLessonPackVersionRecord(stageId, versionId);
  },

  async listLessonPackVersionRecordsByStageId(stageId: string): Promise<LessonPackVersionRecord[]> {
    return serverStorageClient.listLessonPackVersionRecordsByStageId(stageId);
  },

  async deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void> {
    await serverStorageClient.deleteLessonPackVersionRecord(stageId, versionId);
  },

  async deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteLessonPackVersionsByStageId(stageId);
  },

  async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
    await serverStorageClient.saveMediaFileRecord(record);
  },

  async listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
    return serverStorageClient.listMediaFilesByStageId(stageId);
  },

  async deleteMediaFilesByStageId(stageId: string): Promise<void> {
    await serverStorageClient.deleteMediaFilesByStageId(stageId);
  },

  async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
    await serverStorageClient.saveImageFileRecord(record);
  },

  async getImageFileRecord(id: string): Promise<ImageFileRecord | undefined> {
    return serverStorageClient.getImageFileRecord(id);
  },

  async listImageFileRecords(): Promise<ImageFileRecord[]> {
    return serverStorageClient.listImageFileRecords();
  },

  async deleteImageFileRecord(id: string): Promise<void> {
    await serverStorageClient.deleteImageFileRecord(id);
  },

  async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
    await serverStorageClient.deleteImageFileRecordsBefore(createdAt);
  },
};
