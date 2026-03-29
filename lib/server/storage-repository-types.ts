import type {
  ChatSessionRecord,
  ImageFileRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

export type ServerBinaryStatus = 'ready' | 'pending' | 'failed';

export interface StoredBinaryPayload {
  buffer: Buffer;
  mimeType: string;
}

export interface ServerMediaMetadata extends Omit<MediaFileRecord, 'blob' | 'poster'> {
  hasBlob: boolean;
  hasPoster: boolean;
  storageStatus: ServerBinaryStatus;
  storageError?: string;
}

export interface ServerImageMetadata extends Omit<ImageFileRecord, 'blob'> {
  hasBlob: boolean;
  storageStatus: ServerBinaryStatus;
  storageError?: string;
  objectKey?: string;
}

export interface ServerStorageRepository {
  ensureReady(): Promise<void>;
  saveStageRecord(record: StageRecord): Promise<void>;
  getStageRecord(stageId: string): Promise<StageRecord | null>;
  deleteStageRecord(stageId: string): Promise<void>;
  listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]>;

  replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void>;
  listScenesByStageId(stageId: string): Promise<SceneRecord[]>;
  countScenesByStageId(stageId: string): Promise<number>;
  deleteScenesByStageId(stageId: string): Promise<void>;

  replaceChatSessionsByStageId(stageId: string, records: ChatSessionRecord[]): Promise<void>;
  listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]>;
  deleteChatSessionsByStageId(stageId: string): Promise<void>;

  savePlaybackStateRecord(record: PlaybackStateRecord & { sceneId?: string }): Promise<void>;
  getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | null>;
  deletePlaybackStateRecord(stageId: string): Promise<void>;

  saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void>;
  getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | null>;
  deleteStageOutlinesRecord(stageId: string): Promise<void>;

  saveMediaFileRecord(record: MediaFileRecord): Promise<void>;
  listMediaFilesByStageId(stageId: string): Promise<ServerMediaMetadata[]>;
  getMediaFileBlob(stageId: string, mediaId: string): Promise<StoredBinaryPayload | null>;
  getMediaPosterBlob(stageId: string, mediaId: string): Promise<StoredBinaryPayload | null>;
  deleteMediaFilesByStageId(stageId: string): Promise<void>;

  saveImageFileRecord(record: ImageFileRecord): Promise<void>;
  getImageFileRecordMetadata(id: string): Promise<ServerImageMetadata | null>;
  getImageFileBlob(id: string): Promise<StoredBinaryPayload | null>;
  listImageFileRecordMetadata(): Promise<ServerImageMetadata[]>;
  deleteImageFileRecord(id: string): Promise<void>;
  deleteImageFileRecordsBefore(createdAt: number): Promise<void>;
}
