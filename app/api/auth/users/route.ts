import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { changeUserRole, listUsersPublic } from '@/lib/server/auth';
import { requireApiRole } from '@/lib/server/auth-guards';
import type { SystemRole } from '@/lib/server/auth-types';

const ROLE_SET = new Set<SystemRole>(['admin', 'teacher', 'student']);

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }
  try {
    return apiSuccess({
      users: await listUsersPublic(),
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list users',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as {
      userId?: string;
      role?: SystemRole;
    };
    const userId = body.userId?.trim() || '';
    const role = body.role;
    if (!userId || !role) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: userId, role',
      );
    }
    if (!ROLE_SET.has(role)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid role');
    }

    await changeUserRole(userId, role);
    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'User not found');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update user role',
      error instanceof Error ? error.message : String(error),
    );
  }
}
