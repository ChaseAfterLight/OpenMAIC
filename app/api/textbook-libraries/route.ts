import { after, type NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import type { AuthPublicUser } from '@/lib/server/auth-types';
import { runTextbookAttachmentProcessing } from '@/lib/server/textbook-library-parser';
import {
  canManageTextbookLibrary,
  canReadTextbookAttachment,
  canReadTextbookLibrary,
} from '@/lib/server/textbook-library-access';
import type {
  TextbookLibraryJsonAction,
  UploadTextbookAttachmentMetadata,
} from '@/lib/server/textbook-library-api-types';
import type { TextbookAttachmentType } from '@/lib/server/textbook-library-types';
import {
  deleteTextbookAttachment,
  deleteTextbookLibrary,
  ensureTextbookLibraryStorageReady,
  findTextbookAttachment,
  getTextbookLibrary,
  listTextbookLibraries,
  publishOfficialTextbookLibraries,
  readTextbookAttachmentBlob,
  saveTextbookAttachment,
  saveTextbookLibrary,
  updateTextbookAttachmentProcessing,
} from '@/lib/server/textbook-library-repository';

function inferAttachmentType(mimeType: string): TextbookAttachmentType {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return 'docx';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/html') return 'html';
  return 'other';
}

function resolveRequestedView(user: AuthPublicUser, requestedView?: 'draft' | 'published') {
  if (user.role === 'admin') {
    return requestedView ?? 'draft';
  }
  return 'published';
}

async function handleJsonAction(body: TextbookLibraryJsonAction, user: AuthPublicUser) {
  switch (body.action) {
    case 'listLibraries': {
      const view = body.scope === 'official' ? resolveRequestedView(user, body.view) : 'draft';
      if (body.scope === 'official' && view === 'draft' && user.role !== 'admin') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook library access');
      }

      const libraries = await listTextbookLibraries({
        scope: body.scope,
        view,
        ownerUserId: body.scope === 'personal' && user.role !== 'admin' ? user.id : undefined,
        ...body.filters,
      });
      return apiSuccess({ ok: true, libraries });
    }

    case 'getLibrary': {
      const view = body.scope === 'official' ? resolveRequestedView(user, body.view) : 'draft';
      const library = await getTextbookLibrary({
        scope: body.scope,
        libraryId: body.libraryId,
        view,
      });
      if (!library) {
        return apiSuccess({ ok: true, library: null });
      }
      if (!canReadTextbookLibrary(user, library, view)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook library access');
      }
      return apiSuccess({ ok: true, library });
    }

    case 'saveLibrary': {
      const { payload } = body;
      const ownerUserId =
        payload.library.scope === 'personal'
          ? user.role === 'admin'
            ? payload.library.ownerUserId ?? user.id
            : user.id
          : undefined;
      if (!canManageTextbookLibrary(user, payload.library.scope, ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook library update');
      }
      const saved = await saveTextbookLibrary({
        ...payload,
        library: {
          ...payload.library,
          ownerUserId,
        },
      });
      return apiSuccess({ ok: true, library: saved });
    }

    case 'deleteLibrary': {
      const view = body.scope === 'official' ? 'draft' : 'draft';
      const library = await getTextbookLibrary({
        scope: body.scope,
        libraryId: body.libraryId,
        view,
      });
      if (!library) {
        return apiSuccess({ ok: true });
      }
      if (!canManageTextbookLibrary(user, library.scope, library.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook library delete');
      }
      await deleteTextbookLibrary({
        scope: body.scope,
        libraryId: body.libraryId,
        view,
      });
      return apiSuccess({ ok: true });
    }

    case 'publishOfficialLibraries': {
      if (user.role !== 'admin') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook publish');
      }
      const libraries = await publishOfficialTextbookLibraries(user.id);
      return apiSuccess({ ok: true, libraries });
    }

    case 'updateAttachmentProcessing': {
      const location = await findTextbookAttachment(body.payload.attachmentId);
      if (!location) {
        return apiSuccess({ ok: true, library: null });
      }
      if (!canManageTextbookLibrary(user, location.library.scope, location.library.ownerUserId)) {
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          403,
          'Forbidden attachment processing update',
        );
      }
      const attachment = await updateTextbookAttachmentProcessing(body.payload);
      return apiSuccess({ ok: true, attachmentId: attachment?.id ?? body.payload.attachmentId });
    }

    case 'deleteAttachment': {
      const location = await findTextbookAttachment(body.attachmentId);
      if (!location) {
        return apiSuccess({ ok: true });
      }
      if (!canManageTextbookLibrary(user, location.library.scope, location.library.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden attachment delete');
      }
      await deleteTextbookAttachment(body.attachmentId);
      return apiSuccess({ ok: true });
    }

    case 'retryAttachmentProcessing': {
      const location = await findTextbookAttachment(body.attachmentId);
      if (!location) {
        return apiSuccess({ ok: true, attachmentId: body.attachmentId });
      }
      if (!canManageTextbookLibrary(user, location.library.scope, location.library.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden attachment processing retry');
      }
      after(() => runTextbookAttachmentProcessing(body.attachmentId));
      return apiSuccess({ ok: true, attachmentId: body.attachmentId });
    }
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

  if (action !== 'uploadChapterAttachment') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported textbook upload action');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing attachment file');
  }

  const metadata = JSON.parse(metadataRaw) as UploadTextbookAttachmentMetadata;
  const view = metadata.scope === 'official' ? metadata.view ?? 'draft' : 'draft';
  const library = await getTextbookLibrary({
    scope: metadata.scope,
    libraryId: metadata.libraryId,
    view,
  });
  if (!library) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Textbook library not found');
  }
  if (!canManageTextbookLibrary(user, library.scope, library.ownerUserId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden chapter attachment upload');
  }

  const attachment = await saveTextbookAttachment({
    scope: metadata.scope,
    view,
    libraryId: metadata.libraryId,
    chapterId: metadata.chapterId,
    ownerUserId: library.scope === 'personal' ? library.ownerUserId : undefined,
    filename: file.name,
    title: metadata.title,
    mimeType: file.type || 'application/octet-stream',
    type: inferAttachmentType(file.type || 'application/octet-stream'),
    size: file.size,
    description: metadata.description,
    order: metadata.order,
    buffer: Buffer.from(await file.arrayBuffer()),
  });
  after(() => runTextbookAttachmentProcessing(attachment.id));
  return apiSuccess({ ok: true, attachmentId: attachment.id });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(request, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    await ensureTextbookLibraryStorageReady();
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return await handleFormDataAction(await request.formData(), auth.user);
    }
    return await handleJsonAction((await request.json()) as TextbookLibraryJsonAction, auth.user);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Textbook library request failed',
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
    await ensureTextbookLibraryStorageReady();
    const action = request.nextUrl.searchParams.get('action');
    const attachmentId = request.nextUrl.searchParams.get('id');

    if (action === 'downloadAttachment' && attachmentId) {
      const location = await findTextbookAttachment(attachmentId);
      if (!location) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Attachment not found');
      }
      if (!canReadTextbookAttachment(auth.user, location)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden attachment access');
      }
      const blob = await readTextbookAttachmentBlob(attachmentId);
      if (!blob) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Attachment blob not found');
      }
      return new NextResponse(new Uint8Array(blob.buffer), {
        status: 200,
        headers: {
          'Content-Type': blob.mimeType,
          'Cache-Control': 'no-store',
          'Content-Disposition': `inline; filename="${encodeURIComponent(blob.filename)}"`,
        },
      });
    }

    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported textbook action');
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Textbook library request failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
