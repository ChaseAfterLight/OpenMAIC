'use client';

import { useId, useMemo, useState, type MouseEvent } from 'react';
import { BookOpen, Check, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TextbookChapterTreeNode } from '@/lib/utils/textbook-chapter-tree';

export type ChapterNode = TextbookChapterTreeNode;

interface TextbookChapterSelectorProps {
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

export function TextbookChapterSelector({
  treeData,
  value,
  onChange,
  placeholder = '全部教材与章节',
  className,
  confirmLabel = '确认选择',
  clearLabel = '清除当前筛选',
  helperText = '支持选择任意层级',
  emptyLabel = '暂无可用教材目录',
}: TextbookChapterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [activePath, setActivePath] = useState<string[]>(value);
  const contentId = useId();

  const displayText = useMemo(() => resolveDisplayText(treeData, value), [treeData, value]);

  const columns = useMemo(() => {
    const nextColumns: ChapterNode[][] = [treeData];
    let currentNodes = treeData;

    for (const selectedId of activePath) {
      const node = currentNodes.find((candidate) => candidate.id === selectedId);
      if (!node?.children?.length) break;

      nextColumns.push(node.children);
      currentNodes = node.children;
    }

    return nextColumns;
  }, [activePath, treeData]);

  const handleSelect = (depth: number, node: ChapterNode) => {
    const nextPath = activePath.slice(0, depth);
    nextPath.push(node.id);
    setActivePath(nextPath);

    if (!node.children?.length) {
      onChange(nextPath);
      setOpen(false);
    }
  };

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

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setActivePath(value);
        }
      }}
    >
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
            'inline-flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 pl-3 pr-2 text-sm font-normal text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:bg-slate-900 sm:w-[320px]',
            !displayText && 'text-slate-500 dark:text-slate-400',
            className,
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
          <div className="flex h-[320px] max-w-[calc(100vw-1rem)] overflow-x-auto">
            {columns.map((columnNodes, depth) => (
              <div
                key={depth}
                className="flex h-full w-[180px] shrink-0 flex-col overflow-y-auto border-r border-slate-100 py-2 last:border-r-0 dark:border-slate-800"
              >
                {columnNodes.map((node) => {
                  const isSelected = activePath[depth] === node.id;
                  const hasChildren = Boolean(node.children?.length);

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleSelect(depth, node)}
                      className={cn(
                        'mx-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-indigo-50 font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      <span className="truncate">{node.label}</span>
                      {hasChildren ? (
                        <ChevronRight className="size-3.5 shrink-0 opacity-50" />
                      ) : isSelected ? (
                        <Check className="size-3.5 shrink-0 opacity-70" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
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
