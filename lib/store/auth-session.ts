'use client';

import { create } from 'zustand';
import type { AuthPublicUser } from '@/lib/server/auth-types';

export interface AuthSessionSnapshot {
  initialized: boolean;
  authenticated: boolean;
  adminExists: boolean;
  user: AuthPublicUser | null;
}

interface AuthSessionState extends AuthSessionSnapshot {
  setSession: (payload: {
    initialized: boolean;
    authenticated: boolean;
    adminExists: boolean;
    user: AuthPublicUser | null;
  }) => void;
}

export const useAuthSessionStore = create<AuthSessionState>()((set) => ({
  initialized: false,
  authenticated: false,
  adminExists: false,
  user: null,
  setSession: (payload) => set(payload),
}));

export function setAuthSession(snapshot: AuthSessionSnapshot) {
  useAuthSessionStore.getState().setSession(snapshot);
}

export async function refreshAuthSession(): Promise<AuthSessionSnapshot> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    const data = await res.json();
    const snapshot: AuthSessionSnapshot = {
      initialized: true,
      authenticated: Boolean(data.authenticated),
      adminExists: Boolean(data.adminExists),
      user: (data.user as AuthPublicUser | null) ?? null,
    };
    setAuthSession(snapshot);
    return snapshot;
  } catch {
    const snapshot: AuthSessionSnapshot = {
      initialized: true,
      authenticated: false,
      adminExists: false,
      user: null,
    };
    setAuthSession(snapshot);
    return snapshot;
  }
}
