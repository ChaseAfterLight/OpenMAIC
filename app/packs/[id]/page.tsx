import { redirect } from 'next/navigation';

import { LessonPackDetailClient } from '@/components/workbench/lesson-pack-detail-client';
import { getActiveModuleId } from '@/lib/module-host/runtime';
import { requirePageUser } from '@/lib/server/auth-guards';

export default async function LessonPackDetailPage() {
  await requirePageUser('/auth/login');

  if (getActiveModuleId() !== 'k12') {
    redirect('/');
  }

  return <LessonPackDetailClient />;
}
