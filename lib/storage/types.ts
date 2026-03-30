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

export type StorageType = 'media' | 'poster' | 'audio';

export interface StorageProvider {
  upload(hash: string, blob: Buffer, type: StorageType, mimeType?: string): Promise<string>;
  exists(hash: string, type: StorageType): Promise<boolean>;
  getUrl(hash: string, type: StorageType): string;
  batchExists(hashes: string[], type: StorageType): Promise<Set<string>>;
}

export type StorageDriver = 'indexeddb' | 'server' | 'hybrid';

export interface StorageAdapter {
  saveStageRecord(record: StageRecord): Promise<void>;
  getStageRecord(stageId: string): Promise<StageRecord | undefined>;
  deleteStageRecord(stageId: string): Promise<void>;
  listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]>;

  replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void>;
  listScenesByStageId(stageId: string): Promise<SceneRecord[]>;
  countScenesByStageId(stageId: string): Promise<number>;
  deleteScenesByStageId(stageId: string): Promise<void>;

  replaceChatSessionsByStageId(stageId: string, records: ChatSessionRecord[]): Promise<void>;
  listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]>;
  deleteChatSessionsByStageId(stageId: string): Promise<void>;

  savePlaybackStateRecord(
    record: PlaybackStateRecord & { sceneId?: string },
  ): Promise<void>;
  getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined>;
  deletePlaybackStateRecord(stageId: string): Promise<void>;

  saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void>;
  getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined>;
  deleteStageOutlinesRecord(stageId: string): Promise<void>;

  saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void>;
  getLessonPackVersionRecord(
    stageId: string,
    versionId: string,
  ): Promise<LessonPackVersionRecord | undefined>;
  listLessonPackVersionRecordsByStageId(stageId: string): Promise<LessonPackVersionRecord[]>;
  deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void>;
  deleteLessonPackVersionsByStageId(stageId: string): Promise<void>;

  saveMediaFileRecord(record: MediaFileRecord): Promise<void>;
  listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]>;
  deleteMediaFilesByStageId(stageId: string): Promise<void>;

  saveImageFileRecord(record: ImageFileRecord): Promise<void>;
  getImageFileRecord(id: string): Promise<ImageFileRecord | undefined>;
  listImageFileRecords(): Promise<ImageFileRecord[]>;
  deleteImageFileRecord(id: string): Promise<void>;
  deleteImageFileRecordsBefore(createdAt: number): Promise<void>;
}
