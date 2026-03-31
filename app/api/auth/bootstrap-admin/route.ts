import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { hasAnyAdmin, loginUser, registerUser } from '@/lib/server/auth';
import { setAuthCookie } from '@/lib/server/auth-cookie';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const email = body.email?.trim() || '';
    const password = body.password || '';
    const displayName = body.displayName?.trim() || undefined;

    if (!email || !password) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: email, password',
      );
    }

    if (await hasAnyAdmin()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Admin already initialized');
    }

    await registerUser({
      email,
      password,
      displayName,
      role: 'admin',
    });
    const session = await loginUser({ email, password });
    const response = apiSuccess({
      authenticated: true,
      user: session.user,
    });
    setAuthCookie(response, session.sessionId, session.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Email already exists');
      }
      if (error.message.startsWith('PASSWORD_TOO_SHORT:')) {
        const minLength = error.message.split(':')[1] || '8';
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          400,
          `Password must be at least ${minLength} characters`,
        );
      }
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Admin initialization failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
