import { createLogger } from '@/lib/logger';
import type {
  ServerImageFileMetadata,
  ServerMediaFileMetadata,
  StorageJsonAction,
} from '@/lib/storage/server-api-types';
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

const log = createLogger('ServerStorageClient');

interface ApiEnvelope {
  success: boolean;
  error?: string;
  details?: string;
  [key: string]: unknown;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as ApiEnvelope;
  if (!response.ok || !data.success) {
    throw new Error(data.error || data.details || `服务端存储请求失败: ${response.status}`);
  }
  return data as T;
}

async function requestJson<T>(body: StorageJsonAction): Promise<T> {
  const response = await fetch('/api/storage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(response);
}

async function fetchBlob(url: string, mimeType: string): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`下载服务端文件失败: ${response.status}`);
  }
  const blob = await response.blob();
  return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType });
}

function toMetadataOnlyImageRecord(record: ServerImageFileMetadata): ImageFileRecord {
  return {
    id: record.id,
    blob: new Blob([], { type: record.mimeType }),
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
  };
}

async function toImageRecord(record: ServerImageFileMetadata): Promise<ImageFileRecord> {
  return {
    ...toMetadataOnlyImageRecord(record),
    blob: record.downloadUrl
      ? await fetchBlob(record.downloadUrl, record.mimeType)
      : new Blob([], { type: record.mimeType }),
  };
}

async function toMediaRecord(record: ServerMediaFileMetadata): Promise<MediaFileRecord> {
  const [blob, poster] = await Promise.all([
    record.downloadUrl
      ? fetchBlob(record.downloadUrl, record.mimeType)
      : Promise.resolve(new Blob([], { type: record.mimeType })),
    record.posterDownloadUrl
      ? fetchBlob(record.posterDownloadUrl, 'image/png')
      : Promise.resolve(undefined),
  ]);

  return {
    id: record.id,
    stageId: record.stageId,
    type: record.type,
    blob,
    mimeType: record.mimeType,
    size: record.size,
    poster,
    prompt: record.prompt,
    params: record.params,
    error: record.error,
    errorCode: record.errorCode,
    ossKey: record.ossKey,
    posterOssKey: record.posterOssKey,
    createdAt: record.createdAt,
  };
}

async function uploadBinary(
  action: 'saveImageFileRecord' | 'saveMediaFileRecord',
  metadata: Record<string, unknown>,
  blob: Blob,
  poster?: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.set('action', action);
  formData.set('metadata', JSON.stringify(metadata));
  formData.set('blob', blob);
  if (poster) {
    formData.set('poster', poster);
  }

  const response = await fetch('/api/storage', {
    method: 'POST',
    body: formData,
  });
  await parseApiResponse<{ ok: true }>(response);
}

export const serverStorageClient = {
  async saveStageRecord(record: StageRecord): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'saveStageRecord', record });
  },

  async getStageRecord(stageId: string): Promise<StageRecord | undefined> {
    const response = await requestJson<{ record: StageRecord | null }>({
      action: 'getStageRecord',
      stageId,
    });
    return response.record ?? undefined;
  },

  async deleteStageRecord(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteStageRecord', stageId });
  },

  async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
    const response = await requestJson<{ records: StageRecord[] }>({
      action: 'listStageRecordsByUpdatedAtDesc',
    });
    return response.records ?? [];
  },

  async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'replaceScenesByStageId', stageId, records });
  },

  async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
    const response = await requestJson<{ records: SceneRecord[] }>({
      action: 'listScenesByStageId',
      stageId,
    });
    return response.records ?? [];
  },

  async countScenesByStageId(stageId: string): Promise<number> {
    const response = await requestJson<{ count: number }>({
      action: 'countScenesByStageId',
      stageId,
    });
    return response.count ?? 0;
  },

  async deleteScenesByStageId(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteScenesByStageId', stageId });
  },

  async replaceChatSessionsByStageId(stageId: string, records: ChatSessionRecord[]): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'replaceChatSessionsByStageId', stageId, records });
  },

  async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
    const response = await requestJson<{ records: ChatSessionRecord[] }>({
      action: 'listChatSessionsByStageId',
      stageId,
    });
    return response.records ?? [];
  },

  async deleteChatSessionsByStageId(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteChatSessionsByStageId', stageId });
  },

  async savePlaybackStateRecord(record: PlaybackStateRecord & { sceneId?: string }): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'savePlaybackStateRecord', record });
  },

  async getPlaybackStateRecord(
    stageId: string,
  ): Promise<(PlaybackStateRecord & { sceneId?: string }) | undefined> {
    const response = await requestJson<{
      record: (PlaybackStateRecord & { sceneId?: string }) | null;
    }>({
      action: 'getPlaybackStateRecord',
      stageId,
    });
    return response.record ?? undefined;
  },

  async deletePlaybackStateRecord(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deletePlaybackStateRecord', stageId });
  },

  async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'saveStageOutlinesRecord', record });
  },

  async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | undefined> {
    const response = await requestJson<{ record: StageOutlinesRecord | null }>({
      action: 'getStageOutlinesRecord',
      stageId,
    });
    return response.record ?? undefined;
  },

  async deleteStageOutlinesRecord(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteStageOutlinesRecord', stageId });
  },

  async saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'saveLessonPackVersionRecord', record });
  },

  async getLessonPackVersionRecord(
    stageId: string,
    versionId: string,
  ): Promise<LessonPackVersionRecord | undefined> {
    const response = await requestJson<{ version: LessonPackVersionRecord | null }>({
      action: 'getLessonPackVersionRecord',
      stageId,
      versionId,
    });
    return response.version ?? undefined;
  },

  async listLessonPackVersionRecordsByStageId(stageId: string): Promise<LessonPackVersionRecord[]> {
    const response = await requestJson<{ versions: LessonPackVersionRecord[] }>({
      action: 'listLessonPackVersionRecordsByStageId',
      stageId,
    });
    return response.versions ?? [];
  },

  async deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void> {
    await requestJson<{ ok: true }>({
      action: 'deleteLessonPackVersionRecord',
      stageId,
      versionId,
    });
  },

  async deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteLessonPackVersionsByStageId', stageId });
  },

  async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
    await uploadBinary(
      'saveMediaFileRecord',
      {
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
      },
      record.blob,
      record.poster,
    );
  },

  async listMediaFilesByStageId(stageId: string): Promise<MediaFileRecord[]> {
    const response = await requestJson<{ media: ServerMediaFileMetadata[] }>({
      action: 'listMediaFilesByStageId',
      stageId,
    });
    return Promise.all((response.media ?? []).map((record) => toMediaRecord(record)));
  },

  async deleteMediaFilesByStageId(stageId: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteMediaFilesByStageId', stageId });
  },

  async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
    await uploadBinary(
      'saveImageFileRecord',
      {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
      },
      record.blob,
    );
  },

  async getImageFileRecord(id: string): Promise<ImageFileRecord | undefined> {
    const response = await requestJson<{ image: ServerImageFileMetadata | null }>({
      action: 'getImageFileRecordMetadata',
      id,
    });
    if (!response.image) {
      return undefined;
    }
    return toImageRecord(response.image);
  },

  async listImageFileRecords(): Promise<ImageFileRecord[]> {
    const response = await requestJson<{ images: ServerImageFileMetadata[] }>({
      action: 'listImageFileRecordMetadata',
    });
    return (response.images ?? []).map((record) => toMetadataOnlyImageRecord(record));
  },

  async deleteImageFileRecord(id: string): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteImageFileRecord', id });
  },

  async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
    await requestJson<{ ok: true }>({ action: 'deleteImageFileRecordsBefore', createdAt });
  },
};

export function logServerStorageFailure(message: string, error: unknown): void {
  log.warn(message, error instanceof Error ? error.message : error);
}
