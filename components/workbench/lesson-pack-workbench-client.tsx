'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  FileOutput,
  LayoutGrid,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Sun,
  Library,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';

import { AgentBar } from '@/components/agent/agent-bar';
import { SpeechButton } from '@/components/audio/speech-button';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { K12StructuredInputFields } from '@/components/k12/k12-structured-input';
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
import { Textarea } from '@/components/ui/textarea';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import {
  getActiveModule,
} from '@/lib/module-host/runtime';
import {
  buildK12RequirementText,
  getDefaultK12StructuredInput,
} from '@/lib/module-host/k12';
import {
  resolveLocalizedList,
  resolveLocalizedText,
  type K12ModulePresets,
  type K12StructuredInput,
  type SupportedLocale,
} from '@/lib/module-host/types';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';
import { subscribeHybridSyncState } from '@/lib/storage/hybrid-sync';
import type { UserRequirements } from '@/lib/types/generation';
import type { Slide } from '@/lib/types/slides';
import {
  deleteStageData,
  duplicateStage,
  getFirstSlideByStages,
  listStages,
  renameStage,
  type StageListItem,
} from '@/lib/utils/stage-storage';
import { storePdfBlob } from '@/lib/utils/image-storage';

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'zh-CN',
  webSearch: false,
};

const workbenchCopy = {
  'zh-CN': {
    title: '教师备课工作台',
    description: '管理所有的教案与课件，或在右侧开启一次新的备课设计。',
    filters: '备课包筛选',
    searchPlaceholder: '搜索标题、学科或年级...',
    grade: '年级',
    subject: '学科',
    status: '状态',
    sort: '排序',
    all: '全部',
    recent: '最近更新',
    oldest: '最早创建',
    ready: '就绪',
    draft: '草稿',
    inProgress: '进行中',
    archived: '已归档',
    empty: '当前工作台还没有内容，快从上方创建一个新备课包吧。',
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
  },
  'en-US': {
    title: 'Teacher Workbench',
    description: 'Manage your lesson plans and slides, or kick off a new lesson design on the right.',
    filters: 'Filters',
    searchPlaceholder: 'Search by title, subject, or grade...',
    grade: 'Grade',
    subject: 'Subject',
    status: 'Status',
    sort: 'Sort',
    all: 'All',
    recent: 'Recently updated',
    oldest: 'Oldest created',
    ready: 'Ready',
    draft: 'Draft',
    inProgress: 'In progress',
    archived: 'Archived',
    empty: 'No lesson packs yet. Kick off a new one from the panel above.',
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
    createHint: 'After generation, you will automatically enter the classroom editor. You can always manage it later in the workbench.',
    myLibrary: 'My Library',
  },
} as const;

function formatTimestamp(timestamp: number, locale: SupportedLocale) {
  return new Date(timestamp).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status: StageListItem['lessonPack']['status'], locale: SupportedLocale) {
  const copy = workbenchCopy[locale];
  if (status === 'ready') return copy.ready;
  if (status === 'in_progress') return copy.inProgress;
  if (status === 'archived') return copy.archived;
  return copy.draft;
}

export function LessonPackWorkbenchClient() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const activeLocale = (locale === 'zh-CN' ? 'zh-CN' : 'en-US') as SupportedLocale;
  const copy = workbenchCopy[activeLocale];
  const activeModule = getActiveModule();
  const isK12Module = activeModule.id === 'k12';
  const k12Presets = (isK12Module ? activeModule.presets : undefined) as K12ModulePresets | undefined;
  const moduleBadge = resolveLocalizedText(activeModule.home.badge, activeLocale);
  const moduleSlogan = resolveLocalizedText(activeModule.home.slogan, activeLocale);
  const modulePlaceholder = resolveLocalizedText(activeModule.home.requirementPlaceholder, activeLocale);
  const moduleSubmitLabel = resolveLocalizedText(activeModule.home.submitLabel, activeLocale);
  const quickPrompts = resolveLocalizedList(activeModule.home.quickPrompts, activeLocale);

  const currentModelId = useSettingsStore((s) => s.modelId);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [k12Form, setK12Form] = useState<K12StructuredInput>(() => {
    return getDefaultK12StructuredInput(k12Presets);
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  const [renameTarget, setRenameTarget] = useState<StageListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      setForm((prev) => ({
        ...prev,
        webSearch: savedWebSearch === 'true',
        language: savedLanguage === 'en-US' ? 'en-US' : 'zh-CN',
      }));
    } catch {
      // localStorage unavailable
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const loadClassrooms = useCallback(async () => {
    const list = await listStages();
    setClassrooms(list);
    if (list.length === 0) {
      setThumbnails({});
      return;
    }
    setThumbnails(await getFirstSlideByStages(list.map((item) => item.id)));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- Initial list hydration triggers state updates */
  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => subscribeHybridSyncState(() => void loadClassrooms()), [loadClassrooms]);

  const allGrades = useMemo(
    () =>
      Array.from(
        new Set(
          classrooms
            .map((item) => item.lessonPack.grade)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [classrooms],
  );
  const allSubjects = useMemo(
    () =>
      Array.from(
        new Set(
          classrooms
            .map((item) => item.lessonPack.subject)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [classrooms],
  );

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
            item.lessonPack.lessonType,
            item.lessonPack.textbookEdition,
            item.lessonPack.unit,
            item.lessonPack.chapter,
          ]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(keyword));
        const matchesGrade = gradeFilter === 'all' || item.lessonPack.grade === gradeFilter;
        const matchesSubject = subjectFilter === 'all' || item.lessonPack.subject === subjectFilter;
        const matchesStatus = statusFilter === 'all' || item.lessonPack.status === statusFilter;
        return matchesKeyword && matchesGrade && matchesSubject && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') return a.createdAt - b.createdAt;
        return b.updatedAt - a.updatedAt;
      });
  }, [classrooms, gradeFilter, search, sortBy, statusFilter, subjectFilter]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable
    }
  };

  const handleGenerate = async () => {
    if (!currentModelId) {
      toast.error(activeLocale === 'zh-CN' ? '请先完成模型配置' : 'Please configure a model first');
      setSettingsOpen(true);
      return;
    }
    if (!isK12Module && !form.requirement.trim()) {
      setError(activeLocale === 'zh-CN' ? '请输入课堂需求' : 'Please describe the lesson');
      return;
    }

    setError(null);
    const userProfile = useUserProfileStore.getState();
    const requirements: UserRequirements = {
      moduleId: activeModule.id,
      k12: isK12Module ? k12Form : undefined,
      requirement:
        isK12Module && k12Presets
          ? buildK12RequirementText({
              input: k12Form,
              presets: k12Presets,
              locale: activeLocale,
              freeform: form.requirement,
              supplementaryPdfName: form.pdfFile?.name,
            })
          : form.requirement.trim(),
      language: form.language,
      userNickname: userProfile.nickname || undefined,
      userBio: userProfile.bio || undefined,
      webSearch: form.webSearch || undefined,
    };

    let pdfStorageKey: string | undefined;
    let pdfFileName: string | undefined;
    let pdfProviderId: string | undefined;
    let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

    if (form.pdfFile) {
      pdfStorageKey = await storePdfBlob(form.pdfFile);
      pdfFileName = form.pdfFile.name;
      const settings = useSettingsStore.getState();
      pdfProviderId = settings.pdfProviderId;
      const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
      if (providerCfg) {
        pdfProviderConfig = { apiKey: providerCfg.apiKey, baseUrl: providerCfg.baseUrl };
      }
    }

    sessionStorage.setItem(
      'generationSession',
      JSON.stringify({
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        selectedTextbookResources: requirements.k12?.chapterResources,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      }),
    );

    router.push('/generation-preview');
  };

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

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500/30">
      {/* 动态光晕背景，增加空间感与前沿感 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] left-[20%] h-[500px] w-[800px] rounded-full bg-indigo-500/10 blur-[120px] dark:bg-indigo-600/10" />
        <div className="absolute top-[10%] right-[10%] h-[400px] w-[600px] rounded-full bg-violet-400/10 blur-[100px] dark:bg-violet-800/10" />
      </div>
      
      {/* 极简顶部导航 */}
      <header className="relative z-10 flex items-center justify-between border-b border-slate-200/50 bg-white/50 px-6 py-4 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/50">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md">
            <Sparkles className="size-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {copy.title}
          </span>
          <Badge variant="secondary" className="hidden rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 sm:inline-flex">
            {moduleBadge}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-16 px-4 py-12 sm:px-6 lg:px-8">
        
        {/* ================= 上半部分：Hero 创作区 ================= */}
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 text-center">
          <div className="space-y-4">
            <h1 className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-500 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent dark:from-white dark:via-slate-200 dark:to-slate-500 sm:text-6xl">
              {moduleSlogan}
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-500 dark:text-slate-400">
              {copy.description}
            </p>
          </div>

          {/* 魔法输入终端 */}
          <div className="w-full space-y-4 rounded-[2rem] border border-slate-200/60 bg-white/70 p-3 shadow-2xl shadow-indigo-500/5 backdrop-blur-xl transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 dark:border-slate-800/60 dark:bg-slate-900/70 dark:shadow-black/50">
            
            <div className="relative">
              <Textarea
                value={form.requirement}
                onChange={(e) => updateForm('requirement', e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder={modulePlaceholder}
                className="min-h-[140px] resize-none border-0 bg-transparent px-5 py-4 text-lg leading-relaxed placeholder:text-slate-400 focus-visible:ring-0 dark:placeholder:text-slate-500"
              />
              <div className="absolute bottom-4 right-4">
                <SpeechButton onTranscription={(text) => updateForm('requirement', form.requirement ? `${form.requirement}\n${text}` : text)} />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl bg-slate-50 p-4 dark:bg-slate-950/50">
              {/* K12 专属筛选器排成一排 */}
              {isK12Module && k12Presets && (
                <K12StructuredInputFields
                  presets={k12Presets}
                  value={k12Form}
                  locale={activeLocale}
                  onChange={setK12Form}
                />
              )}

              {/* 工具栏与生成按钮并排 */}
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
                  <GenerationToolbar
                    language={form.language}
                    onLanguageChange={(value) => updateForm('language', value)}
                    webSearch={form.webSearch}
                    onWebSearchChange={(value) => updateForm('webSearch', value)}
                    onSettingsOpen={() => setSettingsOpen(true)}
                    pdfFile={form.pdfFile}
                    onPdfFileChange={(file) => updateForm('pdfFile', file)}
                    onPdfError={setError}
                  />
                  <AgentBar />
                </div>
                
                <Button 
                  className="h-12 w-full min-w-[160px] rounded-xl bg-indigo-600 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/40 md:w-auto" 
                  onClick={() => void handleGenerate()}
                >
                  <Sparkles className="mr-2 size-5" />
                  {moduleSubmitLabel}
                </Button>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}

          {/* 快捷推荐提示语，放到底部 */}
          {quickPrompts.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-medium text-slate-400">{copy.quickPrompts}：</span>
              {quickPrompts.slice(0, 3).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => updateForm('requirement', prompt)}
                  className="rounded-full border border-slate-200/80 bg-white/50 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 分割线 */}
        <div className="mx-auto h-px w-full max-w-5xl bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-800" />

        {/* ================= 下半部分：我的库 (全宽瀑布流/网格) ================= */}
        <section className="space-y-8">
          {/* 过滤器操作条 */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/60 p-4 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-900/60 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 px-2">
              <Library className="size-5 text-indigo-500" />
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{copy.myLibrary}</h2>
              <Badge variant="secondary" className="ml-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {visibleClassrooms.length}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full md:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder={copy.searchPlaceholder} 
                  className="h-10 rounded-xl bg-white/80 pl-9 dark:bg-slate-950/80" 
                />
              </div>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-10 w-[120px] rounded-xl bg-white/80 dark:bg-slate-950/80"><SelectValue placeholder={copy.grade} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.all}</SelectItem>
                  {allGrades.map((grade) => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="h-10 w-[120px] rounded-xl bg-white/80 dark:bg-slate-950/80"><SelectValue placeholder={copy.subject} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.all}</SelectItem>
                  {allSubjects.map((subject) => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-[120px] rounded-xl bg-white/80 dark:bg-slate-950/80"><SelectValue placeholder={copy.status} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.all}</SelectItem>
                  <SelectItem value="draft">{copy.draft}</SelectItem>
                  <SelectItem value="in_progress">{copy.inProgress}</SelectItem>
                  <SelectItem value="ready">{copy.ready}</SelectItem>
                  <SelectItem value="archived">{copy.archived}</SelectItem>
                </SelectContent>
              </Select>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'recent' | 'oldest')}>
                <SelectTrigger className="h-10 w-[140px] rounded-xl border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800">
                  <SelectValue placeholder={copy.sort} />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="recent">{copy.recent}</SelectItem>
                  <SelectItem value="oldest">{copy.oldest}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 网格视图 - 支持大屏 4 列 */}
          {visibleClassrooms.length === 0 ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/30 dark:border-slate-800 dark:bg-slate-900/30">
              <div className="flex size-20 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500 shadow-sm dark:bg-indigo-500/10 dark:text-indigo-400">
                <LayoutGrid className="size-10" />
              </div>
              <p className="mt-6 text-lg font-medium text-slate-600 dark:text-slate-300">{copy.empty}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleClassrooms.map((classroom) => (
                <article
                  key={classroom.id}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-white/5 dark:bg-slate-900/80"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/packs/${classroom.id}`)}
                    className="relative block w-full overflow-hidden text-left"
                  >
                    <div className="relative aspect-[16/9] w-full bg-slate-100 dark:bg-slate-950">
                      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
                        {thumbnails[classroom.id] ? (
                          <ThumbnailSlide
                            slide={thumbnails[classroom.id]}
                            size={560}
                            viewportSize={thumbnails[classroom.id].viewportSize ?? 1000}
                            viewportRatio={thumbnails[classroom.id].viewportRatio ?? 0.5625}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-400">
                              <Monitor className="size-4" />
                              {classroom.sceneCount} {copy.sceneCount}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* 悬浮状态标签 */}
                      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
                        {classroom.lessonPack.grade ? <Badge className="bg-white/90 text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:bg-slate-900/90 dark:text-slate-300">{classroom.lessonPack.grade}</Badge> : null}
                        {classroom.lessonPack.subject ? <Badge className="bg-white/90 text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:bg-slate-900/90 dark:text-slate-300">{classroom.lessonPack.subject}</Badge> : null}
                      </div>
                      <div className="absolute right-4 top-4 z-10">
                         <Badge variant="secondary" className="bg-indigo-500/90 text-white shadow-sm backdrop-blur hover:bg-indigo-600">{getStatusLabel(classroom.lessonPack.status, activeLocale)}</Badge>
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                            {classroom.name}
                          </h2>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {formatTimestamp(classroom.updatedAt, activeLocale)}
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
                            <DropdownMenuItem onClick={() => router.push(`/classroom/${classroom.id}`)}>
                              <Pencil className="mr-2 size-4" />
                              {copy.continueEdit}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/packs/${classroom.id}?tab=export`)}>
                              <FileOutput className="mr-2 size-4" />
                              {copy.export}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setRenameTarget(classroom); setRenameValue(classroom.name); }}>{copy.rename}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleDuplicate(classroom.id)}>{copy.duplicate}</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(classroom.id)}>{copy.delete}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {classroom.lessonPack.lessonType ? <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">{classroom.lessonPack.lessonType}</Badge> : null}
                        {classroom.lessonPack.durationMinutes ? <Badge variant="outline" className="rounded-md border-slate-200 text-xs font-normal text-slate-600 dark:border-slate-700 dark:text-slate-400">{classroom.lessonPack.durationMinutes} min</Badge> : null}
                        {classroom.lessonPack.chapter ? <Badge variant="outline" className="rounded-md border-indigo-200 text-xs font-normal text-indigo-700 dark:border-indigo-500/30 dark:text-indigo-300">{classroom.lessonPack.chapter}</Badge> : null}
                      </div>
                      {classroom.lessonPack.textbookEdition || classroom.lessonPack.unit ? (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {[classroom.lessonPack.textbookEdition, classroom.lessonPack.volume, classroom.lessonPack.unit]
                            .filter(Boolean)
                            .join(' / ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{copy.renameTitle}</DialogTitle>
            <DialogDescription>{copy.renameDescription}</DialogDescription>
          </DialogHeader>
          <Input 
            className="h-10 rounded-xl"
            value={renameValue} 
            onChange={(e) => setRenameValue(e.target.value)} 
            placeholder={copy.renamePlaceholder} 
          />
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="rounded-xl" onClick={() => setRenameTarget(null)}>{copy.cancel}</Button>
            <Button className="rounded-xl" onClick={() => void handleRename()} disabled={!renameValue.trim()}>{copy.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
