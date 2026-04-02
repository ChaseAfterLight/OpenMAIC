import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import type {
  ServerAudioMetadata,
  ServerImageMetadata,
  ServerMediaMetadata,
  ServerStorageRepository,
} from '@/lib/server/storage-repository-types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { safeStorageId } from '@/lib/server/storage-key-utils';
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

const log = createLogger('FileStorageRepo');

type JsonValue = Record<string, unknown> | unknown[];

interface StoredMediaMetadata extends Omit<ServerMediaMetadata, 'storageStatus'> {
  storageStatus?: ServerMediaMetadata['storageStatus'];
}

function getStorageRoots() {
  const storageRoot = getServerStorageConfig().storageRoot;
  return {
    storageRoot,
    stagesRoot: path.join(storageRoot, 'stages'),
    imagesRoot: path.join(storageRoot, 'images'),
  };
}

function stageDir(stageId: string): string {
  return path.join(getStorageRoots().stagesRoot, safeStorageId(stageId));
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

function audioDir(stageId: string): string {
  return path.join(stageDir(stageId), 'audio');
}

function lessonPackVersionsDir(stageId: string): string {
  return path.join(stageDir(stageId), 'lesson-pack-versions');
}

function lessonPackVersionFile(stageId: string, versionId: string): string {
  return path.join(lessonPackVersionsDir(stageId), `${safeStorageId(versionId)}.json`);
}

function mediaMetaFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeStorageId(mediaId)}.json`);
}

function mediaBlobFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeStorageId(mediaId)}.bin`);
}

function mediaPosterFile(stageId: string, mediaId: string): string {
  return path.join(mediaDir(stageId), `${safeStorageId(mediaId)}.poster.bin`);
}

function audioMetaFile(stageId: string, audioId: string): string {
  return path.join(audioDir(stageId), `${safeStorageId(audioId)}.json`);
}

function audioBlobFile(stageId: string, audioId: string): string {
  return path.join(audioDir(stageId), `${safeStorageId(audioId)}.bin`);
}

function imageMetaFile(id: string): string {
  return path.join(getStorageRoots().imagesRoot, `${safeStorageId(id)}.json`);
}

function imageBlobFile(id: string): string {
  return path.join(getStorageRoots().imagesRoot, `${safeStorageId(id)}.bin`);
}

function resolveAudioMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    default:
      return `audio/${format}`;
  }
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
  const { stagesRoot } = getStorageRoots();
  await ensureDir(stagesRoot);
  const entries = await fs.readdir(stagesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(stagesRoot, entry.name));
}

export function createFileStorageRepository(): ServerStorageRepository {
  return {
    async ensureReady(): Promise<void> {
      const { stagesRoot, imagesRoot, storageRoot } = getStorageRoots();
      await Promise.all([ensureDir(stagesRoot), ensureDir(imagesRoot)]);
      log.info(`服务端文件存储根目录: ${storageRoot}`);
    },

    async saveStageRecord(record: StageRecord): Promise<void> {
      await writeJson(stageFile(record.id), record as unknown as JsonValue);
    },

    async getStageRecord(stageId: string): Promise<StageRecord | null> {
      return readJsonFile<StageRecord>(stageFile(stageId));
    },

    async deleteStageRecord(stageId: string): Promise<void> {
      await removePath(stageDir(stageId));
    },

    async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
      const dirs = await listStageDirs();
      const records = await Promise.all(
        dirs.map((dir) => readJsonFile<StageRecord>(path.join(dir, 'stage.json'))),
      );
      return records
        .filter((record): record is StageRecord => Boolean(record))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
      await writeJson(scenesFile(stageId), records as unknown as JsonValue);
    },

    async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
      const records = await readJsonFile<SceneRecord[]>(scenesFile(stageId));
      return (records ?? []).sort((a, b) => a.order - b.order);
    },

    async countScenesByStageId(stageId: string): Promise<number> {
      const records = await this.listScenesByStageId(stageId);
      return records.length;
    },

    async deleteScenesByStageId(stageId: string): Promise<void> {
      await removePath(scenesFile(stageId));
    },

    async replaceChatSessionsByStageId(
      stageId: string,
      records: ChatSessionRecord[],
    ): Promise<void> {
      await writeJson(chatsFile(stageId), records as unknown as JsonValue);
    },

    async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
      const records = await readJsonFile<ChatSessionRecord[]>(chatsFile(stageId));
      return (records ?? []).sort((a, b) => a.createdAt - b.createdAt);
    },

    async deleteChatSessionsByStageId(stageId: string): Promise<void> {
      await removePath(chatsFile(stageId));
    },

    async savePlaybackStateRecord(
      record: PlaybackStateRecord & { sceneId?: string },
    ): Promise<void> {
      await writeJson(playbackFile(record.stageId), record as unknown as JsonValue);
    },

    async getPlaybackStateRecord(
      stageId: string,
    ): Promise<(PlaybackStateRecord & { sceneId?: string }) | null> {
      return readJsonFile<PlaybackStateRecord & { sceneId?: string }>(playbackFile(stageId));
    },

    async deletePlaybackStateRecord(stageId: string): Promise<void> {
      await removePath(playbackFile(stageId));
    },

    async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
      await writeJson(outlinesFile(record.stageId), record as unknown as JsonValue);
    },

    async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | null> {
      return readJsonFile<StageOutlinesRecord>(outlinesFile(stageId));
    },

    async deleteStageOutlinesRecord(stageId: string): Promise<void> {
      await removePath(outlinesFile(stageId));
    },

    async saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
      await writeJson(
        lessonPackVersionFile(record.stageId, record.id),
        record as unknown as JsonValue,
      );
    },

    async getLessonPackVersionRecord(
      stageId: string,
      versionId: string,
    ): Promise<LessonPackVersionRecord | null> {
      return readJsonFile<LessonPackVersionRecord>(lessonPackVersionFile(stageId, versionId));
    },

    async listLessonPackVersionRecordsByStageId(stageId: string): Promise<LessonPackVersionRecord[]> {
      const dir = lessonPackVersionsDir(stageId);
      const files = await readDirectory(dir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));
      const records = await Promise.all(
        jsonFiles.map((file) => readJsonFile<LessonPackVersionRecord>(path.join(dir, file))),
      );
      return records
        .filter((record): record is LessonPackVersionRecord => Boolean(record))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void> {
      await removePath(lessonPackVersionFile(stageId, versionId));
    },

    async deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
      await removePath(lessonPackVersionsDir(stageId));
    },

    async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
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
        hasBlob: true,
        hasPoster: Boolean(record.poster),
        storageStatus: record.errorCode ? 'failed' : 'ready',
      };
      await fs.writeFile(
        mediaBlobFile(record.stageId, record.id),
        Buffer.from(await record.blob.arrayBuffer()),
      );
      if (record.poster) {
        await fs.writeFile(
          mediaPosterFile(record.stageId, record.id),
          Buffer.from(await record.poster.arrayBuffer()),
        );
      } else {
        await removePath(mediaPosterFile(record.stageId, record.id));
      }
      await writeJson(mediaMetaFile(record.stageId, record.id), metadata as unknown as JsonValue);
    },

    async saveAudioFileRecord(record: AudioFileRecord): Promise<void> {
      if (!record.stageId) {
        throw new Error(`Audio record missing stageId: ${record.id}`);
      }
      await ensureDir(audioDir(record.stageId));
      const metadata: ServerAudioMetadata = {
        id: record.id,
        duration: record.duration,
        format: record.format,
        text: record.text,
        voice: record.voice,
        stageId: record.stageId,
        providerId: record.providerId,
        modelId: record.modelId,
        speed: record.speed,
        createdAt: record.createdAt,
        ossKey: record.ossKey,
        hasBlob: true,
        storageStatus: 'ready',
      };
      await fs.writeFile(
        audioBlobFile(record.stageId, record.id),
        Buffer.from(await record.blob.arrayBuffer()),
      );
      await writeJson(audioMetaFile(record.stageId, record.id), metadata as unknown as JsonValue);
    },

    async getAudioFileRecordMetadata(id: string): Promise<ServerAudioMetadata | null> {
      const { stagesRoot } = getStorageRoots();
      await ensureDir(stagesRoot);
      const stageDirs = await readDirectory(stagesRoot);
      for (const stageName of stageDirs) {
        const metadata = await readJsonFile<ServerAudioMetadata>(
          path.join(stagesRoot, stageName, 'audio', `${safeStorageId(id)}.json`),
        );
        if (metadata) {
          return metadata;
        }
      }
      return null;
    },

    async getAudioFileBlob(stageId: string, audioId: string) {
      const metadata = await readJsonFile<ServerAudioMetadata>(audioMetaFile(stageId, audioId));
      if (!metadata?.hasBlob) {
        return null;
      }
      try {
        const buffer = await fs.readFile(audioBlobFile(stageId, audioId));
        return { buffer, mimeType: resolveAudioMimeType(metadata.format) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async listAudioFileRecordsByStageId(stageId: string): Promise<ServerAudioMetadata[]> {
      const dir = audioDir(stageId);
      const files = await readDirectory(dir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));
      const records = await Promise.all(
        jsonFiles.map((file) => readJsonFile<ServerAudioMetadata>(path.join(dir, file))),
      );
      return records
        .filter((record): record is ServerAudioMetadata => Boolean(record))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteAudioFileRecord(id: string): Promise<void> {
      const { stagesRoot } = getStorageRoots();
      const stageDirs = await readDirectory(stagesRoot);
      await Promise.all(
        stageDirs.map(async (stageName) => {
          await Promise.all([
            removePath(path.join(stagesRoot, stageName, 'audio', `${safeStorageId(id)}.json`)),
            removePath(path.join(stagesRoot, stageName, 'audio', `${safeStorageId(id)}.bin`)),
          ]);
        }),
      );
    },

    async deleteAudioFileRecordsByStageId(stageId: string): Promise<void> {
      await removePath(audioDir(stageId));
    },

    async listMediaFilesByStageId(stageId: string): Promise<ServerMediaMetadata[]> {
      const dir = mediaDir(stageId);
      const files = await readDirectory(dir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));
      const records = await Promise.all(
        jsonFiles.map((file) => readJsonFile<StoredMediaMetadata>(path.join(dir, file))),
      );
      return records
        .filter((record): record is StoredMediaMetadata => Boolean(record))
        .map((record) => ({
          ...record,
          storageStatus: record.storageStatus ?? 'ready',
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async getMediaFileBlob(stageId: string, mediaId: string) {
      const metadata = await readJsonFile<StoredMediaMetadata>(mediaMetaFile(stageId, mediaId));
      if (!metadata?.hasBlob) {
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
    },

    async getMediaPosterBlob(stageId: string, mediaId: string) {
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
    },

    async deleteMediaFilesByStageId(stageId: string): Promise<void> {
      await removePath(mediaDir(stageId));
    },

    async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
      await ensureDir(getStorageRoots().imagesRoot);
      const metadata: ServerImageMetadata = {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
        hasBlob: true,
        storageStatus: 'ready',
      };
      await fs.writeFile(imageBlobFile(record.id), Buffer.from(await record.blob.arrayBuffer()));
      await writeJson(imageMetaFile(record.id), metadata as unknown as JsonValue);
    },

    async getImageFileRecordMetadata(id: string): Promise<ServerImageMetadata | null> {
      return readJsonFile<ServerImageMetadata>(imageMetaFile(id));
    },

    async getImageFileBlob(id: string) {
      const metadata = await this.getImageFileRecordMetadata(id);
      if (!metadata?.hasBlob) {
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
    },

    async listImageFileRecordMetadata(): Promise<ServerImageMetadata[]> {
      const { imagesRoot } = getStorageRoots();
      await ensureDir(imagesRoot);
      const files = await readDirectory(imagesRoot);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));
      const records = await Promise.all(
        jsonFiles.map((file) => readJsonFile<ServerImageMetadata>(path.join(imagesRoot, file))),
      );
      return records
        .filter((record): record is ServerImageMetadata => Boolean(record))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async deleteImageFileRecord(id: string): Promise<void> {
      await Promise.all([removePath(imageMetaFile(id)), removePath(imageBlobFile(id))]);
    },

    async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
      const records = await this.listImageFileRecordMetadata();
      await Promise.all(
        records
          .filter((record) => record.createdAt < createdAt)
          .map((record) => this.deleteImageFileRecord(record.id)),
      );
    },
  };
}

export async function hasFileBackedStage(stageId: string): Promise<boolean> {
  return fileExists(stageFile(stageId));
}
