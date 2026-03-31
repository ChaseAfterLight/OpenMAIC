export type SystemRole = 'admin' | 'teacher' | 'student';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: SystemRole;
  displayName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

export interface AuthPublicUser {
  id: string;
  email: string;
  role: SystemRole;
  displayName?: string;
  createdAt: number;
  updatedAt: number;
}
