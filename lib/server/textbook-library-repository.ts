import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import type { PostgresObjectStorageConfig } from '@/lib/server/storage-backend-config';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { deleteImageFileRecord, saveImageFileRecord } from '@/lib/server/storage-repository';
import {
  deleteObjectsFromStorage,
  ensureObjectStorageBucket,
  getObjectFromStorage,
  putObjectToStorage,
} from '@/lib/server/storage-object-store';
import {
  fromJsonColumn,
  getStoragePgPool,
  toJsonb,
  withStorageTransaction,
} from '@/lib/server/storage-postgres';
import {
  buildTextbookAttachmentObjectKey,
  buildTextbookImportDraftObjectKey,
  inferFileExtension,
  safeStorageId,
} from '@/lib/server/storage-key-utils';
import {
  buildOfficialTextbookSeedLibraries,
  buildPublishedTextbookSeedLibraries,
} from '@/lib/server/textbook-library-seed';
import type {
  CreateTextbookPdfImportDraftInput,
  ListTextbookLibrariesOptions,
  ListTextbookPdfImportDraftsOptions,
  SaveTextbookAttachmentInput,
  SaveTextbookLibraryInput,
  SaveTextbookPdfImportDraftInput,
  TextbookAttachmentLocation,
  TextbookAttachmentRecord,
  TextbookChapterRecord,
  TextbookLibraryRecord,
  TextbookLibraryScope,
  TextbookLibraryStore,
  TextbookLibraryView,
  TextbookPdfImportDraftRecord,
  TextbookPdfImportUnitDraft,
  UpdateTextbookAttachmentProcessingInput,
  UpdateTextbookPdfImportProcessingInput,
} from '@/lib/server/textbook-library-types';

const log = createLogger('TextbookLibraryRepository');
const STORE_ROW_ID = 'default';
const TEXTBOOK_COVER_DOWNLOAD_URL_PREFIX = '/api/storage?action=downloadImage&id=';
const POSTGRES_LIBRARIES_TABLE = 'textbook_libraries';
const POSTGRES_IMPORT_DRAFTS_TABLE = 'textbook_pdf_import_drafts';

let readyPromise: Promise<void> | null = null;

function getTextbookDir(): string {
  return path.join(getServerStorageConfig().storageRoot, 'textbooks');
}

function getStoreFilePath(): string {
  return path.join(getTextbookDir(), 'textbook-library-store.json');
}

function getAttachmentDir(): string {
  return path.join(getTextbookDir(), 'attachments');
}

function getImportDraftDir(): string {
  return path.join(getTextbookDir(), 'imports');
}

function buildTextbookCoverImageId(scope: TextbookLibraryScope, libraryId: string): string {
  return `textbook-cover-${scope}-${safeStorageId(libraryId)}`;
}

function buildTextbookCoverDownloadUrl(imageId: string): string {
  return `${TEXTBOOK_COVER_DOWNLOAD_URL_PREFIX}${encodeURIComponent(imageId)}`;
}

function normalizeLibraryViewForScope(
  scope: TextbookLibraryScope,
  view: TextbookLibraryView = 'draft',
): TextbookLibraryView {
  return scope === 'personal' ? 'draft' : view;
}

function parseTextbookCoverDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  if (!dataUrl.startsWith('data:')) {
    return null;
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return null;
  }

  const header = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  if (!payload) {
    return null;
  }

  const mimeType = header.split(';')[0]?.trim() || 'image/png';
  return {
    mimeType,
    buffer: Buffer.from(payload, 'base64'),
  };
}

async function persistTextbookLibraryCover(
  library: TextbookLibraryRecord,
): Promise<string | undefined> {
  const cover = library.cover?.trim();
  if (!cover) {
    return undefined;
  }

  if (!cover.startsWith('data:')) {
    return cover;
  }

  const parsed = parseTextbookCoverDataUrl(cover);
  if (!parsed) {
    return cover;
  }

  const imageId = buildTextbookCoverImageId(library.scope, library.id);
  const extension = inferFileExtension('cover', parsed.mimeType) || '.png';
  const blobBuffer = parsed.buffer.buffer.slice(
    parsed.buffer.byteOffset,
    parsed.buffer.byteOffset + parsed.buffer.byteLength,
  ) as ArrayBuffer;
  await saveImageFileRecord({
    id: imageId,
    filename: `cover${extension}`,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
    createdAt: library.updatedAt || library.createdAt || Date.now(),
    blob: new Blob([blobBuffer], { type: parsed.mimeType }),
  });
  return buildTextbookCoverDownloadUrl(imageId);
}

async function migrateStoredLibraryCoverIfNeeded(
  library: TextbookLibraryRecord,
): Promise<TextbookLibraryRecord> {
  try {
    const cover = await persistTextbookLibraryCover(library);
    if (cover === library.cover) {
      return library;
    }
    return {
      ...library,
      cover,
    };
  } catch (error) {
    log.warn(`教材封面迁移失败，已保留原始内容: ${library.id}`, error);
    return library;
  }
}

async function migrateStoredTextbookCovers(store: TextbookLibraryStore): Promise<boolean> {
  let changed = false;

  for (const collection of [store.officialDraft, store.officialPublished, store.personalLibraries]) {
    for (let index = 0; index < collection.length; index += 1) {
      const current = collection[index];
      const next = await migrateStoredLibraryCoverIfNeeded(current);
      if (next !== current) {
        collection[index] = next;
        changed = true;
      }
    }
  }

  return changed;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function createEmptyStore(): TextbookLibraryStore {
  return {
    officialDraft: [],
    officialPublished: [],
    personalLibraries: [],
    pdfImportDrafts: [],
    updatedAt: Date.now(),
  };
}

async function seedStoreIfNeeded(store: TextbookLibraryStore): Promise<TextbookLibraryStore> {
  const hasOfficialData = store.officialDraft.length > 0 || store.officialPublished.length > 0;
  if (hasOfficialData) {
    return store;
  }

  const timestamp = Date.now();
  const seededStore: TextbookLibraryStore = {
    ...store,
    officialDraft: buildOfficialTextbookSeedLibraries(timestamp),
    officialPublished: buildPublishedTextbookSeedLibraries(timestamp),
    updatedAt: timestamp,
  };

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    await writeStore(seededStore);
  } else {
    await replacePostgresLibraries('official', 'draft', seededStore.officialDraft);
    await replacePostgresLibraries('official', 'published', seededStore.officialPublished);
    await getStoragePgPool(config.databaseUrl).query(
      `
        UPDATE textbook_library_store
        SET updated_at = $2
        WHERE id = $1
      `,
      [STORE_ROW_ID, timestamp],
    );
  }
  log.info(
    `教材库已自动导入内置教材种子: draft=${seededStore.officialDraft.length}, published=${seededStore.officialPublished.length}`,
  );
  return seededStore;
}

function normalizeAttachmentRecord(
  attachment: TextbookAttachmentRecord,
  order: number,
): TextbookAttachmentRecord {
  const now = Date.now();
  return {
    ...attachment,
    title: attachment.title?.trim() || attachment.filename,
    mimeType: attachment.mimeType || 'application/octet-stream',
    type: attachment.type || 'other',
    size: Number(attachment.size) || 0,
    description: attachment.description?.trim() || undefined,
    order,
    uploadedAt: attachment.uploadedAt || now,
    updatedAt: attachment.updatedAt || attachment.uploadedAt || now,
    status: attachment.status || 'uploaded',
    storageKey: attachment.storageKey,
    objectKey: attachment.objectKey,
    externalUrl: attachment.externalUrl,
    parserJobId: attachment.parserJobId,
    extractedText: attachment.extractedText,
    extractedSummary: attachment.extractedSummary,
    parseError: attachment.parseError,
    sourcePdf: attachment.sourcePdf
      ? {
          importDraftId: attachment.sourcePdf.importDraftId,
          pageStart: Number(attachment.sourcePdf.pageStart) || 1,
          pageEnd:
            Number(attachment.sourcePdf.pageEnd) ||
            Number(attachment.sourcePdf.pageStart) ||
            1,
          confidence: Number(attachment.sourcePdf.confidence) || 0,
          status: attachment.sourcePdf.status || 'confirmed',
        }
      : undefined,
  };
}

function normalizeImportChapterDraft(
  chapter: TextbookPdfImportUnitDraft['chapters'][number],
  order: number,
) {
  const { summary: _summary, keywords: _keywords, ...rest } = chapter as TextbookPdfImportUnitDraft['chapters'][number] & {
    summary?: unknown;
    keywords?: unknown;
  };
  return {
    ...rest,
    title: chapter.title?.trim() || `章节 ${order + 1}`,
    order,
    pageStart: Math.max(1, Number(chapter.pageStart) || 1),
    pageEnd: Math.max(1, Number(chapter.pageEnd) || Number(chapter.pageStart) || 1),
    confidence: Math.max(0, Math.min(1, Number(chapter.confidence) || 0)),
    printedPage: chapter.printedPage ? Math.max(1, Number(chapter.printedPage)) : undefined,
    source: chapter.source ?? undefined,
    needsReview: Boolean(chapter.needsReview),
  };
}

function normalizeImportUnitDraft(unit: TextbookPdfImportUnitDraft, order: number): TextbookPdfImportUnitDraft {
  return {
    ...unit,
    title: unit.title?.trim() || `单元 ${order + 1}`,
    order,
    source: unit.source ?? undefined,
    needsReview: Boolean(unit.needsReview),
    chapters: Array.isArray(unit.chapters)
      ? unit.chapters.map((chapter, chapterIndex) =>
          normalizeImportChapterDraft(chapter, chapter.order ?? chapterIndex),
        )
      : [],
  };
}

function normalizePdfImportDraft(draft: TextbookPdfImportDraftRecord): TextbookPdfImportDraftRecord {
  const now = Date.now();
  const { pageTexts: _pageTexts, ...restDraft } = draft as TextbookPdfImportDraftRecord & {
    pageTexts?: unknown;
  };
  return {
    ...restDraft,
    ownerUserId: draft.ownerUserId?.trim() || undefined,
    filename: draft.filename?.trim() || 'document.pdf',
    mimeType: draft.mimeType || 'application/pdf',
    size: Number(draft.size) || 0,
    uploadedAt: draft.uploadedAt || now,
    updatedAt: draft.updatedAt || draft.uploadedAt || now,
    status: draft.status || 'uploaded',
    storageKey: draft.storageKey,
    objectKey: draft.objectKey,
    parserJobId: draft.parserJobId,
    pageCount: draft.pageCount ? Math.max(1, Number(draft.pageCount)) : undefined,
    extractedText: draft.extractedText,
    units: Array.isArray(draft.units)
      ? draft.units.map((unit, unitIndex) => normalizeImportUnitDraft(unit, unit.order ?? unitIndex))
      : [],
    unboundPages: Array.isArray(draft.unboundPages)
      ? [...new Set(draft.unboundPages.map((page) => Number(page)).filter((page) => page > 0))].sort(
          (left, right) => left - right,
        )
      : [],
    proposalSource: draft.proposalSource ?? undefined,
    proposalConfidence:
      typeof draft.proposalConfidence === 'number'
        ? Math.max(0, Math.min(1, Number(draft.proposalConfidence) || 0))
        : undefined,
    aiModel: draft.aiModel?.trim() || undefined,
    tocCandidatePages: Array.isArray(draft.tocCandidatePages)
      ? [...new Set(draft.tocCandidatePages.map((page) => Number(page)).filter((page) => page > 0))].sort(
          (left, right) => left - right,
        )
      : [],
    pageAnchors: Array.isArray(draft.pageAnchors)
      ? draft.pageAnchors
          .map((anchor) => ({
            printedPage: Math.max(1, Number(anchor.printedPage) || 1),
            rawPage: Math.max(1, Number(anchor.rawPage) || 1),
            confidence: Math.max(0, Math.min(1, Number(anchor.confidence) || 0)),
            source: anchor.source ?? 'rules',
          }))
          .sort((left, right) => left.printedPage - right.printedPage)
      : [],
    conflictNotes: Array.isArray(draft.conflictNotes)
      ? draft.conflictNotes
          .map((note) => ({
            code: note.code ?? 'ai-failed',
            message: note.message?.trim() || '解析提示',
            page: note.page ? Math.max(1, Number(note.page)) : undefined,
            chapterTitle: note.chapterTitle?.trim() || undefined,
            source: note.source ?? 'system',
          }))
          .filter((note) => Boolean(note.message))
      : [],
    lowConfidencePages: Array.isArray(draft.lowConfidencePages)
      ? [...new Set(draft.lowConfidencePages.map((page) => Number(page)).filter((page) => page > 0))].sort(
          (left, right) => left - right,
        )
      : [],
    parseError: draft.parseError,
  };
}

function normalizeChapterRecord(chapter: TextbookChapterRecord, order: number): TextbookChapterRecord {
  return {
    ...chapter,
    summary: chapter.summary || '',
    keywords: Array.isArray(chapter.keywords) ? chapter.keywords.filter(Boolean) : [],
    order,
    attachments: Array.isArray(chapter.attachments)
      ? chapter.attachments.map((attachment, index) => normalizeAttachmentRecord(attachment, index))
      : [],
  };
}

function normalizeLibraryRecord(library: TextbookLibraryRecord): TextbookLibraryRecord {
  const now = Date.now();
  return {
    ...library,
    ownerUserId: library.ownerUserId?.trim() || undefined,
    cover: library.cover?.trim() || undefined,
    publisher: library.publisher.trim(),
    subjectId: library.subjectId.trim(),
    subjectLabel: library.subjectLabel?.trim() || undefined,
    gradeId: library.gradeId.trim(),
    gradeLabel: library.gradeLabel?.trim() || undefined,
    editionId: library.editionId.trim(),
    editionLabel: library.editionLabel.trim(),
    createdAt: library.createdAt || now,
    updatedAt: library.updatedAt || now,
    publishedAt: library.publishedAt,
    publishedByUserId: library.publishedByUserId,
    volumes: Array.isArray(library.volumes)
      ? library.volumes.map((volume, volumeIndex) => ({
          ...volume,
          label: volume.label.trim(),
          order: volume.order ?? volumeIndex,
          units: Array.isArray(volume.units)
            ? volume.units.map((unit, unitIndex) => ({
                ...unit,
                title: unit.title.trim(),
                order: unit.order ?? unitIndex,
                chapters: Array.isArray(unit.chapters)
                  ? unit.chapters.map((chapter, chapterIndex) =>
                      normalizeChapterRecord(chapter, chapter.order ?? chapterIndex),
                    )
                  : [],
              }))
            : [],
        }))
      : [],
  };
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesFilterText(
  value: string | undefined,
  label: string | undefined,
  filterValue: string,
): boolean {
  const target = normalizeFilterText(filterValue);
  if (!target) {
    return true;
  }

  const valueMatches = normalizeFilterText(value ?? '') === target;
  const labelMatches = normalizeFilterText(label ?? '') === target;
  return valueMatches || labelMatches;
}

async function readFileStore(): Promise<TextbookLibraryStore> {
  const filePath = getStoreFilePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<TextbookLibraryStore>;
    return {
      officialDraft: Array.isArray(parsed.officialDraft)
        ? parsed.officialDraft.map(normalizeLibraryRecord)
        : [],
      officialPublished: Array.isArray(parsed.officialPublished)
        ? parsed.officialPublished.map(normalizeLibraryRecord)
        : [],
      personalLibraries: Array.isArray(parsed.personalLibraries)
        ? parsed.personalLibraries.map(normalizeLibraryRecord)
        : [],
      pdfImportDrafts: Array.isArray(parsed.pdfImportDrafts)
        ? parsed.pdfImportDrafts.map(normalizePdfImportDraft)
        : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyStore();
    }
    throw error;
  }
}

async function writeFileStore(store: TextbookLibraryStore): Promise<void> {
  const filePath = getStoreFilePath();
  await ensureDir(path.dirname(filePath));
  await writeJsonFileAtomic(filePath, store);
}

async function ensurePostgresSchema(config: PostgresObjectStorageConfig): Promise<void> {
  const pool = getStoragePgPool(config.databaseUrl);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS textbook_library_store (
      id TEXT PRIMARY KEY,
      updated_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    ALTER TABLE textbook_library_store
    DROP COLUMN IF EXISTS official_draft;
  `);
  await pool.query(`
    ALTER TABLE textbook_library_store
    DROP COLUMN IF EXISTS official_published;
  `);
  await pool.query(`
    ALTER TABLE textbook_library_store
    DROP COLUMN IF EXISTS personal_libraries;
  `);
  await pool.query(`
    ALTER TABLE textbook_library_store
    DROP COLUMN IF EXISTS pdf_import_drafts;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${POSTGRES_LIBRARIES_TABLE} (
      scope TEXT NOT NULL,
      view TEXT NOT NULL,
      id TEXT NOT NULL,
      owner_user_id TEXT,
      publisher TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      grade_id TEXT NOT NULL,
      edition_id TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      raw_library JSONB NOT NULL,
      PRIMARY KEY (scope, view, id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS textbook_libraries_scope_view_updated_idx
    ON ${POSTGRES_LIBRARIES_TABLE} (scope, view, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS textbook_libraries_scope_view_owner_updated_idx
    ON ${POSTGRES_LIBRARIES_TABLE} (scope, view, owner_user_id, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS textbook_libraries_scope_view_subject_grade_idx
    ON ${POSTGRES_LIBRARIES_TABLE} (scope, view, subject_id, grade_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${POSTGRES_IMPORT_DRAFTS_TABLE} (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      owner_user_id TEXT,
      library_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      raw_draft JSONB NOT NULL
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS textbook_pdf_import_drafts_scope_library_volume_uidx
    ON ${POSTGRES_IMPORT_DRAFTS_TABLE} (scope, library_id, volume_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS textbook_pdf_import_drafts_scope_library_updated_idx
    ON ${POSTGRES_IMPORT_DRAFTS_TABLE} (scope, library_id, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS textbook_pdf_import_drafts_owner_updated_idx
    ON ${POSTGRES_IMPORT_DRAFTS_TABLE} (owner_user_id, updated_at DESC);
  `);
  await pool.query(
    `
      INSERT INTO textbook_library_store (
        id,
        updated_at
      ) VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `,
    [STORE_ROW_ID, Date.now()],
  );
}

export async function ensureTextbookLibraryStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const config = getServerStorageConfig();
      if (config.backend === 'file') {
        await ensureDir(getTextbookDir());
        await ensureDir(getAttachmentDir());
        await ensureDir(getImportDraftDir());
        const store = await readFileStore();
        await writeFileStore(store);
        log.info('教材库存储已就绪: file');
        return;
      }

      await ensurePostgresSchema(config);
      await ensureObjectStorageBucket(config);
      log.info('教材库存储已就绪: postgres-object-storage');
    })();
  }

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

function mapPostgresLibraryRow(row: { raw_library: unknown }): TextbookLibraryRecord {
  return normalizeLibraryRecord(
    fromJsonColumn<TextbookLibraryRecord>(row.raw_library as TextbookLibraryRecord | string),
  );
}

async function listPostgresLibraries(input: {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  ownerUserId?: string;
  libraryId?: string;
  publisher?: string;
  subjectId?: string;
  gradeId?: string;
  editionId?: string;
}): Promise<TextbookLibraryRecord[]> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return [];
  }

  const normalizedView = normalizeLibraryViewForScope(input.scope, input.view);
  const conditions = ['scope = $1', 'view = $2'];
  const values: Array<string> = [input.scope, normalizedView];

  if (input.ownerUserId) {
    values.push(input.ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  if (input.libraryId) {
    values.push(input.libraryId);
    conditions.push(`id = $${values.length}`);
  }
  if (input.publisher) {
    values.push(input.publisher.trim());
    conditions.push(`publisher = $${values.length}`);
  }
  if (input.subjectId) {
    values.push(input.subjectId.trim());
    conditions.push(`subject_id = $${values.length}`);
  }
  if (input.gradeId) {
    values.push(input.gradeId.trim());
    conditions.push(`grade_id = $${values.length}`);
  }
  if (input.editionId) {
    values.push(input.editionId.trim());
    conditions.push(`edition_id = $${values.length}`);
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT raw_library
      FROM ${POSTGRES_LIBRARIES_TABLE}
      WHERE ${conditions.join(' AND ')}
      ORDER BY publisher ASC, edition_id ASC, updated_at DESC
    `,
    values,
  );
  return result.rows.map((row) => mapPostgresLibraryRow(row));
}

async function getPostgresLibrary(input: {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  libraryId: string;
}): Promise<TextbookLibraryRecord | null> {
  const libraries = await listPostgresLibraries({
    scope: input.scope,
    view: input.view,
    libraryId: input.libraryId,
  });
  return libraries[0] ?? null;
}

async function upsertPostgresLibrary(
  library: TextbookLibraryRecord,
  view: TextbookLibraryView = 'draft',
): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const normalizedView = normalizeLibraryViewForScope(library.scope, view);
  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO ${POSTGRES_LIBRARIES_TABLE} (
        scope,
        view,
        id,
        owner_user_id,
        publisher,
        subject_id,
        grade_id,
        edition_id,
        updated_at,
        raw_library
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (scope, view, id) DO UPDATE
      SET owner_user_id = EXCLUDED.owner_user_id,
          publisher = EXCLUDED.publisher,
          subject_id = EXCLUDED.subject_id,
          grade_id = EXCLUDED.grade_id,
          edition_id = EXCLUDED.edition_id,
          updated_at = EXCLUDED.updated_at,
          raw_library = EXCLUDED.raw_library
    `,
    [
      library.scope,
      normalizedView,
      library.id,
      library.ownerUserId ?? null,
      library.publisher,
      library.subjectId,
      library.gradeId,
      library.editionId,
      library.updatedAt,
      toJsonb(library),
    ],
  );
}

async function deletePostgresLibrary(input: {
  scope: TextbookLibraryScope;
  view?: TextbookLibraryView;
  libraryId: string;
}): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `
      DELETE FROM ${POSTGRES_LIBRARIES_TABLE}
      WHERE scope = $1 AND view = $2 AND id = $3
    `,
    [input.scope, normalizeLibraryViewForScope(input.scope, input.view), input.libraryId],
  );
}

async function replacePostgresLibraries(
  scope: TextbookLibraryScope,
  view: TextbookLibraryView,
  libraries: TextbookLibraryRecord[],
): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const normalizedView = normalizeLibraryViewForScope(scope, view);
  await withStorageTransaction(config.databaseUrl, async (client) => {
    await client.query(
      `
        DELETE FROM ${POSTGRES_LIBRARIES_TABLE}
        WHERE scope = $1 AND view = $2
      `,
      [scope, normalizedView],
    );

    for (const library of libraries) {
      await client.query(
        `
          INSERT INTO ${POSTGRES_LIBRARIES_TABLE} (
            scope,
            view,
            id,
            owner_user_id,
            publisher,
            subject_id,
            grade_id,
            edition_id,
            updated_at,
            raw_library
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          library.scope,
          normalizedView,
          library.id,
          library.ownerUserId ?? null,
          library.publisher,
          library.subjectId,
          library.gradeId,
          library.editionId,
          library.updatedAt,
          toJsonb(library),
        ],
      );
    }
  });
}

function mapPostgresImportDraftRow(row: { raw_draft: unknown }): TextbookPdfImportDraftRecord {
  return normalizePdfImportDraft(
    fromJsonColumn<TextbookPdfImportDraftRecord>(
      row.raw_draft as TextbookPdfImportDraftRecord | string,
    ),
  );
}

async function listPostgresImportDrafts(input?: {
  scope?: TextbookLibraryScope;
  libraryId?: string;
  volumeId?: string;
  ownerUserId?: string;
}): Promise<TextbookPdfImportDraftRecord[]> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return [];
  }

  const conditions: string[] = [];
  const values: Array<string> = [];
  if (input?.scope) {
    values.push(input.scope);
    conditions.push(`scope = $${values.length}`);
  }
  if (input?.libraryId) {
    values.push(input.libraryId);
    conditions.push(`library_id = $${values.length}`);
  }
  if (input?.volumeId) {
    values.push(input.volumeId);
    conditions.push(`volume_id = $${values.length}`);
  }
  if (input?.ownerUserId) {
    values.push(input.ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT raw_draft
      FROM ${POSTGRES_IMPORT_DRAFTS_TABLE}
      ${whereClause}
      ORDER BY updated_at DESC, id ASC
    `,
    values,
  );
  return result.rows.map((row) => mapPostgresImportDraftRow(row));
}

async function getPostgresImportDraft(draftId: string): Promise<TextbookPdfImportDraftRecord | null> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return null;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT raw_draft
      FROM ${POSTGRES_IMPORT_DRAFTS_TABLE}
      WHERE id = $1
      LIMIT 1
    `,
    [draftId],
  );
  if ((result.rowCount ?? 0) > 0) {
    return mapPostgresImportDraftRow(result.rows[0]);
  }
  return null;
}

async function upsertPostgresImportDraft(draft: TextbookPdfImportDraftRecord): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO ${POSTGRES_IMPORT_DRAFTS_TABLE} (
        id,
        scope,
        owner_user_id,
        library_id,
        volume_id,
        status,
        updated_at,
        raw_draft
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET scope = EXCLUDED.scope,
          owner_user_id = EXCLUDED.owner_user_id,
          library_id = EXCLUDED.library_id,
          volume_id = EXCLUDED.volume_id,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          raw_draft = EXCLUDED.raw_draft
    `,
    [
      draft.id,
      draft.scope,
      draft.ownerUserId ?? null,
      draft.libraryId,
      draft.volumeId,
      draft.status,
      draft.updatedAt,
      toJsonb(draft),
    ],
  );
}

async function deletePostgresImportDraftById(draftId: string): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `DELETE FROM ${POSTGRES_IMPORT_DRAFTS_TABLE} WHERE id = $1`,
    [draftId],
  );
}

async function deletePostgresImportDraftsByLibrary(
  scope: TextbookLibraryScope,
  libraryId: string,
): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `DELETE FROM ${POSTGRES_IMPORT_DRAFTS_TABLE} WHERE scope = $1 AND library_id = $2`,
    [scope, libraryId],
  );
}

async function readStore(options?: {
  includeImportDrafts?: boolean;
}): Promise<TextbookLibraryStore> {
  await ensureTextbookLibraryStorageReady();
  const includeImportDrafts = options?.includeImportDrafts ?? true;
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const seededStore = await seedStoreIfNeeded(await readFileStore());
    if (await migrateStoredTextbookCovers(seededStore)) {
      await writeStore(seededStore);
    }
    return seededStore;
  }

  const [officialDraft, officialPublished, personalLibraries, metadataResult] = await Promise.all([
    listPostgresLibraries({ scope: 'official', view: 'draft' }),
    listPostgresLibraries({ scope: 'official', view: 'published' }),
    listPostgresLibraries({ scope: 'personal', view: 'draft' }),
    getStoragePgPool(config.databaseUrl).query(
      `
        SELECT updated_at
        FROM textbook_library_store
        WHERE id = $1
        LIMIT 1
      `,
      [STORE_ROW_ID],
    ),
  ]);
  if ((metadataResult.rowCount ?? 0) === 0) {
    return createEmptyStore();
  }
  const store = {
    officialDraft,
    officialPublished,
    personalLibraries,
    pdfImportDrafts: includeImportDrafts ? await listPostgresImportDrafts() : [],
    updatedAt: Number(metadataResult.rows[0].updated_at) || Date.now(),
  };
  const seededStore = await seedStoreIfNeeded(store);
  if (await migrateStoredTextbookCovers(seededStore)) {
    await writeStore(seededStore);
  }
  return seededStore;
}

async function writeStore(store: TextbookLibraryStore): Promise<void> {
  const nextStore = {
    ...store,
    updatedAt: Date.now(),
  };

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    await writeFileStore(nextStore);
    return;
  }

  await Promise.all([
    replacePostgresLibraries('official', 'draft', nextStore.officialDraft),
    replacePostgresLibraries('official', 'published', nextStore.officialPublished),
    replacePostgresLibraries('personal', 'draft', nextStore.personalLibraries),
  ]);
  await getStoragePgPool(config.databaseUrl).query(
    `
      UPDATE textbook_library_store
      SET updated_at = $2
      WHERE id = $1
    `,
    [STORE_ROW_ID, nextStore.updatedAt],
  );
}

function matchesLibraryQuery(library: TextbookLibraryRecord, options: ListTextbookLibrariesOptions): boolean {
  if (options.ownerUserId && library.ownerUserId && library.ownerUserId !== options.ownerUserId) {
    return false;
  }
  if (options.publisher && normalizeFilterText(library.publisher) !== normalizeFilterText(options.publisher)) {
    return false;
  }
  if (options.subjectId && !matchesFilterText(library.subjectId, library.subjectLabel, options.subjectId)) {
    return false;
  }
  if (options.gradeId && !matchesFilterText(library.gradeId, library.gradeLabel, options.gradeId)) {
    return false;
  }
  if (options.editionId && !matchesFilterText(library.editionId, library.editionLabel, options.editionId)) {
    return false;
  }
  if (options.semester) {
    const hasSemester = library.volumes.some((volume) => volume.semester === options.semester);
    if (!hasSemester) {
      return false;
    }
  }

  const query = options.query?.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    library.publisher,
    library.subjectId,
    library.subjectLabel ?? '',
    library.gradeId,
    library.gradeLabel ?? '',
    library.editionId,
    library.editionLabel,
    ...library.volumes.flatMap((volume) => [
      volume.label,
      ...volume.units.flatMap((unit) => [
        unit.title,
        ...unit.chapters.flatMap((chapter) => [
          chapter.title,
          chapter.summary,
          ...chapter.keywords,
          ...chapter.attachments.map((attachment) => attachment.title),
        ]),
      ]),
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function getLibrariesForView(
  store: TextbookLibraryStore,
  scope: TextbookLibraryScope,
  view: TextbookLibraryView = 'draft',
): TextbookLibraryRecord[] {
  if (scope === 'official') {
    return view === 'published' ? store.officialPublished : store.officialDraft;
  }
  return store.personalLibraries;
}

function setLibrariesForView(
  store: TextbookLibraryStore,
  scope: TextbookLibraryScope,
  libraries: TextbookLibraryRecord[],
  view: TextbookLibraryView = 'draft',
) {
  if (scope === 'official') {
    if (view === 'published') {
      store.officialPublished = libraries;
    } else {
      store.officialDraft = libraries;
    }
    return;
  }
  store.personalLibraries = libraries;
}

function upsertLibrary(
  libraries: TextbookLibraryRecord[],
  library: TextbookLibraryRecord,
): TextbookLibraryRecord[] {
  const index = libraries.findIndex((item) => item.id === library.id);
  const nextLibraries = [...libraries];
  if (index >= 0) {
    nextLibraries[index] = library;
  } else {
    nextLibraries.push(library);
  }
  return nextLibraries.sort((a, b) => a.publisher.localeCompare(b.publisher) || a.editionLabel.localeCompare(b.editionLabel));
}

function removeLibrary(
  libraries: TextbookLibraryRecord[],
  libraryId: string,
): TextbookLibraryRecord[] {
  return libraries.filter((library) => library.id !== libraryId);
}

function findChapterInLibrary(
  library: TextbookLibraryRecord,
  chapterId: string,
): TextbookChapterRecord | undefined {
  for (const volume of library.volumes) {
    for (const unit of volume.units) {
      const chapter = unit.chapters.find((candidate) => candidate.id === chapterId);
      if (chapter) {
        return chapter;
      }
    }
  }
  return undefined;
}

function findVolumeInLibrary(
  library: TextbookLibraryRecord,
  volumeId: string,
) {
  return library.volumes.find((volume) => volume.id === volumeId);
}

function findAttachmentInLibraries(
  libraries: TextbookLibraryRecord[],
  source: TextbookAttachmentLocation['source'],
  attachmentId: string,
): TextbookAttachmentLocation | null {
  for (const library of libraries) {
    for (const volume of library.volumes) {
      for (const unit of volume.units) {
        for (const chapter of unit.chapters) {
          const attachment = chapter.attachments.find((candidate) => candidate.id === attachmentId);
          if (attachment) {
            return {
              source,
              library,
              chapter,
              attachment,
            };
          }
        }
      }
    }
  }
  return null;
}

function buildTextbookAttachmentFilePath(
  scope: TextbookLibraryScope,
  libraryId: string,
  chapterId: string,
  attachmentId: string,
  filename: string,
  mimeType: string,
): string {
  const extension = inferFileExtension(filename, mimeType);
  const basename = path.basename(filename, path.extname(filename)) || 'attachment';
  return path.join(
    getAttachmentDir(),
    scope,
    safeStorageId(libraryId),
    safeStorageId(chapterId),
    safeStorageId(attachmentId),
    `${basename}${extension}`,
  );
}

function buildTextbookImportDraftFilePath(
  scope: TextbookLibraryScope,
  libraryId: string,
  volumeId: string,
  draftId: string,
  filename: string,
  mimeType: string,
): string {
  const extension = inferFileExtension(filename, mimeType);
  const basename = path.basename(filename, path.extname(filename)) || 'import';
  return path.join(
    getImportDraftDir(),
    scope,
    safeStorageId(libraryId),
    safeStorageId(volumeId),
    safeStorageId(draftId),
    `${basename}${extension}`,
  );
}

function matchesImportDraftQuery(
  draft: TextbookPdfImportDraftRecord,
  options: ListTextbookPdfImportDraftsOptions,
): boolean {
  if (draft.scope !== options.scope) {
    return false;
  }
  if (draft.libraryId !== options.libraryId) {
    return false;
  }
  if (options.volumeId && draft.volumeId !== options.volumeId) {
    return false;
  }
  if (options.ownerUserId && draft.ownerUserId && draft.ownerUserId !== options.ownerUserId) {
    return false;
  }
  return true;
}

async function deleteAttachmentObjects(attachments: TextbookAttachmentRecord[]): Promise<void> {
  const config = getServerStorageConfig();
  const persistedAttachments = attachments.filter(
    (attachment) => !attachment.externalUrl && (attachment.storageKey || attachment.objectKey),
  );
  if (persistedAttachments.length === 0) {
    return;
  }

  if (config.backend === 'file') {
    await Promise.all(
      persistedAttachments.map(async (attachment) => {
        if (!attachment.storageKey) {
          return;
        }
        const filePath = path.join(config.storageRoot, attachment.storageKey);
        await fs.rm(filePath, { force: true }).catch(() => {});
      }),
    );
    return;
  }

  await deleteObjectsFromStorage(
    config,
    persistedAttachments
      .map((attachment) => attachment.objectKey)
      .filter((value): value is string => Boolean(value)),
  );
}

async function deleteImportDraftObjects(drafts: TextbookPdfImportDraftRecord[]): Promise<void> {
  const config = getServerStorageConfig();
  const persistedDrafts = drafts.filter((draft) => draft.storageKey || draft.objectKey);
  if (persistedDrafts.length === 0) {
    return;
  }

  if (config.backend === 'file') {
    await Promise.all(
      persistedDrafts.map(async (draft) => {
        if (!draft.storageKey) {
          return;
        }
        const filePath = path.join(config.storageRoot, draft.storageKey);
        await fs.rm(filePath, { force: true }).catch(() => {});
      }),
    );
    return;
  }

  await deleteObjectsFromStorage(
    config,
    persistedDrafts
      .map((draft) => draft.objectKey ?? draft.storageKey)
      .filter((value): value is string => Boolean(value)),
  );
}

export async function listTextbookLibraries(
  options: ListTextbookLibrariesOptions,
): Promise<TextbookLibraryRecord[]> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    return (
      await listPostgresLibraries({
        scope: options.scope,
        view: options.view,
        ownerUserId: options.ownerUserId,
        publisher: options.publisher,
        subjectId: options.subjectId,
        gradeId: options.gradeId,
        editionId: options.editionId,
      })
    )
      .filter((library) => matchesLibraryQuery(library, options))
      .map((library) => structuredClone(library));
  }
  const store = await readStore({ includeImportDrafts: false });
  return getLibrariesForView(store, options.scope, options.view)
    .filter((library) => matchesLibraryQuery(library, options))
    .map((library) => structuredClone(library));
}

export async function getTextbookLibrary(input: {
  scope: TextbookLibraryScope;
  libraryId: string;
  view?: TextbookLibraryView;
}): Promise<TextbookLibraryRecord | null> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const library = await getPostgresLibrary(input);
    return library ? structuredClone(library) : null;
  }
  const store = await readStore({ includeImportDrafts: false });
  const library =
    getLibrariesForView(store, input.scope, input.view).find((item) => item.id === input.libraryId) ??
    null;
  return library ? structuredClone(library) : null;
}

export async function saveTextbookLibrary(
  input: SaveTextbookLibraryInput,
): Promise<TextbookLibraryRecord> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const scope = input.library.scope;
    const view = normalizeLibraryViewForScope(scope, input.view);
    const existing = await getPostgresLibrary({
      scope,
      view,
      libraryId: input.library.id,
    });
    const libraryId = input.library.id || randomUUID();
    const storedCover = await persistTextbookLibraryCover({
      ...input.library,
      id: libraryId,
      scope,
      createdAt: existing?.createdAt ?? input.library.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    if (!storedCover) {
      await deleteImageFileRecord(buildTextbookCoverImageId(scope, libraryId));
    }
    const normalized = normalizeLibraryRecord({
      ...input.library,
      id: libraryId,
      createdAt: existing?.createdAt ?? input.library.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      publishedAt: scope === 'official' && view === 'published' ? input.library.publishedAt : undefined,
      publishedByUserId:
        scope === 'official' && view === 'published' ? input.library.publishedByUserId : undefined,
      cover: storedCover,
    });
    await upsertPostgresLibrary(normalized, view);
    return structuredClone(normalized);
  }
  const store = await readStore({ includeImportDrafts: false });
  const scope = input.library.scope;
  const view = input.view ?? (scope === 'official' ? 'draft' : 'draft');
  const libraries = getLibrariesForView(store, scope, view);
  const existing = libraries.find((library) => library.id === input.library.id);
  const libraryId = input.library.id || randomUUID();
  const storedCover = await persistTextbookLibraryCover({
    ...input.library,
    id: libraryId,
    scope,
    createdAt: existing?.createdAt ?? input.library.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  if (!storedCover) {
    await deleteImageFileRecord(buildTextbookCoverImageId(scope, libraryId));
  }
  const normalized = normalizeLibraryRecord({
    ...input.library,
    id: libraryId,
    createdAt: existing?.createdAt ?? input.library.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    publishedAt: scope === 'official' && view === 'published' ? input.library.publishedAt : undefined,
    publishedByUserId:
      scope === 'official' && view === 'published' ? input.library.publishedByUserId : undefined,
    cover: storedCover,
  });

  setLibrariesForView(store, scope, upsertLibrary(libraries, normalized), view);
  await writeStore(store);
  return structuredClone(normalized);
}

export async function deleteTextbookLibrary(input: {
  scope: TextbookLibraryScope;
  libraryId: string;
  view?: TextbookLibraryView;
}): Promise<void> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const target = await getPostgresLibrary(input);
    if (!target) {
      return;
    }

    const attachments = target.volumes.flatMap((volume) =>
      volume.units.flatMap((unit) => unit.chapters.flatMap((chapter) => chapter.attachments)),
    );
    const relatedImportDrafts = await listPostgresImportDrafts({
      scope: input.scope,
      libraryId: input.libraryId,
    });
    await deleteAttachmentObjects(attachments);
    await deleteImportDraftObjects(relatedImportDrafts);
    await deleteImageFileRecord(buildTextbookCoverImageId(input.scope, input.libraryId));
    await deletePostgresImportDraftsByLibrary(input.scope, input.libraryId);
    await deletePostgresLibrary(input);
    return;
  }
  const store = await readStore({ includeImportDrafts: false });
  const libraries = getLibrariesForView(store, input.scope, input.view);
  const target = libraries.find((library) => library.id === input.libraryId);
  if (!target) {
    return;
  }

  const attachments = target.volumes.flatMap((volume) =>
    volume.units.flatMap((unit) => unit.chapters.flatMap((chapter) => chapter.attachments)),
  );
  const relatedImportDrafts =
    getServerStorageConfig().backend === 'file'
      ? store.pdfImportDrafts.filter(
          (candidate) => candidate.scope === input.scope && candidate.libraryId === input.libraryId,
        )
      : await listPostgresImportDrafts({
          scope: input.scope,
          libraryId: input.libraryId,
        });
  await deleteAttachmentObjects(attachments);
  await deleteImportDraftObjects(relatedImportDrafts);
  await deleteImageFileRecord(buildTextbookCoverImageId(input.scope, input.libraryId));
  if (getServerStorageConfig().backend === 'file') {
    store.pdfImportDrafts = store.pdfImportDrafts.filter(
      (candidate) => !(candidate.scope === input.scope && candidate.libraryId === input.libraryId),
    );
  } else {
    await deletePostgresImportDraftsByLibrary(input.scope, input.libraryId);
  }
  setLibrariesForView(store, input.scope, removeLibrary(libraries, input.libraryId), input.view);
  await writeStore(store);
}

export async function publishOfficialTextbookLibraries(
  publishedByUserId: string,
): Promise<TextbookLibraryRecord[]> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const draftLibraries = await listPostgresLibraries({
      scope: 'official',
      view: 'draft',
    });
    const publishedAt = Date.now();
    const publishedLibraries: TextbookLibraryRecord[] = [];
    for (const library of draftLibraries) {
      const storedCover = await persistTextbookLibraryCover({
        ...structuredClone(library),
        updatedAt: publishedAt,
      });
      publishedLibraries.push(
        normalizeLibraryRecord({
          ...structuredClone(library),
          cover: storedCover,
          publishedAt,
          publishedByUserId,
          updatedAt: publishedAt,
        }),
      );
    }
    await replacePostgresLibraries('official', 'published', publishedLibraries);
    return structuredClone(publishedLibraries);
  }
  const store = await readStore({ includeImportDrafts: false });
  const publishedAt = Date.now();
  const publishedLibraries: TextbookLibraryRecord[] = [];
  for (const library of store.officialDraft) {
    const storedCover = await persistTextbookLibraryCover({
      ...structuredClone(library),
      updatedAt: publishedAt,
    });
    publishedLibraries.push(
      normalizeLibraryRecord({
        ...structuredClone(library),
        cover: storedCover,
        publishedAt,
        publishedByUserId,
        updatedAt: publishedAt,
      }),
    );
  }
  store.officialPublished = publishedLibraries;
  await writeStore(store);
  return structuredClone(store.officialPublished);
}

export async function saveTextbookAttachment(
  input: SaveTextbookAttachmentInput,
): Promise<TextbookAttachmentRecord> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const library = await getPostgresLibrary({
      scope: input.scope,
      view: input.view,
      libraryId: input.libraryId,
    });
    if (!library) {
      throw new Error('TEXTBOOK_LIBRARY_NOT_FOUND');
    }
    if (input.scope === 'personal' && input.ownerUserId && library.ownerUserId !== input.ownerUserId) {
      throw new Error('TEXTBOOK_LIBRARY_FORBIDDEN');
    }

    const chapter = findChapterInLibrary(library, input.chapterId);
    if (!chapter) {
      throw new Error('TEXTBOOK_CHAPTER_NOT_FOUND');
    }

    const attachmentId = randomUUID();
    const now = Date.now();
    let storageKey = '';
    let objectKey: string | undefined;

    const config = getServerStorageConfig();
    if (config.backend === 'file') {
      const filePath = buildTextbookAttachmentFilePath(
        input.scope,
        input.libraryId,
        input.chapterId,
        attachmentId,
        input.filename,
        input.mimeType,
      );
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, input.buffer);
      storageKey = path.relative(config.storageRoot, filePath).replace(/\\/g, '/');
    } else {
      objectKey = buildTextbookAttachmentObjectKey(
        config.objectKeyPrefix,
        input.scope,
        input.libraryId,
        input.chapterId,
        attachmentId,
        input.filename,
        input.mimeType,
      );
      await putObjectToStorage(config, objectKey, input.buffer, input.mimeType);
      storageKey = objectKey;
    }

    const attachment: TextbookAttachmentRecord = {
      id: attachmentId,
      filename: input.filename,
      title: input.title?.trim() || input.filename,
      mimeType: input.mimeType,
      type: input.type,
      size: input.size,
      description: input.description?.trim() || undefined,
      order: input.order ?? chapter.attachments.length,
      uploadedAt: now,
      updatedAt: now,
      status: 'uploaded',
      storageKey,
      objectKey,
      sourcePdf: input.sourcePdf,
    };

    chapter.attachments = [...chapter.attachments, attachment].sort((a, b) => a.order - b.order);
    library.updatedAt = now;
    await upsertPostgresLibrary(
      normalizeLibraryRecord(library),
      normalizeLibraryViewForScope(input.scope, input.view),
    );
    return structuredClone(attachment);
  }
  const store = await readStore({ includeImportDrafts: false });
  const libraries = getLibrariesForView(store, input.scope, input.view);
  const libraryIndex = libraries.findIndex((library) => library.id === input.libraryId);
  if (libraryIndex < 0) {
    throw new Error('TEXTBOOK_LIBRARY_NOT_FOUND');
  }

  const library = libraries[libraryIndex];
  if (input.scope === 'personal' && input.ownerUserId && library.ownerUserId !== input.ownerUserId) {
    throw new Error('TEXTBOOK_LIBRARY_FORBIDDEN');
  }

  const chapter = findChapterInLibrary(library, input.chapterId);
  if (!chapter) {
    throw new Error('TEXTBOOK_CHAPTER_NOT_FOUND');
  }

  const attachmentId = randomUUID();
  const now = Date.now();
  let storageKey = '';
  let objectKey: string | undefined;

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const filePath = buildTextbookAttachmentFilePath(
      input.scope,
      input.libraryId,
      input.chapterId,
      attachmentId,
      input.filename,
      input.mimeType,
    );
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, input.buffer);
    storageKey = path.relative(config.storageRoot, filePath).replace(/\\/g, '/');
  } else {
    objectKey = buildTextbookAttachmentObjectKey(
      config.objectKeyPrefix,
      input.scope,
      input.libraryId,
      input.chapterId,
      attachmentId,
      input.filename,
      input.mimeType,
    );
    await putObjectToStorage(config, objectKey, input.buffer, input.mimeType);
    storageKey = objectKey;
  }

  const attachment: TextbookAttachmentRecord = {
    id: attachmentId,
    filename: input.filename,
    title: input.title?.trim() || input.filename,
    mimeType: input.mimeType,
    type: input.type,
    size: input.size,
    description: input.description?.trim() || undefined,
    order: input.order ?? chapter.attachments.length,
    uploadedAt: now,
    updatedAt: now,
    status: 'uploaded',
    storageKey,
    objectKey,
    sourcePdf: input.sourcePdf,
  };

  chapter.attachments = [...chapter.attachments, attachment].sort((a, b) => a.order - b.order);
  library.updatedAt = now;
  setLibrariesForView(store, input.scope, upsertLibrary(libraries, normalizeLibraryRecord(library)), input.view);
  await writeStore(store);
  return structuredClone(attachment);
}

export async function listTextbookPdfImportDrafts(
  options: ListTextbookPdfImportDraftsOptions,
): Promise<TextbookPdfImportDraftRecord[]> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    return (await listPostgresImportDrafts(options)).map((draft) => structuredClone(draft));
  }
  const store = await readStore();
  return store.pdfImportDrafts
    .filter((draft) => matchesImportDraftQuery(draft, options))
    .map((draft) => structuredClone(draft));
}

export async function getTextbookPdfImportDraft(
  draftId: string,
): Promise<TextbookPdfImportDraftRecord | null> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const draft = await getPostgresImportDraft(draftId);
    return draft ? structuredClone(draft) : null;
  }
  const store = await readStore();
  const draft = store.pdfImportDrafts.find((candidate) => candidate.id === draftId) ?? null;
  return draft ? structuredClone(draft) : null;
}

export async function createTextbookPdfImportDraft(
  input: CreateTextbookPdfImportDraftInput,
): Promise<TextbookPdfImportDraftRecord> {
  const isPostgres = getServerStorageConfig().backend === 'postgres-object-storage';
  const store = isPostgres ? null : await readStore({ includeImportDrafts: false });
  const library = isPostgres
    ? await getPostgresLibrary({
        scope: input.scope,
        view: input.view,
        libraryId: input.libraryId,
      })
    : (getLibrariesForView(store!, input.scope, input.view).find(
        (candidate) => candidate.id === input.libraryId,
      ) ?? null);
  if (!library) {
    throw new Error('TEXTBOOK_LIBRARY_NOT_FOUND');
  }
  if (input.scope === 'personal' && input.ownerUserId && library.ownerUserId !== input.ownerUserId) {
    throw new Error('TEXTBOOK_LIBRARY_FORBIDDEN');
  }
  const volume = findVolumeInLibrary(library, input.volumeId);
  if (!volume) {
    throw new Error('TEXTBOOK_VOLUME_NOT_FOUND');
  }

  const existingDraft =
    !isPostgres
      ? store!.pdfImportDrafts.find(
          (draft) =>
            draft.scope === input.scope &&
            draft.libraryId === input.libraryId &&
            draft.volumeId === input.volumeId,
        )
      : (
          await listPostgresImportDrafts({
            scope: input.scope,
            libraryId: input.libraryId,
            volumeId: input.volumeId,
          })
        )[0];
  if (existingDraft) {
    throw new Error('TEXTBOOK_IMPORT_DRAFT_ALREADY_EXISTS');
  }

  const draftId = randomUUID();
  const now = Date.now();
  let storageKey = '';
  let objectKey: string | undefined;
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const filePath = buildTextbookImportDraftFilePath(
      input.scope,
      input.libraryId,
      input.volumeId,
      draftId,
      input.filename,
      input.mimeType,
    );
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, input.buffer);
    storageKey = path.relative(config.storageRoot, filePath).replace(/\\/g, '/');
  } else {
    objectKey = buildTextbookImportDraftObjectKey(
      config.objectKeyPrefix,
      input.scope,
      input.libraryId,
      input.volumeId,
      draftId,
      input.filename,
      input.mimeType,
    );
    await putObjectToStorage(config, objectKey, input.buffer, input.mimeType);
    storageKey = objectKey;
  }

  const draft = normalizePdfImportDraft({
    id: draftId,
    scope: input.scope,
    ownerUserId: library.scope === 'personal' ? library.ownerUserId : undefined,
    libraryId: input.libraryId,
    volumeId: input.volumeId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    uploadedAt: now,
    updatedAt: now,
    status: 'uploaded',
    storageKey,
    objectKey,
    units: [],
    unboundPages: [],
    tocCandidatePages: [],
    pageAnchors: [],
    conflictNotes: [],
    lowConfidencePages: [],
  });
  if (!isPostgres) {
    store!.pdfImportDrafts = [...store!.pdfImportDrafts, draft];
    await writeStore(store!);
  } else {
    await upsertPostgresImportDraft(draft);
  }
  return structuredClone(draft);
}

export async function saveTextbookPdfImportDraft(
  input: SaveTextbookPdfImportDraftInput,
): Promise<TextbookPdfImportDraftRecord> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const existing = await getPostgresImportDraft(input.draft.id);
    if (!existing) {
      throw new Error('TEXTBOOK_IMPORT_DRAFT_NOT_FOUND');
    }
    const nextDraft = normalizePdfImportDraft({
      ...input.draft,
      id: existing.id,
      scope: existing.scope,
      ownerUserId: existing.ownerUserId,
      libraryId: existing.libraryId,
      volumeId: existing.volumeId,
      filename: existing.filename,
      mimeType: existing.mimeType,
      size: existing.size,
      uploadedAt: existing.uploadedAt,
      storageKey: existing.storageKey,
      objectKey: existing.objectKey,
      updatedAt: Date.now(),
    });
    await upsertPostgresImportDraft(nextDraft);
    return structuredClone(nextDraft);
  }
  const store = await readStore();
  const draftIndex = store.pdfImportDrafts.findIndex((candidate) => candidate.id === input.draft.id);
  if (draftIndex < 0) {
    throw new Error('TEXTBOOK_IMPORT_DRAFT_NOT_FOUND');
  }
  const existing = store.pdfImportDrafts[draftIndex];
  const nextDraft = normalizePdfImportDraft({
    ...input.draft,
    id: existing.id,
    scope: existing.scope,
    ownerUserId: existing.ownerUserId,
    libraryId: existing.libraryId,
    volumeId: existing.volumeId,
    filename: existing.filename,
    mimeType: existing.mimeType,
    size: existing.size,
    uploadedAt: existing.uploadedAt,
    storageKey: existing.storageKey,
    objectKey: existing.objectKey,
    updatedAt: Date.now(),
  });
  store.pdfImportDrafts[draftIndex] = nextDraft;
  await writeStore(store);
  return structuredClone(nextDraft);
}

export async function updateTextbookPdfImportProcessing(
  input: UpdateTextbookPdfImportProcessingInput,
): Promise<TextbookPdfImportDraftRecord | null> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const current = await getPostgresImportDraft(input.draftId);
    if (!current) {
      return null;
    }
    const nextDraft = normalizePdfImportDraft({
      ...current,
      status: input.status,
      parserJobId: input.parserJobId ?? current.parserJobId,
      pageCount: input.pageCount ?? current.pageCount,
      extractedText: input.extractedText ?? current.extractedText,
      units: input.units ?? current.units,
      unboundPages: input.unboundPages ?? current.unboundPages,
      proposalSource: input.proposalSource ?? current.proposalSource,
      proposalConfidence: input.proposalConfidence ?? current.proposalConfidence,
      aiModel: input.aiModel ?? current.aiModel,
      tocCandidatePages: input.tocCandidatePages ?? current.tocCandidatePages,
      pageAnchors: input.pageAnchors ?? current.pageAnchors,
      conflictNotes: input.conflictNotes ?? current.conflictNotes,
      lowConfidencePages: input.lowConfidencePages ?? current.lowConfidencePages,
      parseError: input.parseError,
      updatedAt: Date.now(),
    });
    await upsertPostgresImportDraft(nextDraft);
    return structuredClone(nextDraft);
  }
  const store = await readStore();
  const draftIndex = store.pdfImportDrafts.findIndex((candidate) => candidate.id === input.draftId);
  if (draftIndex < 0) {
    return null;
  }
  const current = store.pdfImportDrafts[draftIndex];
  const nextDraft = normalizePdfImportDraft({
    ...current,
    status: input.status,
    parserJobId: input.parserJobId ?? current.parserJobId,
    pageCount: input.pageCount ?? current.pageCount,
    extractedText: input.extractedText ?? current.extractedText,
    units: input.units ?? current.units,
    unboundPages: input.unboundPages ?? current.unboundPages,
    proposalSource: input.proposalSource ?? current.proposalSource,
    proposalConfidence: input.proposalConfidence ?? current.proposalConfidence,
    aiModel: input.aiModel ?? current.aiModel,
    tocCandidatePages: input.tocCandidatePages ?? current.tocCandidatePages,
    pageAnchors: input.pageAnchors ?? current.pageAnchors,
    conflictNotes: input.conflictNotes ?? current.conflictNotes,
    lowConfidencePages: input.lowConfidencePages ?? current.lowConfidencePages,
    parseError: input.parseError,
    updatedAt: Date.now(),
  });
  store.pdfImportDrafts[draftIndex] = nextDraft;
  await writeStore(store);
  return structuredClone(nextDraft);
}

export async function readTextbookPdfImportDraftBlob(draftId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
} | null> {
  const draft = await getTextbookPdfImportDraft(draftId);
  if (!draft?.storageKey) {
    return null;
  }
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const filePath = path.join(config.storageRoot, draft.storageKey);
    const buffer = await fs.readFile(filePath);
    return {
      buffer,
      mimeType: draft.mimeType,
      filename: draft.filename,
    };
  }

  const objectKey = draft.objectKey ?? draft.storageKey;
  const buffer = await getObjectFromStorage(config, objectKey);
  return {
    buffer,
    mimeType: draft.mimeType,
    filename: draft.filename,
  };
}

export async function deleteTextbookPdfImportDraft(draftId: string): Promise<boolean> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const draft = await getPostgresImportDraft(draftId);
    if (!draft) {
      return false;
    }
    if (draft.status === 'confirmed') {
      throw new Error('TEXTBOOK_IMPORT_DRAFT_IN_USE');
    }

    const config = getServerStorageConfig();
    if (draft.storageKey) {
      if (config.backend === 'file') {
        const filePath = path.join(config.storageRoot, draft.storageKey);
        await fs.rm(filePath, { force: true }).catch(() => {});
      } else if (draft.objectKey || draft.storageKey) {
        await deleteObjectsFromStorage(config, [draft.objectKey ?? draft.storageKey]);
      }
    }
    await deletePostgresImportDraftById(draftId);
    return true;
  }
  const store = await readStore();
  const draftIndex = store.pdfImportDrafts.findIndex((candidate) => candidate.id === draftId);
  if (draftIndex < 0) {
    return false;
  }
  const draft = store.pdfImportDrafts[draftIndex];
  if (draft.status === 'confirmed') {
    throw new Error('TEXTBOOK_IMPORT_DRAFT_IN_USE');
  }

  store.pdfImportDrafts = store.pdfImportDrafts.filter((candidate) => candidate.id !== draftId);
  const config = getServerStorageConfig();
  if (draft.storageKey) {
    if (config.backend === 'file') {
      const filePath = path.join(config.storageRoot, draft.storageKey);
      await fs.rm(filePath, { force: true }).catch(() => {});
    } else if (draft.objectKey || draft.storageKey) {
      await deleteObjectsFromStorage(config, [draft.objectKey ?? draft.storageKey]);
    }
  }
  await writeStore(store);
  return true;
}

export async function confirmTextbookPdfImportDraft(
  draftId: string,
): Promise<{ draft: TextbookPdfImportDraftRecord; library: TextbookLibraryRecord }> {
  const isPostgres = getServerStorageConfig().backend === 'postgres-object-storage';
  const store = isPostgres ? null : await readStore({ includeImportDrafts: true });
  const draft = isPostgres
    ? await getPostgresImportDraft(draftId)
    : store?.pdfImportDrafts.find((candidate) => candidate.id === draftId) ?? null;
  if (!draft) {
    throw new Error('TEXTBOOK_IMPORT_DRAFT_NOT_FOUND');
  }
  const view: TextbookLibraryView = 'draft';
  const library = isPostgres
    ? await getPostgresLibrary({
        scope: draft.scope,
        view,
        libraryId: draft.libraryId,
      })
    : (getLibrariesForView(store!, draft.scope, view).find(
        (candidate) => candidate.id === draft.libraryId,
      ) ?? null);
  if (!library) {
    throw new Error('TEXTBOOK_LIBRARY_NOT_FOUND');
  }
  const volume = findVolumeInLibrary(library, draft.volumeId);
  if (!volume) {
    throw new Error('TEXTBOOK_VOLUME_NOT_FOUND');
  }

  const oldAttachments = volume.units.flatMap((unit) =>
    unit.chapters.flatMap((chapter) => chapter.attachments),
  );

  const importedUnits = draft.units.map((unit, unitIndex) => ({
    id: `${draft.id}-unit-${unitIndex + 1}`,
    title: unit.title,
    order: unitIndex,
    chapters: unit.chapters.map((chapter, chapterIndex) => {
      const chapterId = `${draft.id}-chapter-${unitIndex + 1}-${chapterIndex + 1}`;
      const attachmentId = `${draft.id}-attachment-${unitIndex + 1}-${chapterIndex + 1}`;
      return {
        id: chapterId,
        title: chapter.title,
        summary: '',
        keywords: [],
        order: chapterIndex,
        attachments: [
          {
            id: attachmentId,
            filename: draft.filename,
            title: `${chapter.title}.pdf`,
            mimeType: draft.mimeType,
            type: 'pdf' as const,
            size: draft.size,
            description: `${chapter.title}（PDF 第 ${chapter.pageStart}-${chapter.pageEnd} 页）`,
            order: 0,
            uploadedAt: Date.now(),
            updatedAt: Date.now(),
            status: 'ready' as const,
            externalUrl: `/api/textbook-libraries?action=downloadAttachment&id=${encodeURIComponent(attachmentId)}`,
            extractedSummary: undefined,
            sourcePdf: {
              importDraftId: draft.id,
              pageStart: chapter.pageStart,
              pageEnd: chapter.pageEnd,
              confidence: chapter.confidence,
              status: 'confirmed' as const,
            },
          },
        ],
      };
    }),
  }));

  volume.units = importedUnits;
  library.updatedAt = Date.now();
  const normalizedLibrary = normalizeLibraryRecord(library);
  if (isPostgres) {
    await upsertPostgresLibrary(normalizedLibrary, view);
  } else {
    const libraries = getLibrariesForView(store!, draft.scope, view);
    setLibrariesForView(store!, draft.scope, upsertLibrary(libraries, normalizedLibrary), view);
  }

  const nextDraft = normalizePdfImportDraft({
    ...draft,
    status: 'confirmed',
    updatedAt: Date.now(),
  });
  if (!isPostgres) {
    const draftIndex = store!.pdfImportDrafts.findIndex((candidate) => candidate.id === draftId);
    store!.pdfImportDrafts[draftIndex] = nextDraft;
  }

  await deleteAttachmentObjects(oldAttachments);
  if (isPostgres) {
    await upsertPostgresImportDraft(nextDraft);
  } else {
    await writeStore(store!);
  }

  return {
    draft: structuredClone(nextDraft),
    library: structuredClone(normalizedLibrary),
  };
}

export async function findTextbookAttachment(
  attachmentId: string,
): Promise<TextbookAttachmentLocation | null> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const collections: Array<{
      source: TextbookAttachmentLocation['source'];
      scope: TextbookLibraryScope;
      view?: TextbookLibraryView;
    }> = [
      { source: 'official-published', scope: 'official', view: 'published' },
      { source: 'official-draft', scope: 'official', view: 'draft' },
      { source: 'personal', scope: 'personal', view: 'draft' },
    ];
    for (const collection of collections) {
      const libraries = await listPostgresLibraries({
        scope: collection.scope,
        view: collection.view,
      });
      const location = findAttachmentInLibraries(libraries, collection.source, attachmentId);
      if (location) {
        return location;
      }
    }
    return null;
  }
  const store = await readStore({ includeImportDrafts: false });
  return (
    findAttachmentInLibraries(store.officialPublished, 'official-published', attachmentId) ??
    findAttachmentInLibraries(store.officialDraft, 'official-draft', attachmentId) ??
    findAttachmentInLibraries(store.personalLibraries, 'personal', attachmentId)
  );
}

export async function readTextbookAttachmentBlob(attachmentId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
} | null> {
  const location = await findTextbookAttachment(attachmentId);
  if (!location) {
    return null;
  }
  if (location.attachment.externalUrl || !location.attachment.storageKey) {
    return null;
  }

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const filePath = path.join(config.storageRoot, location.attachment.storageKey);
    const buffer = await fs.readFile(filePath);
    return {
      buffer,
      mimeType: location.attachment.mimeType,
      filename: location.attachment.filename,
    };
  }

  const objectKey = location.attachment.objectKey ?? location.attachment.storageKey;
  const buffer = await getObjectFromStorage(config, objectKey);
  return {
    buffer,
    mimeType: location.attachment.mimeType,
    filename: location.attachment.filename,
  };
}

export async function updateTextbookAttachmentProcessing(
  input: UpdateTextbookAttachmentProcessingInput,
): Promise<TextbookAttachmentRecord | null> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const collections: Array<{
      scope: TextbookLibraryScope;
      view?: TextbookLibraryView;
    }> = [
      { scope: 'official', view: 'draft' },
      { scope: 'official', view: 'published' },
      { scope: 'personal', view: 'draft' },
    ];

    for (const collection of collections) {
      const libraries = await listPostgresLibraries({
        scope: collection.scope,
        view: collection.view,
      });
      for (const library of libraries) {
        for (const volume of library.volumes) {
          for (const unit of volume.units) {
            const chapter = unit.chapters.find((candidate) =>
              candidate.attachments.some((attachment) => attachment.id === input.attachmentId),
            );
            if (!chapter) {
              continue;
            }

            const attachmentIndex = chapter.attachments.findIndex(
              (attachment) => attachment.id === input.attachmentId,
            );
            const nextAttachment = {
              ...chapter.attachments[attachmentIndex],
              status: input.status,
              parserJobId: input.parserJobId ?? chapter.attachments[attachmentIndex].parserJobId,
              extractedText: input.extractedText,
              extractedSummary: input.extractedSummary,
              parseError: input.parseError,
              updatedAt: Date.now(),
            };
            chapter.attachments[attachmentIndex] = nextAttachment;
            library.updatedAt = Date.now();
            await upsertPostgresLibrary(
              normalizeLibraryRecord(library),
              normalizeLibraryViewForScope(collection.scope, collection.view),
            );
            return structuredClone(nextAttachment);
          }
        }
      }
    }

    return null;
  }
  const store = await readStore({ includeImportDrafts: false });
  const collections: Array<{
    scope: TextbookLibraryScope;
    view?: TextbookLibraryView;
    libraries: TextbookLibraryRecord[];
  }> = [
    { scope: 'official', view: 'draft', libraries: store.officialDraft },
    { scope: 'official', view: 'published', libraries: store.officialPublished },
    { scope: 'personal', libraries: store.personalLibraries },
  ];

  let updatedAttachment: TextbookAttachmentRecord | null = null;

  for (const collection of collections) {
    for (const library of collection.libraries) {
      for (const volume of library.volumes) {
        for (const unit of volume.units) {
          const chapter = unit.chapters.find((candidate) =>
            candidate.attachments.some((attachment) => attachment.id === input.attachmentId),
          );
          if (!chapter) {
            continue;
          }

          const attachmentIndex = chapter.attachments.findIndex(
            (attachment) => attachment.id === input.attachmentId,
          );
          const nextAttachment = {
            ...chapter.attachments[attachmentIndex],
            status: input.status,
            parserJobId: input.parserJobId ?? chapter.attachments[attachmentIndex].parserJobId,
            extractedText: input.extractedText,
            extractedSummary: input.extractedSummary,
            parseError: input.parseError,
            updatedAt: Date.now(),
          };
          chapter.attachments[attachmentIndex] = nextAttachment;
          library.updatedAt = Date.now();
          setLibrariesForView(
            store,
            collection.scope,
            upsertLibrary(collection.libraries, normalizeLibraryRecord(library)),
            collection.view,
          );
          updatedAttachment = structuredClone(nextAttachment);
        }
      }
    }
  }

  if (updatedAttachment) {
    await writeStore(store);
  }

  return updatedAttachment;
}

export async function deleteTextbookAttachment(attachmentId: string): Promise<boolean> {
  if (getServerStorageConfig().backend === 'postgres-object-storage') {
    const collections: Array<{
      scope: TextbookLibraryScope;
      view?: TextbookLibraryView;
    }> = [
      { scope: 'official', view: 'draft' },
      { scope: 'official', view: 'published' },
      { scope: 'personal', view: 'draft' },
    ];

    for (const collection of collections) {
      const libraries = await listPostgresLibraries({
        scope: collection.scope,
        view: collection.view,
      });
      for (const library of libraries) {
        for (const volume of library.volumes) {
          for (const unit of volume.units) {
            const index = unit.chapters.findIndex((chapter) =>
              chapter.attachments.some((attachment) => attachment.id === attachmentId),
            );
            if (index < 0) {
              continue;
            }

            const chapter = unit.chapters[index];
            const attachmentIndex = chapter.attachments.findIndex(
              (attachment) => attachment.id === attachmentId,
            );
            const deletedAttachment = chapter.attachments[attachmentIndex];
            chapter.attachments = chapter.attachments.filter(
              (attachment) => attachment.id !== attachmentId,
            );
            library.updatedAt = Date.now();
            await upsertPostgresLibrary(
              normalizeLibraryRecord(library),
              normalizeLibraryViewForScope(collection.scope, collection.view),
            );
            await deleteAttachmentObjects([deletedAttachment]);
            return true;
          }
        }
      }
    }

    return false;
  }
  const store = await readStore({ includeImportDrafts: false });
  const collections: Array<{
    scope: TextbookLibraryScope;
    view?: TextbookLibraryView;
    libraries: TextbookLibraryRecord[];
  }> = [
    { scope: 'official', view: 'draft', libraries: store.officialDraft },
    { scope: 'official', view: 'published', libraries: store.officialPublished },
    { scope: 'personal', libraries: store.personalLibraries },
  ];

  let deletedAttachment: TextbookAttachmentRecord | null = null;

  for (const collection of collections) {
    for (const library of collection.libraries) {
      for (const volume of library.volumes) {
        for (const unit of volume.units) {
          const index = unit.chapters.findIndex((chapter) =>
            chapter.attachments.some((attachment) => attachment.id === attachmentId),
          );
          if (index < 0) {
            continue;
          }

          const chapter = unit.chapters[index];
          const attachmentIndex = chapter.attachments.findIndex(
            (attachment) => attachment.id === attachmentId,
          );
          deletedAttachment = chapter.attachments[attachmentIndex];
          chapter.attachments = chapter.attachments.filter(
            (attachment) => attachment.id !== attachmentId,
          );
          library.updatedAt = Date.now();
          setLibrariesForView(
            store,
            collection.scope,
            upsertLibrary(collection.libraries, normalizeLibraryRecord(library)),
            collection.view,
          );
        }
      }
    }
  }

  if (!deletedAttachment) {
    return false;
  }

  await deleteAttachmentObjects([deletedAttachment]);
  await writeStore(store);
  return true;
}
