import type {
  AudioFileRecord,
  ChatSessionRecord,
  ImageFileRecord,
  LessonPackVersionRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

export interface ServerImageFileMetadata extends Omit<ImageFileRecord, 'blob'> {
  downloadUrl?: string;
  hasBlob?: boolean;
  storageStatus?: 'ready' | 'pending' | 'failed';
  storageError?: string;
  objectKey?: string;
}

export interface ServerAudioFileMetadata extends Omit<AudioFileRecord, 'blob'> {
  downloadUrl?: string;
  hasBlob?: boolean;
  storageStatus?: 'ready' | 'pending' | 'failed';
  storageError?: string;
  objectKey?: string;
}

export interface ServerMediaFileMetadata extends Omit<MediaFileRecord, 'blob' | 'poster'> {
  downloadUrl?: string;
  posterDownloadUrl?: string;
  hasBlob?: boolean;
  hasPoster?: boolean;
  storageStatus?: 'ready' | 'pending' | 'failed';
  storageError?: string;
}

export type StorageJsonAction =
  | { action: 'saveStageRecord'; record: StageRecord }
  | { action: 'getStageRecord'; stageId: string }
  | { action: 'deleteStageRecord'; stageId: string }
  | { action: 'listStageRecordsByUpdatedAtDesc' }
  | { action: 'replaceScenesByStageId'; stageId: string; records: SceneRecord[] }
  | { action: 'listScenesByStageId'; stageId: string }
  | { action: 'countScenesByStageId'; stageId: string }
  | { action: 'deleteScenesByStageId'; stageId: string }
  | { action: 'replaceChatSessionsByStageId'; stageId: string; records: ChatSessionRecord[] }
  | { action: 'listChatSessionsByStageId'; stageId: string }
  | { action: 'deleteChatSessionsByStageId'; stageId: string }
  | { action: 'savePlaybackStateRecord'; record: PlaybackStateRecord & { sceneId?: string } }
  | { action: 'getPlaybackStateRecord'; stageId: string }
  | { action: 'deletePlaybackStateRecord'; stageId: string }
  | { action: 'saveStageOutlinesRecord'; record: StageOutlinesRecord }
  | { action: 'getStageOutlinesRecord'; stageId: string }
  | { action: 'deleteStageOutlinesRecord'; stageId: string }
  | { action: 'saveLessonPackVersionRecord'; record: LessonPackVersionRecord }
  | { action: 'getLessonPackVersionRecord'; stageId: string; versionId: string }
  | { action: 'listLessonPackVersionRecordsByStageId'; stageId: string }
  | { action: 'deleteLessonPackVersionRecord'; stageId: string; versionId: string }
  | { action: 'deleteLessonPackVersionsByStageId'; stageId: string }
  | { action: 'listMediaFilesByStageId'; stageId: string }
  | { action: 'deleteMediaFilesByStageId'; stageId: string }
  | { action: 'getAudioFileRecordMetadata'; id: string }
  | { action: 'listAudioFileRecordsByStageId'; stageId: string }
  | { action: 'deleteAudioFileRecord'; id: string }
  | { action: 'deleteAudioFileRecordsByStageId'; stageId: string }
  | { action: 'getImageFileRecordMetadata'; id: string }
  | { action: 'listImageFileRecordMetadata' }
  | { action: 'deleteImageFileRecord'; id: string }
  | { action: 'deleteImageFileRecordsBefore'; createdAt: number };

export type StorageJsonResponse =
  | { ok: true }
  | { ok: true; record?: StageRecord | PlaybackStateRecord | StageOutlinesRecord | null }
  | { ok: true; records: StageRecord[] | SceneRecord[] | ChatSessionRecord[] }
  | { ok: true; version?: LessonPackVersionRecord | null }
  | { ok: true; versions: LessonPackVersionRecord[] }
  | { ok: true; count: number }
  | { ok: true; images: ServerImageFileMetadata[] }
  | { ok: true; image?: ServerImageFileMetadata | null }
  | { ok: true; audio?: ServerAudioFileMetadata | null }
  | { ok: true; audios: ServerAudioFileMetadata[] }
  | { ok: true; media: ServerMediaFileMetadata[] };
