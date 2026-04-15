'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Monitor, Moon, Plus, Settings, Sparkles, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsDialog } from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ResourceChapterSelector } from '@/components/ui/resource-chapter-selector';
import { CreateLessonSheet } from '@/components/workbench/create-lesson-sheet';
import { WorkbenchLibraryGrid } from '@/components/workbench/workbench-library-grid';
import { WorkbenchSidebarShell } from '@/components/workbench/workbench-sidebar-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { resolveLocalizedText, type SupportedLocale } from '@/lib/module-host/types';
import { getActiveModule } from '@/lib/module-host/runtime';
import { getWorkbenchNavigation, isWorkbenchNavigationItemActive } from '@/lib/workbench/navigation';
import {
  getWorkbenchChapterTreeStorageKey,
  sanitizeExpandedChapterKeys,
  sanitizeSelectedChapterPath,
} from '@/lib/workbench/sidebar-state';
import { subscribeHybridSyncState } from '@/lib/storage/hybrid-sync';
import { refreshAuthSession, setAuthSession, useAuthSessionStore } from '@/lib/store/auth-session';
import { useSettingsStore } from '@/lib/store/settings';
import type { Slide } from '@/lib/types/slides';
import {
  buildTextbookChapterTree,
  matchesTextbookChapterPath,
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

const workbenchCopy = {
  'zh-CN': {
    description: '管理所有的教案与课件资产。',
    filters: '章节筛选',
    searchPlaceholder: '搜索标题、教材版本或章节...',
    textbookPlaceholder: '全部教材与章节',
    textbookConfirm: '确认选择',
    textbookClear: '清除筛选',
    textbookHint: '支持选择任意层级',
    textbookEmpty: '当前没有可用的教材目录。',
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
    duplicated: '已复制备课包',
    deleted: '已删除备课包',
    renameSuccess: '名称已更新',
    createTitle: '新建备课任务',
    createHint: '输入需求并生成后，将自动进入课堂编辑器。结束后也可在工作台继续管理。',
    createShort: '新建',
    myLibrary: '我的备课库',
    settings: '设置',
    logout: '退出登录',
    navigation: '导航',
    navigationHint: '在工作台、教材库和管理页之间快速切换。',
  },
  'en-US': {
    description: 'Manage your lesson plans and slide assets.',
    filters: 'Chapter Filters',
    searchPlaceholder: 'Search by title, textbook edition, or chapter...',
    textbookPlaceholder: 'All textbooks and chapters',
    textbookConfirm: 'Apply',
    textbookClear: 'Clear filter',
    textbookHint: 'Select any level',
    textbookEmpty: 'No textbook catalog is available yet.',
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
    duplicated: 'Lesson pack duplicated',
    deleted: 'Lesson pack deleted',
    renameSuccess: 'Lesson pack renamed',
    createTitle: 'Create Lesson',
    createHint:
      'After generation, you will automatically enter the classroom editor. You can always manage it later in the workbench.',
    createShort: 'Create',
    myLibrary: 'My Library',
    settings: 'Settings',
    logout: 'Logout',
    navigation: 'Navigation',
    navigationHint: 'Switch between the workbench, textbook library, and admin pages.',
  },
} as const;

function getWorkbenchCopy(locale: SupportedLocale, moduleId: string) {
  const base = workbenchCopy[locale];
  if (moduleId !== 'adult-education') return base;
  return {
    ...base,
    searchPlaceholder:
      locale === 'zh-CN'
        ? '搜索标题、资料版本、模块或章节主题...'
        : 'Search by title, resource edition, module, or section...',
    textbookPlaceholder: locale === 'zh-CN' ? '全部资料与章节' : 'All resources and sections',
    textbookConfirm: locale === 'zh-CN' ? '确认选择' : 'Apply',
    textbookHint:
      locale === 'zh-CN' ? '支持按资料目录任意层级筛选' : 'Filter by any level of the resource outline',
    textbookEmpty:
      locale === 'zh-CN' ? '当前没有可用的资料目录。' : 'No resource catalog is available yet.',
    createTitle: locale === 'zh-CN' ? '新建培训任务' : 'Create Training Pack',
    createHint:
      locale === 'zh-CN'
        ? '输入培训目标并生成后，将自动进入课堂编辑器。结束后也可继续在工作台里管理。'
        : 'After generation, you will automatically enter the editor. You can always manage the training pack here later.',
    createShort: locale === 'zh-CN' ? '新建' : 'Create',
    myLibrary: locale === 'zh-CN' ? '我的培训包' : 'My Training Packs',
    openPack: locale === 'zh-CN' ? '培训详情' : 'Training details',
  };
}

function parseStoredChapterState(value: string | null) {
  if (!value) {
    return { selectedPath: [] as string[], expandedKeys: [] as string[] };
  }

  try {
    const parsed = JSON.parse(value) as {
      selectedPath?: unknown;
      expandedKeys?: unknown;
    };
    return {
      selectedPath: Array.isArray(parsed.selectedPath)
        ? parsed.selectedPath.filter((item): item is string => typeof item === 'string')
        : [],
      expandedKeys: Array.isArray(parsed.expandedKeys)
        ? parsed.expandedKeys.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return { selectedPath: [] as string[], expandedKeys: [] as string[] };
  }
}

function arePathsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

export function LessonPackWorkbenchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);

  const activeLocale = (locale === 'zh-CN' ? 'zh-CN' : 'en-US') as SupportedLocale;
  const activeModule = getActiveModule();
  const copy = getWorkbenchCopy(activeLocale, activeModule.id);
  const moduleBadge = resolveLocalizedText(activeModule.home.badge, activeLocale);
  const moduleTitle = resolveLocalizedText(activeModule.metadata.title, activeLocale);
  const moduleDescription = resolveLocalizedText(activeModule.metadata.description, activeLocale);
  const authUser = useAuthSessionStore((state) => state.user);
  const isAdmin = authUser?.role === 'admin';

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [classroomsLoaded, setClassroomsLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [chapterPath, setChapterPath] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  const [expandedTreeKeys, setExpandedTreeKeys] = useState<Set<string>>(new Set());
  const [chapterStateReady, setChapterStateReady] = useState(false);
  const [storedChapterState, setStoredChapterState] = useState({
    selectedPath: [] as string[],
    expandedKeys: [] as string[],
  });
  const [renameTarget, setRenameTarget] = useState<StageListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const chapterStorageKey = useMemo(
    () => getWorkbenchChapterTreeStorageKey(activeModule.id),
    [activeModule.id],
  );

  const loadClassrooms = useCallback(async () => {
    const list = await listStages();
    setClassrooms(list);
    if (list.length === 0) {
      setThumbnails({});
      setClassroomsLoaded(true);
      return;
    }
    setThumbnails(await getFirstSlideByStages(list.map((item) => item.id)));
    setClassroomsLoaded(true);
  }, []);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  useEffect(() => subscribeHybridSyncState(() => void loadClassrooms()), [loadClassrooms]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredChapterState(parseStoredChapterState(window.localStorage.getItem(chapterStorageKey)));
    setChapterStateReady(false);
  }, [chapterStorageKey]);

  const chapterTreeData = useMemo(
    () => buildTextbookChapterTree(classrooms.map((item) => item.lessonPack)),
    [classrooms],
  );

  useEffect(() => {
    if (!classroomsLoaded || chapterStateReady) return;
    const nextPath = sanitizeSelectedChapterPath(chapterTreeData, storedChapterState.selectedPath);
    const nextExpanded = sanitizeExpandedChapterKeys(
      chapterTreeData,
      storedChapterState.expandedKeys,
      nextPath,
    );
    setChapterPath(nextPath);
    setExpandedTreeKeys(nextExpanded);
    setChapterStateReady(true);
  }, [chapterStateReady, chapterTreeData, classroomsLoaded, storedChapterState]);

  useEffect(() => {
    if (!chapterStateReady) return;
    const nextPath = sanitizeSelectedChapterPath(chapterTreeData, chapterPath);
    const nextExpanded = sanitizeExpandedChapterKeys(chapterTreeData, expandedTreeKeys, nextPath);

    if (!arePathsEqual(nextPath, chapterPath)) {
      setChapterPath(nextPath);
      return;
    }
    if (!areSetsEqual(nextExpanded, expandedTreeKeys)) {
      setExpandedTreeKeys(nextExpanded);
    }
  }, [chapterPath, chapterStateReady, chapterTreeData, expandedTreeKeys]);

  useEffect(() => {
    if (!chapterStateReady || typeof window === 'undefined') return;
    window.localStorage.setItem(
      chapterStorageKey,
      JSON.stringify({
        selectedPath: chapterPath,
        expandedKeys: Array.from(expandedTreeKeys),
      }),
    );
  }, [chapterPath, chapterStateReady, chapterStorageKey, expandedTreeKeys]);

  const visibleClassrooms = useMemo(() => {
    return [...classrooms]
      .filter((item) => {
        const keyword = search.trim().toLowerCase();
        const matchesKeyword =
          keyword.length === 0 ||
          [
            item.name,
            item.lessonPack.grade,
            item.lessonPack.subject,
            item.lessonPack.textbookEdition,
            item.lessonPack.lessonType,
            item.lessonPack.chapter,
          ]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(keyword));
        const matchesChapter = matchesTextbookChapterPath(item.lessonPack, chapterPath);
        const matchesStatus = statusFilter === 'all' || getDisplayStatus(item) === statusFilter;
        return matchesKeyword && matchesChapter && matchesStatus;
      })
      .sort((left, right) =>
        sortBy === 'oldest' ? left.createdAt - right.createdAt : right.updatedAt - left.updatedAt,
      );
  }, [chapterPath, classrooms, search, sortBy, statusFilter]);

  const groupedClassrooms = useMemo(() => {
    const groups: Record<string, StageListItem[]> = {};
    const uncategorized = activeLocale === 'zh-CN' ? '未分类' : 'Uncategorized';

    for (const item of visibleClassrooms) {
      const key = item.lessonPack.textbookEdition || item.lessonPack.subject || uncategorized;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return Object.keys(groups)
      .sort((left, right) => {
        if (left === uncategorized) return -1;
        if (right === uncategorized) return 1;
        return left.localeCompare(right);
      })
      .map((groupKey) => ({ groupKey, items: groups[groupKey] }));
  }, [activeLocale, visibleClassrooms]);

  const navigationGroups = useMemo(() => {
    return getWorkbenchNavigation(activeLocale, activeModule.id).map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.requiresAdmin || isAdmin),
    }));
  }, [activeLocale, activeModule.id, isAdmin]);

  const getContinueHref = useCallback((classroom: StageListItem) => {
    const hasPendingOutlineReview = classroom.sceneCount === 0 && classroom.outlineCount > 0;
    return hasPendingOutlineReview
      ? `/generation-preview?stageId=${encodeURIComponent(classroom.id)}`
      : `/classroom/${classroom.id}`;
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
    const confirmed = window.confirm(
      activeLocale === 'zh-CN' ? '确认删除这个备课包吗？' : 'Delete this lesson pack?',
    );
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

  const sidebarContent = (collapsed: boolean): ReactNode => (
    <div className="flex h-full flex-col gap-4">
      <nav className="flex flex-col gap-4">
        {navigationGroups.map((group) =>
          group.items.length === 0 ? null : (
            <section key={group.id} className="flex flex-col gap-2">
              {collapsed ? null : (
                <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {group.label[activeLocale]}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isWorkbenchNavigationItemActive(pathname, item.href, item.matchMode);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label[activeLocale]}
                      onClick={() => router.push(item.href)}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {collapsed ? null : <span className="truncate">{item.label[activeLocale]}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ),
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <Button
          variant="ghost"
          className={cn(
            'h-11 rounded-2xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
            collapsed ? 'justify-center px-0' : 'justify-start',
          )}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4 shrink-0" />
          {collapsed ? null : <span className="ml-3">{copy.settings}</span>}
        </Button>
        <Button
          variant="ghost"
          className={cn(
            'h-11 rounded-2xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
            collapsed ? 'justify-center px-0' : 'justify-start',
          )}
          onClick={() => void handleLogout()}
        >
          <LogOut className="size-4 shrink-0" />
          {collapsed ? null : <span className="ml-3">{copy.logout}</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50 selection:bg-indigo-500/30 dark:bg-slate-950">
      <WorkbenchSidebarShell
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        desktopSidebar={sidebarContent(sidebarCollapsed)}
        mobileSidebar={sidebarContent(false)}
        mobileTitle={copy.navigation}
        mobileDescription={copy.navigationHint}
        createLabel={copy.createShort}
        onCreate={() => setCreateSheetOpen(true)}
        header={
          <div className="flex items-center justify-between gap-4 rounded-[28px] border border-slate-200/70 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/85">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-bold text-slate-900 dark:text-white">{moduleTitle}</span>
                  <Badge variant="secondary" className="rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {moduleBadge}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{copy.description}</p>
              </div>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-full px-3 text-xs font-semibold"
                onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
              >
                {locale === 'zh-CN' ? 'CN' : 'EN'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full"
                onClick={() =>
                  setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')
                }
              >
                {theme === 'light' ? <Sun className="size-4" /> : theme === 'dark' ? <Moon className="size-4" /> : <Monitor className="size-4" />}
              </Button>
              <Button
                onClick={() => setCreateSheetOpen(true)}
                className="h-10 rounded-full bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="mr-2 size-4" />
                {copy.createTitle}
              </Button>
            </div>
          </div>
        }
        controls={
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              {copy.myLibrary}
            </h1>
            <p className="text-base text-slate-500 dark:text-slate-400">{moduleDescription}</p>
          </div>
        }
        content={
          <WorkbenchLibraryGrid
            copy={copy}
            locale={activeLocale}
            search={search}
            chapterSelector={
              <ResourceChapterSelector
                treeData={chapterTreeData}
                value={chapterPath}
                onChange={setChapterPath}
                placeholder={copy.textbookPlaceholder}
                confirmLabel={copy.textbookConfirm}
                clearLabel={copy.textbookClear}
                helperText={copy.textbookHint}
                emptyLabel={copy.textbookEmpty}
                className="h-11 rounded-2xl"
              />
            }
            statusFilter={statusFilter}
            sortBy={sortBy}
            groupedClassrooms={groupedClassrooms}
            visibleCount={visibleClassrooms.length}
            thumbnails={thumbnails}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            onSortByChange={setSortBy}
            onCreate={() => setCreateSheetOpen(true)}
            onOpenPack={(stageId) => router.push(`/packs/${stageId}`)}
            onContinue={(stageId) => {
              const classroom = classrooms.find((item) => item.id === stageId);
              if (classroom) router.push(getContinueHref(classroom));
            }}
            onExport={(stageId) => router.push(`/packs/${stageId}?tab=export`)}
            onRename={(classroom) => {
              setRenameTarget(classroom);
              setRenameValue(classroom.name);
            }}
            onDuplicate={(stageId) => void handleDuplicate(stageId)}
            onDelete={(stageId) => void handleDelete(stageId)}
          />
        }
      />

      <CreateLessonSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} activeLocale={activeLocale} copy={copy} />

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.renameTitle}</DialogTitle>
            <DialogDescription>{copy.renameDescription}</DialogDescription>
          </DialogHeader>
          <Input
            className="h-10 rounded-xl"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder={copy.renamePlaceholder}
          />
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="rounded-xl" onClick={() => setRenameTarget(null)}>
              {copy.cancel}
            </Button>
            <Button className="rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={() => void handleRename()} disabled={!renameValue.trim()}>
              {copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function getDisplayStatus(item: StageListItem) {
  if (item.lessonPack.status !== 'draft') return item.lessonPack.status;
  return item.sceneCount > 0 ? 'ready' : 'draft';
}
