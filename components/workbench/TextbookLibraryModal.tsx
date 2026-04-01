'use client';

import { useMemo, useState } from 'react';
import { Book, Search, CheckCircle2, BookOpen, FilterX } from 'lucide-react';

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
  type SupportedLocale,
} from '@/lib/module-host/types';

export interface Textbook {
  id: string;
  name: string;
  cover?: string;
  edition: string;
  subject: string;
  editionId?: string;
  volumeId?: string;
  gradeId?: string;
  subjectId?: string;
}

interface Chapter {
  id: string;
  title: string;
  summary?: string;
  keywords?: string[];
  children?: Chapter[];
}

interface TextbookCard extends Textbook {
  editionId: string;
  volumeId: string;
  gradeId: string;
  subjectId: string;
  units: Chapter[];
}

interface TextbookLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets?: K12ModulePresets;
  value?: K12StructuredInput;
  locale?: SupportedLocale;
  onSelect: (textbook: Textbook, chapterPath: string[], chapterTitle: string) => void;
}

const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';

type TextbookUnits = K12ModulePresets['textbookEditions'][number]['volumes'][number]['units'];

function buildChapterTree(units: TextbookUnits) {
  return units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    children: unit.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      keywords: chapter.keywords,
    })),
  }));
}

function matchesQuery(card: TextbookCard, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    card.name,
    card.edition,
    card.subject,
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
  const [activeChapterLabelPath, setActiveChapterLabelPath] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('全部');
  const [editionFilter, setEditionFilter] = useState('全部');

  const currentSelection = useMemo(() => {
    if (!presets || !value) return undefined;
    return getK12TextbookSelection(presets, value);
  }, [presets, value]);

  const textbookCards = useMemo<TextbookCard[]>(() => {
    if (!presets || !currentSelection) return [];

    const cards = currentSelection.editions.flatMap((edition) =>
      edition.volumes
        .filter(
          (volume) =>
            volume.gradeId === value?.gradeId && volume.subjectId === value?.subjectId,
        )
        .map((volume) => {
          const subject = presets.subjects.find((option) => option.id === volume.subjectId);

          return {
            id: volume.id,
            name: resolveLocalizedText(volume.label, locale),
            edition: resolveLocalizedText(edition.label, locale),
            subject: subject ? subject.label[locale] : volume.subjectId,
            editionId: edition.id,
            volumeId: volume.id,
            gradeId: volume.gradeId,
            subjectId: volume.subjectId,
            units: buildChapterTree(volume.units),
          };
        }),
    );

    return cards;
  }, [currentSelection, locale, presets, value?.gradeId, value?.subjectId]);

  const subjectOptions = useMemo(() => {
    const subjects = new Map<string, string>();

    for (const card of textbookCards) {
      subjects.set(card.subject, card.subject);
    }

    return ['全部', ...Array.from(subjects.values())];
  }, [textbookCards]);

  const editionOptions = useMemo(() => {
    const editions = new Set<string>();
    for (const card of textbookCards) {
      editions.add(card.edition);
    }
    return ['全部', ...Array.from(editions)];
  }, [textbookCards]);

  const filteredBooks = useMemo(() => {
    return textbookCards.filter((book) => {
      const matchSearch = matchesQuery(book, searchQuery);
      const matchSubject = subjectFilter === '全部' || book.subject === subjectFilter;
      const matchEdition = editionFilter === '全部' || book.edition === editionFilter;
      return matchSearch && matchSubject && matchEdition;
    });
  }, [editionFilter, searchQuery, subjectFilter, textbookCards]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const currentBook = currentSelection?.volume
        ? textbookCards.find((book) => book.volumeId === currentSelection.volume?.id) ?? null
        : filteredBooks[0] ?? textbookCards[0] ?? null;

      setActiveBook(currentBook);
      if (currentSelection?.unit && currentSelection.chapter && currentBook) {
        setActiveChapterPath([currentSelection.unit.id, currentSelection.chapter.id]);
        setActiveChapterLabelPath([currentSelection.unit.title, currentSelection.chapter.title]);
      } else {
        setActiveChapterPath([]);
        setActiveChapterLabelPath([]);
      }
    } else {
      setActiveBook(null);
      setActiveChapterPath([]);
      setActiveChapterLabelPath([]);
    }

    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    if (activeBook && activeChapterPath.length > 0) {
      onSelect(activeBook, activeChapterPath, activeChapterLabelPath.join(' · '));
      onOpenChange(false);
    }
  };

  const handleClearFilters = () => {
    setSubjectFilter('全部');
    setEditionFilter('全部');
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-[1100px] h-[85vh] p-0 flex flex-col overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-row items-center justify-between sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="size-5 text-indigo-500" />
            教材资源中心
          </DialogTitle>

          <div className="flex items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索教材名称、版本、章节..."
                className="h-9 pl-9 rounded-full bg-slate-100 border-transparent dark:bg-slate-800 focus-visible:bg-white transition-colors"
              />
            </div>
            <Button
              onClick={handleConfirm}
              disabled={!activeBook || activeChapterPath.length === 0}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 h-9 px-6 transition-all"
            >
              确认选择
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-[5] flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950/50">
            <div className="p-6 pb-2 border-b border-slate-200/40 dark:border-slate-800/40">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-10">
                    学科
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
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-10">
                    版本
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
              {filteredBooks.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-5">
                  {filteredBooks.map((book) => {
                    const isSelected = activeBook?.id === book.id;
                    return (
                      <div
                        key={book.id}
                        onClick={() => {
                          setActiveBook(book);
                          setActiveChapterPath([]);
                          setActiveChapterLabelPath([]);
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
                          {isSelected && (
                            <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm animate-in zoom-in-50 duration-200">
                              <CheckCircle2 className="size-4" />
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 px-1">
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
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FilterX className="size-10 opacity-30" />
                  <p className="text-sm">没有找到符合条件的教材</p>
                  <Button variant="link" onClick={handleClearFilters}>
                    清除所有筛选
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
                    选择章节
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    当前：{activeBook.name} ({activeBook.edition})
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
                          const isSelected = activeChapterPath.includes(chapter.id);
                          return (
                            <button
                              key={chapter.id}
                              onClick={() => {
                                setActiveChapterPath([unit.id, chapter.id]);
                                setActiveChapterLabelPath([unit.title, chapter.title]);
                              }}
                              className={cn(
                                'w-full text-left flex items-center justify-between px-3 py-2.5 ml-1 text-sm rounded-lg transition-all',
                                isSelected
                                  ? 'bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/15 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-500/20'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
                              )}
                            >
                              <span className="truncate">{chapter.title}</span>
                              {isSelected && (
                                <CheckCircle2 className="size-4 shrink-0 text-indigo-500" />
                              )}
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
                <p className="text-sm">请先在左侧选择一本教材</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
