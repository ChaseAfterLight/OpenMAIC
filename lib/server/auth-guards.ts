import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { canAccessRole, getAuthSessionFromCookieStore, getAuthSessionFromRequest } from '@/lib/server/auth';
import type { AuthPublicUser, SystemRole } from '@/lib/server/auth-types';

export async function requireApiUser(
  req: NextRequest,
): Promise<{ user: AuthPublicUser } | { response: ReturnType<typeof apiError> }> {
  const session = await getAuthSessionFromRequest(req);
  if (!session) {
    return {
      response: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required'),
    };
  }
  return { user: session.user };
}

export async function requireApiRole(
  req: NextRequest,
  roles: SystemRole[],
): Promise<{ user: AuthPublicUser } | { response: ReturnType<typeof apiError> }> {
  const auth = await requireApiUser(req);
  if ('response' in auth) {
    return auth;
  }
  if (!canAccessRole(auth.user.role, roles)) {
    return {
      response: apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient role'),
    };
  }
  return auth;
}

export async function requirePageRole(
  roles: SystemRole[],
  options?: { loginPath?: string; forbiddenPath?: string },
): Promise<AuthPublicUser> {
  const cookieStore = await cookies();
  const session = await getAuthSessionFromCookieStore(cookieStore);
  if (!session) {
    redirect(options?.loginPath ?? '/auth/login');
  }
  if (!canAccessRole(session.user.role, roles)) {
    redirect(options?.forbiddenPath ?? '/');
  }
  return session.user;
}

export async function requirePageUser(loginPath = '/auth/login'): Promise<AuthPublicUser> {
  const cookieStore = await cookies();
  const session = await getAuthSessionFromCookieStore(cookieStore);
  if (!session) {
    redirect(loginPath);
  }
  return session.user;
}
