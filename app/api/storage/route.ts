import { type NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import type { AuthPublicUser } from '@/lib/server/auth-types';
import {
  getAudioFileBlob,
  getAudioFileRecordMetadata,
  deleteAudioFileRecord,
  deleteAudioFileRecordsByStageId,
  listAudioFileRecordsByStageId,
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

function buildAudioDownloadUrl(stageId: string, id: string): string {
  return `/api/storage?action=downloadAudio&stageId=${encodeURIComponent(stageId)}&id=${encodeURIComponent(id)}`;
}

function hasStageAccess(user: AuthPublicUser, ownerUserId?: string): boolean {
  if (user.role === 'admin') return true;
  if (!ownerUserId) return false;
  return ownerUserId === user.id;
}

async function ensureStageAccess(user: AuthPublicUser, stageId: string) {
  const stage = await getStageRecord(stageId);
  if (!stage) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Stage not found');
  }
  if (!hasStageAccess(user, stage.ownerUserId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden stage access');
  }
  return null;
}

async function handleJsonAction(body: StorageJsonAction, user: AuthPublicUser) {
  switch (body.action) {
    case 'saveStageRecord':
      await saveStageRecord({
        ...body.record,
        ownerUserId: user.role === 'admin' ? body.record.ownerUserId ?? user.id : user.id,
      });
      return apiSuccess({ ok: true });
    case 'getStageRecord':
      {
        const record = await getStageRecord(body.stageId);
        if (!record) {
          return apiSuccess({ ok: true, record: null });
        }
        if (!hasStageAccess(user, record.ownerUserId)) {
          return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden stage access');
        }
        return apiSuccess({ ok: true, record });
      }
    case 'deleteStageRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteStageRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'listStageRecordsByUpdatedAtDesc':
      {
        const records = await listStageRecordsByUpdatedAtDesc();
        const filtered =
          user.role === 'admin' ? records : records.filter((r) => r.ownerUserId === user.id);
        return apiSuccess({ ok: true, records: filtered });
      }
    case 'replaceScenesByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await replaceScenesByStageId(body.stageId, body.records);
      return apiSuccess({ ok: true });
    case 'listScenesByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({ ok: true, records: await listScenesByStageId(body.stageId) });
    case 'countScenesByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({ ok: true, count: await countScenesByStageId(body.stageId) });
    case 'deleteScenesByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteScenesByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'replaceChatSessionsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await replaceChatSessionsByStageId(body.stageId, body.records);
      return apiSuccess({ ok: true });
    case 'listChatSessionsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({ ok: true, records: await listChatSessionsByStageId(body.stageId) });
    case 'deleteChatSessionsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteChatSessionsByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'savePlaybackStateRecord':
      {
        const denied = await ensureStageAccess(user, body.record.stageId);
        if (denied) return denied;
      }
      await savePlaybackStateRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getPlaybackStateRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({ ok: true, record: (await getPlaybackStateRecord(body.stageId)) ?? null });
    case 'deletePlaybackStateRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deletePlaybackStateRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'saveStageOutlinesRecord':
      {
        const denied = await ensureStageAccess(user, body.record.stageId);
        if (denied) return denied;
      }
      await saveStageOutlinesRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getStageOutlinesRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({ ok: true, record: (await getStageOutlinesRecord(body.stageId)) ?? null });
    case 'deleteStageOutlinesRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteStageOutlinesRecord(body.stageId);
      return apiSuccess({ ok: true });
    case 'saveLessonPackVersionRecord':
      {
        const denied = await ensureStageAccess(user, body.record.stageId);
        if (denied) return denied;
      }
      await saveLessonPackVersionRecord(body.record);
      return apiSuccess({ ok: true });
    case 'getLessonPackVersionRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({
        ok: true,
        version: (await getLessonPackVersionRecord(body.stageId, body.versionId)) ?? null,
      });
    case 'listLessonPackVersionRecordsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      return apiSuccess({
        ok: true,
        versions: await listLessonPackVersionRecordsByStageId(body.stageId),
      });
    case 'deleteLessonPackVersionRecord':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteLessonPackVersionRecord(body.stageId, body.versionId);
      return apiSuccess({ ok: true });
    case 'deleteLessonPackVersionsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteLessonPackVersionsByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'listMediaFilesByStageId': {
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
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
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteMediaFilesByStageId(body.stageId);
      return apiSuccess({ ok: true });
    case 'getAudioFileRecordMetadata': {
      const audio = await getAudioFileRecordMetadata(body.id);
      if (!audio) {
        return apiSuccess({ ok: true, audio: null });
      }
      const denied = await ensureStageAccess(user, audio.stageId || '');
      if (denied) return denied;
      return apiSuccess({
        ok: true,
        audio: {
          ...audio,
          downloadUrl: audio.hasBlob ? buildAudioDownloadUrl(audio.stageId || '', audio.id) : undefined,
        },
      });
    }
    case 'listAudioFileRecordsByStageId': {
      const denied = await ensureStageAccess(user, body.stageId);
      if (denied) return denied;
      const audios = await listAudioFileRecordsByStageId(body.stageId);
      return apiSuccess({
        ok: true,
        audios: audios.map((record) => ({
          ...record,
          downloadUrl: record.hasBlob ? buildAudioDownloadUrl(body.stageId, record.id) : undefined,
        })),
      });
    }
    case 'deleteAudioFileRecord': {
      const audio = await getAudioFileRecordMetadata(body.id);
      if (!audio) {
        return apiSuccess({ ok: true });
      }
      const denied = await ensureStageAccess(user, audio.stageId || '');
      if (denied) return denied;
      await deleteAudioFileRecord(body.id);
      return apiSuccess({ ok: true });
    }
    case 'deleteAudioFileRecordsByStageId':
      {
        const denied = await ensureStageAccess(user, body.stageId);
        if (denied) return denied;
      }
      await deleteAudioFileRecordsByStageId(body.stageId);
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

async function handleFormDataAction(formData: FormData, user: AuthPublicUser) {
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
    const stageDenied = await ensureStageAccess(user, metadata.stageId);
    if (stageDenied) return stageDenied;
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
  const auth = await requireApiRole(request, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    await ensureStorageRoots();
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleFormDataAction(await request.formData(), auth.user);
    }
    return await handleJsonAction((await request.json()) as StorageJsonAction, auth.user);
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
  const auth = await requireApiRole(request, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

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
      const denied = await ensureStageAccess(auth.user, stageId);
      if (denied) return denied;
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
      const denied = await ensureStageAccess(auth.user, stageId);
      if (denied) return denied;
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

    if (action === 'downloadAudio' && id && stageId) {
      const denied = await ensureStageAccess(auth.user, stageId);
      if (denied) return denied;
      const record = await getAudioFileBlob(stageId, id);
      if (!record) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Audio file not found');
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
