'use client';

import { useEffect, useMemo, useState } from 'react';
import { Book, Search, CheckCircle2, BookOpen, FilterX, Loader2, Download } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { downloadTextbookFile } from './textbook-download';
import {
  type K12ModulePresets,
  type K12StructuredInput,
  type K12TextbookResource,
  type SupportedLocale,
} from '@/lib/module-host/types';
import type { TextbookLibraryRecord } from '@/lib/server/textbook-library-types';

export interface Textbook {
  id: string;
  name: string;
  cover?: string;
  edition: string;
  subject: string;
  publisher?: string;
  grade?: string;
  source: 'preset' | 'official' | 'personal';
}

export interface TextbookSelection {
  textbook: Textbook;
  libraryId?: string;
  editionId?: string;
  volumeId?: string;
  volumeLabel?: string;
  unitId?: string;
  unitTitle?: string;
  chapterId: string;
  chapterTitle: string;
  chapterPath: string[];
  chapterTitlePath: string[];
  chapterSummary?: string;
  chapterKeywords?: string[];
  chapterResources?: K12TextbookResource[];
  publisher?: string;
  // Add gradeId, gradeLabel, subjectId, subjectLabel for lesson pack metadata
  gradeId?: string;
  gradeLabel?: string;
  subjectId?: string;
  subjectLabel?: string;
}

interface Chapter {
  id: string;
  title: string;
  summary?: string;
  keywords?: string[];
  resources?: K12TextbookResource[];
  children?: Chapter[];
}

export interface TextbookCard extends Textbook {
  libraryId?: string;
  editionId: string;
  editionLabel?: string;
  volumeId: string;
  volumeLabel?: string;
  gradeId: string;
  gradeLabel?: string;
  subjectId: string;
  subjectLabel?: string;
  units: Chapter[];
}

export interface TextbookCardFilters {
  searchQuery: string;
  sourceFilter: 'all' | 'official' | 'personal' | 'preset';
  subjectFilter: string;
  gradeFilter: string;
  publisherFilter: string;
  editionFilter: string;
}

interface ResourceLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets?: K12ModulePresets;
  value?: K12StructuredInput;
  locale?: SupportedLocale;
  copyVariant?: 'k12' | 'adult-education';
  onSelect: (selection: TextbookSelection) => void;
}

const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';
type ResourceLibraryCopyVariant = 'k12' | 'adult-education';

function getBookGradient(id: string) {
  const gradients = [
    'from-blue-500 to-cyan-400',
    'from-indigo-500 to-purple-500',
    'from-emerald-400 to-teal-500',
    'from-orange-400 to-rose-400',
    'from-slate-700 to-slate-500',
  ];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[index % gradients.length];
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesLookupValue(candidate: string | undefined, filter: string) {
  const normalizedFilter = normalizeLookupValue(filter);
  if (!normalizedFilter) {
    return true;
  }
  return normalizeLookupValue(candidate ?? '') === normalizedFilter;
}

function buildAttachmentResources(library: TextbookLibraryRecord, chapterId: string) {
  for (const volume of library.volumes) {
    for (const unit of volume.units) {
      const chapter = unit.chapters.find((item) => item.id === chapterId);
      if (!chapter) continue;

      return chapter.attachments.map((attachment) => ({
        id: attachment.id,
        title:
          attachment.status === 'ready' || attachment.status === 'uploaded'
            ? attachment.title
            : `${attachment.title} (${attachment.status})`,
        type: attachment.type,
        description: attachment.description ?? attachment.extractedSummary,
        url:
          (attachment.sourcePdf?.importDraftId
            ? `/api/textbook-libraries?action=downloadAttachment&id=${encodeURIComponent(attachment.id)}`
            : attachment.externalUrl) ??
          `/api/textbook-libraries?action=downloadAttachment&id=${encodeURIComponent(attachment.id)}`,
      })) satisfies K12TextbookResource[];
    }
  }

  return [] satisfies K12TextbookResource[];
}

function buildRemoteCards(libraries: TextbookLibraryRecord[]): TextbookCard[] {
  return libraries.flatMap((library) =>
    library.volumes.map((volume) => ({
      id: `${library.scope}:${library.id}:${volume.id}`,
      libraryId: library.id,
      source: library.scope,
      name: volume.label,
      edition: library.editionLabel,
      editionLabel: library.editionLabel,
      cover: library.cover,
      subject: library.subjectLabel ?? library.subjectId,
      subjectLabel: library.subjectLabel,
      publisher: library.publisher,
      grade: library.gradeLabel ?? library.gradeId,
      editionId: library.editionId,
      volumeId: volume.id,
      volumeLabel: volume.label,
      gradeId: library.gradeId,
      gradeLabel: library.gradeLabel,
      subjectId: library.subjectId,
      units: volume.units.map((unit) => ({
        id: unit.id,
        title: unit.title,
        children: unit.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          summary: chapter.summary,
          keywords: chapter.keywords,
          resources: buildAttachmentResources(library, chapter.id),
        })),
      })),
    })),
  );
}

function dedupeTextbookCards(cards: TextbookCard[]) {
  const deduped = new Map<string, TextbookCard>();

  for (const card of cards) {
    const existing = deduped.get(card.id);
    if (!existing) {
      deduped.set(card.id, card);
      continue;
    }

    const existingHasCover = Boolean(existing.cover);
    const nextHasCover = Boolean(card.cover);
    if (nextHasCover && !existingHasCover) {
      deduped.set(card.id, card);
    }
  }

  return [...deduped.values()];
}

function matchesQuery(card: TextbookCard, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    card.name,
    card.edition,
    card.editionLabel ?? '',
    card.subject,
    card.subjectLabel ?? '',
    card.publisher ?? '',
    card.grade ?? '',
    card.gradeLabel ?? '',
    card.subjectId,
    card.gradeId,
    card.editionId,
    ...card.units.flatMap((unit) => [
      unit.title,
      ...(unit.children ?? []).flatMap((chapter) => [
        chapter.title,
        chapter.summary ?? '',
        ...(chapter.keywords ?? []),
      ]),
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

export function filterTextbookCards(cards: TextbookCard[], filters: TextbookCardFilters) {
  return cards.filter((book) => {
    const matchSearch = matchesQuery(book, filters.searchQuery);
    const matchSource = filters.sourceFilter === 'all' || book.source === filters.sourceFilter;
    const matchSubject =
      filters.subjectFilter === '全部' ||
      matchesLookupValue(book.subject, filters.subjectFilter) ||
      matchesLookupValue(book.subjectLabel, filters.subjectFilter) ||
      matchesLookupValue(book.subjectId, filters.subjectFilter);
    const matchGrade =
      filters.gradeFilter === '全部' ||
      matchesLookupValue(book.grade, filters.gradeFilter) ||
      matchesLookupValue(book.gradeLabel, filters.gradeFilter) ||
      matchesLookupValue(book.gradeId, filters.gradeFilter);
    const matchPublisher =
      filters.publisherFilter === '全部' || matchesLookupValue(book.publisher, filters.publisherFilter);
    const matchEdition =
      filters.editionFilter === '全部' ||
      matchesLookupValue(book.edition, filters.editionFilter) ||
      matchesLookupValue(book.editionLabel, filters.editionFilter) ||
      matchesLookupValue(book.editionId, filters.editionFilter);
    return (
      matchSearch &&
      matchSource &&
      matchSubject &&
      matchGrade &&
      matchPublisher &&
      matchEdition
    );
  });
}

function sourceLabel(locale: SupportedLocale, source: 'all' | 'official' | 'personal' | 'preset') {
  if (locale === 'en-US') {
    if (source === 'official') return 'Official';
    if (source === 'personal') return 'Mine';
    if (source === 'preset') return 'Preset';
    return 'All';
  }
  if (source === 'official') return '官方';
  if (source === 'personal') return '我的';
  if (source === 'preset') return '内置';
  return '全部';
}

function getLibraryCopy(locale: SupportedLocale, copyVariant: ResourceLibraryCopyVariant) {
  if (copyVariant !== 'adult-education') {
    return {
      title: locale === 'en-US' ? 'Textbook Resource Center' : '教材资源中心',
      searchPlaceholder:
        locale === 'en-US'
          ? 'Search textbooks, editions, chapters...'
          : '搜索教材名称、版本、章节...',
      emptyText: locale === 'en-US' ? 'No textbooks found' : '没有找到符合条件的教材',
      subjectLabel: locale === 'en-US' ? 'Subject' : '学科',
      gradeLabel: locale === 'en-US' ? 'Grade' : '年级',
      publisherLabel: locale === 'en-US' ? 'Publisher' : '出版社',
      editionLabel: locale === 'en-US' ? 'Edition' : '版本',
      loadingLibraries:
        locale === 'en-US' ? 'Loading textbook libraries...' : '正在加载教材库...',
      loadingDetails:
        locale === 'en-US' ? 'Loading textbook details...' : '正在加载教材详情...',
      chooseSection: locale === 'en-US' ? 'Choose chapter' : '选择章节',
      current: locale === 'en-US' ? 'Current' : '当前',
      unitCount: locale === 'en-US' ? 'units' : '单元',
      chapterResources: locale === 'en-US' ? 'Chapter resources' : '章节资料',
      chapterResourcesHint:
        locale === 'en-US'
          ? 'Download the attached source documents directly'
          : '可直接下载该章节附带的源文件',
      pickLeftFirst:
        locale === 'en-US' ? 'Choose a textbook on the left first' : '请先在左侧选择一本教材',
      cardMetaFallback: locale === 'en-US' ? 'Publisher' : '出版社',
    };
  }

  return {
    title: locale === 'en-US' ? 'Course Resource Library' : '课程资料库',
    searchPlaceholder:
      locale === 'en-US'
        ? 'Search resources, editions, modules, or sections...'
        : '搜索资料名称、版本、模块或章节主题...',
    emptyText: locale === 'en-US' ? 'No resources found' : '没有找到符合条件的资料',
    subjectLabel: locale === 'en-US' ? 'Focus' : '方向',
    gradeLabel: locale === 'en-US' ? 'Audience' : '对象',
    publisherLabel: locale === 'en-US' ? 'Provider' : '机构',
    editionLabel: locale === 'en-US' ? 'Edition' : '资料版本',
    loadingLibraries:
      locale === 'en-US' ? 'Loading resource libraries...' : '正在加载资料库...',
    loadingDetails:
      locale === 'en-US' ? 'Loading resource details...' : '正在加载资料详情...',
    chooseSection: locale === 'en-US' ? 'Choose section' : '选择章节主题',
    current: locale === 'en-US' ? 'Current' : '当前',
    unitCount: locale === 'en-US' ? 'modules' : '模块',
    chapterResources: locale === 'en-US' ? 'Linked resources' : '配套资料',
    chapterResourcesHint:
      locale === 'en-US'
        ? 'Download the linked supporting materials directly'
        : '可直接下载该主题附带的参考资料',
    pickLeftFirst:
      locale === 'en-US' ? 'Choose a resource on the left first' : '请先在左侧选择一份资料',
    cardMetaFallback: locale === 'en-US' ? 'Provider' : '机构',
  };
}

export function ResourceLibraryModal({
  open,
  onOpenChange,
  presets: _presets,
  value,
  locale = DEFAULT_LOCALE,
  copyVariant = 'k12',
  onSelect,
}: ResourceLibraryModalProps) {
  const text = getLibraryCopy(locale, copyVariant);
  const [activeBook, setActiveBook] = useState<TextbookCard | null>(null);
  const [activeChapterPath, setActiveChapterPath] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'official' | 'personal' | 'preset'>('all');
  const [subjectFilter, setSubjectFilter] = useState('全部');
  const [gradeFilter, setGradeFilter] = useState('全部');
  const [publisherFilter, setPublisherFilter] = useState('全部');
  const [editionFilter, setEditionFilter] = useState('全部');
  const [remoteCards, setRemoteCards] = useState<TextbookCard[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function loadRemoteLibraries() {
      setIsLoadingRemote(true);
      try {
        const requestLibraries = async (
          scope: 'official' | 'personal',
          options?: { view?: 'draft' | 'published'; withFilters?: boolean },
        ) => {
          const response = await fetch('/api/textbook-libraries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'listLibraries',
              scope,
              ...(options?.view ? { view: options.view } : {}),
              ...(options?.withFilters ?? true
                ? {
                    filters: {
                      gradeId: value?.gradeId,
                      subjectId: value?.subjectId,
                    },
                  }
                : {}),
            }),
            cache: 'no-store',
          });
          const data = (await response.json().catch(() => ({}))) as {
            success?: boolean;
            libraries?: TextbookLibraryRecord[];
          };
          if (!response.ok || !data.success) {
            throw new Error(`Failed to load ${scope} textbooks`);
          }
          return data.libraries ?? [];
        };

        const [officialLibraries, personalLibraries] = await Promise.all([
          requestLibraries('official', { view: 'published', withFilters: true }),
          requestLibraries('personal', { withFilters: true }),
        ]);

        let nextRemoteCards = buildRemoteCards([...officialLibraries, ...personalLibraries]);

        if (nextRemoteCards.length === 0) {
          const fallbackLibraries = await Promise.all([
            requestLibraries('official', { view: 'published', withFilters: false }),
            requestLibraries('official', { view: 'draft', withFilters: false }),
            requestLibraries('personal', { withFilters: false }),
          ]);
          nextRemoteCards = buildRemoteCards(fallbackLibraries.flat());
        }

        if (!cancelled) {
          setRemoteCards(dedupeTextbookCards(nextRemoteCards));
        }
      } catch {
        if (!cancelled) {
          setRemoteCards([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRemote(false);
        }
      }
    }

    void loadRemoteLibraries();
    return () => {
      cancelled = true;
    };
  }, [open, value?.gradeId, value?.subjectId]);

  const textbookCards = remoteCards;
  const isInitialLoading = open && isLoadingRemote && remoteCards.length === 0;

  const sourceOptions = useMemo(() => {
    const sources = new Set<'official' | 'personal' | 'preset'>();
    for (const card of textbookCards) {
      sources.add(card.source);
    }
    return ['all', ...Array.from(sources)] as Array<'all' | 'official' | 'personal' | 'preset'>;
  }, [textbookCards]);

  const subjectOptions = useMemo(() => {
    const subjects = new Map<string, string>();
    for (const card of textbookCards) {
      subjects.set(card.subject, card.subject);
    }
    return ['全部', ...Array.from(subjects.values())];
  }, [textbookCards]);

  const gradeOptions = useMemo(() => {
    const grades = new Map<string, string>();
    for (const card of textbookCards) {
      if (card.grade) {
        grades.set(card.grade, card.grade);
      }
    }
    return ['全部', ...Array.from(grades.values())];
  }, [textbookCards]);

  const publisherOptions = useMemo(() => {
    const publishers = new Map<string, string>();
    for (const card of textbookCards) {
      if (card.publisher) {
        publishers.set(card.publisher, card.publisher);
      }
    }
    return ['全部', ...Array.from(publishers.values())];
  }, [textbookCards]);

  const editionOptions = useMemo(() => {
    const editions = new Set<string>();
    for (const card of textbookCards) {
      editions.add(card.edition);
    }
    return ['全部', ...Array.from(editions)];
  }, [textbookCards]);

  const activeUnit = activeBook?.units.find((unit) => unit.id === activeChapterPath[0]) ?? null;
  const activeChapter =
    activeUnit?.children?.find((chapter) => chapter.id === activeChapterPath[1]) ?? null;

  const filteredBooks = useMemo(() => {
    return filterTextbookCards(textbookCards, {
      searchQuery,
      sourceFilter,
      subjectFilter,
      gradeFilter,
      publisherFilter,
      editionFilter,
    });
  }, [
    editionFilter,
    gradeFilter,
    publisherFilter,
    searchQuery,
    sourceFilter,
    subjectFilter,
    textbookCards,
  ]);

  useEffect(() => {
    if (!open || !activeBook) return;
    const freshActiveBook =
      textbookCards.find((book) => book.id === activeBook.id) ??
      textbookCards.find(
        (book) =>
          book.volumeId === activeBook.volumeId ||
          (book.libraryId && book.libraryId === activeBook.libraryId),
      );

    if (freshActiveBook && freshActiveBook !== activeBook) {
      setActiveBook(freshActiveBook);
    }
  }, [activeBook, open, textbookCards]);

  useEffect(() => {
    if (!open || isLoadingRemote || activeBook || textbookCards.length === 0) return;

    const currentBook =
      textbookCards.find(
        (book) =>
          book.volumeId === value?.volumeId ||
          (book.libraryId && book.libraryId === value?.textbookLibraryId),
      ) ??
      filteredBooks[0] ??
      textbookCards[0] ??
      null;

    setActiveBook(currentBook);
    if (value?.unitId && value.chapterId && currentBook) {
      setActiveChapterPath([value.unitId, value.chapterId]);
    }
  }, [
    activeBook,
    filteredBooks,
    isLoadingRemote,
    open,
    textbookCards,
    value?.chapterId,
    value?.textbookLibraryId,
    value?.unitId,
    value?.volumeId,
  ]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setIsLoadingRemote(true);
      setRemoteCards([]);
      setActiveBook(null);
      setActiveChapterPath([]);
    } else {
      setActiveBook(null);
      setActiveChapterPath([]);
    }

    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    if (!activeBook || activeChapterPath.length < 2) return;

    const activeUnit = activeBook.units.find((unit) => unit.id === activeChapterPath[0]);
    const activeChapter = activeUnit?.children?.find((chapter) => chapter.id === activeChapterPath[1]);
    if (!activeUnit || !activeChapter) return;

    onSelect({
      textbook: activeBook,
      libraryId: activeBook.libraryId,
      editionId: activeBook.editionId,
      volumeId: activeBook.volumeId,
      volumeLabel: activeBook.volumeLabel,
      unitId: activeUnit.id,
      unitTitle: activeUnit.title,
      chapterId: activeChapter.id,
      chapterTitle: activeChapter.title,
      chapterPath: [activeUnit.id, activeChapter.id],
      chapterTitlePath: [activeUnit.title, activeChapter.title],
      chapterSummary: activeChapter.summary,
      chapterKeywords: activeChapter.keywords,
      chapterResources: activeChapter.resources,
      publisher: activeBook.publisher,
      // Pass gradeId, gradeLabel, subjectId, subjectLabel from the selected textbook
      gradeId: activeBook.gradeId,
      gradeLabel: activeBook.gradeLabel,
      subjectId: activeBook.subjectId,
      subjectLabel: activeBook.subjectLabel,
    });
    onOpenChange(false);
  };

  const handleClearFilters = () => {
    setSourceFilter('all');
    setSubjectFilter('全部');
    setGradeFilter('全部');
    setPublisherFilter('全部');
    setEditionFilter('全部');
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-[1100px] h-[85vh] p-0 flex flex-col overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-row items-center justify-between sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="size-5 text-indigo-500" />
            {text.title}
          </DialogTitle>

          <div className="flex items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={text.searchPlaceholder}
                className="h-9 pl-9 rounded-full bg-slate-100 border-transparent dark:bg-slate-800 focus-visible:bg-white transition-colors"
              />
            </div>
            <Button
              onClick={handleConfirm}
              disabled={!activeBook || activeChapterPath.length === 0}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 h-9 px-6 transition-all"
            >
              {locale === 'en-US' ? 'Confirm' : '确认选择'}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-[5] flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950/50">
            <div className="p-6 pb-2 border-b border-slate-200/40 dark:border-slate-800/40">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                    {locale === 'en-US' ? 'Source' : '来源'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {sourceOptions.map((source) => (
                      <button
                        key={source}
                        onClick={() => setSourceFilter(source)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-full transition-all',
                          sourceFilter === source
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {sourceLabel(locale, source)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                    {text.subjectLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {subjectOptions.map((subject) => (
                      <button
                        key={subject}
                        onClick={() => setSubjectFilter(subject)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-full transition-all',
                          subjectFilter === subject
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                    {text.gradeLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {gradeOptions.map((grade) => (
                      <button
                        key={grade}
                        onClick={() => setGradeFilter(grade)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-full transition-all',
                          gradeFilter === grade
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {grade}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                    {text.publisherLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {publisherOptions.map((publisher) => (
                      <button
                        key={publisher}
                        onClick={() => setPublisherFilter(publisher)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-full transition-all',
                          publisherFilter === publisher
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {publisher}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-16">
                    {text.editionLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {editionOptions.map((edition) => (
                      <button
                        key={edition}
                        onClick={() => setEditionFilter(edition)}
                        className={cn(
                          'px-3 py-1 text-sm rounded-full transition-all',
                          editionFilter === edition
                            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-medium shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                        )}
                      >
                        {edition}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isInitialLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="size-5 animate-spin" />
                  <p className="text-sm">{text.loadingLibraries}</p>
                </div>
              ) : filteredBooks.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
                  {filteredBooks.map((book) => {
                    const isSelected = activeBook?.id === book.id;
                    return (
                      <div
                        key={book.id}
                        onClick={() => {
                          setActiveBook(book);
                          setActiveChapterPath([]);
                        }}
                        className={cn(
                          'group relative flex flex-col gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer bg-white dark:bg-slate-900',
                          isSelected
                            ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                            : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700 shadow-sm',
                        )}
                      >
                        <div
                          className={`aspect-[2/3] w-full rounded-r-2xl rounded-l-md overflow-hidden relative shadow-lg transition-all duration-500 group-hover:shadow-2xl bg-gradient-to-br ${getBookGradient(book.id)}`}
                        >
                          {book.cover ? (
                            <img
                              src={book.cover}
                              alt={book.name}
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                          ) : (
                            <>
                              <div className={`absolute inset-0 bg-gradient-to-br ${getBookGradient(book.id)}`} />
                              <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10" />
                              <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-white/30 z-20" />
                            </>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
                          <div className="absolute inset-0 p-4 flex flex-col justify-between text-white z-20">
                            <Badge
                              variant="secondary"
                              className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-0 self-start text-[10px] shadow-sm"
                            >
                              {book.publisher || text.cardMetaFallback}
                            </Badge>
                            <div className="space-y-1 mt-auto mb-4">
                              <h4 className="font-bold text-base leading-tight drop-shadow-md line-clamp-3">
                                {book.name}
                              </h4>
                              <p className="text-[11px] text-white/80 line-clamp-1">
                                {book.subject} • {book.grade}
                              </p>
                            </div>
                          </div>
                          {isSelected ? (
                            <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm animate-in zoom-in-50 duration-200">
                              <CheckCircle2 className="size-4" />
                            </div>
                          ) : null}
                        </div>

                        <div className="px-1 flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                          >
                            {sourceLabel(locale, book.source)}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FilterX className="size-10 opacity-30" />
                  <p className="text-sm">{text.emptyText}</p>
                  <Button variant="link" onClick={handleClearFilters}>
                    {locale === 'en-US' ? 'Clear filters' : '清除所有筛选'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-[3] min-w-[320px] max-w-[400px] border-l border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-col">
            {isInitialLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-50/30 dark:bg-slate-900/30">
                <Loader2 className="size-5 animate-spin" />
                <p className="text-sm">{text.loadingDetails}</p>
              </div>
            ) : activeBook ? (
              <>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br ${getBookGradient(activeBook.id)}`}
                    >
                      {activeBook.cover ? (
                        <img
                          src={activeBook.cover}
                          alt={activeBook.name}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <div className="aspect-[3/4] w-full flex items-center justify-center bg-gradient-to-b from-black/10 to-black/25">
                          <Book className="size-6 text-white/90" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Book className="size-4 text-indigo-500" />
                        {text.chooseSection}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {text.current}：{activeBook.name} ({activeBook.edition})
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeBook.publisher ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                          >
                            {activeBook.publisher}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                        >
                          {activeBook.units.length} {text.unitCount}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="space-y-2">
                    {activeBook.units.map((unit) => (
                      <div key={unit.id} className="space-y-1">
                        <div className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/30 rounded-lg">
                          {unit.title}
                        </div>
                        {unit.children?.map((chapter) => {
                          const isSelected = activeChapterPath[1] === chapter.id;
                          return (
                            <button
                              key={chapter.id}
                              onClick={() => {
                                setActiveChapterPath([unit.id, chapter.id]);
                              }}
                              className={cn(
                                'w-full text-left flex items-center justify-between px-3 py-2.5 ml-1 text-sm rounded-lg transition-all',
                                isSelected
                                  ? 'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/15 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-500/20'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
                              )}
                            >
                              <div className="min-w-0">
                                <span className="block truncate">{chapter.title}</span>
                                {chapter.resources?.length ? (
                                  <span className="mt-1 block text-[11px] text-slate-400">
                                    {locale === 'en-US'
                                      ? `${chapter.resources.length} resources`
                                      : `${chapter.resources.length} 份资料`}
                                  </span>
                                ) : null}
                              </div>
                              {isSelected ? (
                                <CheckCircle2 className="size-4 shrink-0 text-indigo-500" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {activeChapter?.resources?.length ? (
                    <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800">
                            {text.chapterResources}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">
                            {text.chapterResourcesHint}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-white text-slate-500 border-slate-200"
                        >
                          {activeChapter.resources.length}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {activeChapter.resources.map((resource) => (
                          <button
                            key={resource.id}
                            type="button"
                            disabled={!resource.url}
                            onClick={() => {
                              if (!resource.url) return;
                              void downloadTextbookFile(resource.url, resource.title);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                              resource.url
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/40'
                                : 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400',
                            )}
                          >
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {resource.title}
                              </span>
                              {resource.description ? (
                                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                  {resource.description}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase">
                                {resource.type}
                              </span>
                              <Download className="size-3.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 dark:bg-slate-900/30">
                <BookOpen className="size-12 opacity-20 mb-4" />
                <p className="text-sm">{text.pickLeftFirst}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
