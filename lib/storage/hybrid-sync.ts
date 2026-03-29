import { createLogger } from '@/lib/logger';

const log = createLogger('HybridSync');
const STORAGE_KEY = 'openmaic.hybrid-sync-state';

export type HybridSyncStatus = 'synced' | 'pending' | 'failed';

export interface HybridSyncRecord {
  stageId: string;
  status: HybridSyncStatus;
  updatedAt: number;
  message?: string;
}

type Listener = (record: HybridSyncRecord) => void;

const listeners = new Set<Listener>();

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll(): Record<string, HybridSyncRecord> {
  if (!canUseStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, HybridSyncRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, HybridSyncRecord>): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore localStorage failures
  }
}

export function setHybridSyncState(
  stageId: string,
  status: HybridSyncStatus,
  message?: string,
): HybridSyncRecord {
  const record: HybridSyncRecord = {
    stageId,
    status,
    updatedAt: Date.now(),
    ...(message ? { message } : {}),
  };
  const all = readAll();
  all[stageId] = record;
  writeAll(all);
  listeners.forEach((listener) => listener(record));
  if (status === 'failed') {
    log.warn(`课堂 ${stageId} 同步失败: ${message || '未知错误'}`);
  } else {
    log.info(`课堂 ${stageId} 同步状态: ${status}`);
  }
  return record;
}

export function getHybridSyncState(stageId: string): HybridSyncRecord | undefined {
  return readAll()[stageId];
}

export function subscribeHybridSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
