'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpen,
  FileOutput,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Sun,
  Library,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { SettingsDialog } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ResourceChapterSelector } from '@/components/ui/resource-chapter-selector';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { getActiveModule } from '@/lib/module-host/runtime';
import { resolveLocalizedText, type SupportedLocale } from '@/lib/module-host/types';
import { subscribeHybridSyncState } from '@/lib/storage/hybrid-sync';
import type { Slide } from '@/lib/types/slides';
import { refreshAuthSession, setAuthSession, useAuthSessionStore } from '@/lib/store/auth-session';
import {
  buildTextbookChapterTree,
  matchesTextbookChapterPath,
  type TextbookChapterTreeNode,
} from '@/lib/utils/textbook-chapter-tree';
import {
  deleteStageData,
  duplicateStage,
  getFirstSlideByStages,
  listStages,
  renameStage,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import { cn } from '@/lib/utils';

import { CreateLessonSheet } from '@/components/workbench/create-lesson-sheet';

// --- 语言包配置 (省略部分重复代码以保持简洁，保留原有 workbenchCopy 即可) ---
const workbenchCopy = {
  'zh-CN': {
    title: '教师备课工作台',
    description: '管理所有的教案与课件资产。',
    filters: '目录筛选',
    searchPlaceholder: '搜索标题、教材版本或章节...',
    textbookPlaceholder: '全部教材与章节',
    textbookConfirm: '确认选择',
    textbookClear: '清除教材筛选',
    textbookHint: '支持选择任意层级',
    textbookEmpty: '当前没有可用的教材目录。',
    grade: '年级',
    subject: '学科',
    status: '状态',
    sort: '排序',
    all: '全部',
    recent: '最近更新',
    oldest: '最早创建',
    ready: '已完成',
    draft: '未开始',
    inProgress: '生成中',
    archived: '已归档',
    empty: '当前工作台还没有内容，快创建一个新备课包吧。',
    sceneCount: '内容页',
    openPack: '备课详情',
    continueEdit: '继续编辑',
    export: '导出物料',
    rename: '重命名',
    duplicate: '复制',
    delete: '删除',
    renameTitle: '重命名备课包',
    renameDescription: '新的名称会同步到工作台和编辑器。',
    renamePlaceholder: '输入备课包名称',
    cancel: '取消',
    save: '保存',
    exported: '已导出',
    notExported: '未导出',
    duplicated: '已复制备课包',
    deleted: '已删除备课包',
    renameSuccess: '名称已更新',
    createTitle: '新建备课任务',
    quickPrompts: '快捷建议',
    createHint: '输入需求并生成后，将自动进入课堂编辑器。结束后也可在工作台继续管理。',
    myLibrary: '我的备课库',
    textbookEntry: '教材库',
    adminEntry: '管理后台',
    logout: '退出登录',
  },
  'en-US': {
    title: 'Teacher Workbench',
    description: 'Manage your lesson plans and slide assets.',
    filters: 'Filters',
    searchPlaceholder: 'Search by title, textbook edition, or chapter...',
    textbookPlaceholder: 'All textbooks and chapters',
    textbookConfirm: 'Apply',
    textbookClear: 'Clear textbook filter',
    textbookHint: 'Select any level',
    textbookEmpty: 'No textbook catalog is available yet.',
    grade: 'Grade',
    subject: 'Subject',
    status: 'Status',
    sort: 'Sort',
    all: 'All',
    recent: 'Recently updated',
    oldest: 'Oldest created',
    ready: 'Done',
    draft: 'Not started',
    inProgress: 'Generating',
    archived: 'Archived',
    empty: 'No lesson packs yet. Kick off a new one to get started.',
    sceneCount: 'scenes',
    openPack: 'Details',
    continueEdit: 'Continue Editing',
    export: 'Export',
    rename: 'Rename',
    duplicate: 'Duplicate',
    delete: 'Delete',
    renameTitle: 'Rename lesson pack',
    renameDescription: 'The new name will be reflected in both the workbench and editor.',
    renamePlaceholder: 'Enter a lesson pack name',
    cancel: 'Cancel',
    save: 'Save',
    exported: 'Exported',
    notExported: 'Not exported',
    duplicated: 'Lesson pack duplicated',
    deleted: 'Lesson pack deleted',
    renameSuccess: 'Lesson pack renamed',
    createTitle: 'Create Lesson',
    quickPrompts: 'Suggestions',
    createHint:
      'After generation, you will automatically enter the classroom editor. You can always manage it later in the workbench.',
    myLibrary: 'My Library',
    textbookEntry: 'Textbooks',
    adminEntry: 'Admin',
    logout: 'Logout',
  },
} as const;

function getWorkbenchCopy(locale: SupportedLocale, moduleId: string) {
  const base = workbenchCopy[locale];
  if (moduleId !== 'adult-education') return base;
  return {
    ...base,
    searchPlaceholder: locale === 'zh-CN' ? '搜索标题、资料版本、模块或章节主题...' : 'Search by title, resource edition, module, or section...',
    textbookPlaceholder: locale === 'zh-CN' ? '全部资料与章节' : 'All resources and sections',
    textbookClear: locale === 'zh-CN' ? '清除资料筛选' : 'Clear resource filter',
    textbookHint: locale === 'zh-CN' ? '支持按资料目录任意层级筛选' : 'Filter by any level of the resource outline',
    textbookEmpty: locale === 'zh-CN' ? '当前没有可用的资料目录。' : 'No resource catalog is available yet.',
    createTitle: locale === 'zh-CN' ? '新建培训任务' : 'Create Training Pack',
    createHint: locale === 'zh-CN' ? '输入培训目标并生成后，将自动进入课堂编辑器。结束后也可继续在工作台里管理。' : 'After generation, you will automatically enter the editor. You can always manage the training pack here later.',
    myLibrary: locale === 'zh-CN' ? '我的培训包' : 'My Training Packs',
    openPack: locale === 'zh-CN' ? '培训详情' : 'Training details',
    textbookEntry: locale === 'zh-CN' ? '资源库' : 'Resources',
  };
}

function formatTimestamp(timestamp: number, locale: SupportedLocale) {
  return new Date(timestamp).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getStatusLabel(status: StageListItem['lessonPack']['status'], locale: SupportedLocale) {
  const copy = workbenchCopy[locale];
  if (status === 'ready') return copy.ready;
  if (status === 'in_progress') return copy.inProgress;
  if (status === 'archived') return copy.archived;
  return copy.draft;
}

function getDisplayStatus(item: StageListItem) {
  if (item.lessonPack.status !== 'draft') return item.lessonPack.status;
  return item.sceneCount > 0 ? 'ready' : 'draft';
}

function LessonPackThumbnail({ slide, sceneCount, sceneCountLabel }: { slide?: Slide; sceneCount: number; sceneCountLabel: string; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver(([entry]) => setContainerWidth(Math.round(entry.contentRect.width)));
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const canRenderThumbnail = Boolean(slide) && containerWidth > 0;

  return (
    <div ref={containerRef} className="relative aspect-[16/9] w-full bg-slate-100 dark:bg-slate-950">
      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
        {canRenderThumbnail && slide ? (
          <ThumbnailSlide slide={slide} size={containerWidth} viewportSize={slide.viewportSize ?? 1000} viewportRatio={slide.viewportRatio ?? 0.5625} />
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

export function LessonPackWorkbenchClient() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const activeLocale = (locale === 'zh-CN' ? 'zh-CN' : 'en-US') as SupportedLocale;
  const activeModule = getActiveModule();
  const copy = getWorkbenchCopy(activeLocale, activeModule.id);
  const moduleBadge = resolveLocalizedText(activeModule.home.badge, activeLocale);
  const moduleTitle = resolveLocalizedText(activeModule.metadata.title, activeLocale);
  const moduleDescription = resolveLocalizedText(activeModule.metadata.description, activeLocale);
  const resourceEntryLabel = copy.textbookEntry;
  const authUser = useAuthSessionStore((s) => s.user);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [search, setSearch] = useState('');
  
  // 筛选状态
  const [chapterPath, setChapterPath] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  
  // 侧边栏树状目录的展开状态
  const [expandedTreeKeys, setExpandedTreeKeys] = useState<Set<string>>(new Set());

  const [renameTarget, setRenameTarget] = useState<StageListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);

  const loadClassrooms = useCallback(async () => {
    const list = await listStages();
    setClassrooms(list);
    if (list.length === 0) {
      setThumbnails({});
      return;
    }
    setThumbnails(await getFirstSlideByStages(list.map((item) => item.id)));
  }, []);

  useEffect(() => { void loadClassrooms(); }, [loadClassrooms]);
  useEffect(() => subscribeHybridSyncState(() => void loadClassrooms()), [loadClassrooms]);
  useEffect(() => { const t = window.setTimeout(() => setIsHydrated(true), 0); return () => window.clearTimeout(t); }, []);

  const chapterTreeData = useMemo(() => buildTextbookChapterTree(classrooms.map((item) => item.lessonPack)), [classrooms]);

  // 当外部改变选中路径时（如清除筛选），重置展开状态
  useEffect(() => {
    if (chapterPath.length > 0) {
      setExpandedTreeKeys(new Set(chapterPath.slice(0, -1)));
    }
  }, [chapterPath]);

  const visibleClassrooms = useMemo(() => {
    return [...classrooms]
      .filter((item) => {
        const keyword = search.trim().toLowerCase();
        const matchesKeyword =
          keyword.length === 0 ||
          [item.name, item.lessonPack.grade, item.lessonPack.subject, item.lessonPack.textbookEdition, item.lessonPack.lessonType, item.lessonPack.chapter]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(keyword));
        const matchesChapterPath = matchesTextbookChapterPath(item.lessonPack, chapterPath);
        const matchesStatus = statusFilter === 'all' || getDisplayStatus(item) === statusFilter;
        return matchesKeyword && matchesChapterPath && matchesStatus;
      })
      .sort((a, b) => sortBy === 'oldest' ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt);
  }, [chapterPath, classrooms, search, sortBy, statusFilter]);

  // 分组与排序：确保“未分类”永远置顶
  const groupedClassroomsArray = useMemo(() => {
    const groups: Record<string, StageListItem[]> = {};
    const uncategorizedKey = activeLocale === 'zh-CN' ? '未分类' : 'Uncategorized';

    for (const item of visibleClassrooms) {
      const groupKey = item.lessonPack.textbookEdition || item.lessonPack.subject || uncategorizedKey;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    }

    return Object.keys(groups)
      .sort((a, b) => {
        if (a === uncategorizedKey) return -1;
        if (b === uncategorizedKey) return 1;
        return a.localeCompare(b);
      })
      .map((key) => ({ groupKey: key, items: groups[key] }));
  }, [visibleClassrooms, activeLocale]);

  const getContinueHref = useCallback((classroom: StageListItem) => {
    const hasPendingOutlineReview = classroom.sceneCount === 0 && classroom.outlineCount > 0;
    return hasPendingOutlineReview ? `/generation-preview?stageId=${encodeURIComponent(classroom.id)}` : `/classroom/${classroom.id}`;
  }, []);

  const handleRename = async () => {
    if (!renameTarget) return;
    await renameStage(renameTarget.id, renameValue);
    toast.success(copy.renameSuccess);
    setRenameTarget(null);
    setRenameValue('');
    await loadClassrooms();
  };

  const handleDuplicate = async (stageId: string) => {
    await duplicateStage(stageId);
    toast.success(copy.duplicated);
    await loadClassrooms();
  };

  const handleDelete = async (stageId: string) => {
    const confirmed = window.confirm(activeLocale === 'zh-CN' ? '确认删除这个备课包吗？' : 'Delete this lesson pack?');
    if (!confirmed) return;
    await deleteStageData(stageId);
    toast.success(copy.deleted);
    await loadClassrooms();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthSession({ initialized: true, authenticated: false, adminExists: true, user: null });
    await refreshAuthSession();
    router.replace('/auth/login');
  };

  // 侧边栏内联树渲染逻辑
  const handleTreeClick = (node: TextbookChapterTreeNode, currentPath: string[]) => {
    setChapterPath(currentPath);
    if (node.children?.length) {
      setExpandedTreeKeys((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  };

  const toggleSidebarExpand = (nodeId: string, event: MouseEvent) => {
    event.stopPropagation();
    setExpandedTreeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderSidebarTree = (node: TextbookChapterTreeNode, depth: number, parentPath: string[]) => {
    const currentPath = [...parentPath, node.id];
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedTreeKeys.has(node.id);
    const isSelected = chapterPath.length === currentPath.length && currentPath.every((id, i) => id === chapterPath[i]);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          role="button"
          onClick={() => handleTreeClick(node, currentPath)}
          style={{ paddingLeft: `${depth * 14}px` }}
          className={cn(
            'group relative flex w-full cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors',
            isSelected
              ? 'bg-indigo-50/80 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
          )}
        >
          <div
            className="flex size-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            onClick={(e) => { if (hasChildren) toggleSidebarExpand(node.id, e); }}
          >
            {hasChildren ? (
              <ChevronRight
                className={cn('size-3.5 text-slate-400 transition-transform duration-200', isExpanded && 'rotate-90 text-slate-600 dark:text-slate-300')}
              />
            ) : (
              <span className="size-3.5" />
            )}
          </div>
          <span className="truncate flex-1 text-left">{node.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="flex flex-col mt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {node.children!.map((child) => renderSidebarTree(child, depth + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans selection:bg-indigo-500/30 dark:bg-slate-950">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/50 bg-white/70 px-6 py-4 backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-950/70">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md">
            <Sparkles className="size-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {moduleTitle}
          </span>
          <Badge variant="secondary" className="hidden rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 sm:inline-flex">
            {moduleBadge}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.push(authUser?.role === 'admin' ? '/admin/textbooks' : '/textbooks')}>
            {resourceEntryLabel}
          </Button>
          {authUser?.role === 'admin' ? (
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/users')}>{copy.adminEntry}</Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void handleLogout()}>{copy.logout}</Button>
          
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-3 text-xs font-medium" onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}>
              {locale === 'zh-CN' ? 'CN' : 'EN'}
            </Button>
            <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
            <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}>
              {theme === 'light' ? <Sun className="size-3.5" /> : theme === 'dark' ? <Moon className="size-3.5" /> : <Monitor className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-3.5" />
            </Button>
          </div>

          <Button onClick={() => setCreateSheetOpen(true)} className="h-9 rounded-full bg-indigo-600 pl-3 pr-4 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg">
            <Plus className="mr-1.5 size-4" />
            <span className="hidden sm:inline">{copy.createTitle}</span>
            <span className="sm:hidden">新建</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-8 sm:px-8 lg:px-12">
        {/* 顶部标题区 */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            {copy.myLibrary}
          </h1>
          <p className="text-base text-slate-500 dark:text-slate-400">{moduleDescription}</p>
        </div>

        {/* 核心功能区：左侧边栏 + 右侧内容 */}
        <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
          
          {/* 左侧边栏 - 目录树 (仅在 lg 及以上屏幕显示平铺，移动端用下拉) */}
          <aside className="hidden lg:flex flex-col gap-4 sticky top-24 overflow-y-auto max-h-[calc(100vh-8rem)] pr-2 custom-scrollbar">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800/50">
               <h3 className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100 flex items-center gap-2">
                 <BookOpen className="size-4 text-indigo-500" />
                 {copy.filters}
               </h3>
               {chapterPath.length > 0 && (
                 <button onClick={() => setChapterPath([])} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                   {copy.textbookClear}
                 </button>
               )}
            </div>
            
            {isHydrated ? (
              <nav className="flex flex-col pb-6">
                {chapterTreeData.length > 0 ? (
                  chapterTreeData.map((node) => renderSidebarTree(node, 0, []))
                ) : (
                  <p className="text-sm text-slate-500 py-4 text-center">{copy.textbookEmpty}</p>
                )}
              </nav>
            ) : (
               <div className="space-y-3 pt-2">
                 {[1, 2, 3, 4].map(i => <div key={i} className="h-6 w-full rounded-md bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />)}
               </div>
            )}
          </aside>

          {/* 移动端侧边栏替代方案 - 保留 Popover 供小屏幕使用 */}
          <div className="lg:hidden block w-full">
            {isHydrated && (
              <ResourceChapterSelector
                treeData={chapterTreeData}
                value={chapterPath}
                onChange={setChapterPath}
                placeholder={copy.textbookPlaceholder}
                confirmLabel={copy.textbookConfirm}
                clearLabel={copy.textbookClear}
                emptyLabel={copy.textbookEmpty}
              />
            )}
          </div>

          {/* 右侧主内容区 */}
          <div className="flex min-w-0 flex-col gap-6">
            
            {/* 控制条 (搜索与状态) */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl border border-slate-200/60 bg-white/60 p-3 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/60">
              <div className="relative flex-1 md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="h-10 w-full rounded-xl border-slate-200 bg-white/80 pl-9 focus-visible:ring-indigo-500/50 dark:border-slate-800 dark:bg-slate-950/80"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isHydrated ? (
                  <>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 w-[110px] rounded-xl border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">
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
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'recent' | 'oldest')}>
                      <SelectTrigger className="h-10 w-[110px] rounded-xl border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 font-medium">
                        <SelectValue placeholder={copy.sort} />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="recent">{copy.recent}</SelectItem>
                        <SelectItem value="oldest">{copy.oldest}</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <div className="h-10 w-[110px] rounded-xl border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-950/60" />
                    <div className="h-10 w-[110px] rounded-xl border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-950/60" />
                  </>
                )}
              </div>
            </div>

            {/* 课件列表/书架展示 */}
            {visibleClassrooms.length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/30 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex size-20 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500 shadow-sm dark:bg-indigo-500/10 dark:text-indigo-400">
                  <Library className="size-10" />
                </div>
                <p className="mt-6 text-lg font-medium text-slate-600 dark:text-slate-300">{copy.empty}</p>
                <Button onClick={() => setCreateSheetOpen(true)} className="mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="mr-2 size-4" />
                  {copy.createTitle}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col pb-12 gap-10">
                {groupedClassroomsArray.map(({ groupKey, items }) => (
                  <section key={groupKey} className="flex flex-col">
                    {/* 书架吸顶头部 */}
                    <div className="sticky top-[72px] z-20 -mx-4 mb-4 px-4 py-3 backdrop-blur-xl bg-slate-50/90 dark:bg-slate-950/90 flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                        <Library className="size-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        {groupKey}
                      </h2>
                      <Badge variant="secondary" className="rounded-full bg-slate-200/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {items.length}
                      </Badge>
                    </div>

                    {/* 响应式网格布局 */}
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {items.map((classroom) => (
                        <article
                          key={classroom.id}
                          className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-slate-800/80 dark:bg-slate-900"
                        >
                          <button
                            type="button"
                            onClick={() => router.push(`/packs/${classroom.id}`)}
                            className="relative block w-full overflow-hidden text-left"
                          >
                            <div className="relative">
                              <LessonPackThumbnail slide={thumbnails[classroom.id]} sceneCount={classroom.sceneCount} sceneCountLabel={copy.sceneCount} />
                              <div className="absolute right-3 top-3 z-10">
                                <Badge variant="secondary" className="bg-white/90 text-slate-700 shadow-sm backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
                                  {getStatusLabel(getDisplayStatus(classroom), activeLocale)}
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
                                    {[classroom.lessonPack.grade, classroom.lessonPack.subject, classroom.lessonPack.textbookEdition].filter(Boolean).join(' · ')}
                                  </p>
                                </div>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                    <DropdownMenuItem onClick={() => router.push(`/packs/${classroom.id}`)}>
                                      <ArrowUpRight className="mr-2 size-4" />
                                      {copy.openPack}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(getContinueHref(classroom))}>
                                      <Pencil className="mr-2 size-4" />
                                      {copy.continueEdit}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(`/packs/${classroom.id}?tab=export`)}>
                                      <FileOutput className="mr-2 size-4" />
                                      {copy.export}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => { setRenameTarget(classroom); setRenameValue(classroom.name); }}>
                                      {copy.rename}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void handleDuplicate(classroom.id)}>
                                      {copy.duplicate}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(classroom.id)}>
                                      {copy.delete}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap gap-2">
                                  {classroom.lessonPack.lessonType && (
                                    <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">
                                      {classroom.lessonPack.lessonType}
                                    </Badge>
                                  )}
                                  {classroom.lessonPack.durationMinutes && (
                                    <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">
                                      {classroom.lessonPack.durationMinutes} min
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {formatTimestamp(classroom.updatedAt, activeLocale)}
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
        </div>
      </main>

      {/* --- 弹窗组件保持不变 --- */}
      <CreateLessonSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} activeLocale={activeLocale} copy={copy} />

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.renameTitle}</DialogTitle>
            <DialogDescription>{copy.renameDescription}</DialogDescription>
          </DialogHeader>
          <Input className="h-10 rounded-xl" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder={copy.renamePlaceholder} />
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="rounded-xl" onClick={() => setRenameTarget(null)}>{copy.cancel}</Button>
            <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={() => void handleRename()} disabled={!renameValue.trim()}>{copy.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
