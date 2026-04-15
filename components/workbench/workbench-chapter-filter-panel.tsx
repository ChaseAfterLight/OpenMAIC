'use client';

import { type MouseEvent } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';

import type { TextbookChapterTreeNode } from '@/lib/utils/textbook-chapter-tree';
import { cn } from '@/lib/utils';

interface WorkbenchChapterFilterPanelProps {
  treeData: TextbookChapterTreeNode[];
  value: string[];
  expandedKeys: Set<string>;
  title: string;
  emptyLabel: string;
  clearLabel: string;
  onChange: (value: string[]) => void;
  onToggleExpanded: (nodeId: string) => void;
}

export function WorkbenchChapterFilterPanel({
  treeData,
  value,
  expandedKeys,
  title,
  emptyLabel,
  clearLabel,
  onChange,
  onToggleExpanded,
}: WorkbenchChapterFilterPanelProps) {
  const handleNodeClick = (node: TextbookChapterTreeNode, currentPath: string[]) => {
    onChange(currentPath);
    if (node.children?.length) {
      onToggleExpanded(node.id);
    }
  };

  const toggleNode = (nodeId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleExpanded(nodeId);
  };

  const renderNode = (
    node: TextbookChapterTreeNode,
    depth: number,
    parentPath: string[],
  ) => {
    const currentPath = [...parentPath, node.id];
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedKeys.has(node.id);
    const isActive =
      value.length === currentPath.length && currentPath.every((segment, index) => segment === value[index]);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleNodeClick(node, currentPath)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleNodeClick(node, currentPath);
            }
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors',
            isActive
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
          )}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={(event) => hasChildren && toggleNode(node.id, event)}
            aria-label={hasChildren ? `toggle-${node.id}` : undefined}
          >
            {hasChildren ? (
              <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />
            ) : (
              <span className="size-4" />
            )}
          </button>
          <span className="truncate">{node.label}</span>
        </div>
        {hasChildren && isExpanded ? (
          <div className="flex flex-col gap-1 py-1">
            {node.children!.map((child) => renderNode(child, depth + 1, currentPath))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-[24px] border border-slate-200/70 bg-slate-50/85 p-3 dark:border-slate-800/70 dark:bg-slate-900/45">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="size-4 text-indigo-500" />
          {title}
        </div>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {clearLabel}
          </button>
        ) : null}
      </div>

      {treeData.length === 0 ? (
        <p className="rounded-2xl bg-white/80 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-1">{treeData.map((node) => renderNode(node, 0, []))}</div>
      )}
    </section>
  );
}
