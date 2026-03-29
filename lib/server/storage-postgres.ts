import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const poolCache = new Map<string, Pool>();

export function getStoragePgPool(connectionString: string): Pool {
  const existing = poolCache.get(connectionString);
  if (existing) {
    return existing;
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  poolCache.set(connectionString, pool);
  return pool;
}

export async function withStorageTransaction<T>(
  connectionString: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getStoragePgPool(connectionString).connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJsonColumn<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

export function getNullableText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getNullableNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    return Number(value);
  }
  return undefined;
}

export type JsonRow = QueryResultRow;
