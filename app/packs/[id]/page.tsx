import { redirect } from 'next/navigation';

import { LessonPackDetailClient } from '@/components/workbench/lesson-pack-detail-client';
import { isEducationWorkbenchModuleId } from '@/lib/module-host/education';
import { getActiveModuleId } from '@/lib/module-host/runtime';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function LessonPackDetailPage() {
  await requirePageRole(['admin', 'teacher'], {
    loginPath: '/auth/login',
    forbiddenPath: '/forbidden',
  });

  if (!isEducationWorkbenchModuleId(getActiveModuleId())) {
    redirect('/');
  }

  return <LessonPackDetailClient />;
}
