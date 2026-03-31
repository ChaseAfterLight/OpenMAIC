import type { NextResponse } from 'next/server';
import { getAuthCookieName } from '@/lib/server/auth';

function isSecureRequest(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookie(response: NextResponse, sessionId: string, expiresAt: number): void {
  response.cookies.set(getAuthCookieName(), sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(),
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(getAuthCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(),
    path: '/',
    expires: new Date(0),
  });
}
