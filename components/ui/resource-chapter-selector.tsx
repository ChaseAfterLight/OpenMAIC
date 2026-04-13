'use client';

import { useId, useMemo, useState, useEffect, type MouseEvent } from 'react';
import { BookOpen, Check, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TextbookChapterTreeNode } from '@/lib/utils/textbook-chapter-tree';

export type ChapterNode = TextbookChapterTreeNode;

interface ResourceChapterSelectorProps {
  treeData: ChapterNode[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  confirmLabel?: string;
  clearLabel?: string;
  helperText?: string;
  emptyLabel?: string;
}

function resolveDisplayText(treeData: ChapterNode[], value: string[]) {
  if (value.length === 0) return null;

  const labels: string[] = [];
  let currentNodes = treeData;

  for (const selectedId of value) {
    const node = currentNodes.find((candidate) => candidate.id === selectedId);
    if (!node) break;

    labels.push(node.label);
    currentNodes = node.children ?? [];
  }

  return labels.length > 0 ? labels.join(' · ') : null;
}

export function ResourceChapterSelector({
  treeData,
  value,
  onChange,
  placeholder = '全部教材与章节',
  className,
  confirmLabel = '确认选择',
  clearLabel = '清除当前筛选',
  helperText = '支持选择任意层级',
  emptyLabel = '暂无可用教材目录',
}: ResourceChapterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [activePath, setActivePath] = useState<string[]>(value);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const contentId = useId();

  const displayText = useMemo(() => resolveDisplayText(treeData, value), [treeData, value]);

  // 当弹窗打开时，同步 value 并自动展开已选中节点的父级路径
  useEffect(() => {
    if (open) {
      setActivePath(value);
      setExpandedKeys(new Set(value.slice(0, -1)));
    }
  }, [open, value]);

  const handleClear = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActivePath([]);
    onChange([]);
    setOpen(false);
  };

  const handleConfirm = () => {
    onChange(activePath);
    setOpen(false);
  };

  const handleNodeClick = (node: ChapterNode, currentPath: string[]) => {
    setActivePath(currentPath);
    const hasChildren = Boolean(node.children?.length);

    if (hasChildren) {
      // 如果有子节点，则切换展开/收起状态
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
    } else {
      // 如果是叶子节点，直接选中并关闭弹窗
      onChange(currentPath);
      setOpen(false);
    }
  };

  const toggleExpand = (nodeId: string, event: MouseEvent) => {
    event.stopPropagation();
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // 递归渲染树节点
  const renderTreeNode = (node: ChapterNode, depth: number, parentPath: string[]) => {
    const currentPath = [...parentPath, node.id];
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedKeys.has(node.id);
    
    // 判断当前节点是否是被完全选中的路径（或其路径上）
    const isSelected =
      activePath.length === currentPath.length &&
      currentPath.every((id, i) => id === activePath[i]);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          role="button"
          onClick={() => handleNodeClick(node, currentPath)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={cn(
            'group relative flex w-full cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-3 text-sm transition-colors',
            isSelected
              ? 'bg-indigo-50 font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          )}
        >
          {/* 展开/收起箭头区域 */}
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            onClick={(e) => {
              if (hasChildren) toggleExpand(node.id, e);
            }}
          >
            {hasChildren ? (
              <ChevronRight
                className={cn(
                  'size-4 text-slate-400 transition-transform duration-200',
                  isExpanded && 'rotate-90 text-slate-600 dark:text-slate-300'
                )}
              />
            ) : (
              <span className="size-4" /> // 占位，保持对齐
            )}
          </div>

          <span className="truncate flex-1 text-left">{node.label}</span>

          {isSelected && !hasChildren && (
            <Check className="size-4 shrink-0 opacity-70" />
          )}
        </div>

        {/* 递归子节点 */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200">
            {node.children!.map((child) => renderTreeNode(child, depth + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={displayText || placeholder}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'inline-flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 pl-3 pr-2 text-sm font-normal text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:bg-slate-900',
            !displayText && 'text-slate-500 dark:text-slate-400',
            className
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="size-4 shrink-0 text-indigo-500" />
            <span className="truncate">{displayText || placeholder}</span>
          </div>

          {value.length > 0 ? (
            <button
              type="button"
              aria-label={clearLabel}
              onClick={handleClear}
              className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      </PopoverTrigger>

      <PopoverContent
        id={contentId}
        align="start"
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border-slate-200/70 bg-white/95 p-0 shadow-2xl backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/95"
      >
        {treeData.length === 0 ? (
          <div className="flex h-[240px] w-[320px] items-center justify-center px-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>
          </div>
        ) : (
          <div className="flex max-h-[380px] w-[280px] sm:w-[320px] flex-col overflow-y-auto p-2">
            {treeData.map((node) => renderTreeNode(node, 0, []))}
          </div>
        )}

        {treeData.length === 0 ? null : (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <span className="text-xs text-slate-400">{helperText}</span>
            <Button
              size="sm"
              className="h-8 rounded-lg bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-700"
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}