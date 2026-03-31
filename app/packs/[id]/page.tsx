import { redirect } from 'next/navigation';

import { LessonPackDetailClient } from '@/components/workbench/lesson-pack-detail-client';
import { getActiveModuleId } from '@/lib/module-host/runtime';

export default function LessonPackDetailPage() {
  if (getActiveModuleId() !== 'k12') {
    redirect('/');
  }

  return <LessonPackDetailClient />;
}
