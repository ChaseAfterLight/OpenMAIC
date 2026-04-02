'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, BookText, Calculator, Languages, Layers, Plus, Trash2, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 请确保引入了这些 shadcn 组件
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { K12TextbookEdition, SupportedLocale } from '@/lib/module-host/types';
import type { K12TextbookCatalogSnapshot } from '@/lib/k12-textbook-catalog/types';

export type BookshelfCopy = {
  title: string;
  desc: string;
  users: string;
  addEdition: string;
  deleteEdition: string;
  delete: string;
  emptyHub: string;
  loading: string;
  published: string;
  draft: string;
  editionCount: string;
  chapterCount: string;
  volumeCount: string;
  publisherFallback: string;
  emptyCta: string;
  allSubjects: string;
  createDrawerTitle: string;
  createDrawerDesc: string;
  editionLabel: string;
  publisherLabel: string;
  subjectLabel: string;
  gradeLabel: string;
  volumeLabelInput: string;
  cancel: string;
  createAndEnter: string;
};

// 1. 定义创建向导的数据结构
export type CreateEditionInput = {
  editionLabel: string;
  publisher: string;
  subjectId: string;
  gradeId: string;
  volumeLabel: string;
};

function createDefaultEditionInput(locale: SupportedLocale): CreateEditionInput {
  return {
    editionLabel: locale === 'zh-CN' ? '新教材版本' : 'New Textbook Edition',
    publisher: PUBLISHER_OPTIONS[locale][0],
    subjectId: 'math',
    gradeId: '',
    volumeLabel: locale === 'zh-CN' ? '上册' : 'Volume 1',
  };
}

type BookshelfViewProps = {
  editions: K12TextbookEdition[] | undefined;
  loading: boolean;
  saving?: boolean;
  published: K12TextbookCatalogSnapshot | null;
  text: BookshelfCopy;
  activeLocale: SupportedLocale;
  // 2. 修改 onAddEdition 的入参，接收表单数据
  onAddEdition: (data: CreateEditionInput) => void | Promise<void>;
  onDeleteEdition: (editionId: string) => void;
  onSelectVolume: (editionId: string, volumeId: string) => void;
  onDeleteVolume: (editionId: string, volumeId: string) => void;
};

type BookPalette = {
  cover: string;
  glow: string;
};

const BOOK_PALETTES: BookPalette[] = [
  { cover: 'from-sky-500 via-cyan-500 to-indigo-600', glow: 'bg-cyan-200/60' },
  { cover: 'from-indigo-600 via-violet-600 to-fuchsia-500', glow: 'bg-violet-200/60' },
  { cover: 'from-emerald-500 via-teal-500 to-cyan-500', glow: 'bg-emerald-200/60' },
  { cover: 'from-amber-500 via-orange-500 to-rose-500', glow: 'bg-orange-200/60' },
  { cover: 'from-slate-800 via-slate-700 to-slate-500', glow: 'bg-slate-300/50' },
  { cover: 'from-fuchsia-600 via-rose-500 to-orange-400', glow: 'bg-rose-200/60' },
];

const VOLUME_OPTIONS: Record<SupportedLocale, string[]> = {
  'zh-CN': ['上册', '下册', '必修一', '必修二'],
  'en-US': ['Volume 1', 'Volume 2', 'Required 1', 'Required 2'],
};

const PUBLISHER_OPTIONS: Record<SupportedLocale, string[]> = {
  'zh-CN': [
    '人民教育出版社',
    '科学出版社',
    '外语教学与研究出版社',
    '高等教育出版社',
    '上海教育出版社',
    '北京师范大学出版社',
  ],
  'en-US': [
    "People's Education Press",
    'Science Press',
    'Foreign Language Teaching and Research Press',
    'Higher Education Press',
    'Shanghai Education Press',
    'Beijing Normal University Press',
  ],
};

const GRADE_OPTIONS: Array<{
  id: string;
  label: Record<SupportedLocale, string>;
}> = [
  { id: 'grade-1', label: { 'zh-CN': '一年级', 'en-US': 'Grade 1' } },
  { id: 'grade-2', label: { 'zh-CN': '二年级', 'en-US': 'Grade 2' } },
  { id: 'grade-3', label: { 'zh-CN': '三年级', 'en-US': 'Grade 3' } },
  { id: 'grade-4', label: { 'zh-CN': '四年级', 'en-US': 'Grade 4' } },
  { id: 'grade-5', label: { 'zh-CN': '五年级', 'en-US': 'Grade 5' } },
  { id: 'grade-6', label: { 'zh-CN': '六年级', 'en-US': 'Grade 6' } },
  { id: 'grade-7', label: { 'zh-CN': '初一', 'en-US': 'Middle 1' } },
  { id: 'grade-8', label: { 'zh-CN': '初二', 'en-US': 'Middle 2' } },
  { id: 'grade-9', label: { 'zh-CN': '初三', 'en-US': 'Middle 3' } },
  { id: 'grade-10', label: { 'zh-CN': '高一', 'en-US': 'High 1' } },
  { id: 'grade-11', label: { 'zh-CN': '高二', 'en-US': 'High 2' } },
  { id: 'grade-12', label: { 'zh-CN': '高三', 'en-US': 'High 3' } },
];

function hashId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getBookPalette(id: string) {
  return BOOK_PALETTES[hashId(id) % BOOK_PALETTES.length];
}

type SubjectMeta = {
  label: Record<SupportedLocale, string>;
  icon: LucideIcon;
  palette: BookPalette;
};

const SUBJECT_META: Record<string, SubjectMeta> = {
  math: {
    label: { 'zh-CN': '数学', 'en-US': 'Math' },
    icon: Calculator,
    palette: { cover: 'from-sky-500 via-cyan-500 to-indigo-600', glow: 'bg-cyan-200/60' },
  },
  chinese: {
    label: { 'zh-CN': '语文', 'en-US': 'Chinese' },
    icon: BookText,
    palette: { cover: 'from-rose-500 via-red-500 to-orange-500', glow: 'bg-red-200/60' },
  },
  english: {
    label: { 'zh-CN': '英语', 'en-US': 'English' },
    icon: Languages,
    palette: { cover: 'from-violet-500 via-purple-500 to-fuchsia-500', glow: 'bg-purple-200/60' },
  },
};

function getSubjectMeta(subjectId: string): SubjectMeta {
  return SUBJECT_META[subjectId] ?? {
    label: { 'zh-CN': subjectId || '其他学科', 'en-US': subjectId || 'Other' },
    icon: BookOpen,
    palette: getBookPalette(subjectId || 'subject'),
  };
}

function getSubjectLabel(subjectId: string, locale: SupportedLocale) {
  const meta = getSubjectMeta(subjectId);
  return meta.label[locale] || meta.label['zh-CN'] || meta.label['en-US'] || subjectId || '未分类';
}

function getEditionTitle(edition: K12TextbookEdition, activeLocale: SupportedLocale) {
  return edition.label[activeLocale] || edition.label['zh-CN'] || edition.label['en-US'] || '未命名教材';
}

function getVolumeTitle(volume: K12TextbookEdition['volumes'][number], activeLocale: SupportedLocale) {
  return volume.label[activeLocale] || volume.label['zh-CN'] || volume.label['en-US'] || '未命名册次';
}

function getVolumeChapterCount(volume: K12TextbookEdition['volumes'][number]) {
  return volume.units.reduce((sum, unit) => sum + unit.chapters.length, 0);
}

function localeHint(locale: SupportedLocale, kind: 'edition' | 'volume') {
  if (locale === 'zh-CN') {
    switch (kind) {
      case 'edition':
        return '例如：人教版（2024）';
      case 'volume':
        return '例如：上册、必修一';
    }
  }

  switch (kind) {
    case 'edition':
      return 'e.g. PEP Edition 2024';
    case 'volume':
      return 'e.g. Volume 1';
  }
}

// ============================================================================
// 新增: 侧边抽屉表单组件 (CreateEditionDrawer)
// ============================================================================
export function CreateEditionDrawer({
  open,
  onOpenChange,
  onSubmit,
  saving,
  activeLocale,
  text,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateEditionInput) => void | Promise<void>;
  saving: boolean;
  activeLocale: SupportedLocale;
  text: BookshelfCopy;
}) {
  const [formData, setFormData] = useState<CreateEditionInput>(() => createDefaultEditionInput(activeLocale));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.editionLabel || !formData.publisher || !formData.subjectId || !formData.gradeId || !formData.volumeLabel) return;
    await onSubmit(formData);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-0 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-2xl sm:max-w-[34rem] dark:border-slate-800/80 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.94))]"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800/80">
            <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              {text.createDrawerTitle}
            </SheetTitle>
          </div>

          <form id="create-edition-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="editionLabel" className="text-slate-700 dark:text-slate-300">
                  {text.editionLabel} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="editionLabel"
                  placeholder={localeHint(activeLocale, 'edition')}
                  required
                  value={formData.editionLabel}
                  onChange={(e) => setFormData({ ...formData, editionLabel: e.target.value })}
                  className="h-11 rounded-2xl border-slate-200 bg-white/80 shadow-sm transition-shadow placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500/25 dark:border-slate-700 dark:bg-slate-950/70 dark:placeholder:text-slate-600"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="publisher" className="text-slate-700 dark:text-slate-300">
                  {text.publisherLabel}
                </Label>
                <Select
                  value={formData.publisher}
                  onValueChange={(val) => setFormData({ ...formData, publisher: val })}
                >
                  <SelectTrigger
                    id="publisher"
                    className="h-11 rounded-2xl border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <SelectValue placeholder={text.publisherLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLISHER_OPTIONS[activeLocale].map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="subjectId" className="text-slate-700 dark:text-slate-300">
                  {text.subjectLabel} <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={formData.subjectId}
                  onValueChange={(val) => setFormData({ ...formData, subjectId: val })}
                >
                  <SelectTrigger
                    id="subjectId"
                    className="h-11 rounded-2xl border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <SelectValue placeholder={text.subjectLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUBJECT_META).map(([key, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-slate-500" />
                            <span>{meta.label[activeLocale] || meta.label['zh-CN']}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="gradeId" className="text-slate-700 dark:text-slate-300">
                  {text.gradeLabel} <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={formData.gradeId}
                  onValueChange={(val) => setFormData({ ...formData, gradeId: val })}
                >
                  <SelectTrigger
                    id="gradeId"
                    className="h-11 rounded-2xl border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <SelectValue placeholder={text.gradeLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label[activeLocale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="volumeLabel" className="text-slate-700 dark:text-slate-300">
                  {text.volumeLabelInput} <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={formData.volumeLabel}
                  onValueChange={(val) => setFormData({ ...formData, volumeLabel: val })}
                >
                  <SelectTrigger
                    id="volumeLabel"
                    className="h-11 rounded-2xl border-slate-200 bg-white/80 shadow-sm dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <SelectValue placeholder={text.volumeLabelInput} />
                  </SelectTrigger>
                  <SelectContent>
                    {VOLUME_OPTIONS[activeLocale].map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-[13px] leading-6 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  创建后会自动生成这一册，并直接进入工作台。
                </div>
              </div>
            </div>
          </form>

          <SheetFooter className="mt-auto border-t border-slate-200/80 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-full border-slate-200 bg-transparent px-4 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
            >
              {text.cancel}
            </Button>
            <Button
              type="submit"
              form="create-edition-form"
              disabled={saving}
              className="rounded-full bg-slate-900 px-5 text-white shadow-lg shadow-slate-900/15 transition-transform hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {saving ? text.loading : text.createAndEnter}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// BookCover & BookCoverSkeleton 组件保持不变
// ============================================================================
export function BookCover({
  volume,
  editionTitle,
  edition,
  activeLocale,
  text,
  onClick,
  onDelete,
}: {
  volume: K12TextbookEdition['volumes'][number];
  editionTitle: string;
  edition: K12TextbookEdition;
  activeLocale: SupportedLocale;
  text: BookshelfCopy;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const subjectMeta = useMemo(() => getSubjectMeta(volume.subjectId), [volume.subjectId]);
  const palette = subjectMeta.palette;
  const SubjectIcon = subjectMeta.icon;
  const totalUnits = volume.units.length;
  const totalChapters = useMemo(() => getVolumeChapterCount(volume), [volume]);
  const volumeTitle = getVolumeTitle(volume, activeLocale);
  const subjectName = getSubjectLabel(volume.subjectId, activeLocale);

  return (
    <div className="group relative block w-full text-left focus-visible:outline-none">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.();
        }}
        className="absolute right-2 top-2 z-20 h-8 w-8 rounded-full border border-white/15 bg-black/20 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-rose-500/90 hover:text-white group-hover:opacity-100"
        aria-label={text.delete}
        title={text.delete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus-visible:outline-none"
      >
        <article className="mx-auto w-full max-w-[15rem] [perspective:1200px] transition-transform duration-500 group-hover:-translate-y-2">
          <div
            className={`relative aspect-[2/3] overflow-hidden rounded-l-md rounded-r-[1.35rem] shadow-[0_24px_60px_rgba(15,23,42,0.18)] transition-all duration-500 group-hover:rotate-[-1.25deg] group-hover:shadow-[0_34px_80px_rgba(15,23,42,0.28)] bg-gradient-to-br ${palette.cover}`}
          >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.34),transparent_36%)] opacity-90" />
          <div className="absolute inset-0 opacity-18 [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="absolute left-0 top-0 h-full w-5 bg-gradient-to-r from-black/25 via-white/12 to-transparent" />
          <div className="absolute left-[0.85rem] top-4 bottom-4 w-px bg-white/35" />

          <div className="absolute inset-0 flex flex-col p-5 text-white sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Badge
                variant="secondary"
                className="rounded-full border-0 bg-white/18 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
              >
                {edition.publisher || '未定出版社'}
              </Badge>
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
                <SubjectIcon className="h-3.5 w-3.5" />
                <span>{subjectName}</span>
              </div>
            </div>

            <div className="mt-auto space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="rounded-full border-0 bg-white/16 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md"
                >
                  {editionTitle}
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full border-0 bg-white/16 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md"
                >
                  {subjectName}
                </Badge>
                {volume.gradeId ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full border-0 bg-white/16 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md"
                  >
                    {volume.gradeId}
                  </Badge>
                ) : null}
              </div>
              <h3 className="max-w-[11rem] text-xl font-semibold leading-tight tracking-tight drop-shadow-md sm:text-2xl">
                {volumeTitle}
              </h3>
              <div className={`h-1 w-14 rounded-full ${palette.glow}`} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/15 bg-black/12 p-3 backdrop-blur-md">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                <span>{editionTitle}</span>
                <span>{volume.id.slice(-4)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/88">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  {totalUnits} 单元
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  {totalChapters} {text.chapterCount}
                </span>
              </div>
            </div>
          </div>
        </div>
        </article>
      </button>
    </div>
  );
}

export function BookCoverSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[15rem]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-l-md rounded-r-[1.35rem] bg-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.10)] dark:bg-slate-800/80">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/30 via-transparent to-transparent" />
        <div className="absolute left-0 top-0 h-full w-5 bg-gradient-to-r from-black/10 via-white/10 to-transparent" />
      </div>
    </div>
  );
}

// ============================================================================
// 主视图: BookshelfView
// ============================================================================
export function BookshelfView({
  editions,
  loading,
  saving = false,
  published,
  text,
  activeLocale,
  onAddEdition,
  onDeleteEdition,
  onSelectVolume,
  onDeleteVolume,
}: BookshelfViewProps) {
  const router = useRouter();
  const [activeSubjectFilter, setActiveSubjectFilter] = useState<'all' | string>('all');
  
  // 3. 抽屉状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSession, setDrawerSession] = useState(0);

  const editionCount = editions?.length ?? 0;
  const volumeCount = editions?.reduce((sum, edition) => sum + edition.volumes.length, 0) ?? 0;
  const publishedLabel = published ? `${text.published} v${published.version}` : text.draft;
  const availableSubjects = useMemo(() => {
    const subjects = new Map<string, string>();
    for (const edition of editions ?? []) {
      for (const volume of edition.volumes) {
        if (!volume.subjectId || subjects.has(volume.subjectId)) continue;
        subjects.set(volume.subjectId, getSubjectLabel(volume.subjectId, activeLocale));
      }
    }
    return Array.from(subjects.entries()).map(([id, label]) => ({ id, label }));
  }, [activeLocale, editions]);
  
  const filteredEditions = useMemo(() => {
    if (!editions) return [];
    return editions
      .map((edition) => ({
        edition,
        volumes:
          activeSubjectFilter === 'all'
            ? edition.volumes
            : edition.volumes.filter((volume) => volume.subjectId === activeSubjectFilter),
      }))
      .filter((item) => item.volumes.length > 0);
  }, [activeSubjectFilter, editions]);

  const handleCreateSubmit = async (data: CreateEditionInput) => {
    try {
      await onAddEdition(data);
      setIsDrawerOpen(false);
    } catch {
      // Parent handler already reports errors.
    }
  };

  const openCreateDrawer = () => {
    setDrawerSession((value) => value + 1);
    setIsDrawerOpen(true);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_42%,_#e8edf3_100%)] transition-colors dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#07111f_44%,_#020617_100%)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-cyan-300/15 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-200/40 via-transparent to-transparent dark:from-slate-900/40" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
        <header className="flex flex-col gap-6 border-b border-slate-200/70 pb-6 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600 shadow-sm backdrop-blur dark:bg-slate-950/60 dark:text-indigo-300">
              Textbook Shelf
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl">
                {text.title}
              </h1>
              <p className="max-w-2xl text-base font-medium leading-7 text-slate-500 dark:text-slate-400 sm:text-lg">
                {text.desc}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                <Layers className="h-4 w-4" />
                {editionCount} {text.editionCount}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                <BookOpen className="h-4 w-4" />
                {volumeCount} {text.volumeCount}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                {publishedLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="rounded-full text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100"
              onClick={() => router.push('/admin/users')}
            >
              <Users className="mr-2 h-4 w-4" />
              {text.users}
            </Button>
            {/* 4. 修改右上角按钮的行为，打开 Drawer */}
            <Button
              onClick={openCreateDrawer}
              disabled={loading || saving}
              className="rounded-full bg-slate-900 px-5 text-white shadow-lg shadow-slate-900/15 transition-transform hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              {text.addEdition}
            </Button>
          </div>
        </header>

        {!loading && availableSubjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-6 dark:border-slate-800">
            <Button
              type="button"
              size="sm"
              variant={activeSubjectFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setActiveSubjectFilter('all')}
              className={`rounded-full ${
                activeSubjectFilter === 'all'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-white/50 dark:bg-slate-900/50'
              }`}
            >
              {text.allSubjects}
            </Button>
            {availableSubjects.map((subject) => {
              const meta = getSubjectMeta(subject.id);
              const Icon = meta.icon;
              const isActive = activeSubjectFilter === subject.id;
              return (
                <Button
                  key={subject.id}
                  type="button"
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  onClick={() => setActiveSubjectFilter(subject.id)}
                  className={`rounded-full ${
                    isActive
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-white/50 dark:bg-slate-900/50'
                  }`}
                >
                  <Icon className="mr-2 h-3.5 w-3.5" />
                  {subject.label}
                </Button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <BookCoverSkeleton key={index} />
            ))}
          </div>
        ) : !editions?.length ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-12 text-center shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/40">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              <BookOpen className="h-7 w-7" />
            </div>
            <h2 className="mt-6 text-xl font-semibold text-slate-900 dark:text-slate-50">
              {text.emptyHub}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {text.emptyCta}
            </p>
            {/* 5. 修改空状态的按钮行为，打开 Drawer */}
            <Button
              onClick={openCreateDrawer}
              disabled={saving}
              className="mt-6 rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              {text.addEdition}
            </Button>
          </div>
        ) : (
          <section className="relative">
            <div className="absolute inset-x-6 top-[-0.75rem] h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent dark:via-slate-700/70" />
            <div className="space-y-10">
              {filteredEditions.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                  当前分类下暂无教材
                </div>
              ) : (
                filteredEditions.map(({ edition, volumes }) => {
                  const editionTitle = getEditionTitle(edition, activeLocale);
                  return (
                    <div key={edition.id} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                            {edition.publisher || text.publisherFallback}
                          </div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                            {editionTitle}
                          </h2>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="rounded-full text-slate-500 hover:bg-white/70 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-rose-400"
                          onClick={() => onDeleteEdition(edition.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {text.deleteEdition}
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {volumes.map((volume) => (
                          <BookCover
                            key={volume.id}
                            volume={volume}
                            edition={edition}
                            editionTitle={editionTitle}
                            activeLocale={activeLocale}
                            text={text}
                            onClick={() => onSelectVolume(edition.id, volume.id)}
                            onDelete={() => onDeleteVolume(edition.id, volume.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>

      {/* 6. 挂载创建向导 Drawer */}
      <CreateEditionDrawer
        key={drawerSession}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSubmit={handleCreateSubmit}
        saving={saving}
        activeLocale={activeLocale}
        text={text}
      />
    </div>
  );
}
