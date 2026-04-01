import type { K12TextbookEdition } from '@/lib/module-host/types';

export interface K12TextbookCatalogSnapshot {
  editions: K12TextbookEdition[];
  version: number;
  updatedAt: number;
  updatedBy?: string;
  publishedAt?: number;
  publishedBy?: string;
}

export interface K12TextbookCatalogState {
  draft: K12TextbookCatalogSnapshot;
  published: K12TextbookCatalogSnapshot | null;
}

