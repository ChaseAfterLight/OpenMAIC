import { redirect } from 'next/navigation';

import { LessonPackWorkbenchClient } from '@/components/workbench/lesson-pack-workbench-client';
import { getActiveModuleId } from '@/lib/module-host/runtime';
import { hasAnyAdmin } from '@/lib/server/auth';
import { requirePageRole } from '@/lib/server/auth-guards';

export default async function AdultEducationHomePage() {
  if (!(await hasAnyAdmin())) {
    redirect('/setup/admin');
  }
  await requirePageRole(['admin', 'teacher'], {
    loginPath: '/auth/login',
    forbiddenPath: '/forbidden',
  });

  if (getActiveModuleId() !== 'adult-education') {
    redirect('/');
  }

  return <LessonPackWorkbenchClient />;
}
