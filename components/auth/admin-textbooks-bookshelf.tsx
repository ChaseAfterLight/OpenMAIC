'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Layers, Plus, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
};

type BookshelfViewProps = {
  editions: K12TextbookEdition[] | undefined;
  loading: boolean;
  saving?: boolean;
  published: K12TextbookCatalogSnapshot | null;
  text: BookshelfCopy;
  activeLocale: SupportedLocale;
  onAddEdition: () => void | Promise<void>;
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

function hashId(id: string) {
  return id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getBookPalette(id: string) {
  return BOOK_PALETTES[hashId(id) % BOOK_PALETTES.length];
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
  const palette = useMemo(() => getBookPalette(volume.id), [volume.id]);
  const totalUnits = volume.units.length;
  const totalChapters = useMemo(() => getVolumeChapterCount(volume), [volume]);
  const volumeTitle = getVolumeTitle(volume, activeLocale);

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
              <div className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
                Volume
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
  const editionCount = editions?.length ?? 0;
  const volumeCount = editions?.reduce((sum, edition) => sum + edition.volumes.length, 0) ?? 0;
  const publishedLabel = published ? `${text.published} v${published.version}` : text.draft;

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
            <Button
              onClick={onAddEdition}
              disabled={loading || saving}
              className="rounded-full bg-slate-900 px-5 text-white shadow-lg shadow-slate-900/15 transition-transform hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              {saving ? text.loading : text.addEdition}
            </Button>
          </div>
        </header>

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
            <Button
              onClick={onAddEdition}
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
              {editions.map((edition) => {
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
                      {edition.volumes.map((volume) => (
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
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
