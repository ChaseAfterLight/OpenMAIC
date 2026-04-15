import { describe, expect, it } from 'vitest';

import {
  getWorkbenchNavigation,
  isWorkbenchNavigationItemActive,
} from '@/lib/workbench/navigation';
import {
  getWorkbenchChapterTreeStorageKey,
  sanitizeExpandedChapterKeys,
  sanitizeSelectedChapterPath,
} from '@/lib/workbench/sidebar-state';

const treeData = [
  {
    id: 'grade-4',
    label: '四年级',
    children: [
      {
        id: 'math',
        label: '数学',
        children: [
          {
            id: 'pep',
            label: '人教版',
            children: [{ id: 'chapter-1', label: '大数的认识' }],
          },
        ],
      },
    ],
  },
];

describe('workbench navigation', () => {
  it('returns stable workbench and admin routes for k12', () => {
    const groups = getWorkbenchNavigation('zh-CN', 'k12');
    const items = groups.flatMap((group) => group.items);

    expect(items.find((item) => item.id === 'k12-home')?.href).toBe('/k12');
    expect(items.find((item) => item.id === 'admin-textbooks')?.href).toBe('/admin/textbooks');
    expect(items.find((item) => item.id === 'admin-users')?.href).toBe('/admin/users');
  });

  it('matches prefix and exact navigation routes correctly', () => {
    expect(isWorkbenchNavigationItemActive('/admin/textbooks/import', '/admin/textbooks', 'prefix')).toBe(true);
    expect(isWorkbenchNavigationItemActive('/k12', '/k12', 'exact')).toBe(true);
    expect(isWorkbenchNavigationItemActive('/adult-education', '/k12', 'exact')).toBe(false);
  });
});

describe('workbench sidebar state', () => {
  it('builds a module-scoped storage key', () => {
    expect(getWorkbenchChapterTreeStorageKey('k12')).toBe('workbench:chapter-tree-expanded:k12');
  });

  it('trims invalid selected chapter segments and keeps active ancestors expanded', () => {
    const selectedPath = sanitizeSelectedChapterPath(treeData, [
      'grade-4',
      'math',
      'pep',
      'missing-chapter',
    ]);
    const expanded = sanitizeExpandedChapterKeys(treeData, ['grade-4', 'ghost'], selectedPath);

    expect(selectedPath).toEqual(['grade-4', 'math', 'pep']);
    expect(Array.from(expanded)).toEqual(['grade-4', 'math']);
  });
});
