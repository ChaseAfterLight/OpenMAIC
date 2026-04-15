'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, FileOutput, Library, Monitor, MoreHorizontal, Pencil, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { SupportedLocale } from '@/lib/module-host/types';
import type { Slide } from '@/lib/types/slides';
import type { StageListItem } from '@/lib/utils/stage-storage';

interface WorkbenchLibraryCopy {
  searchPlaceholder: string;
  status: string;
  sort: string;
  all: string;
  recent: string;
  oldest: string;
  ready: string;
  draft: string;
  inProgress: string;
  archived: string;
  empty: string;
  sceneCount: string;
  openPack: string;
  continueEdit: string;
  export: string;
  rename: string;
  duplicate: string;
  delete: string;
  createTitle: string;
}

interface GroupedClassrooms {
  groupKey: string;
  items: StageListItem[];
}

interface WorkbenchLibraryGridProps {
  copy: WorkbenchLibraryCopy;
  locale: SupportedLocale;
  search: string;
  chapterSelector: ReactNode;
  statusFilter: string;
  sortBy: 'recent' | 'oldest';
  groupedClassrooms: GroupedClassrooms[];
  visibleCount: number;
  thumbnails: Record<string, Slide>;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSortByChange: (value: 'recent' | 'oldest') => void;
  onCreate: () => void;
  onOpenPack: (stageId: string) => void;
  onContinue: (stageId: string) => void;
  onExport: (stageId: string) => void;
  onRename: (classroom: StageListItem) => void;
  onDuplicate: (stageId: string) => void;
  onDelete: (stageId: string) => void;
}

function formatTimestamp(timestamp: number, locale: SupportedLocale) {
  return new Date(timestamp).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDisplayStatus(item: StageListItem) {
  if (item.lessonPack.status !== 'draft') return item.lessonPack.status;
  return item.sceneCount > 0 ? 'ready' : 'draft';
}

function getStatusLabel(status: StageListItem['lessonPack']['status'] | 'draft' | 'ready', copy: WorkbenchLibraryCopy) {
  if (status === 'ready') return copy.ready;
  if (status === 'in_progress') return copy.inProgress;
  if (status === 'archived') return copy.archived;
  return copy.draft;
}

function LessonPackThumbnail({
  slide,
  sceneCount,
  sceneCountLabel,
}: {
  slide?: Slide;
  sceneCount: number;
  sceneCountLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver(([entry]) =>
      setContainerWidth(Math.round(entry.contentRect.width)),
    );
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const canRenderThumbnail = Boolean(slide) && containerWidth > 0;

  return (
    <div ref={containerRef} className="relative aspect-[16/9] w-full bg-slate-100 dark:bg-slate-950">
      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
        {canRenderThumbnail && slide ? (
          <ThumbnailSlide
            slide={slide}
            size={containerWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-400">
              <Monitor className="size-4" />
              {sceneCount} {sceneCountLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkbenchLibraryGrid({
  copy,
  locale,
  search,
  chapterSelector,
  statusFilter,
  sortBy,
  groupedClassrooms,
  visibleCount,
  thumbnails,
  onSearchChange,
  onStatusFilterChange,
  onSortByChange,
  onCreate,
  onOpenPack,
  onContinue,
  onExport,
  onRename,
  onDuplicate,
  onDelete,
}: WorkbenchLibraryGridProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200/70 bg-white/85 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/85">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-center">
          <div className="relative min-w-0 flex-[1.05]">
            <BookOpen className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="h-11 rounded-2xl border-slate-200 bg-white/85 pl-9 dark:border-slate-800 dark:bg-slate-950/80"
            />
          </div>
          <div className="min-w-0 xl:w-[340px] xl:max-w-[380px]">{chapterSelector}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:ml-auto xl:flex-nowrap">
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="h-10 w-[92px] rounded-2xl border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80">
                <SelectValue placeholder={copy.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{copy.all}</SelectItem>
                <SelectItem value="draft">{copy.draft}</SelectItem>
                <SelectItem value="in_progress">{copy.inProgress}</SelectItem>
                <SelectItem value="ready">{copy.ready}</SelectItem>
                <SelectItem value="archived">{copy.archived}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => onSortByChange(value as 'recent' | 'oldest')}>
              <SelectTrigger className="h-10 w-[100px] rounded-2xl border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80">
                <SelectValue placeholder={copy.sort} />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="recent">{copy.recent}</SelectItem>
                <SelectItem value="oldest">{copy.oldest}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {visibleCount === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-slate-200 bg-white/55 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/35">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500 shadow-sm dark:bg-indigo-500/10 dark:text-indigo-400">
            <Library className="size-10" />
          </div>
          <p className="mt-6 text-lg font-medium text-slate-600 dark:text-slate-300">{copy.empty}</p>
          <Button onClick={onCreate} className="mt-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-2 size-4" />
            {copy.createTitle}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-10 pb-12">
          {groupedClassrooms.map(({ groupKey, items }) => (
            <section key={groupKey} className="flex flex-col">
              <div className="-mx-2 mb-4 flex items-center gap-3 rounded-3xl bg-slate-50/95 px-2 py-3 backdrop-blur dark:bg-slate-950/95">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                  <Library className="size-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{groupKey}</h2>
                <Badge variant="secondary" className="rounded-full bg-slate-200/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {items.length}
                </Badge>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6 2xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                {items.map((classroom) => (
                  <article
                    key={classroom.id}
                    className="group flex flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-slate-800/80 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPack(classroom.id)}
                      className="relative block w-full overflow-hidden text-left"
                    >
                      <div className="relative">
                        <LessonPackThumbnail
                          slide={thumbnails[classroom.id]}
                          sceneCount={classroom.sceneCount}
                          sceneCountLabel={copy.sceneCount}
                        />
                        <div className="absolute right-3 top-3 z-10">
                          <Badge variant="secondary" className="bg-white/90 text-slate-700 shadow-sm backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
                            {getStatusLabel(getDisplayStatus(classroom), copy)}
                          </Badge>
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                              {classroom.name}
                            </h2>
                            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                              {[classroom.lessonPack.grade, classroom.lessonPack.subject, classroom.lessonPack.textbookEdition]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-2xl">
                              <DropdownMenuItem onClick={() => onOpenPack(classroom.id)}>
                                <ArrowUpRight className="mr-2 size-4" />
                                {copy.openPack}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onContinue(classroom.id)}>
                                <Pencil className="mr-2 size-4" />
                                {copy.continueEdit}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onExport(classroom.id)}>
                                <FileOutput className="mr-2 size-4" />
                                {copy.export}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onRename(classroom)}>
                                {copy.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDuplicate(classroom.id)}>
                                {copy.duplicate}
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => onDelete(classroom.id)}>
                                {copy.delete}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            {classroom.lessonPack.lessonType ? (
                              <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">
                                {classroom.lessonPack.lessonType}
                              </Badge>
                            ) : null}
                            {classroom.lessonPack.durationMinutes ? (
                              <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">
                                {classroom.lessonPack.durationMinutes} min
                              </Badge>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {formatTimestamp(classroom.updatedAt, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
