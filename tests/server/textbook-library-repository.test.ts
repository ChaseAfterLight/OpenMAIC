import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
const getServerStorageConfigMock = vi.hoisted(() => vi.fn());
const ensureObjectStorageBucketMock = vi.hoisted(() => vi.fn());
const deleteObjectsFromStorageMock = vi.hoisted(() => vi.fn());
const putObjectToStorageMock = vi.hoisted(() => vi.fn());
const deleteImageFileRecordMock = vi.hoisted(() => vi.fn());
const saveImageFileRecordMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/storage-backend-config', () => ({
  getServerStorageConfig: getServerStorageConfigMock,
}));

vi.mock('@/lib/server/storage-postgres', () => ({
  getStoragePgPool: vi.fn(() => ({
    query: queryMock,
  })),
  withStorageTransaction: vi.fn(async (_databaseUrl: string, callback: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    callback({ query: queryMock }),
  ),
  toJsonb: (value: unknown) => JSON.stringify(value ?? null),
  fromJsonColumn: (value: unknown) =>
    typeof value === 'string' ? JSON.parse(value) : value,
}));

vi.mock('@/lib/server/storage-object-store', () => ({
  ensureObjectStorageBucket: ensureObjectStorageBucketMock,
  deleteObjectsFromStorage: deleteObjectsFromStorageMock,
  getObjectFromStorage: vi.fn(),
  putObjectToStorage: putObjectToStorageMock,
}));

vi.mock('@/lib/server/storage-repository', () => ({
  deleteImageFileRecord: deleteImageFileRecordMock,
  saveImageFileRecord: saveImageFileRecordMock,
}));

vi.mock('@/lib/server/textbook-library-seed', () => ({
  buildOfficialTextbookSeedLibraries: vi.fn(() => []),
  buildPublishedTextbookSeedLibraries: vi.fn(() => []),
}));

const postgresConfig = {
  backend: 'postgres-object-storage' as const,
  storageRoot: 'D:/tmp/storage',
  databaseUrl: 'postgresql://test',
  autoInitialize: true,
  objectStorageRegion: 'auto',
  objectStorageBucket: 'bucket',
  objectStorageForcePathStyle: true,
  objectKeyPrefix: 'openmaic',
};

function createLibraryRow() {
  return {
    raw_library: {
      id: 'library-1',
      scope: 'official',
      publisher: '人民教育出版社',
      subjectId: 'math',
      gradeId: 'grade-4',
      editionId: 'edition-1',
      editionLabel: '四年级上册',
      createdAt: 1,
      updatedAt: 1,
      volumes: [],
    },
  };
}

function createImportDraftRow(overrides?: Record<string, unknown>) {
  return {
    raw_draft: {
      id: 'draft-1',
      scope: 'official',
      libraryId: 'library-1',
      volumeId: 'volume-1',
      filename: 'book.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: 1,
      updatedAt: 1,
      status: 'uploaded',
      units: [],
      unboundPages: [],
      tocCandidatePages: [],
      pageAnchors: [],
      conflictNotes: [],
      lowConfidencePages: [],
      ...overrides,
    },
  };
}

describe('textbook-library-repository postgres import draft split', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getServerStorageConfigMock.mockReturnValue(postgresConfig);
    ensureObjectStorageBucketMock.mockResolvedValue(undefined);
    deleteObjectsFromStorageMock.mockResolvedValue(undefined);
    putObjectToStorageMock.mockResolvedValue(undefined);
    deleteImageFileRecordMock.mockResolvedValue(undefined);
    saveImageFileRecordMock.mockResolvedValue(undefined);
  });

  it('lists libraries without selecting legacy pdf_import_drafts payload', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM textbook_libraries')) {
        return { rowCount: 1, rows: [createLibraryRow()] };
      }
      if (sql.includes('SELECT 1') && sql.includes('FROM textbook_libraries')) {
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const { listTextbookLibraries } = await import('@/lib/server/textbook-library-repository');
    const libraries = await listTextbookLibraries({ scope: 'official', view: 'draft' });

    expect(libraries).toHaveLength(1);
    const executedSql = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes('FROM textbook_libraries'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('SELECT raw_draft'))).toBe(false);
    expect(
      executedSql.some(
        (sql) => sql.includes('FROM textbook_library_store') && sql.includes('pdf_import_drafts'),
      ),
    ).toBe(false);
  });

  it('lists import drafts from the dedicated postgres table', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM textbook_pdf_import_drafts')) {
        return { rowCount: 1, rows: [createImportDraftRow()] };
      }
      return { rowCount: 0, rows: [] };
    });

    const { listTextbookPdfImportDrafts } = await import('@/lib/server/textbook-library-repository');
    const drafts = await listTextbookPdfImportDrafts({
      scope: 'official',
      libraryId: 'library-1',
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe('draft-1');
    const executedSql = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes('FROM textbook_pdf_import_drafts'))).toBe(true);
    expect(
      executedSql.some(
        (sql) =>
          sql.includes('FROM textbook_library_store') && sql.includes('pdf_import_drafts'),
      ),
    ).toBe(false);
  });

  it('updates a single import draft by upserting the dedicated postgres row', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT raw_draft') && sql.includes('WHERE id = $1')) {
        return { rowCount: 1, rows: [createImportDraftRow()] };
      }
      if (sql.includes('INSERT INTO textbook_pdf_import_drafts')) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    const { updateTextbookPdfImportProcessing } = await import(
      '@/lib/server/textbook-library-repository'
    );
    const updated = await updateTextbookPdfImportProcessing({
      draftId: 'draft-1',
      status: 'ready',
      parserJobId: 'job-1',
      pageCount: 12,
      extractedText: 'hello',
    });

    expect(updated?.status).toBe('ready');
    expect(updated?.parserJobId).toBe('job-1');
    const executedSql = queryMock.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes('SELECT raw_draft'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO textbook_pdf_import_drafts'))).toBe(
      true,
    );
    expect(executedSql.some((sql) => sql.includes('UPDATE textbook_library_store'))).toBe(false);
  });
});
