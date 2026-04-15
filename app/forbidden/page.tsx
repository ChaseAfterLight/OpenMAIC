'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { refreshAuthSession } from '@/lib/store/auth-session';

export default function ForbiddenPage() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await refreshAuthSession();
      router.replace('/auth/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Access Restricted
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          This workspace is available to teachers and admins only.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Your current account does not have permission to open lesson generation or storage-backed
          workbench pages. Please ask an administrator to upgrade your role if you need access.
        </p>
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <LogOut className="size-4" />
            {isLoggingOut ? 'Signing out...' : 'Logout'}
          </Button>
        </div>
      </div>
    </main>
  );
}
