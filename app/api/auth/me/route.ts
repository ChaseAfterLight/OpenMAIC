import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { getAuthSessionFromRequest, hasAnyAdmin } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  try {
    const [session, adminExists] = await Promise.all([getAuthSessionFromRequest(req), hasAnyAdmin()]);
    if (!session) {
      return apiSuccess({
        authenticated: false,
        user: null,
        adminExists,
      });
    }

    return apiSuccess({
      authenticated: true,
      user: session.user,
      adminExists,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to read current user',
      error instanceof Error ? error.message : String(error),
    );
  }
}
