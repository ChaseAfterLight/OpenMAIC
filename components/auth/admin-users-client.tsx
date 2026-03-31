'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { AuthPublicUser, SystemRole } from '@/lib/server/auth-types';

const ROLES: SystemRole[] = ['admin', 'teacher', 'student'];

export function AdminUsersClient() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AuthPublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('auth.loadingUsers'));
        return;
      }
      setUsers((data.users || []) as AuthPublicUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.loadingUsers'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function updateRole(userId: string, role: SystemRole) {
    const res = await fetch('/api/auth/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t('settings.saveFailed'));
      return;
    }
    await reload();
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('auth.userManagement')}</CardTitle>
            <Button onClick={() => void reload()} variant="outline">
              {t('auth.refresh')}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? <p>{t('auth.loadingUsers')}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {!loading && users.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('auth.noUsers')}</p>
            ) : null}
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3"
                >
                  <div>
                    <p className="font-medium">{user.displayName || user.email}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Select value={user.role} onValueChange={(value) => void updateRole(user.id, value as SystemRole)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
