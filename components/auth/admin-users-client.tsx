'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Users, ShieldAlert, UserX, ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { AuthPublicUser, SystemRole } from '@/lib/server/auth-types';

const ROLES: SystemRole[] = ['admin', 'teacher', 'student'];

// --- 视觉辅助组件 (无需额外安装) ---

// 1. 提取名字首字母作为头像
const getInitials = (name?: string | null) => {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
};

// 2. 角色彩色标签
const RoleBadge = ({ role, label }: { role: SystemRole; label: string }) => {
  const styles = {
    admin: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
    teacher: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
    student: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  };

  const icons = {
    admin: <ShieldAlert className="w-3 h-3 mr-1" />,
    teacher: <Users className="w-3 h-3 mr-1" />,
    student: <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[role]}`}>
      {icons[role]}
      <span>{label}</span>
    </span>
  );
};

export function AdminUsersClient() {
  const { t } = useI18n();
  const router = useRouter();
  const isZh = t('auth.roleAdmin') === '管理员';
  const textbookLabel = isZh ? '教材目录' : 'Textbooks';

  const [users, setUsers] = useState<AuthPublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const roleLabels: Record<SystemRole, string> = {
    admin: t('auth.roleAdmin'),
    teacher: t('auth.roleTeacher'),
    student: t('auth.roleStudent'),
  };

  // 1. 独立的数据加载逻辑
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('auth.loadingUsers'));
      setUsers((data.users || []) as AuthPublicUser[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('auth.loadingUsers'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // 2. 乐观更新角色 (Optimistic Update)
  async function updateRole(userId: string, newRole: SystemRole) {
    const previousUsers = [...users];
    
    // 立即更新 UI
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));

    try {
      const res = await fetch('/api/auth/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('auth.roleUpdateFailed'));
      }
      
      toast.success(t('auth.roleUpdated'));
    } catch (e) {
      // 回滚状态
      setUsers(previousUsers);
      toast.error(e instanceof Error ? e.message : t('auth.roleUpdateFailed'));
    }
  }

  // 3. 过滤逻辑
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const lowerQuery = searchQuery.toLowerCase();
    return users.filter(user => 
      user.email?.toLowerCase().includes(lowerQuery) || 
      user.displayName?.toLowerCase().includes(lowerQuery)
    );
  }, [users, searchQuery]);

  return (
    <main className="min-h-[100dvh] bg-slate-50/50 dark:bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
              className="shrink-0 rounded-full border-slate-200 bg-white/90 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 dark:hover:bg-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('generation.backToHome')}
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('auth.userManagement')}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {t('auth.userManagementDesc')}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push('/admin/textbooks')}>
            <BookOpen className="mr-2 h-4 w-4" />
            {textbookLabel}
          </Button>
        </div>

        {/* Main Card */}
        <Card className="border-slate-200 shadow-sm overflow-hidden dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 pb-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="search"
                  placeholder={t('auth.searchUsersPlaceholder')}
                  className="w-full pl-9 bg-white dark:bg-slate-950 transition-all focus-visible:ring-2"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <Button 
                onClick={() => void loadUsers()} 
                variant="outline" 
                className="w-full sm:w-auto shadow-sm"
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {t('auth.refresh')}
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 bg-white dark:bg-slate-950">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-medium">{t('auth.userProfile')}</th>
                    <th scope="col" className="px-6 py-4 font-medium">{t('auth.systemRole')}</th>
                    <th scope="col" className="px-6 py-4 font-medium text-right">{t('auth.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  
                  {/* Loading State */}
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                            <div className="space-y-2">
                              <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                              <div className="h-3 w-40 rounded bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="h-9 w-[130px] rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    
                    /* Empty State */
                    <tr>
                      <td colSpan={3} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3 text-slate-500 dark:text-slate-400">
                          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                            <UserX className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                            {searchQuery ? t('auth.noUsersFound') : t('auth.noUsers')}
                          </p>
                          <p className="text-sm">
                            {searchQuery ? t('auth.noUsersMatch') : t('auth.inviteUsersHint')}
                          </p>
                        </div>
                      </td>
                    </tr>
                    
                  ) : (
                    
                    /* Data Rows */
                    filteredUsers.map((user) => (
                      <tr 
                        key={user.id} 
                        className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold text-sm border border-indigo-100 dark:border-indigo-800/50">
                              {getInitials(user.displayName)}
                            </div>
                            {/* Info */}
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {user.displayName || <span className="text-slate-400 italic">{t('auth.noName')}</span>}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {user.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <RoleBadge role={user.role} label={roleLabels[user.role]} />
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex justify-end opacity-100 sm:opacity-70 transition-opacity group-hover:opacity-100">
                            <Select
                              value={user.role}
                              onValueChange={(value) => void updateRole(user.id, value as SystemRole)}
                            >
                              <SelectTrigger className="h-9 w-[130px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((role) => (
                                  <SelectItem key={role} value={role} className="capitalize">
                                    {roleLabels[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
