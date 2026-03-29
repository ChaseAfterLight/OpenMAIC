import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import {
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type {
  ChatSessionRecord,
  ImageFileRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

const log = createLogger('ServerStorageRepo');

const STORAGE_ROOT = path.join(process.cwd(), 'data', 'storage');
const STAGES_ROOT = path.join(STORAGE_ROOT, 'stages');
const IMAGES_ROOT = path.join(STORAGE_ROOT, 'images');

type JsonValue = Record<string, unknown> | unknown[];

interface StoredMediaMetadata extends Omit<MediaFileRecord, 'blob' | 'poster'> {
  hasPoster: boolean;
}

function safeId(id: string): string {
  return Buffer.from(id).toString('base64url');
}

function stageDir(stageId: string): string {
  return path.join(STAGES_ROOT, safeId(stageId));
}

function stageFile(stageId: string): string {
  return path.join(stageDir(stageId), 'stage.json');
}

function scenesFile(stageId: string): string {
  return path.join(stageDir(stageId), 'scenes.json');
}

function chatsFile(stageId: string): string {
  return path.join(stageDir(stageId), 'chat-sessions.json');
}

function playbackFile(stageId: string): string {
  return path.join(stageDir(stageId), 'playback.json');
}

function outlinesFile(stageId: string): string {
  return path.join(stageDir(stageId), 'outlines.json');
}

function mediaDir(stageId: string): string {
  return path.join(stageDir(stageId), 'media');
}

function mediaMetaFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeId(mediaId)}.json`);
}

function mediaBlobFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeId(mediaId)}.bin`);
}

function mediaPosterFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeId(mediaId)}.poster.bin`);
}

function imageMetaFile(id: string): string {
  return path.join(IMAGES_ROOT, `${safeId(id)}.json`);
}

function imageBlobFile(id: string): string {
  return path.join(IMAGES_ROOT, `${safeId(id)}.bin`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJson(filePath: string, data: JsonValue): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeJsonFileAtomic(filePath, data);
}

async function readDirectory(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function removePath(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listStageDirs(): Promise<string[]> {
  await ensureDir(STAGES_ROOT);
  const entries = await fs.readdir(STAGES_ROOT, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(STAGES_ROOT, entry.name));
}

export async function saveStageRecord(record: StageRecord): Promise<void> {
  await writeJson(stageFile(record.id), record as unknown as JsonValue);
}

export async function getStageRecord(stageId: string): Promise<StageRecord | null> {
  return readJsonFile<StageRecord>(stageFile(stageId));
}

export async function deleteStageRecord(stageId: string): Promise<void> {
  await removePath(stageDir(stageId));
}

export async function listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
  const dirs = await listStageDirs();
  const records = await Promise.all(dirs.map((dir) => readJsonFile<StageRecord>(path.join(dir, 'stage.json'))));
  return records
    .filter((record): record is StageRecord => Boolean(record))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
  await writeJson(scenesFile(stageId), records as unknown as JsonValue);
}

export async function listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  const records = await readJsonFile<SceneRecord[]>(scenesFile(stageId));
  return (records ?? []).sort((a, b) => a.order - b.order);
}

export async function countScenesByStageId(stageId: string): Promise<number> {
  const records = await listScenesByStageId(stageId);
  return records.length;
}

export async function deleteScenesByStageId(stageId: string): Promise<void> {
  await removePath(scenesFile(stageId));
}

export async function replaceChatSessionsByStageId(
  stageId: string,
  records: ChatSessionRecord[],
): Promise<void> {
  await writeJson(chatsFile(stageId), records as unknown as JsonValue);
}

export async function listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
  const records = await readJsonFile<ChatSessionRecord[]>(chatsFile(stageId));
  return (records ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteChatSessionsByStageId(stageId: string): Promise<void> {
  await removePath(chatsFile(stageId));
}

export async function savePlaybackStateRecord(
  record: PlaybackStateRecord & { sceneId?: string },
): Promise<void> {
  await writeJson(playbackFile(record.stageId), record as unknown as JsonValue);
}

export async function getPlaybackStateRecord(
  stageId: string,
): Promise<(PlaybackStateRecord & { sceneId?: string }) | null> {
  return readJsonFile<PlaybackStateRecord & { sceneId?: string }>(playbackFile(stageId));
}

export async function deletePlaybackStateRecord(stageId: string): Promise<void> {
  await removePath(playbackFile(stageId));
}

export async function saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
  await writeJson(outlinesFile(record.stageId), record as unknown as JsonValue);
}

export async function getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | null> {
  return readJsonFile<StageOutlinesRecord>(outlinesFile(stageId));
}

export async function deleteStageOutlinesRecord(stageId: string): Promise<void> {
  await removePath(outlinesFile(stageId));
}

export async function saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
  await ensureDir(mediaDir(record.stageId));
  const metadata: StoredMediaMetadata = {
    id: record.id,
    stageId: record.stageId,
    type: record.type,
    mimeType: record.mimeType,
    size: record.size,
    prompt: record.prompt,
    params: record.params,
    error: record.error,
    errorCode: record.errorCode,
    ossKey: record.ossKey,
    posterOssKey: record.posterOssKey,
    createdAt: record.createdAt,
    hasPoster: Boolean(record.poster),
  };
  await fs.writeFile(mediaBlobFile(record.stageId, record.id), Buffer.from(await record.blob.arrayBuffer()));
  if (record.poster) {
    await fs.writeFile(
      mediaPosterFile(record.stageId, record.id),
      Buffer.from(await record.poster.arrayBuffer()),
    );
  } else {
    await removePath(mediaPosterFile(record.stageId, record.id));
  }
  await writeJson(mediaMetaFile(record.stageId, record.id), metadata as unknown as JsonValue);
}

export async function listMediaFilesByStageId(stageId: string): Promise<StoredMediaMetadata[]> {
  const dir = mediaDir(stageId);
  const files = await readDirectory(dir);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const records = await Promise.all(
    jsonFiles.map((file) => readJsonFile<StoredMediaMetadata>(path.join(dir, file))),
  );
  return records
    .filter((record): record is StoredMediaMetadata => Boolean(record))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMediaFileBlob(
  stageId: string,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const metadata = await readJsonFile<StoredMediaMetadata>(mediaMetaFile(stageId, mediaId));
  if (!metadata) {
    return null;
  }
  try {
    const buffer = await fs.readFile(mediaBlobFile(stageId, mediaId));
    return { buffer, mimeType: metadata.mimeType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function getMediaPosterBlob(
  stageId: string,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const metadata = await readJsonFile<StoredMediaMetadata>(mediaMetaFile(stageId, mediaId));
  if (!metadata?.hasPoster) {
    return null;
  }
  try {
    const buffer = await fs.readFile(mediaPosterFile(stageId, mediaId));
    return { buffer, mimeType: 'image/png' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function deleteMediaFilesByStageId(stageId: string): Promise<void> {
  await removePath(mediaDir(stageId));
}

export async function saveImageFileRecord(record: ImageFileRecord): Promise<void> {
  await ensureDir(IMAGES_ROOT);
  const metadata: Omit<ImageFileRecord, 'blob'> = {
    id: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
  };
  await fs.writeFile(imageBlobFile(record.id), Buffer.from(await record.blob.arrayBuffer()));
  await writeJson(imageMetaFile(record.id), metadata as unknown as JsonValue);
}

export async function getImageFileRecordMetadata(
  id: string,
): Promise<Omit<ImageFileRecord, 'blob'> | null> {
  return readJsonFile<Omit<ImageFileRecord, 'blob'>>(imageMetaFile(id));
}

export async function getImageFileBlob(
  id: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const metadata = await getImageFileRecordMetadata(id);
  if (!metadata) {
    return null;
  }
  try {
    const buffer = await fs.readFile(imageBlobFile(id));
    return { buffer, mimeType: metadata.mimeType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listImageFileRecordMetadata(): Promise<Array<Omit<ImageFileRecord, 'blob'>>> {
  await ensureDir(IMAGES_ROOT);
  const files = await readDirectory(IMAGES_ROOT);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const records = await Promise.all(
    jsonFiles.map((file) => readJsonFile<Omit<ImageFileRecord, 'blob'>>(path.join(IMAGES_ROOT, file))),
  );
  return records
    .filter((record): record is Omit<ImageFileRecord, 'blob'> => Boolean(record))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteImageFileRecord(id: string): Promise<void> {
  await Promise.all([removePath(imageMetaFile(id)), removePath(imageBlobFile(id))]);
}

export async function deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
  const records = await listImageFileRecordMetadata();
  await Promise.all(
    records
      .filter((record) => record.createdAt < createdAt)
      .map((record) => deleteImageFileRecord(record.id)),
  );
}

export async function hasStage(stageId: string): Promise<boolean> {
  return fileExists(stageFile(stageId));
}

export async function ensureStorageRoots(): Promise<void> {
  await Promise.all([ensureDir(STAGES_ROOT), ensureDir(IMAGES_ROOT)]);
}

log.info(`服务端存储根目录: ${STORAGE_ROOT}`);
