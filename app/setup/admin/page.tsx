'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function SetupAdminPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setIsCheckingAuth(false);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.adminExists === false) {
          setIsCheckingAuth(false);
          return;
        }

        if (data.authenticated) {
          router.replace('/');
          return;
        }

        if (data.adminExists) {
          router.replace('/auth/login');
          return;
        }

        setIsCheckingAuth(false);
      } catch {
        if (!cancelled) setIsCheckingAuth(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('auth.initAdminFailed'));
        return;
      }

      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.initAdminFailed'));
    } finally {
      setLoading(false);
    }
  }

  if (isCheckingAuth) {
    return (
      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(114,46,209,0.12),_transparent_34%),linear-gradient(to_bottom,_#fafafa,_#f4f4f5)] p-4 dark:bg-[radial-gradient(circle_at_top,_rgba(139,71,234,0.18),_transparent_30%),linear-gradient(to_bottom,_#020617,_#0f172a)]">
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:5rem_5rem]" />
        <div className="relative z-10 flex items-center gap-3 rounded-full border border-border/70 bg-background/80 px-5 py-3 shadow-lg backdrop-blur">
          <Loader2 className="size-5 animate-spin text-[var(--primary)]" />
          <span className="text-sm font-medium text-muted-foreground">
            {t('auth.checkingSession')}
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(114,46,209,0.14),_transparent_30%),linear-gradient(to_bottom,_#fafafa,_#f4f4f5)] p-4 sm:p-6 dark:bg-[radial-gradient(circle_at_top,_rgba(139,71,234,0.18),_transparent_28%),linear-gradient(to_bottom,_#020617,_#0f172a)]">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:5rem_5rem]" />
      <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[var(--primary)]/10 blur-3xl" />
      <div className="absolute -right-24 bottom-12 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl dark:bg-[var(--primary)]/15" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md items-center">
        <Card className="w-full overflow-hidden border-border/70 bg-background/90 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-4 border-b border-border/60 bg-background/80 px-6 pb-6 pt-8 text-center sm:px-8">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)] shadow-sm dark:bg-[var(--primary)]/15">
              <ShieldCheck className="size-7" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" />
                {t('auth.setupAdminBadge')}
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                {t('auth.setupAdminTitle')}
              </CardTitle>
              <CardDescription className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
                {t('auth.setupAdminDesc')}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-6 py-6 sm:px-8">
            <div className="rounded-2xl border border-border/70 bg-secondary/60 p-4 text-sm text-muted-foreground">
              {t('auth.setupAdminHint')}
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('auth.displayNameOptional')}
                  <span className="ml-1 text-muted-foreground">({t('common.optional')})</span>
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={t('auth.adminDisplayNamePlaceholder')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    disabled={loading}
                    className="h-12 rounded-xl border-border/70 bg-background pl-10 shadow-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-[var(--primary)]/40"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('auth.adminEmail')}
                  <span className="ml-1 text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder={t('auth.adminEmailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                    className="h-12 rounded-xl border-border/70 bg-background pl-10 shadow-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-[var(--primary)]/40"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('auth.password')}
                  <span className="ml-1 text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                    className="h-12 rounded-xl border-border/70 bg-background pl-10 shadow-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-[var(--primary)]/40"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
              </div>

              {error ? (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              ) : null}

              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-[var(--primary)] text-base font-semibold text-primary-foreground shadow-lg shadow-[var(--primary)]/20 transition-all hover:bg-[var(--primary)]/90 hover:shadow-xl hover:shadow-[var(--primary)]/25"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t('auth.initializing')}
                  </span>
                ) : (
                  t('auth.createAdmin')
                )}
              </Button>
            </form>

            <p className="text-center text-xs leading-5 text-muted-foreground">
              {t('auth.setupAdminFooter')}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
