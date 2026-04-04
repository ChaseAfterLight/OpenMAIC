import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nextServerMocks = vi.hoisted(() => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    const result = callback();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => {});
    }
  }),
}));

const authMocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(),
}));

const parserMocks = vi.hoisted(() => ({
  runTextbookAttachmentProcessing: vi.fn(),
  runTextbookPdfImportProcessing: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  confirmTextbookPdfImportDraft: vi.fn(),
  createTextbookPdfImportDraft: vi.fn(),
  deleteTextbookAttachment: vi.fn(),
  deleteTextbookPdfImportDraft: vi.fn(),
  deleteTextbookLibrary: vi.fn(),
  ensureTextbookLibraryStorageReady: vi.fn(),
  findTextbookAttachment: vi.fn(),
  getTextbookLibrary: vi.fn(),
  getTextbookPdfImportDraft: vi.fn(),
  listTextbookLibraries: vi.fn(),
  listTextbookPdfImportDrafts: vi.fn(),
  publishOfficialTextbookLibraries: vi.fn(),
  readTextbookAttachmentBlob: vi.fn(),
  readTextbookPdfImportDraftBlob: vi.fn(),
  saveTextbookAttachment: vi.fn(),
  saveTextbookLibrary: vi.fn(),
  saveTextbookPdfImportDraft: vi.fn(),
  updateTextbookAttachmentProcessing: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: nextServerMocks.after,
  };
});

vi.mock('@/lib/server/auth-guards', () => ({
  requireApiRole: authMocks.requireApiRole,
}));

vi.mock('@/lib/server/textbook-library-parser', () => ({
  runTextbookAttachmentProcessing: parserMocks.runTextbookAttachmentProcessing,
}));

vi.mock('@/lib/server/textbook-pdf-import-parser', () => ({
  runTextbookPdfImportProcessing: parserMocks.runTextbookPdfImportProcessing,
}));

vi.mock('@/lib/server/textbook-library-repository', () => repositoryMocks);

import { POST } from '@/app/api/textbook-libraries/route';
import type {
  TextbookLibraryRecord,
  TextbookPdfImportDraftRecord,
} from '@/lib/server/textbook-library-types';

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin' as const,
  createdAt: 1,
  updatedAt: 1,
};

function createLibrary(): TextbookLibraryRecord {
  return {
    id: 'library-1',
    scope: 'official',
    publisher: '人民教育出版社',
    subjectId: 'math',
    gradeId: 'grade-4',
    editionId: 'edition-1',
    editionLabel: '四年级上册',
    createdAt: 1,
    updatedAt: 1,
    volumes: [
      {
        id: 'volume-1',
        label: '第一册',
        order: 0,
        gradeId: 'grade-4',
        semester: 'upper',
        units: [],
      },
    ],
  };
}

function createImportDraft(
  overrides: Partial<TextbookPdfImportDraftRecord> = {},
): TextbookPdfImportDraftRecord {
  return {
    id: 'draft-1',
    scope: 'official',
    libraryId: 'library-1',
    volumeId: 'volume-1',
    filename: 'book.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    uploadedAt: 1,
    updatedAt: 1,
    status: 'ready',
    units: [
      {
        id: 'unit-1',
        title: '第一单元',
        order: 0,
        source: 'merged',
        chapters: [
          {
            id: 'chapter-1',
            title: '认识小数',
            order: 0,
            pageStart: 4,
            pageEnd: 9,
            confidence: 0.91,
            printedPage: 1,
            source: 'merged',
            needsReview: false,
          },
        ],
      },
    ],
    unboundPages: [1, 2, 3],
    proposalSource: 'merged',
    proposalConfidence: 0.86,
    aiModel: 'openai/gpt-4o-mini',
    tocCandidatePages: [2],
    pageAnchors: [{ printedPage: 1, rawPage: 4, confidence: 0.93, source: 'merged' }],
    conflictNotes: [],
    lowConfidencePages: [],
    ...overrides,
  };
}

describe('/api/textbook-libraries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireApiRole.mockResolvedValue({ user: adminUser });
    repositoryMocks.ensureTextbookLibraryStorageReady.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads an import draft and schedules background parsing', async () => {
    const library = createLibrary();
    const importDraft = createImportDraft({ status: 'uploaded', proposalSource: undefined });
    repositoryMocks.getTextbookLibrary.mockResolvedValue(library);
    repositoryMocks.createTextbookPdfImportDraft.mockResolvedValue(importDraft);
    parserMocks.runTextbookPdfImportProcessing.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set('action', 'uploadImportDraft');
    formData.set(
      'metadata',
      JSON.stringify({
        scope: 'official',
        libraryId: library.id,
        volumeId: 'volume-1',
      }),
    );
    formData.set(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'book.pdf', { type: 'application/pdf' }),
    );

    const response = await POST(
      new Request('http://localhost/api/textbook-libraries', {
        method: 'POST',
        body: formData,
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      importDraft?: TextbookPdfImportDraftRecord;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.importDraft?.id).toBe(importDraft.id);
    expect(repositoryMocks.createTextbookPdfImportDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'official',
        libraryId: library.id,
        volumeId: 'volume-1',
        filename: 'book.pdf',
        mimeType: 'application/pdf',
      }),
    );
    expect(parserMocks.runTextbookPdfImportProcessing).toHaveBeenCalledWith(importDraft.id);
    expect(nextServerMocks.after).toHaveBeenCalledTimes(1);
  });

  it('returns fallback AI metadata when listing import drafts after parser degradation', async () => {
    const library = createLibrary();
    const degradedDraft = createImportDraft({
      proposalSource: 'rules',
      proposalConfidence: 0.58,
      conflictNotes: [
        {
          code: 'ai-failed',
          message: 'AI 目录识别失败，已回退到规则解析',
          source: 'system',
        },
      ],
      lowConfidencePages: [5, 6],
    });
    repositoryMocks.getTextbookLibrary.mockResolvedValue(library);
    repositoryMocks.listTextbookPdfImportDrafts.mockResolvedValue([degradedDraft]);

    const response = await POST(
      new Request('http://localhost/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'listImportDrafts',
          scope: 'official',
          libraryId: library.id,
        }),
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      importDrafts: TextbookPdfImportDraftRecord[];
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.importDrafts[0]?.proposalSource).toBe('rules');
    expect(body.importDrafts[0]?.conflictNotes[0]?.code).toBe('ai-failed');
    expect(body.importDrafts[0]?.lowConfidencePages).toEqual([5, 6]);
  });

  it('saves reviewed import draft edits', async () => {
    const currentDraft = createImportDraft();
    const reviewedDraft = createImportDraft({
      units: [
        {
          ...currentDraft.units[0],
          chapters: [
            {
              ...currentDraft.units[0].chapters[0],
              title: '人工修正后的章节名',
              source: 'manual',
              needsReview: false,
            },
          ],
        },
      ],
    });
    repositoryMocks.getTextbookPdfImportDraft.mockResolvedValue(currentDraft);
    repositoryMocks.saveTextbookPdfImportDraft.mockResolvedValue(reviewedDraft);

    const response = await POST(
      new Request('http://localhost/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveImportDraft',
          payload: {
            draft: reviewedDraft,
          },
        }),
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      importDraft: TextbookPdfImportDraftRecord;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.importDraft.units[0]?.chapters[0]?.title).toBe('人工修正后的章节名');
    expect(repositoryMocks.saveTextbookPdfImportDraft).toHaveBeenCalledWith({
      draft: reviewedDraft,
    });
  });

  it('confirms a reviewed import draft', async () => {
    const readyDraft = createImportDraft();
    const confirmedDraft = createImportDraft({ status: 'confirmed' });
    repositoryMocks.getTextbookPdfImportDraft.mockResolvedValue(readyDraft);
    repositoryMocks.confirmTextbookPdfImportDraft.mockResolvedValue({
      draft: confirmedDraft,
      library: createLibrary(),
    });

    const response = await POST(
      new Request('http://localhost/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirmImportDraft',
          draftId: readyDraft.id,
        }),
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      importDraft: TextbookPdfImportDraftRecord;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.importDraft.status).toBe('confirmed');
    expect(repositoryMocks.confirmTextbookPdfImportDraft).toHaveBeenCalledWith(readyDraft.id);
  });

  it('returns a conflict response when deleting a confirmed import draft', async () => {
    const confirmedDraft = createImportDraft({ status: 'confirmed' });
    repositoryMocks.getTextbookPdfImportDraft.mockResolvedValue(confirmedDraft);
    repositoryMocks.deleteTextbookPdfImportDraft.mockRejectedValue(
      new Error('TEXTBOOK_IMPORT_DRAFT_IN_USE'),
    );

    const response = await POST(
      new Request('http://localhost/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteImportDraft',
          draftId: confirmedDraft.id,
        }),
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      error?: string;
    };

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('该导入草稿已经绑定到教材，不能删除');
  });
});
