import { type NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  deleteChatSessionsByStageId,
  deleteImageFileRecord,
  deleteImageFileRecordsBefore,
  deleteLessonPackVersionRecord,
  deleteLessonPackVersionsByStageId,
  deleteMediaFilesByStageId,
  deletePlaybackStateRecord,
  deleteScenesByStageId,
  deleteStageOutlinesRecord,
  deleteStageRecord,
  ensureStorageRoots,
  getImageFileBlob,
  getImageFileRecordMetadata,
  getLessonPackVersionRecord,
  getMediaFileBlob,
  getMediaPosterBlob,
  getPlaybackStateRecord,
  getStageOutlinesRecord,
  getStageRecord,
  listChatSessionsByStageId,
  listImageFileRecordMetadata,
  listLessonPackVersionRecordsByStageId,
  listMediaFilesByStageId,
  listScenesByStageId,
  listStageRecordsByUpdatedAtDesc,
  replaceChatSessionsByStageId,
  replaceScenesByStageId,
  saveImageFileRecord,
  saveLessonPackVersionRecord,
  saveMediaFileRecord,
  savePlaybackStateRecord,
  saveStageOutlinesRecord,
  saveStageRecord,
  countScenesByStageId,
} from '@/lib/server/storage-repository';
import type { StorageJsonAction } from '@/lib/storage/server-api-types';
import type { ImageFileRecord, MediaFileRecord } from '@/lib/utils/database';

function buildImageDownloadUrl(id: string): string {
  return `/api/storage?action=downloadImage&id=${encodeURIComponent(id)}`;
}

function buildMediaDownloadUrl(stageId: string, id: string, poster = false): string {
  return `/api/storage?action=${poster ? 'downloadMediaPoster' : 'downloadMedia'}&stageId=${encodeURIComponent(stageId)}&id=${encodeURIComponent(id)}`;
}

async function handleJsonAction(body: StorageJsonAction) {
  switch (body.action) {
    case 'saveStageRecord':
      await saveStageRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getStageRecord':
      return apiSuccess({ ok: true, record: (await getStageRecord(body.stageId)) ?? null });
    case 'deleteStageRecord':
      await deleteStageRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'listStageRecordsByUpdatedAtDesc':
      return apiSuccess({ ok: true, records: await listStageRecordsByUpdatedAtDesc() });
    case 'replaceScenesByStageId':
      await replaceScenesByStageId(body.stageId, body.records);
      return apiSuccess({ ok: true });
    case 'listScenesByStageId':
      return apiSuccess({ ok: true, records: await listScenesByStageId(body.stageId) });
    case 'countScenesByStageId':
      return apiSuccess({ ok: true, count: await countScenesByStageId(body.stageId) });
    case 'deleteScenesByStageId':
      await deleteScenesByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'replaceChatSessionsByStageId':
      await replaceChatSessionsByStageId(body.stageId, body.records);
      return apiSuccess({ ok: true });
    case 'listChatSessionsByStageId':
      return apiSuccess({ ok: true, records: await listChatSessionsByStageId(body.stageId) });
    case 'deleteChatSessionsByStageId':
      await deleteChatSessionsByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'savePlaybackStateRecord':
      await savePlaybackStateRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getPlaybackStateRecord':
      return apiSuccess({ ok: true, record: (await getPlaybackStateRecord(body.stageId)) ?? null });
    case 'deletePlaybackStateRecord':
      await deletePlaybackStateRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'saveStageOutlinesRecord':
      await saveStageOutlinesRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getStageOutlinesRecord':
      return apiSuccess({ ok: true, record: (await getStageOutlinesRecord(body.stageId)) ?? null });
    case 'deleteStageOutlinesRecord':
      await deleteStageOutlinesRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'saveLessonPackVersionRecord':
      await saveLessonPackVersionRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getLessonPackVersionRecord':
      return apiSuccess({
        ok: true,
        version: (await getLessonPackVersionRecord(body.stageId, body.versionId)) ?? null,
      });
    case 'listLessonPackVersionRecordsByStageId':
      return apiSuccess({
        ok: true,
        versions: await listLessonPackVersionRecordsByStageId(body.stageId),
      });
    case 'deleteLessonPackVersionRecord':
      await deleteLessonPackVersionRecord(body.stageId, body.versionId);
      return apiSuccess({ ok: true });
    case 'deleteLessonPackVersionsByStageId':
      await deleteLessonPackVersionsByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'listMediaFilesByStageId': {
      const media = await listMediaFilesByStageId(body.stageId);
      return apiSuccess({
        ok: true,
        media: media.map((record) => ({
          ...record,
          downloadUrl: record.hasBlob ? buildMediaDownloadUrl(body.stageId, record.id) : undefined,
          posterDownloadUrl: record.hasPoster
            ? buildMediaDownloadUrl(body.stageId, record.id, true)
            : undefined,
        })),
      });
    }
    case 'deleteMediaFilesByStageId':
      await deleteMediaFilesByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'getImageFileRecordMetadata': {
      const image = await getImageFileRecordMetadata(body.id);
      return apiSuccess({
        ok: true,
        image: image
          ? {
              ...image,
              downloadUrl: image.hasBlob ? buildImageDownloadUrl(body.id) : undefined,
            }
          : null,
      });
    }
    case 'listImageFileRecordMetadata': {
      const images = await listImageFileRecordMetadata();
      return apiSuccess({
        ok: true,
        images: images.map((record) => ({
          ...record,
          downloadUrl: record.hasBlob ? buildImageDownloadUrl(record.id) : undefined,
        })),
      });
    }
    case 'deleteImageFileRecord':
      await deleteImageFileRecord(body.id);
      return apiSuccess({ ok: true });
    case 'deleteImageFileRecordsBefore':
      await deleteImageFileRecordsBefore(body.createdAt);
      return apiSuccess({ ok: true });
    default:
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported storage action');
  }
}

async function handleFormDataAction(formData: FormData) {
  const action = formData.get('action');
  const metadataRaw = formData.get('metadata');

  if (typeof action !== 'string' || typeof metadataRaw !== 'string') {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required fields: action, metadata',
    );
  }

  if (action === 'saveImageFileRecord') {
    const file = formData.get('blob');
    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing image blob');
    }
    const metadata = JSON.parse(metadataRaw) as Omit<ImageFileRecord, 'blob'>;
    await saveImageFileRecord({
      ...metadata,
      blob: new Blob([await file.arrayBuffer()], { type: metadata.mimeType }),
    });
    return apiSuccess({ ok: true });
  }

  if (action === 'saveMediaFileRecord') {
    const blobFile = formData.get('blob');
    const posterFile = formData.get('poster');
    if (!(blobFile instanceof File)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing media blob');
    }
    const metadata = JSON.parse(metadataRaw) as Omit<MediaFileRecord, 'blob' | 'poster'>;
    await saveMediaFileRecord({
      ...metadata,
      blob: new Blob([await blobFile.arrayBuffer()], { type: metadata.mimeType }),
      poster:
        posterFile instanceof File
          ? new Blob([await posterFile.arrayBuffer()], { type: posterFile.type || 'image/png' })
          : undefined,
    });
    return apiSuccess({ ok: true });
  }

  return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported storage upload action');
}

export async function POST(request: NextRequest) {
  try {
    await ensureStorageRoots();
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleFormDataAction(await request.formData());
    }
    return await handleJsonAction((await request.json()) as StorageJsonAction);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Storage request failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureStorageRoots();
    const action = request.nextUrl.searchParams.get('action');
    const id = request.nextUrl.searchParams.get('id');
    const stageId = request.nextUrl.searchParams.get('stageId');

    if (action === 'downloadImage' && id) {
      const record = await getImageFileBlob(id);
      if (!record) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Image file not found');
      }
      return new NextResponse(new Uint8Array(record.buffer), {
        status: 200,
        headers: {
          'Content-Type': record.mimeType,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (action === 'downloadMedia' && id && stageId) {
      const record = await getMediaFileBlob(stageId, id);
      if (!record) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Media file not found');
      }
      return new NextResponse(new Uint8Array(record.buffer), {
        status: 200,
        headers: {
          'Content-Type': record.mimeType,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (action === 'downloadMediaPoster' && id && stageId) {
      const record = await getMediaPosterBlob(stageId, id);
      if (!record) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Media poster not found');
      }
      return new NextResponse(new Uint8Array(record.buffer), {
        status: 200,
        headers: {
          'Content-Type': record.mimeType,
          'Cache-Control': 'no-store',
        },
      });
    }

    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported storage download action');
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Storage download failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
