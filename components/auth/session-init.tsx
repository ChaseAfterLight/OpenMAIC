'use client';

import { useEffect } from 'react';
import { useAuthSessionStore } from '@/lib/store/auth-session';
import type { AuthPublicUser } from '@/lib/server/auth-types';

export function AuthSessionInit() {
  const setSession = useAuthSessionStore((s) => s.setSession);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setSession({
          initialized: true,
          authenticated: Boolean(data.authenticated),
          adminExists: Boolean(data.adminExists),
          user: (data.user as AuthPublicUser | null) ?? null,
        });
      } catch {
        if (cancelled) return;
        setSession({
          initialized: true,
          authenticated: false,
          adminExists: false,
          user: null,
        });
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  return null;
}
