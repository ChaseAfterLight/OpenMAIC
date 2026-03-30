import {
  db,
  type ChatSessionRecord,
  type ImageFileRecord,
  type LessonPackVersionRecord,
  type MediaFileRecord,
  type PlaybackStateRecord,
  type SceneRecord,
  type StageOutlinesRecord,
  type StageRecord,
} from '@/lib/utils/database';
import type { StorageAdapter } from '@/lib/storage/types';

export const indexedDbStorageAdapter: StorageAdapter = {
  async saveStageRecord(record: StageRecord): Promise<void> {
    await db.stages.put(record);
  },

  async getStageRecord(stageId: string): Promise<StageRecord | undefined> {
    return db.stages.get(stageId);
  },

  async deleteStageRecord(stageId: string): Promise<void> {
    await db.stages.delete(stageId);
  },

  async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
    return db.stages.orderBy('updatedAt').reverse().toArray();
  },

  async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
    await db.transaction('rw', db.scenes, async () => {
      await db.scenes.where('stageId').equals(stageId).delete();
      if (records.length > 0) {
        await db.scenes.bulkPut(records);
      }
    });
  },

  async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
    return db.scenes.where('stageId').equals(stageId).sortBy('order');
  },

  async countScenesByStageId(stageId: string): Promise<number> {
    return db.scenes.where('stageId').equals(stageId).count();
  },

  async deleteScenesByStageId(stageId: string): Promise<void> {
    await db.scenes.where('stageId').equals(stageId).delete();
  },

  async replaceChatSessionsByStageId(
    stageId: string,
    records: ChatSessionRecord[],
  ): Promise<void> {
    await db.transaction('rw', db.chatSessions, async () => {
      await db.chatSessions.where('stageId').equals(stageId).delete();
      if (records.length > 0) {
        await db.chatSessions.bulkPut(records);
      }
    });
  },

  async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
    return db.chatSessions.where('stageId').equals(stageId).sortBy('createdAt');
  },

  async deleteChatSessionsByStageId(stageId: string): Promise<void> {
    await db.chatSessions.where('stageId').equals(stageId).delete();
  },

  async savePlaybackStateRecord(
    record: PlaybackStateRecord & { sceneId?: string },
  ): Promise<void> {
    await db.playbackState.put(record as PlaybackStateRecord);
  },

  async getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined> {
    return db.playbackState.get(stageId) as Promise<
      (PlaybackStateRecord & { sceneId?: string }) | undefined
    >;
  },

  async deletePlaybackStateRecord(stageId: string): Promise<void> {
    await db.playbackState.delete(stageId);
  },

  async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
    await db.stageOutlines.put(record);
  },

  async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined> {
    return db.stageOutlines.get(stageId);
  },

  async deleteStageOutlinesRecord(stageId: string): Promise<void> {
    await db.stageOutlines.delete(stageId);
  },

  async saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
    await db.lessonPackVersions.put(record);
  },

  async getLessonPackVersionRecord(
    stageId: string,
    versionId: string,
  ): Promise<LessonPackVersionRecord | undefined> {
    const record = await db.lessonPackVersions.get(versionId);
    return record?.stageId === stageId ? record : undefined;
  },

  async listLessonPackVersionRecordsByStageId(stageId: string): Promise<LessonPackVersionRecord[]> {
    const records = await db.lessonPackVersions.where('stageId').equals(stageId).toArray();
    return records.sort((a, b) => b.createdAt - a.createdAt);
  },

  async deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void> {
    const record = await db.lessonPackVersions.get(versionId);
    if (record?.stageId === stageId) {
      await db.lessonPackVersions.delete(versionId);
    }
  },

  async deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
    await db.lessonPackVersions.where('stageId').equals(stageId).delete();
  },

  async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
    await db.mediaFiles.put(record);
  },

  async listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
    return db.mediaFiles.where('stageId').equals(stageId).toArray();
  },

  async deleteMediaFilesByStageId(stageId: string): Promise<void> {
    await db.mediaFiles.where('stageId').equals(stageId).delete();
  },

  async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
    await db.imageFiles.put(record);
  },

  async getImageFileRecord(id: string): Promise<ImageFileRecord | undefined> {
    return db.imageFiles.get(id);
  },

  async listImageFileRecords(): Promise<ImageFileRecord[]> {
    return db.imageFiles.toArray();
  },

  async deleteImageFileRecord(id: string): Promise<void> {
    await db.imageFiles.delete(id);
  },

  async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
    await db.imageFiles.where('createdAt').below(createdAt).delete();
  },
};
