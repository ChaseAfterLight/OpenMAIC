import { createLogger } from '@/lib/logger';
import { hybridStorageAdapter } from '@/lib/storage/adapters/hybrid';
import { indexedDbStorageAdapter } from '@/lib/storage/adapters/indexeddb';
import { serverStorageAdapter } from '@/lib/storage/adapters/server';
import { NoopStorageProvider } from '@/lib/storage/providers/noop';
import type { StorageAdapter, StorageDriver, StorageProvider, StorageType } from '@/lib/storage/types';

const log = createLogger('Storage');

const STORAGE_DRIVER_VALUES = ['indexeddb', 'server', 'hybrid'] as const satisfies readonly StorageDriver[];

function isStorageDriver(value: string): value is StorageDriver {
  return (STORAGE_DRIVER_VALUES as readonly string[]).includes(value);
}

function resolveStorageDriver(): StorageDriver {
  const raw =
    process.env.NEXT_PUBLIC_STORAGE_DRIVER ||
    process.env.STORAGE_DRIVER ||
    process.env.NEXT_PUBLIC_APP_STORAGE_DRIVER ||
    'indexeddb';
  return isStorageDriver(raw) ? raw : 'indexeddb';
}

function createStorageAdapter(driver: StorageDriver): StorageAdapter {
  switch (driver) {
    case 'indexeddb':
      return indexedDbStorageAdapter;
    case 'server':
      return serverStorageAdapter;
    case 'hybrid':
      return hybridStorageAdapter;
    default: {
      log.warn(`未知存储驱动 "${driver}"，已回退到 indexeddb`);
      return indexedDbStorageAdapter;
    }
  }
}

const activeDriver = resolveStorageDriver();
const storageAdapter = createStorageAdapter(activeDriver);
let _provider: StorageProvider | null = null;

log.info(`当前使用的存储驱动: ${activeDriver}`);

export function getStorageAdapter(): StorageAdapter {
  return storageAdapter;
}

export function getActiveStorageDriver(): StorageDriver {
  return activeDriver;
}

// 为兼容旧版媒体存储调用，保留原有 provider 入口。
export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    _provider = new NoopStorageProvider();
  }
  return _provider;
}

export type { StorageProvider, StorageType };
