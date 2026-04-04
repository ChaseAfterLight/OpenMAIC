import { after, type NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import type { AuthPublicUser } from '@/lib/server/auth-types';
import { PDFDocument } from 'pdf-lib';
import { runTextbookAttachmentProcessing } from '@/lib/server/textbook-library-parser';
import { runTextbookPdfImportProcessing } from '@/lib/server/textbook-pdf-import-parser';
import { getDocumentProxy } from 'unpdf';
import {
  canManageTextbookLibrary,
  canReadTextbookAttachment,
  canReadTextbookLibrary,
  canReadTextbookPdfImportDraft,
} from '@/lib/server/textbook-library-access';
import type {
  TextbookLibraryJsonAction,
  UploadTextbookAttachmentMetadata,
  UploadTextbookImportDraftMetadata,
} from '@/lib/server/textbook-library-api-types';
import type { TextbookAttachmentType } from '@/lib/server/textbook-library-types';
import {
  confirmTextbookPdfImportDraft,
  createTextbookPdfImportDraft,
  deleteTextbookAttachment,
  deleteTextbookPdfImportDraft,
  deleteTextbookLibrary,
  ensureTextbookLibraryStorageReady,
  findTextbookAttachment,
  getTextbookLibrary,
  getTextbookPdfImportDraft,
  listTextbookLibraries,
  listTextbookPdfImportDrafts,
  publishOfficialTextbookLibraries,
  readTextbookAttachmentBlob,
  readTextbookPdfImportDraftBlob,
  saveTextbookAttachment,
  saveTextbookLibrary,
  saveTextbookPdfImportDraft,
  updateTextbookAttachmentProcessing,
} from '@/lib/server/textbook-library-repository';

type CanvasContextLike = object;

type CanvasLike = {
  getContext: (contextId: '2d') => CanvasContextLike;
  toBuffer: (type?: string) => Buffer;
};

type CreateCanvasFn = (width: number, height: number) => CanvasLike;

let cachedCreateCanvas: CreateCanvasFn | null | undefined;

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

async function getCreateCanvas(): Promise<CreateCanvasFn | null> {
  if (cachedCreateCanvas !== undefined) {
    return cachedCreateCanvas;
  }

  try {
    const canvasModule = (await import('@napi-rs/canvas')) as unknown as {
      createCanvas?: CreateCanvasFn;
    };
    cachedCreateCanvas =
      typeof canvasModule.createCanvas === 'function' ? canvasModule.createCanvas : null;
    return cachedCreateCanvas;
  } catch {
    cachedCreateCanvas = null;
    return null;
  }
}

async function renderPdfPageAsPng(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 1.6,
): Promise<Buffer> {
  const createCanvas = await getCreateCanvas();
  if (!createCanvas) {
    throw new Error('PDF page rendering is unavailable');
  }

  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const clampedPageNumber = Math.max(1, Math.min(pdf.numPages, pageNumber));
  const page = await pdf.getPage(clampedPageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return canvas.toBuffer('image/png');
}

async function slicePdfPages(
  pdfBuffer: Buffer,
  pageStart: number,
  pageEnd: number,
): Promise<Buffer> {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const totalPages = sourcePdf.getPageCount();
  const start = Math.max(1, Math.min(totalPages, Math.floor(pageStart)));
  const end = Math.max(start, Math.min(totalPages, Math.floor(pageEnd)));
  const pageIndices = Array.from({ length: end - start + 1 }, (_, index) => start - 1 + index);

  const slicedPdf = await PDFDocument.create();
  const copiedPages = await slicedPdf.copyPages(sourcePdf, pageIndices);
  for (const page of copiedPages) {
    slicedPdf.addPage(page);
  }

  return Buffer.from(await slicedPdf.save());
}

function ensurePdfFilename(filename: string) {
  const trimmed = filename.trim() || 'chapter';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
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

    case 'listImportDrafts': {
      const editableView = body.scope === 'official' ? 'draft' : 'draft';
      if (body.scope === 'official' && user.role !== 'admin') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import draft access');
      }
      const library = await getTextbookLibrary({
        scope: body.scope,
        libraryId: body.libraryId,
        view: editableView,
      });
      if (!library) {
        return apiSuccess({ ok: true, importDrafts: [] });
      }
      if (!canManageTextbookLibrary(user, library.scope, library.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import draft access');
      }
      const importDrafts = await listTextbookPdfImportDrafts({
        scope: body.scope,
        view: editableView,
        libraryId: body.libraryId,
        volumeId: body.volumeId,
        ownerUserId: body.scope === 'personal' && user.role !== 'admin' ? user.id : undefined,
      });
      return apiSuccess({ ok: true, importDrafts });
    }

    case 'getImportDraft': {
      const importDraft = await getTextbookPdfImportDraft(body.draftId);
      if (!importDraft) {
        return apiSuccess({ ok: true, importDraft: null });
      }
      if (!canReadTextbookPdfImportDraft(user, importDraft)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import draft access');
      }
      return apiSuccess({ ok: true, importDraft });
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

    case 'saveImportDraft': {
      const currentDraft = await getTextbookPdfImportDraft(body.payload.draft.id);
      if (!currentDraft) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Textbook import draft not found');
      }
      if (!canManageTextbookLibrary(user, currentDraft.scope, currentDraft.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import draft update');
      }
      const importDraft = await saveTextbookPdfImportDraft(body.payload);
      return apiSuccess({ ok: true, importDraft });
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

    case 'confirmImportDraft': {
      const currentDraft = await getTextbookPdfImportDraft(body.draftId);
      if (!currentDraft) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Textbook import draft not found');
      }
      if (!canManageTextbookLibrary(user, currentDraft.scope, currentDraft.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import confirm');
      }
      const { importDraft } = await (async () => {
        const result = await confirmTextbookPdfImportDraft(body.draftId);
        return { importDraft: result.draft };
      })();
      return apiSuccess({ ok: true, importDraft });
    }

    case 'deleteImportDraft': {
      const currentDraft = await getTextbookPdfImportDraft(body.draftId);
      if (!currentDraft) {
        return apiSuccess({ ok: true });
      }
      if (!canManageTextbookLibrary(user, currentDraft.scope, currentDraft.ownerUserId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import delete');
      }
      try {
        await deleteTextbookPdfImportDraft(body.draftId);
        return apiSuccess({ ok: true });
      } catch (error) {
        if (error instanceof Error && error.message === 'TEXTBOOK_IMPORT_DRAFT_IN_USE') {
          return apiError(
            API_ERROR_CODES.INVALID_REQUEST,
            409,
            '该导入草稿已经绑定到教材，不能删除',
          );
        }
        throw error;
      }
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

  if (action !== 'uploadChapterAttachment' && action !== 'uploadImportDraft') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported textbook upload action');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing attachment file');
  }

  if (action === 'uploadChapterAttachment') {
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

  const metadata = JSON.parse(metadataRaw) as UploadTextbookImportDraftMetadata;
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
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden textbook import upload');
  }

  let importDraft;
  try {
    importDraft = await createTextbookPdfImportDraft({
      scope: metadata.scope,
      view,
      libraryId: metadata.libraryId,
      volumeId: metadata.volumeId,
      ownerUserId: library.scope === 'personal' ? library.ownerUserId : undefined,
      filename: file.name,
      mimeType: file.type || 'application/pdf',
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'TEXTBOOK_IMPORT_DRAFT_ALREADY_EXISTS') {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        '该册已存在导入草稿，请先删除后再重新导入',
      );
    }
    throw error;
  }
  after(() => runTextbookPdfImportProcessing(importDraft.id));
  return apiSuccess({ ok: true, importDraft });
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
    const resourceId = request.nextUrl.searchParams.get('id');

    if (action === 'downloadAttachment' && resourceId) {
      const location = await findTextbookAttachment(resourceId);
      if (!location) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Attachment not found');
      }
      if (!canReadTextbookAttachment(auth.user, location)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden attachment access');
      }

      if (location.attachment.sourcePdf?.importDraftId) {
        const sourcePdf = location.attachment.sourcePdf;
        const blob = await readTextbookPdfImportDraftBlob(sourcePdf.importDraftId);
        if (!blob) {
          return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Import draft blob not found');
        }

        const slicedPdfBuffer = await slicePdfPages(
          blob.buffer,
          sourcePdf.pageStart,
          sourcePdf.pageEnd,
        );

        return new NextResponse(new Uint8Array(slicedPdfBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(
              ensurePdfFilename(location.attachment.title || location.attachment.filename),
            )}"`,
          },
        });
      }

      const blob = await readTextbookAttachmentBlob(resourceId);
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

    if (action === 'downloadImportDraftSource' && resourceId) {
      const importDraft = await getTextbookPdfImportDraft(resourceId);
      if (!importDraft) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Import draft not found');
      }
      if (!canReadTextbookPdfImportDraft(auth.user, importDraft)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden import draft access');
      }
      const blob = await readTextbookPdfImportDraftBlob(resourceId);
      if (!blob) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Import draft blob not found');
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

    if (action === 'downloadImportDraftPage' && resourceId) {
      const importDraft = await getTextbookPdfImportDraft(resourceId);
      if (!importDraft) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Import draft not found');
      }
      if (!canReadTextbookPdfImportDraft(auth.user, importDraft)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Forbidden import draft access');
      }

      const pageNumber = Number(request.nextUrl.searchParams.get('page'));
      if (!Number.isFinite(pageNumber) || pageNumber < 1) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid page number');
      }

      const scaleParam = Number(request.nextUrl.searchParams.get('scale'));
      const scale = Number.isFinite(scaleParam) && scaleParam > 0
        ? Math.min(3, Math.max(0.75, scaleParam))
        : 1.6;

      const blob = await readTextbookPdfImportDraftBlob(resourceId);
      if (!blob) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Import draft blob not found');
      }

      const pngBuffer = await renderPdfPageAsPng(blob.buffer, Math.floor(pageNumber), scale);
      return new NextResponse(new Uint8Array(pngBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          'Content-Disposition': `inline; filename="${encodeURIComponent(importDraft.filename)}-page-${Math.floor(pageNumber)}.png"`,
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
