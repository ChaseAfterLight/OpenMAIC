import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { getStoragePgPool } from '@/lib/server/storage-postgres';
import type { AuthSessionRecord, AuthUserRecord, SystemRole } from '@/lib/server/auth-types';

const log = createLogger('AuthRepository');

interface FileAuthStore {
  users: AuthUserRecord[];
  sessions: AuthSessionRecord[];
}

let readyPromise: Promise<void> | null = null;

function getAuthDir(): string {
  return path.join(getServerStorageConfig().storageRoot, 'auth');
}

function getFileStorePath(): string {
  return path.join(getAuthDir(), 'auth-store.json');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readFileStore(): Promise<FileAuthStore> {
  const filePath = getFileStorePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<FileAuthStore>;
    return {
      users: Array.isArray(parsed.users) ? (parsed.users as AuthUserRecord[]) : [],
      sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as AuthSessionRecord[]) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { users: [], sessions: [] };
    }
    throw error;
  }
}

async function writeFileStore(store: FileAuthStore): Promise<void> {
  const filePath = getFileStorePath();
  await ensureDir(path.dirname(filePath));
  await writeJsonFileAtomic(filePath, store);
}

async function ensurePostgresSchema(): Promise<void> {
  const config = getServerStorageConfig();
  if (config.backend !== 'postgres-object-storage') {
    return;
  }

  const pool = getStoragePgPool(config.databaseUrl);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role);');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      last_seen_at BIGINT NOT NULL
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);');
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);',
  );
}

export async function ensureAuthStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const config = getServerStorageConfig();
      if (config.backend === 'file') {
        await ensureDir(getAuthDir());
        const existing = await readFileStore();
        await writeFileStore(existing);
        log.info('认证存储已就绪: file');
        return;
      }

      await ensurePostgresSchema();
      log.info('认证存储已就绪: postgres-object-storage');
    })();
  }

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapPublicUser(row: AuthUserRecord): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createAuthUser(input: {
  email: string;
  passwordHash: string;
  role: SystemRole;
  displayName?: string;
}): Promise<AuthUserRecord> {
  await ensureAuthStorageReady();

  const email = normalizeEmail(input.email);
  const now = Date.now();
  const created: AuthUserRecord = {
    id: randomUUID(),
    email,
    passwordHash: input.passwordHash,
    role: input.role,
    displayName: input.displayName?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const store = await readFileStore();
    if (store.users.some((u) => normalizeEmail(u.email) === email)) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }
    store.users.push(created);
    await writeFileStore(store);
    return mapPublicUser(created);
  }

  try {
    await getStoragePgPool(config.databaseUrl).query(
      `
      INSERT INTO auth_users (id, email, password_hash, role, display_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        created.id,
        created.email,
        created.passwordHash,
        created.role,
        created.displayName ?? null,
        created.createdAt,
        created.updatedAt,
      ],
    );
  } catch (error) {
    const detail = String((error as { code?: string }).code ?? '');
    if (detail === '23505') {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }
    throw error;
  }

  return created;
}

export async function getAuthUserByEmail(emailInput: string): Promise<AuthUserRecord | null> {
  await ensureAuthStorageReady();
  const email = normalizeEmail(emailInput);
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    return store.users.find((u) => normalizeEmail(u.email) === email) ?? null;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT id, email, password_hash, role, display_name, created_at, updated_at
      FROM auth_users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );
  if (result.rowCount === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role) as SystemRole,
    displayName: (row.display_name as string | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getAuthUserById(id: string): Promise<AuthUserRecord | null> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    return store.users.find((u) => u.id === id) ?? null;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT id, email, password_hash, role, display_name, created_at, updated_at
      FROM auth_users
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  if (result.rowCount === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role) as SystemRole,
    displayName: (row.display_name as string | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listAuthUsers(): Promise<AuthUserRecord[]> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    return [...store.users].sort((a, b) => b.createdAt - a.createdAt);
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT id, email, password_hash, role, display_name, created_at, updated_at
      FROM auth_users
      ORDER BY created_at DESC
    `,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role) as SystemRole,
    displayName: (row.display_name as string | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export async function updateAuthUserRole(userId: string, role: SystemRole): Promise<void> {
  await ensureAuthStorageReady();
  const now = Date.now();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    const target = store.users.find((u) => u.id === userId);
    if (!target) {
      throw new Error('USER_NOT_FOUND');
    }
    target.role = role;
    target.updatedAt = now;
    await writeFileStore(store);
    return;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    'UPDATE auth_users SET role = $2, updated_at = $3 WHERE id = $1',
    [userId, role, now],
  );
  if (result.rowCount === 0) {
    throw new Error('USER_NOT_FOUND');
  }
}

export async function countAuthUsersByRole(role: SystemRole): Promise<number> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    return store.users.filter((u) => u.role === role).length;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    'SELECT COUNT(*)::int AS count FROM auth_users WHERE role = $1',
    [role],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function createAuthSession(input: {
  userId: string;
  expiresAt: number;
}): Promise<AuthSessionRecord> {
  await ensureAuthStorageReady();
  const now = Date.now();
  const created: AuthSessionRecord = {
    id: randomUUID(),
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: now,
    lastSeenAt: now,
  };
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    store.sessions.push(created);
    await writeFileStore(store);
    return created;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO auth_sessions (id, user_id, expires_at, created_at, last_seen_at)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [created.id, created.userId, created.expiresAt, created.createdAt, created.lastSeenAt],
  );
  return created;
}

export async function getAuthSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    return store.sessions.find((s) => s.id === sessionId) ?? null;
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT id, user_id, expires_at, created_at, last_seen_at
      FROM auth_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId],
  );
  if (result.rowCount === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}

export async function touchAuthSession(sessionId: string, lastSeenAt: number): Promise<void> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    const target = store.sessions.find((s) => s.id === sessionId);
    if (!target) {
      return;
    }
    target.lastSeenAt = lastSeenAt;
    await writeFileStore(store);
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    'UPDATE auth_sessions SET last_seen_at = $2 WHERE id = $1',
    [sessionId, lastSeenAt],
  );
}

export async function deleteAuthSession(sessionId: string): Promise<void> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    store.sessions = store.sessions.filter((s) => s.id !== sessionId);
    await writeFileStore(store);
    return;
  }

  await getStoragePgPool(config.databaseUrl).query('DELETE FROM auth_sessions WHERE id = $1', [
    sessionId,
  ]);
}

export async function deleteExpiredAuthSessions(now: number): Promise<void> {
  await ensureAuthStorageReady();
  const config = getServerStorageConfig();

  if (config.backend === 'file') {
    const store = await readFileStore();
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((s) => s.expiresAt > now);
    if (store.sessions.length !== before) {
      await writeFileStore(store);
    }
    return;
  }

  await getStoragePgPool(config.databaseUrl).query('DELETE FROM auth_sessions WHERE expires_at <= $1', [
    now,
  ]);
}
