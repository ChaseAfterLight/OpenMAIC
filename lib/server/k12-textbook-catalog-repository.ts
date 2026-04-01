import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import type {
  K12TextbookCatalogSnapshot,
  K12TextbookCatalogState,
} from '@/lib/k12-textbook-catalog/types';
import type { K12TextbookEdition } from '@/lib/module-host/types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { getSeedK12TextbookEditions } from '@/lib/server/k12-textbook-catalog-seed';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { getStoragePgPool } from '@/lib/server/storage-postgres';

const log = createLogger('K12TextbookCatalogRepository');
const DEFAULT_CATALOG_ID = 'k12-default';

let readyPromise: Promise<void> | null = null;

function getCatalogDir(): string {
  return path.join(getServerStorageConfig().storageRoot, 'textbooks');
}

function getCatalogFilePath(): string {
  return path.join(getCatalogDir(), 'catalog.json');
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildSeedState(now = Date.now()): K12TextbookCatalogState {
  const editions = getSeedK12TextbookEditions();
  return {
    draft: {
      editions,
      version: 1,
      updatedAt: now,
      updatedBy: 'seed',
      publishedAt: now,
      publishedBy: 'seed',
    },
    published: {
      editions: cloneJson(editions),
      version: 1,
      updatedAt: now,
      updatedBy: 'seed',
      publishedAt: now,
      publishedBy: 'seed',
    },
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readFileState(): Promise<K12TextbookCatalogState | null> {
  try {
    const content = await fs.readFile(getCatalogFilePath(), 'utf-8');
    return JSON.parse(content) as K12TextbookCatalogState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeFileState(state: K12TextbookCatalogState): Promise<void> {
  await ensureDir(getCatalogDir());
  await writeJsonFileAtomic(getCatalogFilePath(), state);
}

async function ensurePostgresSchema(): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const pool = getStoragePgPool(config.databaseUrl);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS k12_textbook_catalogs (
      catalog_id TEXT PRIMARY KEY,
      draft_json JSONB NOT NULL,
      published_json JSONB,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
}

async function readPostgresState(): Promise<K12TextbookCatalogState | null> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return null;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT draft_json, published_json
      FROM k12_textbook_catalogs
      WHERE catalog_id = $1
      LIMIT 1
    `,
    [DEFAULT_CATALOG_ID],
  );
  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    draft: cloneJson(row.draft_json as K12TextbookCatalogSnapshot),
    published: row.published_json
      ? cloneJson(row.published_json as K12TextbookCatalogSnapshot)
      : null,
  };
}

async function writePostgresState(state: K12TextbookCatalogState): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const now = Date.now();
  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO k12_textbook_catalogs (catalog_id, draft_json, published_json, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
      ON CONFLICT (catalog_id)
      DO UPDATE SET draft_json = EXCLUDED.draft_json, published_json = EXCLUDED.published_json, updated_at = EXCLUDED.updated_at
    `,
    [
      DEFAULT_CATALOG_ID,
      JSON.stringify(state.draft),
      state.published ? JSON.stringify(state.published) : null,
      now,
      now,
    ],
  );
}

async function ensureSeededState(): Promise<void> {
  const config = getServerStorageConfig();
  const seed = buildSeedState();

  if (config.backend === 'file') {
    await ensureDir(getCatalogDir());
    const existing = await readFileState();
    if (!existing) {
      await writeFileState(seed);
    }
    return;
  }

  await ensurePostgresSchema();
  const existing = await readPostgresState();
  if (!existing) {
    await writePostgresState(seed);
  }
}

async function readState(): Promise<K12TextbookCatalogState> {
  await ensureK12TextbookCatalogReady();
  const config = getServerStorageConfig();
  const state =
    config.backend === 'file' ? await readFileState() : await readPostgresState();
  if (!state) {
    const seeded = buildSeedState();
    if (config.backend === 'file') {
      await writeFileState(seeded);
    } else {
      await writePostgresState(seeded);
    }
    return seeded;
  }
  return {
    draft: cloneJson(state.draft),
    published: state.published ? cloneJson(state.published) : null,
  };
}

async function writeState(state: K12TextbookCatalogState): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    await writeFileState(state);
    return;
  }
  await writePostgresState(state);
}

function normalizeSnapshot(snapshot: K12TextbookCatalogSnapshot): K12TextbookCatalogSnapshot {
  return {
    ...snapshot,
    editions: cloneJson(snapshot.editions),
  };
}

export async function ensureK12TextbookCatalogReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureSeededState();
      log.info(`教材目录存储已就绪: ${getServerStorageConfig().backend}`);
    })();
  }

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

export async function getK12TextbookCatalogState(): Promise<K12TextbookCatalogState> {
  return readState();
}

export async function getPublishedK12TextbookCatalog(): Promise<K12TextbookCatalogSnapshot | null> {
  const state = await readState();
  return state.published ? normalizeSnapshot(state.published) : null;
}

export async function saveK12TextbookCatalogDraft(input: {
  editions: K12TextbookEdition[];
  updatedBy: string;
}): Promise<K12TextbookCatalogSnapshot> {
  const state = await readState();
  const nextDraft: K12TextbookCatalogSnapshot = {
    editions: cloneJson(input.editions),
    version: state.draft.version + 1,
    updatedAt: Date.now(),
    updatedBy: input.updatedBy,
  };
  await writeState({
    draft: nextDraft,
    published: state.published,
  });
  return normalizeSnapshot(nextDraft);
}

export async function publishK12TextbookCatalog(input: {
  publishedBy: string;
}): Promise<K12TextbookCatalogSnapshot> {
  const state = await readState();
  const publishedAt = Date.now();
  const nextPublished: K12TextbookCatalogSnapshot = {
    ...cloneJson(state.draft),
    editions: cloneJson(state.draft.editions),
    publishedAt,
    publishedBy: input.publishedBy,
  };
  await writeState({
    draft: state.draft,
    published: nextPublished,
  });
  return normalizeSnapshot(nextPublished);
}

