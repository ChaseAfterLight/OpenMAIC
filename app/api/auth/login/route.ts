import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { loginUser } from '@/lib/server/auth';
import { setAuthCookie } from '@/lib/server/auth-cookie';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = body.email?.trim() || '';
    const password = body.password || '';

    if (!email || !password) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: email, password',
      );
    }

    const session = await loginUser({ email, password });
    const response = apiSuccess({
      authenticated: true,
      user: session.user,
    });
    setAuthCookie(response, session.sessionId, session.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid email or password');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Login failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
