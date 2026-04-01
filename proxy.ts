import { NextResponse, type NextRequest } from 'next/server';

function resolveConfiguredModuleId() {
  return (
    process.env.NEXT_PUBLIC_APP_MODULE ||
    process.env.APP_MODULE ||
    process.env.NEXT_PUBLIC_DEFAULT_MODULE ||
    process.env.DEFAULT_MODULE ||
    'core'
  );
}

export function proxy(request: NextRequest) {
  if (resolveConfiguredModuleId() !== 'k12') {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL('/k12', request.url));
}

export const config = {
  matcher: ['/'],
};
