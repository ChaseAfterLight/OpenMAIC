import CoreHomePageClient from '@/components/home/core-home-page-client';
import { LessonPackWorkbenchClient } from '@/components/workbench/lesson-pack-workbench-client';
import { getActiveModuleId } from '@/lib/module-host/runtime';

export default function Page() {
  return getActiveModuleId() === 'k12' ? <LessonPackWorkbenchClient /> : <CoreHomePageClient />;
}
