import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { createFileStorageRepository } from '@/lib/server/storage-backend-file';
import { createPostgresObjectStorageRepository } from '@/lib/server/storage-backend-postgres';
import type { ServerStorageRepository } from '@/lib/server/storage-repository-types';
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

let repository: ServerStorageRepository | null = null;

function getRepository(): ServerStorageRepository {
  if (repository) {
    return repository;
  }

  const config = getServerStorageConfig();
  repository =
    config.backend === 'postgres-object-storage'
      ? createPostgresObjectStorageRepository(config)
      : createFileStorageRepository();
  return repository;
}

export async function ensureStorageRoots(): Promise<void> {
  await getRepository().ensureReady();
}

export async function saveStageRecord(record: StageRecord): Promise<void> {
  await getRepository().saveStageRecord(record);
}

export async function getStageRecord(stageId: string): Promise<StageRecord | null> {
  return getRepository().getStageRecord(stageId);
}

export async function deleteStageRecord(stageId: string): Promise<void> {
  await getRepository().deleteStageRecord(stageId);
}

export async function listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
  return getRepository().listStageRecordsByUpdatedAtDesc();
}

export async function replaceScenesByStageId(
  stageId: string,
  records: SceneRecord[],
): Promise<void> {
  await getRepository().replaceScenesByStageId(stageId, records);
}

export async function listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  return getRepository().listScenesByStageId(stageId);
}

export async function countScenesByStageId(stageId: string): Promise<number> {
  return getRepository().countScenesByStageId(stageId);
}

export async function deleteScenesByStageId(stageId: string): Promise<void> {
  await getRepository().deleteScenesByStageId(stageId);
}

export async function replaceChatSessionsByStageId(
  stageId: string,
  records: ChatSessionRecord[],
): Promise<void> {
  await getRepository().replaceChatSessionsByStageId(stageId, records);
}

export async function listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
  return getRepository().listChatSessionsByStageId(stageId);
}

export async function deleteChatSessionsByStageId(stageId: string): Promise<void> {
  await getRepository().deleteChatSessionsByStageId(stageId);
}

export async function savePlaybackStateRecord(
  record: PlaybackStateRecord & { sceneId?: string },
): Promise<void> {
  await getRepository().savePlaybackStateRecord(record);
}

export async function getPlaybackStateRecord(
  stageId: string,
): Promise<(PlaybackStateRecord & { sceneId?: string }) | null> {
  return getRepository().getPlaybackStateRecord(stageId);
}

export async function deletePlaybackStateRecord(stageId: string): Promise<void> {
  await getRepository().deletePlaybackStateRecord(stageId);
}

export async function saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
  await getRepository().saveStageOutlinesRecord(record);
}

export async function getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | null> {
  return getRepository().getStageOutlinesRecord(stageId);
}

export async function deleteStageOutlinesRecord(stageId: string): Promise<void> {
  await getRepository().deleteStageOutlinesRecord(stageId);
}

export async function saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
  await getRepository().saveLessonPackVersionRecord(record);
}

export async function getLessonPackVersionRecord(stageId: string, versionId: string) {
  return getRepository().getLessonPackVersionRecord(stageId, versionId);
}

export async function listLessonPackVersionRecordsByStageId(stageId: string) {
  return getRepository().listLessonPackVersionRecordsByStageId(stageId);
}

export async function deleteLessonPackVersionRecord(
  stageId: string,
  versionId: string,
): Promise<void> {
  await getRepository().deleteLessonPackVersionRecord(stageId, versionId);
}

export async function deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
  await getRepository().deleteLessonPackVersionsByStageId(stageId);
}

export async function saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
  await getRepository().saveMediaFileRecord(record);
}

export async function listMediaFilesByStageId(stageId: string) {
  return getRepository().listMediaFilesByStageId(stageId);
}

export async function getMediaFileBlob(stageId: string, mediaId: string) {
  return getRepository().getMediaFileBlob(stageId, mediaId);
}

export async function getMediaPosterBlob(stageId: string, mediaId: string) {
  return getRepository().getMediaPosterBlob(stageId, mediaId);
}

export async function deleteMediaFilesByStageId(stageId: string): Promise<void> {
  await getRepository().deleteMediaFilesByStageId(stageId);
}

export async function saveImageFileRecord(record: ImageFileRecord): Promise<void> {
  await getRepository().saveImageFileRecord(record);
}

export async function getImageFileRecordMetadata(id: string) {
  return getRepository().getImageFileRecordMetadata(id);
}

export async function getImageFileBlob(id: string) {
  return getRepository().getImageFileBlob(id);
}

export async function listImageFileRecordMetadata() {
  return getRepository().listImageFileRecordMetadata();
}

export async function deleteImageFileRecord(id: string): Promise<void> {
  await getRepository().deleteImageFileRecord(id);
}

export async function deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
  await getRepository().deleteImageFileRecordsBefore(createdAt);
}
