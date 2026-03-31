'use client';

import { create } from 'zustand';
import type { AuthPublicUser } from '@/lib/server/auth-types';

interface AuthSessionState {
  initialized: boolean;
  authenticated: boolean;
  adminExists: boolean;
  user: AuthPublicUser | null;
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
