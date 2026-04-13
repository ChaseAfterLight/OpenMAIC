import { NextRequest, NextResponse } from 'next/server';

function resolveConfiguredModuleId() {
  return (
    process.env.NEXT_PUBLIC_APP_MODULE ||
    process.env.APP_MODULE ||
    process.env.NEXT_PUBLIC_DEFAULT_MODULE ||
    process.env.DEFAULT_MODULE ||
    'core'
  );
}

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function proxy(request: NextRequest) {
  const accessCode = process.env.ACCESS_CODE;
  const { pathname } = request.nextUrl;

  if (accessCode) {
    if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
      return NextResponse.next();
    }

    const cookie = request.cookies.get('openmaic_access');
    if (!cookie?.value || !(await verifyToken(cookie.value, accessCode))) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
          { status: 401 },
        );
      }

      return NextResponse.next();
    }
  }

  if (pathname === '/' && resolveConfiguredModuleId() === 'k12') {
    return NextResponse.rewrite(new URL('/k12', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
