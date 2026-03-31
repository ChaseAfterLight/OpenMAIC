import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { getAuthCookieName, logoutBySessionId } from '@/lib/server/auth';
import { clearAuthCookie } from '@/lib/server/auth-cookie';

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.cookies.get(getAuthCookieName())?.value;
    await logoutBySessionId(sessionId);

    const response = apiSuccess({ authenticated: false });
    clearAuthCookie(response);
    return response;
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Logout failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
