import { indexedDbStorageAdapter } from '@/lib/storage/adapters/indexeddb';
import type { StorageAdapter } from '@/lib/storage/types';

/**
 * Hybrid adapter scaffold.
 * Current behavior keeps compatibility by using local IndexedDB.
 * Future iterations can add background sync here.
 */
export const hybridStorageAdapter: StorageAdapter = indexedDbStorageAdapter;
