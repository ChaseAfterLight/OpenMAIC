import { existsSync, readFileSync, promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createLogger } from '@/lib/logger';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { fromJsonColumn, getStoragePgPool, toJsonb, type JsonRow } from '@/lib/server/storage-postgres';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/server/provider-config-crypto';

const log = createLogger('ProviderConfigRepository');

export type ProviderKind = 'llm' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'web-search';

export interface ProviderConfigRecord {
  providerKind: ProviderKind;
  providerId: string;
  enabled: boolean;
  apiKeyEncrypted?: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
  providerOptions?: Record<string, unknown>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderConfigResolvedEntry {
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
  providerOptions?: Record<string, unknown>;
}

export interface ProviderConfigResolvedSnapshot {
  llm: Record<string, ProviderConfigResolvedEntry>;
  tts: Record<string, ProviderConfigResolvedEntry>;
  asr: Record<string, ProviderConfigResolvedEntry>;
  pdf: Record<string, ProviderConfigResolvedEntry>;
  image: Record<string, ProviderConfigResolvedEntry>;
  video: Record<string, ProviderConfigResolvedEntry>;
  webSearch: Record<string, ProviderConfigResolvedEntry>;
}

export interface ProviderConfigPublicSnapshot {
  providers: Record<string, { models?: string[]; baseUrl?: string }>;
  tts: Record<string, { baseUrl?: string }>;
  asr: Record<string, { baseUrl?: string }>;
  pdf: Record<string, { baseUrl?: string }>;
  image: Record<string, { baseUrl?: string }>;
  video: Record<string, { baseUrl?: string }>;
  webSearch: Record<string, { baseUrl?: string; providerOptions?: Record<string, unknown> }>;
}

export interface UpsertProviderConfigInput {
  providerKind: ProviderKind;
  providerId: string;
  enabled: boolean;
  apiKey?: string | null;
  baseUrl?: string | null;
  models?: string[] | null;
  proxy?: string | null;
  providerOptions?: Record<string, unknown> | null;
  createdBy?: string;
  updatedBy?: string;
}

interface FileProviderConfigStore {
  records: ProviderConfigRecord[];
}

interface LegacyProviderEntry {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
  providerOptions?: Record<string, unknown>;
}

type LegacyConfig = Record<ProviderKind, Record<string, LegacyProviderEntry>>;

type YamlData = Partial<{
  providers: Record<string, Partial<LegacyProviderEntry>>;
  tts: Record<string, Partial<LegacyProviderEntry>>;
  asr: Record<string, Partial<LegacyProviderEntry>>;
  pdf: Record<string, Partial<LegacyProviderEntry>>;
  image: Record<string, Partial<LegacyProviderEntry>>;
  video: Record<string, Partial<LegacyProviderEntry>>;
  'web-search': Record<string, Partial<LegacyProviderEntry>>;
}>;

const DEFAULT_YAML_FILE = 'server-providers.yml';
let readyPromise: Promise<void> | null = null;

const LLM_ENV_MAP: Record<string, string> = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  KIMI: 'kimi',
  MINIMAX: 'minimax',
  GLM: 'glm',
  SILICONFLOW: 'siliconflow',
  DOUBAO: 'doubao',
  GROK: 'grok',
  OLLAMA: 'ollama',
};

const TTS_ENV_MAP: Record<string, string> = {
  TTS_OPENAI: 'openai-tts',
  TTS_AZURE: 'azure-tts',
  TTS_GLM: 'glm-tts',
  TTS_QWEN: 'qwen-tts',
  TTS_DOUBAO: 'doubao-tts',
  TTS_ELEVENLABS: 'elevenlabs-tts',
  TTS_MINIMAX: 'minimax-tts',
};

const ASR_ENV_MAP: Record<string, string> = {
  ASR_OPENAI: 'openai-whisper',
  ASR_QWEN: 'qwen-asr',
};

const PDF_ENV_MAP: Record<string, string> = {
  PDF_UNPDF: 'unpdf',
  PDF_MINERU: 'mineru',
};

const IMAGE_ENV_MAP: Record<string, string> = {
  IMAGE_SEEDREAM: 'seedream',
  IMAGE_QWEN_IMAGE: 'qwen-image',
  IMAGE_NANO_BANANA: 'nano-banana',
  IMAGE_MINIMAX: 'minimax-image',
  IMAGE_GROK: 'grok-image',
};

const VIDEO_ENV_MAP: Record<string, string> = {
  VIDEO_SEEDANCE: 'seedance',
  VIDEO_KLING: 'kling',
  VIDEO_VEO: 'veo',
  VIDEO_SORA: 'sora',
  VIDEO_MINIMAX: 'minimax-video',
  VIDEO_GROK: 'grok-video',
};

const WEB_SEARCH_ENV_MAP: Record<string, string> = {
  TAVILY: 'tavily',
  BRAVE: 'brave',
  BAIDU: 'baidu',
};

function normalizeString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((item) => item.trim()).filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptions(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function getProviderConfigDir(): string {
  return path.join(getServerStorageConfig().storageRoot, 'provider-config');
}

function getProviderConfigFilePath(): string {
  return path.join(getProviderConfigDir(), 'provider-config-store.json');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readFileStore(): Promise<FileProviderConfigStore> {
  const filePath = getProviderConfigFilePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<FileProviderConfigStore>;
    return {
      records: Array.isArray(parsed.records) ? (parsed.records as ProviderConfigRecord[]) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { records: [] };
    }
    throw error;
  }
}

async function writeFileStore(store: FileProviderConfigStore): Promise<void> {
  const filePath = getProviderConfigFilePath();
  await ensureDir(path.dirname(filePath));
  await writeJsonFileAtomic(filePath, store);
}

function loadYamlFile(filename: string): YamlData {
  try {
    const filePath = path.join(process.cwd(), filename);
    if (!existsSync(filePath)) {
      return {};
    }
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as YamlData;
  } catch (error) {
    log.warn(`[ProviderConfig] Failed to load ${filename}:`, error);
    return {};
  }
}

function parseModelsEnv(prefix: string): string[] | undefined {
  const raw = normalizeString(process.env[`${prefix}_MODELS`]);
  if (!raw) {
    return undefined;
  }
  return raw
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

function loadEnvSection(
  envMap: Record<string, string>,
  yamlSection: Record<string, Partial<LegacyProviderEntry>> | undefined,
  {
    requiresBaseUrl = false,
    keylessProviders = new Set<string>(),
  }: { requiresBaseUrl?: boolean; keylessProviders?: Set<string> } = {},
): Record<string, LegacyProviderEntry> {
  const result: Record<string, LegacyProviderEntry> = {};

  if (yamlSection) {
    for (const [providerId, entry] of Object.entries(yamlSection)) {
      const apiKey = normalizeString(entry.apiKey);
      const baseUrl = normalizeString(entry.baseUrl);
      const models = normalizeStringArray(entry.models);
      const proxy = normalizeString(entry.proxy);
      const providerOptions = normalizeOptions(entry.providerOptions);
      const shouldInclude = requiresBaseUrl
        ? !!baseUrl
        : !!apiKey || (!!baseUrl && keylessProviders.has(providerId));
      if (!shouldInclude) {
        continue;
      }
      result[providerId] = {
        apiKey,
        baseUrl,
        models,
        proxy,
        providerOptions,
      };
    }
  }

  for (const [prefix, providerId] of Object.entries(envMap)) {
    const apiKey = normalizeString(process.env[`${prefix}_API_KEY`]);
    const baseUrl = normalizeString(process.env[`${prefix}_BASE_URL`]);
    const models = parseModelsEnv(prefix);

    if (result[providerId]) {
      if (apiKey) result[providerId].apiKey = apiKey;
      if (baseUrl) result[providerId].baseUrl = baseUrl;
      if (models && models.length > 0) result[providerId].models = models;
      continue;
    }

    const shouldInclude = requiresBaseUrl
      ? !!baseUrl
      : !!apiKey || (!!baseUrl && keylessProviders.has(providerId));
    if (!shouldInclude) {
      continue;
    }

    result[providerId] = {
      apiKey,
      baseUrl,
      models,
    };
  }

  return result;
}

function loadLegacyConfig(): LegacyConfig {
  const yamlData = loadYamlFile(DEFAULT_YAML_FILE);
  return {
    llm: loadEnvSection(LLM_ENV_MAP, yamlData.providers, {
      keylessProviders: new Set(['ollama']),
    }),
    tts: loadEnvSection(TTS_ENV_MAP, yamlData.tts),
    asr: loadEnvSection(ASR_ENV_MAP, yamlData.asr),
    pdf: loadEnvSection(PDF_ENV_MAP, yamlData.pdf, { requiresBaseUrl: true }),
    image: loadEnvSection(IMAGE_ENV_MAP, yamlData.image),
    video: loadEnvSection(VIDEO_ENV_MAP, yamlData.video),
    'web-search': loadEnvSection(WEB_SEARCH_ENV_MAP, yamlData['web-search']),
  };
}

function toSeedRecords(legacyConfig: LegacyConfig): ProviderConfigRecord[] {
  const now = Date.now();
  const seeded: ProviderConfigRecord[] = [];
  for (const [kind, providers] of Object.entries(legacyConfig) as Array<
    [ProviderKind, Record<string, LegacyProviderEntry>]
  >) {
    for (const [providerId, entry] of Object.entries(providers)) {
      seeded.push({
        providerKind: kind,
        providerId,
        enabled: true,
        apiKeyEncrypted: entry.apiKey ? encryptProviderSecret(entry.apiKey) : undefined,
        baseUrl: entry.baseUrl,
        models: entry.models,
        proxy: entry.proxy,
        providerOptions: entry.providerOptions,
        createdBy: 'legacy-bootstrap',
        updatedBy: 'legacy-bootstrap',
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return seeded;
}

function mapRowToRecord(row: JsonRow): ProviderConfigRecord {
  const optionsRaw = fromJsonColumn<Record<string, unknown> | null>(row.options_json);
  return {
    providerKind: String(row.provider_kind) as ProviderKind,
    providerId: String(row.provider_id),
    enabled: Boolean(row.enabled),
    apiKeyEncrypted: normalizeString(row.api_key_encrypted as string | undefined),
    baseUrl: normalizeString(row.base_url as string | undefined),
    models: normalizeStringArray(fromJsonColumn<string[]>(row.models_json)),
    proxy: normalizeString(row.proxy as string | undefined),
    providerOptions: normalizeOptions(optionsRaw) ?? {},
    createdBy: normalizeString(row.created_by as string | undefined),
    updatedBy: normalizeString(row.updated_by as string | undefined),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function ensurePostgresSchema(): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const pool = getStoragePgPool(config.databaseUrl);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS provider_configs (
      provider_kind TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      api_key_encrypted TEXT,
      base_url TEXT,
      models_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      proxy TEXT,
      options_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT,
      updated_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (provider_kind, provider_id)
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_provider_configs_enabled ON provider_configs(provider_kind, enabled);',
  );
}

async function listRecordsRaw(): Promise<ProviderConfigRecord[]> {
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const store = await readFileStore();
    return store.records;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `SELECT * FROM provider_configs ORDER BY provider_kind ASC, provider_id ASC`,
  );
  return result.rows.map(mapRowToRecord);
}

async function upsertRecordRaw(record: ProviderConfigRecord): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const store = await readFileStore();
    const index = store.records.findIndex(
      (item) =>
        item.providerKind === record.providerKind && item.providerId === record.providerId,
    );
    if (index >= 0) {
      store.records[index] = record;
    } else {
      store.records.push(record);
    }
    await writeFileStore(store);
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO provider_configs (
        provider_kind, provider_id, enabled, api_key_encrypted, base_url, models_json, proxy,
        options_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10, $11, $12
      )
      ON CONFLICT (provider_kind, provider_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        base_url = EXCLUDED.base_url,
        models_json = EXCLUDED.models_json,
        proxy = EXCLUDED.proxy,
        options_json = EXCLUDED.options_json,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    `,
    [
      record.providerKind,
      record.providerId,
      record.enabled,
      record.apiKeyEncrypted ?? null,
      record.baseUrl ?? null,
      toJsonb(record.models ?? []),
      record.proxy ?? null,
      toJsonb(record.providerOptions ?? {}),
      record.createdBy ?? null,
      record.updatedBy ?? null,
      record.createdAt,
      record.updatedAt,
    ],
  );
}

async function removeRecordRaw(kind: ProviderKind, providerId: string): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const store = await readFileStore();
    store.records = store.records.filter(
      (item) => !(item.providerKind === kind && item.providerId === providerId),
    );
    await writeFileStore(store);
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `DELETE FROM provider_configs WHERE provider_kind = $1 AND provider_id = $2`,
    [kind, providerId],
  );
}

async function seedIfEmpty(): Promise<void> {
  const current = await listRecordsRaw();
  if (current.length > 0) {
    return;
  }

  const seedRecords = toSeedRecords(loadLegacyConfig());
  if (seedRecords.length === 0) {
    return;
  }

  for (const record of seedRecords) {
    await upsertRecordRaw(record);
  }
  log.info(`[ProviderConfig] Seeded ${seedRecords.length} provider entries from legacy config.`);
}

export async function ensureProviderConfigStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const config = getServerStorageConfig();
      if (config.backend === 'file') {
        await ensureDir(getProviderConfigDir());
        const existing = await readFileStore();
        await writeFileStore(existing);
      } else {
        await ensurePostgresSchema();
      }
      await seedIfEmpty();
      log.info(`Provider 配置存储已就绪: ${config.backend}`);
    })();
  }

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

export async function listProviderConfigRecords(kind?: ProviderKind): Promise<ProviderConfigRecord[]> {
  await ensureProviderConfigStorageReady();
  const records = await listRecordsRaw();
  if (!kind) {
    return records;
  }
  return records.filter((item) => item.providerKind === kind);
}

export async function getProviderConfigRecord(
  providerKind: ProviderKind,
  providerId: string,
): Promise<ProviderConfigRecord | null> {
  await ensureProviderConfigStorageReady();
  const records = await listRecordsRaw();
  return (
    records.find(
      (item) => item.providerKind === providerKind && item.providerId === providerId,
    ) ?? null
  );
}

export async function upsertProviderConfigRecord(
  input: UpsertProviderConfigInput,
): Promise<ProviderConfigRecord> {
  await ensureProviderConfigStorageReady();
  const now = Date.now();
  const existing = await getProviderConfigRecord(input.providerKind, input.providerId);
  const createdAt = existing?.createdAt ?? now;
  let apiKeyEncrypted = existing?.apiKeyEncrypted;
  if (input.apiKey === null) {
    apiKeyEncrypted = undefined;
  } else if (typeof input.apiKey === 'string') {
    const normalizedKey = input.apiKey.trim();
    apiKeyEncrypted = normalizedKey ? encryptProviderSecret(normalizedKey) : existing?.apiKeyEncrypted;
  }

  const normalizedModels =
    input.models === null ? undefined : normalizeStringArray(input.models ?? existing?.models);
  const normalizedOptions =
    input.providerOptions === null
      ? {}
      : normalizeOptions(input.providerOptions ?? existing?.providerOptions) ?? {};

  const next: ProviderConfigRecord = {
    providerKind: input.providerKind,
    providerId: input.providerId,
    enabled: input.enabled,
    apiKeyEncrypted,
    baseUrl:
      input.baseUrl === null
        ? undefined
        : normalizeString(input.baseUrl) ?? existing?.baseUrl,
    models: normalizedModels,
    proxy:
      input.proxy === null
        ? undefined
        : normalizeString(input.proxy) ?? existing?.proxy,
    providerOptions: normalizedOptions,
    createdBy: existing?.createdBy ?? input.createdBy,
    updatedBy: input.updatedBy,
    createdAt,
    updatedAt: now,
  };
  await upsertRecordRaw(next);
  return next;
}

export async function deleteProviderConfigRecord(
  providerKind: ProviderKind,
  providerId: string,
): Promise<void> {
  await ensureProviderConfigStorageReady();
  await removeRecordRaw(providerKind, providerId);
}

function toResolvedEntry(record: ProviderConfigRecord): ProviderConfigResolvedEntry {
  let apiKey = '';
  if (record.apiKeyEncrypted) {
    try {
      apiKey = decryptProviderSecret(record.apiKeyEncrypted);
    } catch (error) {
      log.warn(
        `Failed to decrypt provider secret for ${record.providerKind}:${record.providerId}`,
        error,
      );
    }
  }

  return {
    enabled: record.enabled,
    apiKey,
    baseUrl: record.baseUrl,
    models: record.models,
    proxy: record.proxy,
    providerOptions: record.providerOptions,
  };
}

export async function getResolvedProviderConfigSnapshot(): Promise<ProviderConfigResolvedSnapshot> {
  const records = await listProviderConfigRecords();
  const snapshot: ProviderConfigResolvedSnapshot = {
    llm: {},
    tts: {},
    asr: {},
    pdf: {},
    image: {},
    video: {},
    webSearch: {},
  };

  for (const record of records.filter((item) => item.enabled)) {
    const resolved = toResolvedEntry(record);
    if (record.providerKind === 'web-search') {
      snapshot.webSearch[record.providerId] = resolved;
      continue;
    }
    snapshot[record.providerKind][record.providerId] = resolved;
  }

  return snapshot;
}

export async function getPublicProviderConfigSnapshot(): Promise<ProviderConfigPublicSnapshot> {
  const records = await listProviderConfigRecords();
  const snapshot: ProviderConfigPublicSnapshot = {
    providers: {},
    tts: {},
    asr: {},
    pdf: {},
    image: {},
    video: {},
    webSearch: {},
  };

  for (const record of records.filter((item) => item.enabled)) {
    if (record.providerKind === 'llm') {
      snapshot.providers[record.providerId] = {
        ...(record.models?.length ? { models: record.models } : {}),
        ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
      };
      continue;
    }

    if (record.providerKind === 'web-search') {
      snapshot.webSearch[record.providerId] = {
        ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
        ...(record.providerOptions ? { providerOptions: record.providerOptions } : {}),
      };
      continue;
    }

    snapshot[record.providerKind][record.providerId] = {
      ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
    };
  }

  return snapshot;
}
