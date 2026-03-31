import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { NextRequest } from 'next/server';
import {
  countAuthUsersByRole,
  createAuthSession,
  createAuthUser,
  deleteAuthSession,
  deleteExpiredAuthSessions,
  getAuthSessionById,
  getAuthUserByEmail,
  getAuthUserById,
  listAuthUsers,
  touchAuthSession,
  updateAuthUserRole,
} from '@/lib/server/auth-repository';
import type { AuthPublicUser, AuthUserRecord, SystemRole } from '@/lib/server/auth-types';

const scrypt = promisify(scryptCallback);

const AUTH_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME?.trim() || 'openmaic_session';
const AUTH_SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS || '14');
const AUTH_MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || '8');
const AUTH_ALLOW_PUBLIC_REGISTRATION =
  (process.env.AUTH_ALLOW_PUBLIC_REGISTRATION || 'true').toLowerCase() === 'true';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export interface AuthSessionResult {
  user: AuthPublicUser;
  sessionId: string;
  expiresAt: number;
}

export function toPublicUser(user: AuthUserRecord): AuthPublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

export function getAuthSessionTtlMs(): number {
  return Math.max(1, AUTH_SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000;
}

export function isPublicRegistrationEnabled(): boolean {
  return AUTH_ALLOW_PUBLIC_REGISTRATION;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string): { ok: boolean; reason?: string } {
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `PASSWORD_TOO_SHORT:${AUTH_MIN_PASSWORD_LENGTH}` };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const stored = Buffer.from(parts[2], 'hex');
  const derived = (await scrypt(password, salt, stored.length)) as Buffer;
  if (derived.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(derived, stored);
}

export async function registerUser(input: {
  email: string;
  password: string;
  role?: SystemRole;
  displayName?: string;
}): Promise<AuthPublicUser> {
  const email = normalizeEmail(input.email);
  const passCheck = validatePassword(input.password);
  if (!passCheck.ok) {
    throw new Error(passCheck.reason || 'INVALID_PASSWORD');
  }

  const existing = await getAuthUserByEmail(email);
  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  const created = await createAuthUser({
    email,
    passwordHash: await hashPassword(input.password),
    role: input.role ?? 'student',
    displayName: input.displayName,
  });
  return toPublicUser(created);
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthSessionResult> {
  await deleteExpiredAuthSessions(Date.now());

  const user = await getAuthUserByEmail(normalizeEmail(input.email));
  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const expiresAt = Date.now() + getAuthSessionTtlMs();
  const session = await createAuthSession({
    userId: user.id,
    expiresAt,
  });

  return {
    user: toPublicUser(user),
    sessionId: session.id,
    expiresAt,
  };
}

export async function getAuthSessionFromSessionId(
  sessionId: string | null | undefined,
): Promise<AuthSessionResult | null> {
  if (!sessionId) {
    return null;
  }
  await deleteExpiredAuthSessions(Date.now());
  const session = await getAuthSessionById(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      await deleteAuthSession(session.id);
    }
    return null;
  }
  const user = await getAuthUserById(session.userId);
  if (!user) {
    await deleteAuthSession(session.id);
    return null;
  }
  await touchAuthSession(session.id, Date.now());
  return {
    user: toPublicUser(user),
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

export async function getAuthSessionFromRequest(req: NextRequest): Promise<AuthSessionResult | null> {
  const sessionId = req.cookies.get(getAuthCookieName())?.value;
  return getAuthSessionFromSessionId(sessionId);
}

export async function getAuthSessionFromCookieStore(
  cookieStore: CookieReader,
): Promise<AuthSessionResult | null> {
  const sessionId = cookieStore.get(getAuthCookieName())?.value;
  return getAuthSessionFromSessionId(sessionId);
}

export async function logoutBySessionId(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }
  await deleteAuthSession(sessionId);
}

export function canAccessRole(userRole: SystemRole, allowedRoles: SystemRole[]): boolean {
  return allowedRoles.includes(userRole);
}

export async function countAdmins(): Promise<number> {
  return countAuthUsersByRole('admin');
}

export async function hasAnyAdmin(): Promise<boolean> {
  return (await countAdmins()) > 0;
}

export async function listUsersPublic(): Promise<AuthPublicUser[]> {
  const users = await listAuthUsers();
  return users.map(toPublicUser);
}

export async function changeUserRole(userId: string, role: SystemRole): Promise<void> {
  await updateAuthUserRole(userId, role);
}
