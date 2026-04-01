import CoreHomePageClient from '@/components/home/core-home-page-client';
import { LessonPackWorkbenchClient } from '@/components/workbench/lesson-pack-workbench-client';
import { getActiveModuleId } from '@/lib/module-host/runtime';
import { hasAnyAdmin } from '@/lib/server/auth';
import { requirePageUser } from '@/lib/server/auth-guards';
import { redirect } from 'next/navigation';

export default async function Page() {
  if (!(await hasAnyAdmin())) {
    redirect('/setup/admin');
  }
  await requirePageUser('/auth/login');

  return getActiveModuleId() === 'k12' ? <LessonPackWorkbenchClient /> : <CoreHomePageClient />;
}
