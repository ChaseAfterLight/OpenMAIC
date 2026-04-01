import path from 'path';

export type ServerStorageBackend = 'file' | 'postgres-object-storage';

export interface FileServerStorageConfig {
  backend: 'file';
  storageRoot: string;
}

export interface PostgresObjectStorageConfig {
  backend: 'postgres-object-storage';
  storageRoot: string;
  databaseUrl: string;
  autoInitialize: boolean;
  objectStorageEndpoint?: string;
  objectStorageRegion: string;
  objectStorageBucket: string;
  objectStorageAccessKeyId?: string;
  objectStorageSecretAccessKey?: string;
  objectStorageForcePathStyle: boolean;
  objectStoragePublicBaseUrl?: string;
  objectKeyPrefix: string;
}

export type ServerStorageRuntimeConfig = FileServerStorageConfig | PostgresObjectStorageConfig;

let cachedConfig: ServerStorageRuntimeConfig | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = readEnv(name);
  if (!value) {
    return defaultValue;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function readRequiredEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`缺少服务端存储环境变量: ${name}`);
  }
  return value;
}

function resolveBackend(): ServerStorageBackend {
  const rawValue =
    readEnv('SERVER_STORAGE_BACKEND') ??
    readEnv('STORAGE_SERVER_BACKEND') ??
    readEnv('SERVER_STORAGE_REPOSITORY') ??
    'file';

  return rawValue === 'postgres-object-storage' ? 'postgres-object-storage' : 'file';
}

export function getServerStorageConfig(): ServerStorageRuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const storageRoot =
    readEnv('SERVER_STORAGE_ROOT') ??
    readEnv('STORAGE_ROOT') ??
    path.join(process.cwd(), 'data', 'storage');
  const backend = resolveBackend();

  if (backend === 'file') {
    cachedConfig = {
      backend,
      storageRoot,
    };
    return cachedConfig;
  }

  cachedConfig = {
    backend,
    storageRoot,
    databaseUrl: readRequiredEnv('SERVER_STORAGE_DATABASE_URL'),
    autoInitialize: readBooleanEnv('SERVER_STORAGE_AUTO_INITIALIZE', false),
    objectStorageEndpoint: readEnv('OBJECT_STORAGE_ENDPOINT'),
    objectStorageRegion: readEnv('OBJECT_STORAGE_REGION') ?? 'auto',
    objectStorageBucket: readRequiredEnv('OBJECT_STORAGE_BUCKET'),
    objectStorageAccessKeyId: readEnv('OBJECT_STORAGE_ACCESS_KEY_ID'),
    objectStorageSecretAccessKey: readEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    objectStorageForcePathStyle: readBooleanEnv('OBJECT_STORAGE_FORCE_PATH_STYLE', true),
    objectStoragePublicBaseUrl: readEnv('OBJECT_STORAGE_PUBLIC_BASE_URL'),
    objectKeyPrefix: readEnv('OBJECT_STORAGE_KEY_PREFIX') ?? 'openmaic',
  };
  return cachedConfig;
}
