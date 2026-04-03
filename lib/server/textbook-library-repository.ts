import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import type { PostgresObjectStorageConfig } from '@/lib/server/storage-backend-config';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import {
  deleteObjectsFromStorage,
  ensureObjectStorageBucket,
  getObjectFromStorage,
  putObjectToStorage,
} from '@/lib/server/storage-object-store';
import { fromJsonColumn, getStoragePgPool, toJsonb } from '@/lib/server/storage-postgres';
import {
  buildTextbookAttachmentObjectKey,
  inferFileExtension,
  safeStorageId,
} from '@/lib/server/storage-key-utils';
import {
  buildOfficialTextbookSeedLibraries,
  buildPublishedTextbookSeedLibraries,
} from '@/lib/server/textbook-library-seed';
import type {
  ListTextbookLibrariesOptions,
  SaveTextbookAttachmentInput,
  SaveTextbookLibraryInput,
  TextbookAttachmentLocation,
  TextbookAttachmentRecord,
  TextbookChapterRecord,
  TextbookLibraryRecord,
  TextbookLibraryScope,
  TextbookLibraryStore,
  TextbookLibraryView,
  UpdateTextbookAttachmentProcessingInput,
} from '@/lib/server/textbook-library-types';

const log = createLogger('TextbookLibraryRepository');
const STORE_ROW_ID = 'default';

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

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function createEmptyStore(): TextbookLibraryStore {
  return {
    officialDraft: [],
    officialPublished: [],
    personalLibraries: [],
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

  await writeStore(seededStore);
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
      official_draft JSONB NOT NULL,
      official_published JSONB NOT NULL,
      personal_libraries JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await pool.query(
    `
      INSERT INTO textbook_library_store (
        id,
        official_draft,
        official_published,
        personal_libraries,
        updated_at
      ) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
      ON CONFLICT (id) DO NOTHING
    `,
    [STORE_ROW_ID, toJsonb([]), toJsonb([]), toJsonb([]), Date.now()],
  );
}

export async function ensureTextbookLibraryStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const config = getServerStorageConfig();
      if (config.backend === 'file') {
        await ensureDir(getTextbookDir());
        await ensureDir(getAttachmentDir());
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

async function readStore(): Promise<TextbookLibraryStore> {
  await ensureTextbookLibraryStorageReady();
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    return seedStoreIfNeeded(await readFileStore());
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT official_draft, official_published, personal_libraries, updated_at
      FROM textbook_library_store
      WHERE id = $1
      LIMIT 1
    `,
    [STORE_ROW_ID],
  );
  if (result.rowCount === 0) {
    return createEmptyStore();
  }
  const row = result.rows[0];
  const store = {
    officialDraft: fromJsonColumn<TextbookLibraryRecord[]>(row.official_draft).map(
      normalizeLibraryRecord,
    ),
    officialPublished: fromJsonColumn<TextbookLibraryRecord[]>(row.official_published).map(
      normalizeLibraryRecord,
    ),
    personalLibraries: fromJsonColumn<TextbookLibraryRecord[]>(row.personal_libraries).map(
      normalizeLibraryRecord,
    ),
    updatedAt: Number(row.updated_at) || Date.now(),
  };
  return seedStoreIfNeeded(store);
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

  await getStoragePgPool(config.databaseUrl).query(
    `
      UPDATE textbook_library_store
      SET official_draft = $2::jsonb,
          official_published = $3::jsonb,
          personal_libraries = $4::jsonb,
          updated_at = $5
      WHERE id = $1
    `,
    [
      STORE_ROW_ID,
      toJsonb(nextStore.officialDraft),
      toJsonb(nextStore.officialPublished),
      toJsonb(nextStore.personalLibraries),
      nextStore.updatedAt,
    ],
  );
}

function matchesLibraryQuery(library: TextbookLibraryRecord, options: ListTextbookLibrariesOptions): boolean {
  if (options.ownerUserId && library.ownerUserId !== options.ownerUserId) {
    return false;
  }
  if (options.publisher && library.publisher !== options.publisher) {
    return false;
  }
  if (options.subjectId && library.subjectId !== options.subjectId) {
    return false;
  }
  if (options.gradeId && library.gradeId !== options.gradeId) {
    return false;
  }
  if (options.editionId && library.editionId !== options.editionId) {
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

export async function listTextbookLibraries(
  options: ListTextbookLibrariesOptions,
): Promise<TextbookLibraryRecord[]> {
  const store = await readStore();
  return getLibrariesForView(store, options.scope, options.view)
    .filter((library) => matchesLibraryQuery(library, options))
    .map((library) => structuredClone(library));
}

export async function getTextbookLibrary(input: {
  scope: TextbookLibraryScope;
  libraryId: string;
  view?: TextbookLibraryView;
}): Promise<TextbookLibraryRecord | null> {
  const store = await readStore();
  const library =
    getLibrariesForView(store, input.scope, input.view).find((item) => item.id === input.libraryId) ??
    null;
  return library ? structuredClone(library) : null;
}

export async function saveTextbookLibrary(
  input: SaveTextbookLibraryInput,
): Promise<TextbookLibraryRecord> {
  const store = await readStore();
  const scope = input.library.scope;
  const view = input.view ?? (scope === 'official' ? 'draft' : 'draft');
  const libraries = getLibrariesForView(store, scope, view);
  const existing = libraries.find((library) => library.id === input.library.id);
  const normalized = normalizeLibraryRecord({
    ...input.library,
    id: input.library.id || randomUUID(),
    createdAt: existing?.createdAt ?? input.library.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    publishedAt: scope === 'official' && view === 'published' ? input.library.publishedAt : undefined,
    publishedByUserId:
      scope === 'official' && view === 'published' ? input.library.publishedByUserId : undefined,
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
  const store = await readStore();
  const libraries = getLibrariesForView(store, input.scope, input.view);
  const target = libraries.find((library) => library.id === input.libraryId);
  if (!target) {
    return;
  }

  const attachments = target.volumes.flatMap((volume) =>
    volume.units.flatMap((unit) => unit.chapters.flatMap((chapter) => chapter.attachments)),
  );
  await deleteAttachmentObjects(attachments);
  setLibrariesForView(store, input.scope, removeLibrary(libraries, input.libraryId), input.view);
  await writeStore(store);
}

export async function publishOfficialTextbookLibraries(
  publishedByUserId: string,
): Promise<TextbookLibraryRecord[]> {
  const store = await readStore();
  const publishedAt = Date.now();
  store.officialPublished = store.officialDraft.map((library) =>
    normalizeLibraryRecord({
      ...structuredClone(library),
      publishedAt,
      publishedByUserId,
      updatedAt: publishedAt,
    }),
  );
  await writeStore(store);
  return structuredClone(store.officialPublished);
}

export async function saveTextbookAttachment(
  input: SaveTextbookAttachmentInput,
): Promise<TextbookAttachmentRecord> {
  const store = await readStore();
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
  };

  chapter.attachments = [...chapter.attachments, attachment].sort((a, b) => a.order - b.order);
  library.updatedAt = now;
  setLibrariesForView(store, input.scope, upsertLibrary(libraries, normalizeLibraryRecord(library)), input.view);
  await writeStore(store);
  return structuredClone(attachment);
}

export async function findTextbookAttachment(
  attachmentId: string,
): Promise<TextbookAttachmentLocation | null> {
  const store = await readStore();
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
  const store = await readStore();
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
  const store = await readStore();
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
