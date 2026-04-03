'use client';

import { useEffect, useMemo, useState } from 'react';
import { Book, Search, CheckCircle2, BookOpen, FilterX, Loader2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getK12TextbookSelection } from '@/lib/module-host/k12';
import {
  resolveLocalizedText,
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
  volumeId: string;
  volumeLabel?: string;
  gradeId: string;
  gradeLabel?: string;
  subjectId: string;
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

interface TextbookLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets?: K12ModulePresets;
  value?: K12StructuredInput;
  locale?: SupportedLocale;
  onSelect: (selection: TextbookSelection) => void;
}

const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';

type TextbookUnits = K12ModulePresets['textbookEditions'][number]['volumes'][number]['units'];

function buildPresetChapterTree(units: TextbookUnits) {
  return units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    children: unit.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      keywords: chapter.keywords,
      resources: chapter.sourceDocuments,
    })),
  }));
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
          attachment.externalUrl ??
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
      subject: library.subjectLabel ?? library.subjectId,
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

function matchesQuery(card: TextbookCard, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    card.name,
    card.edition,
    card.subject,
    card.publisher ?? '',
    card.grade ?? '',
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
    const matchSubject = filters.subjectFilter === '全部' || book.subject === filters.subjectFilter;
    const matchGrade = filters.gradeFilter === '全部' || book.grade === filters.gradeFilter;
    const matchPublisher =
      filters.publisherFilter === '全部' || book.publisher === filters.publisherFilter;
    const matchEdition = filters.editionFilter === '全部' || book.edition === filters.editionFilter;
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

export function TextbookLibraryModal({
  open,
  onOpenChange,
  presets,
  value,
  locale = DEFAULT_LOCALE,
  onSelect,
}: TextbookLibraryModalProps) {
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

  const currentSelection = useMemo(() => {
    if (!presets || !value) return undefined;
    return getK12TextbookSelection(presets, value);
  }, [presets, value]);

  const presetCards = useMemo<TextbookCard[]>(() => {
    if (!presets || !currentSelection) return [];

    return currentSelection.editions.flatMap((edition) =>
      edition.volumes
        .filter(
          (volume) =>
            volume.gradeId === value?.gradeId && volume.subjectId === value?.subjectId,
        )
        .map((volume) => {
          const subject = presets.subjects.find((option) => option.id === volume.subjectId);
          const grade = presets.grades.find((option) => option.id === volume.gradeId);

          return {
            id: `preset:${volume.id}`,
            source: 'preset',
            name: resolveLocalizedText(volume.label, locale),
            edition: resolveLocalizedText(edition.label, locale),
            subject: subject ? subject.label[locale] : volume.subjectId,
            publisher: edition.publisher,
            grade: grade ? grade.label[locale] : volume.gradeId,
            editionId: edition.id,
            volumeId: volume.id,
            volumeLabel: resolveLocalizedText(volume.label, locale),
            gradeId: volume.gradeId,
            gradeLabel: grade ? grade.label[locale] : volume.gradeId,
            subjectId: volume.subjectId,
            units: buildPresetChapterTree(volume.units),
          };
        }),
    );
  }, [currentSelection, locale, presets, value?.gradeId, value?.subjectId]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function loadRemoteLibraries() {
      setIsLoadingRemote(true);
      try {
        const requestLibraries = async (scope: 'official' | 'personal') => {
          const response = await fetch('/api/textbook-libraries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'listLibraries',
              scope,
              ...(scope === 'official' ? { view: 'published' } : {}),
              filters: {
                gradeId: value?.gradeId,
                subjectId: value?.subjectId,
              },
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
          requestLibraries('official'),
          requestLibraries('personal'),
        ]);

        if (!cancelled) {
          setRemoteCards(buildRemoteCards([...officialLibraries, ...personalLibraries]));
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
  }, [locale, open, value?.gradeId, value?.subjectId]);

  const textbookCards = remoteCards.length > 0 ? remoteCards : presetCards;

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

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
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
      } else {
        setActiveChapterPath([]);
      }
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

  const emptyText =
    isLoadingRemote && remoteCards.length === 0 && presetCards.length === 0
      ? locale === 'en-US'
        ? 'Loading textbook libraries...'
        : '正在加载教材库...'
      : locale === 'en-US'
        ? 'No textbooks found'
        : '没有找到符合条件的教材';

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-[1100px] h-[85vh] p-0 flex flex-col overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-row items-center justify-between sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="size-5 text-indigo-500" />
            {locale === 'en-US' ? 'Textbook Resource Center' : '教材资源中心'}
          </DialogTitle>

          <div className="flex items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  locale === 'en-US'
                    ? 'Search textbooks, editions, chapters...'
                    : '搜索教材名称、版本、章节...'
                }
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
                    {locale === 'en-US' ? 'Subject' : '学科'}
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
                    {locale === 'en-US' ? 'Grade' : '年级'}
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
                    {locale === 'en-US' ? 'Publisher' : '出版社'}
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
                    {locale === 'en-US' ? 'Edition' : '版本'}
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
              {isLoadingRemote && remoteCards.length === 0 && presetCards.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400">
                  <Loader2 className="size-5 animate-spin" />
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
                        <div className="aspect-[3/4] w-full bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center overflow-hidden relative">
                          <div className="flex flex-col items-center gap-2 px-3 text-center">
                            <Book className="size-8 text-slate-300 dark:text-slate-600" />
                            <span className="text-xs font-medium text-slate-400">{book.subject}</span>
                          </div>
                          {isSelected ? (
                            <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm animate-in zoom-in-50 duration-200">
                              <CheckCircle2 className="size-4" />
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-1.5 px-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                            >
                              {sourceLabel(locale, book.source)}
                            </Badge>
                            {book.publisher ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                              >
                                {book.publisher}
                              </Badge>
                            ) : null}
                          </div>
                          <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight">
                            {book.name}
                          </h4>
                          <div className="flex gap-1.5 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                            >
                              {book.edition}
                            </Badge>
                            {book.grade ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-none font-normal"
                              >
                                {book.grade}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FilterX className="size-10 opacity-30" />
                  <p className="text-sm">{emptyText}</p>
                  <Button variant="link" onClick={handleClearFilters}>
                    {locale === 'en-US' ? 'Clear filters' : '清除所有筛选'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-[3] min-w-[320px] max-w-[400px] border-l border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-col">
            {activeBook ? (
              <>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Book className="size-4 text-indigo-500" />
                    {locale === 'en-US' ? 'Choose chapter' : '选择章节'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {locale === 'en-US' ? 'Current' : '当前'}：{activeBook.name} ({activeBook.edition})
                  </p>
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
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/30 dark:bg-slate-900/30">
                <BookOpen className="size-12 opacity-20 mb-4" />
                <p className="text-sm">
                  {locale === 'en-US'
                    ? 'Choose a textbook on the left first'
                    : '请先在左侧选择一本教材'}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
