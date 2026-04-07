import { BookOpen, Cpu, MousePointer2, PieChart, type LucideIcon } from 'lucide-react';

import type { SceneType } from '@/lib/types/stage';

export const SCENE_TYPE_ICON: Record<SceneType, LucideIcon> = {
  slide: BookOpen,
  quiz: PieChart,
  interactive: MousePointer2,
  pbl: Cpu,
};

export function getSceneTypeIcon(type: SceneType): LucideIcon {
  return SCENE_TYPE_ICON[type];
}
