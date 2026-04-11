'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { refreshAuthSession } from '@/lib/store/auth-session';

export function AuthSessionInit() {
  const pathname = usePathname();

  useEffect(() => {
    void refreshAuthSession();
  }, [pathname]);

  return null;
}
