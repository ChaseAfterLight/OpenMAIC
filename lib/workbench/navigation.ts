import type { LucideIcon } from 'lucide-react';
import { BookMarked, GraduationCap, LayoutDashboard, LibraryBig, Shield } from 'lucide-react';

import type { SupportedLocale } from '@/lib/module-host/types';

export interface WorkbenchNavigationItem {
  id: string;
  label: Record<SupportedLocale, string>;
  href: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
  matchMode?: 'exact' | 'prefix';
}

export interface WorkbenchNavigationGroup {
  id: string;
  label: Record<SupportedLocale, string>;
  items: WorkbenchNavigationItem[];
}

export function getWorkbenchNavigation(locale: SupportedLocale, moduleId: string) {
  const moduleEntry =
    moduleId === 'adult-education'
      ? {
          id: 'adult-education-home',
          label: { 'zh-CN': '培训工作台', 'en-US': 'Training Workbench' },
          href: '/adult-education',
          icon: GraduationCap,
        }
      : {
          id: 'k12-home',
          label: { 'zh-CN': '备课工作台', 'en-US': 'Lesson Workbench' },
          href: '/k12',
          icon: LayoutDashboard,
        };

  const groups: WorkbenchNavigationGroup[] = [
    {
      id: 'workspace',
      label: { 'zh-CN': '工作区', 'en-US': 'Workspace' },
      items: [moduleEntry],
    },
    {
      id: 'resources',
      label: { 'zh-CN': '资源入口', 'en-US': 'Resources' },
      items: [
        {
          id: 'textbooks',
          label: { 'zh-CN': moduleId === 'adult-education' ? '资源库' : '教材库', 'en-US': moduleId === 'adult-education' ? 'Resources' : 'Textbooks' },
          href: '/textbooks',
          icon: LibraryBig,
          matchMode: 'prefix',
        },
        {
          id: 'admin-textbooks',
          label: { 'zh-CN': '教材管理', 'en-US': 'Manage Libraries' },
          href: '/admin/textbooks',
          icon: BookMarked,
          requiresAdmin: true,
          matchMode: 'prefix',
        },
        {
          id: 'admin-users',
          label: { 'zh-CN': '管理后台', 'en-US': 'Admin' },
          href: '/admin/users',
          icon: Shield,
          requiresAdmin: true,
          matchMode: 'prefix',
        },
      ],
    },
  ];

  return groups.map((group) => ({
    ...group,
    title: group.label[locale],
    items: group.items.map((item) => ({
      ...item,
      title: item.label[locale],
    })),
  }));
}

export function isWorkbenchNavigationItemActive(
  pathname: string,
  href: string,
  matchMode: 'exact' | 'prefix' = 'exact',
) {
  if (matchMode === 'prefix') {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href;
}
