import { describe, expect, it } from 'vitest';
import {
  canAccessRole,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from '@/lib/server/auth';

describe('auth utilities', () => {
  it('normalizes email to lowercase trimmed value', () => {
    expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
  });

  it('validates password minimum length', () => {
    expect(validatePassword('1234567').ok).toBe(false);
    expect(validatePassword('12345678').ok).toBe(true);
  });

  it('hashes and verifies password correctly', async () => {
    const hash = await hashPassword('secret-password');
    expect(hash.startsWith('scrypt:')).toBe(true);
    await expect(verifyPassword('secret-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('checks role access', () => {
    expect(canAccessRole('admin', ['admin'])).toBe(true);
    expect(canAccessRole('teacher', ['admin'])).toBe(false);
    expect(canAccessRole('student', ['teacher', 'student'])).toBe(true);
  });
});
