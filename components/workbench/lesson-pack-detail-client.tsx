'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  FileOutput,
  History,
  LayoutTemplate,
  Loader2,
  PackageOpen,
  PlaySquare,
  Presentation,
  RefreshCw,
  Save,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import type { Scene } from '@/lib/types/stage';
import type { Slide } from '@/lib/types/slides';
import {
  getFirstSlideByStages,
  listLessonPackVersions,
  loadStageData,
  restoreLessonPackVersion,
  saveLessonPackVersion,
} from '@/lib/utils/stage-storage';

const detailCopy = {
  'zh-CN': {
    back: '返回工作台',
    continueEdit: '进入编辑器',
    saveVersion: '保存为版本',
    versionNote: '版本备注（可选，例如：第一版草稿）',
    lessonPlan: '教学设计',
    slides: '课堂演示',
    practice: '互动练习',
    versions: '历史版本',
    export: '导出物料',
    loading: '正在加载备课包...',
    failed: '备课包加载失败',
    empty: '当前备课包还没有生成内容。',
    exported: '已导出',
    notExported: '未导出',
    planDescription: '按当前备课包内容整理出的结构概览，帮助老师在进入编辑器前快速回看。',
    slideDescription: '展示当前备课包里的页面结构与内容顺序。',
    practiceDescription: '从内容中提取测验与互动场景，方便快速定位课堂练习。',
    versionDescription: '随时手动保存当前版本，并在需要时安全地恢复到历史节点。',
    exportDescription: '导出后，工作台会实时显示已导出状态，方便追踪交付进度。',
    restored: '已恢复所选版本',
    saved: '版本已保存',
    planSummary: '内容摘要',
    outlineFallback: '生成的内容结构会在这里汇总展示。',
    noPractice: '当前还没有课堂练习内容。',
    noVersions: '还没有版本记录，建议在开展大改动前先保存一下当前版本。',
    pptx: '导出 PPTX 源文件',
    resourcePack: '导出完整资源包',
    updatedAt: '最近更新',
    metadata: '基础信息',
    sceneCount: '内容页',
    restoreCurrent: '恢复此版本',
    retry: '重试',
  },
  'en-US': {
    back: 'Back to workbench',
    continueEdit: 'Open in Editor',
    saveVersion: 'Save as version',
    versionNote: 'Version note (optional)',
    lessonPlan: 'Lesson Plan',
    slides: 'Slides',
    practice: 'Practice',
    versions: 'History',
    export: 'Export',
    loading: 'Loading lesson pack...',
    failed: 'Failed to load lesson pack',
    empty: 'This lesson pack has no generated content yet.',
    exported: 'Exported',
    notExported: 'Not exported',
    planDescription: 'A structured overview of the current lesson pack before going back into the editor.',
    slideDescription: 'Review the current page flow and scene order.',
    practiceDescription: 'Locate quiz and interactive scenes quickly.',
    versionDescription: 'Save a snapshot of the current state and safely restore to any historical point.',
    exportDescription: 'After export, the workbench will update to reflect the "Exported" status.',
    restored: 'Version restored',
    saved: 'Version saved',
    planSummary: 'Content summary',
    outlineFallback: 'Generated content will be summarized here.',
    noPractice: 'No interactive practice scenes found yet.',
    noVersions: 'No version history yet. Save your current version before making significant changes.',
    pptx: 'Export PPTX',
    resourcePack: 'Export resource pack',
    updatedAt: 'Updated',
    metadata: 'Metadata',
    sceneCount: 'scenes',
    restoreCurrent: 'Restore this version',
    retry: 'Retry',
  },
} as const;

function formatDate(locale: 'zh-CN' | 'en-US', timestamp: number) {
  return new Date(timestamp).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LessonPackDetailClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const packId = params?.id as string;
  const { locale } = useI18n();
  const activeLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const copy = detailCopy[activeLocale];

  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const outlines = useStageStore((s) => s.outlines);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listLessonPackVersions>>>([]);
  const [thumbnail, setThumbnail] = useState<Slide | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const { exporting, exportPPTX, exportResourcePack } = useExportPPTX();
  const previousExporting = useRef(false);

  const currentTab = searchParams.get('tab') ?? 'plan';

  const loadPack = useCallback(async () => {
    if (!packId) return;
    setLoading(true);
    setError(null);

    try {
      const store = useStageStore.getState();
      await store.loadFromStorage(packId);

      const stored = await loadStageData(packId);
      if (!stored) {
        const res = await fetch(`/api/classroom?id=${encodeURIComponent(packId)}`);
        if (!res.ok) throw new Error(copy.failed);
        const json = await res.json();
        if (!json.success || !json.classroom) throw new Error(copy.failed);
        const classroom = json.classroom;
        useStageStore.setState({
          stage: classroom.stage,
          scenes: classroom.scenes,
          currentSceneId: classroom.scenes[0]?.id ?? null,
          chats: [],
          outlines: [],
          generatingOutlines: [],
        });
      }

      const [packVersions, thumbs] = await Promise.all([
        listLessonPackVersions(packId),
        getFirstSlideByStages([packId]),
      ]);
      setVersions(packVersions);
      setThumbnail(thumbs[packId]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.failed);
    } finally {
      setLoading(false);
    }
  }, [copy.failed, packId]);

  useEffect(() => {
    void loadPack();
  }, [loadPack]);

  useEffect(() => {
    if (previousExporting.current && !exporting) {
      void loadPack();
    }
    previousExporting.current = exporting;
  }, [exporting, loadPack]);

  const slideScenes = useMemo(
    () => scenes.filter((scene) => scene.content.type === 'slide'),
    [scenes],
  );
  const practiceScenes = useMemo(
    () => scenes.filter((scene) => scene.content.type === 'quiz' || scene.content.type === 'interactive'),
    [scenes],
  );
  const planItems = useMemo(() => {
    if (outlines.length > 0) return outlines.map((outline) => outline.title);
    return scenes.slice(0, 8).map((scene) => scene.title);
  }, [outlines, scenes]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', value);
    router.replace(`/packs/${packId}?${next.toString()}`);
  };

  const handleSaveVersion = async () => {
    await saveLessonPackVersion(packId, { note: versionNote.trim() || undefined, source: 'manual' });
    toast.success(copy.saved);
    setVersionNote('');
    await loadPack();
  };

  const handleRestoreVersion = async (versionId: string) => {
    const confirmed = window.confirm(
      activeLocale === 'zh-CN' ? '确认恢复到这个历史版本吗？当前未保存的更改将丢失。' : 'Restore this historical version? Unsaved changes will be lost.',
    );
    if (!confirmed) return;
    await restoreLessonPackVersion(packId, versionId);
    toast.success(copy.restored);
    await loadPack();
  };

  // --- 全屏 Loading 态优化 ---
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-white shadow-xl shadow-indigo-500/10 dark:bg-slate-900">
          <Loader2 className="size-6 animate-spin text-indigo-600 dark:text-indigo-400" />
        </div>
        <p className="mt-6 font-medium text-slate-500 dark:text-slate-400">{copy.loading}</p>
      </div>
    );
  }

  // --- 错误态优化 ---
  if (error || !stage) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <Card className="w-full max-w-lg rounded-[2rem] border-0 shadow-2xl shadow-indigo-500/5 dark:bg-slate-900/80">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">
              <LayoutTemplate className="size-6" />
            </div>
            <CardTitle className="text-2xl">{copy.failed}</CardTitle>
            <CardDescription className="text-base">{error ?? copy.empty}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-4 pt-6">
            <Button variant="outline" className="rounded-xl h-11 px-6" onClick={() => router.push('/')}>
              <ArrowLeft className="mr-2 size-4" />
              {copy.back}
            </Button>
            <Button className="rounded-xl h-11 px-6" onClick={() => void loadPack()}>
              <RefreshCw className="mr-2 size-4" />
              {copy.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-500/30">
      {/* 动态光晕背景 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[10%] right-[10%] h-[400px] w-[600px] rounded-full bg-indigo-500/10 blur-[100px] dark:bg-indigo-600/10" />
        <div className="absolute top-[30%] -left-[10%] h-[500px] w-[500px] rounded-full bg-violet-400/5 blur-[120px] dark:bg-violet-800/10" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        
        {/* ================= 顶部：沉浸式 Hero Banner ================= */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/70 shadow-xl shadow-indigo-500/5 backdrop-blur-xl dark:border-white/5 dark:bg-slate-900/60">
          {/* Banner 内部装饰点缀 */}
          <div className="absolute top-0 right-0 p-8 opacity-20 dark:opacity-10">
            <Sparkles className="size-32 text-indigo-500" />
          </div>

          <div className="relative flex flex-col gap-8 p-8 md:p-10 lg:flex-row lg:items-center lg:justify-between">
            {/* 左侧：缩略图与信息 */}
            <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
              <div className="group relative aspect-[16/10] w-full max-w-[280px] shrink-0 overflow-hidden rounded-[1.5rem] bg-slate-100 shadow-inner ring-1 ring-slate-900/5 dark:bg-slate-950 dark:ring-white/10 sm:w-64">
                {thumbnail ? (
                  <ThumbnailSlide
                    slide={thumbnail}
                    size={400}
                    viewportSize={thumbnail.viewportSize ?? 1000}
                    viewportRatio={thumbnail.viewportRatio ?? 0.5625}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/50">
                    <LayoutTemplate className="size-10 text-indigo-200 dark:text-indigo-800" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </div>
              
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {stage.lessonPack?.exportStatus === 'exported' ? copy.exported : copy.notExported}
                  </Badge>
                  {stage.lessonPack?.grade ? <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{stage.lessonPack.grade}</Badge> : null}
                  {stage.lessonPack?.subject ? <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{stage.lessonPack.subject}</Badge> : null}
                  {stage.lessonPack?.lessonType ? <Badge className="bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400" variant="outline">{stage.lessonPack.lessonType}</Badge> : null}
                  {stage.lessonPack?.chapter ? <Badge className="border-indigo-200 bg-white text-indigo-700 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300" variant="outline">{stage.lessonPack.chapter}</Badge> : null}
                </div>
                
                <div>
                  <h1
                    className="line-clamp-2 max-w-5xl text-3xl font-bold tracking-tight leading-tight text-slate-900 dark:text-white sm:text-4xl"
                    title={stage.name}
                  >
                    {stage.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500 dark:text-slate-400">
                    {stage.description || copy.planDescription}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> {copy.updatedAt}: {formatDate(activeLocale, stage.updatedAt)}</span>
                  <span className="flex items-center gap-1.5"><LayoutTemplate className="size-4" /> {scenes.length} {copy.sceneCount}</span>
                  {stage.lessonPack?.durationMinutes ? <span className="flex items-center gap-1.5"><PlaySquare className="size-4" /> {stage.lessonPack.durationMinutes} min</span> : null}
                </div>
              </div>
            </div>

            {/* 右侧：核心操作区 */}
            <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
              <Button 
                size="lg" 
                className="w-full rounded-xl bg-indigo-600 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 sm:w-auto" 
                onClick={() => router.push(`/classroom/${packId}`)}
              >
                <ExternalLink className="mr-2 size-5" />
                {copy.continueEdit}
              </Button>
              <div className="flex w-full gap-3 sm:w-auto">
                <Button variant="secondary" className="flex-1 rounded-xl bg-white shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 sm:flex-none" onClick={() => router.push('/')}>
                  <ArrowLeft className="mr-2 size-4" />
                  {copy.back}
                </Button>
                <Button variant="secondary" className="flex-1 rounded-xl bg-white shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 sm:flex-none" onClick={() => void handleSaveVersion()}>
                  <Save className="mr-2 size-4 text-indigo-600 dark:text-indigo-400" />
                  {copy.saveVersion}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= 主体内容区：Tabs ================= */}
        <Tabs value={currentTab} onValueChange={setTab} className="flex flex-col gap-6">
          {/* Apple 风格胶囊导航 */}
          <div className="overflow-x-auto pb-2">
            <TabsList className="inline-flex h-14 items-center justify-start gap-1 rounded-[1.25rem] bg-white/60 p-1.5 shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md dark:bg-slate-900/60 dark:ring-white/10">
              {[
                { value: 'plan', icon: ScrollText, label: copy.lessonPlan },
                { value: 'slides', icon: Presentation, label: copy.slides },
                { value: 'practice', icon: PackageOpen, label: copy.practice },
                { value: 'versions', icon: History, label: copy.versions },
                { value: 'export', icon: FileOutput, label: copy.export },
              ].map((tab) => (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value}
                  className="inline-flex h-full min-w-[120px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-indigo-500"
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-[500px]">
            {/* --- 1. 教学设计 (文档流视图) --- */}
            <TabsContent value="plan" className="m-0 mt-2 focus-visible:ring-0">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_400px]">
                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <div className="h-2 w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                  <CardHeader className="px-8 pt-8">
                    <CardTitle className="text-2xl">{copy.lessonPlan}</CardTitle>
                    <CardDescription className="text-base">{copy.planDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="px-8 pb-10">
                    <div className="rounded-2xl bg-slate-50/50 p-6 ring-1 ring-inset ring-slate-100 dark:bg-slate-950/50 dark:ring-slate-800/50">
                      {planItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <ScrollText className="mb-3 size-10 opacity-20" />
                          <p>{copy.outlineFallback}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {planItems.map((item, index) => (
                            <div key={`${item}-${index}`} className="flex items-start gap-4 group">
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                                {index + 1}
                              </div>
                              <div className="flex-1 pt-0.5 text-base text-slate-700 dark:text-slate-300">
                                {item}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                    <CardHeader>
                      <CardTitle className="text-lg">{copy.metadata}</CardTitle>
                      <CardDescription>{copy.planSummary}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-950 dark:ring-slate-800">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">学段学科</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stage.lessonPack?.grade || '—'} / {stage.lessonPack?.subject || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-950 dark:ring-slate-800">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">课型时长</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stage.lessonPack?.lessonType || '—'} / {stage.lessonPack?.durationMinutes ?? '—'} min</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-950 dark:ring-slate-800">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">教材章节</span>
                        <span className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {[stage.lessonPack?.textbookEdition, stage.lessonPack?.unit, stage.lessonPack?.chapter]
                            .filter(Boolean)
                            .join(' / ') || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 dark:bg-slate-950 dark:ring-slate-800">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">内容统计</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{slideScenes.length} 演示 / {practiceScenes.length} 练习</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* --- 2. 课堂演示 (画廊视图) --- */}
            <TabsContent value="slides" className="m-0 mt-2 focus-visible:ring-0">
              <Card className="rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                <CardHeader className="px-8 pt-8">
                  <CardTitle className="text-2xl">{copy.slides}</CardTitle>
                  <CardDescription className="text-base">{copy.slideDescription}</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {scenes.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-slate-500">{copy.empty}</div>
                    ) : (
                      scenes.map((scene, index) => <VisualSceneTile key={scene.id} index={index} scene={scene} />)
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- 3. 互动练习 (画廊视图) --- */}
            <TabsContent value="practice" className="m-0 mt-2 focus-visible:ring-0">
              <Card className="rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                <CardHeader className="px-8 pt-8">
                  <CardTitle className="text-2xl">{copy.practice}</CardTitle>
                  <CardDescription className="text-base">{copy.practiceDescription}</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  {practiceScenes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-800">
                      <PackageOpen className="mb-4 size-12 text-slate-300 dark:text-slate-600" />
                      <p className="text-base font-medium text-slate-500 dark:text-slate-400">{copy.noPractice}</p>
                    </div>
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      {practiceScenes.map((scene, index) => <VisualSceneTile key={scene.id} index={index} scene={scene} />)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* --- 4. 历史版本 (时间轴视图) --- */}
            <TabsContent value="versions" className="m-0 mt-2 focus-visible:ring-0">
              <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
                {/* 侧边：保存新版本 */}
                <Card className="h-fit sticky top-8 rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Save className="size-5 text-indigo-500" />{copy.saveVersion}</CardTitle>
                    <CardDescription>{copy.versionDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Input 
                        className="h-11 rounded-xl bg-white dark:bg-slate-950" 
                        value={versionNote} 
                        onChange={(e) => setVersionNote(e.target.value)} 
                        placeholder={copy.versionNote} 
                      />
                    </div>
                    <Button className="h-11 w-full rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => void handleSaveVersion()}>
                      确定保存
                    </Button>
                  </CardContent>
                </Card>

                {/* 主体：时间轴 */}
                <Card className="rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                  <CardHeader className="px-8 pt-8 pb-4">
                    <CardTitle className="text-2xl">{copy.versions}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-8 pb-8">
                    {versions.length === 0 ? (
                      <p className="py-8 text-center text-slate-500 dark:text-slate-400">{copy.noVersions}</p>
                    ) : (
                      <div className="relative ml-4 space-y-8 border-l-2 border-slate-100 py-4 dark:border-slate-800">
                        {versions.map((version) => (
                          <div key={version.id} className="relative pl-8">
                            {/* 时间轴圆点 */}
                            <div className="absolute -left-[9px] top-2 h-4 w-4 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                            
                            <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 transition-shadow hover:shadow-md dark:bg-slate-950 dark:ring-slate-800 md:flex-row md:items-center md:justify-between">
                              <div className="space-y-2">
                                <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                                  {version.note || `未命名版本 (${formatDate(activeLocale, version.createdAt)})`}
                                </p>
                                <div className="flex items-center gap-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                                  <Badge variant="secondary" className="rounded-md px-2 py-0.5 font-mono text-[10px] uppercase">
                                    {version.source}
                                  </Badge>
                                  <span>{formatDate(activeLocale, version.createdAt)}</span>
                                </div>
                              </div>
                              <Button variant="outline" className="rounded-xl shrink-0" onClick={() => void handleRestoreVersion(version.id)}>
                                <RefreshCw className="mr-2 size-4" />
                                {copy.restoreCurrent}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* --- 5. 导出物料 (行动导向视图) --- */}
            <TabsContent value="export" className="m-0 mt-2 focus-visible:ring-0">
              <Card className="rounded-3xl border-white/60 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-slate-900/60">
                <CardHeader className="px-8 pt-8 text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <FileOutput className="size-8" />
                  </div>
                  <CardTitle className="text-3xl">{copy.export}</CardTitle>
                  <CardDescription className="mx-auto mt-2 max-w-xl text-base">{copy.exportDescription}</CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-12 pt-6">
                  <div className="mx-auto flex max-w-2xl flex-col gap-4 sm:flex-row">
                    <Button 
                      size="lg"
                      className="h-16 flex-1 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-lg font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-violet-700 hover:to-indigo-700 hover:shadow-xl" 
                      onClick={exportPPTX} 
                      disabled={exporting || slideScenes.length === 0}
                    >
                      {exporting ? <Loader2 className="mr-3 size-6 animate-spin" /> : <Presentation className="mr-3 size-6" />}
                      {copy.pptx}
                    </Button>
                    <Button 
                      size="lg"
                      variant="outline" 
                      className="h-16 flex-1 rounded-2xl border-2 border-slate-200 bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900" 
                      onClick={exportResourcePack} 
                      disabled={exporting || slideScenes.length === 0}
                    >
                      {exporting ? <Loader2 className="mr-3 size-6 animate-spin" /> : <PackageOpen className="mr-3 size-6" />}
                      {copy.resourcePack}
                    </Button>
                  </div>
                  <div className="mt-8 text-center">
                    <Button variant="ghost" className="text-slate-500" onClick={() => router.push(`/classroom/${packId}`)}>
                      <ExternalLink className="mr-2 size-4" />
                      先不导出，{copy.continueEdit}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </Tabs>
      </div>
    </div>
  );
}

// 可视化幻灯片占位卡片组件
function VisualSceneTile({ index, scene }: { index: number; scene: Scene }) {
  const isInteractive = scene.content.type === 'quiz' || scene.content.type === 'interactive';
  
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      {/* 模拟 16:9 画布区域 */}
      <div className={`relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden ${isInteractive ? 'bg-gradient-to-br from-orange-50 to-rose-50 dark:from-orange-950/40 dark:to-rose-950/40' : 'bg-gradient-to-br from-slate-50 to-indigo-50/50 dark:from-slate-900 dark:to-indigo-950/30'}`}>
        <div className="absolute left-3 top-3 flex size-6 items-center justify-center rounded-full bg-white/80 text-xs font-bold text-slate-700 shadow-sm backdrop-blur dark:bg-slate-800/80 dark:text-slate-300">
          {index + 1}
        </div>
        {isInteractive ? (
          <PackageOpen className="size-10 text-orange-300 dark:text-orange-700" />
        ) : (
          <Presentation className="size-10 text-indigo-200 dark:text-indigo-800" />
        )}
      </div>
      
      {/* 信息区域 */}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="line-clamp-2 min-h-[40px] text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
          {scene.title}
        </h3>
        <div className="mt-auto pt-2">
          <Badge variant={isInteractive ? 'default' : 'secondary'} className={`rounded-md px-2 py-0.5 text-[10px] uppercase font-mono ${isInteractive ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}>
            {scene.content.type}
          </Badge>
        </div>
      </div>
    </div>
  );
}
