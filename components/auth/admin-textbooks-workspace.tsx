'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  Link as LinkIcon,
  Plus,
  Send,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { K12TextbookChapter, K12TextbookEdition, K12TextbookResource, K12TextbookUnit, SupportedLocale } from '@/lib/module-host/types';

export type TextbookSelectionPath = {
  editionId?: string;
  volumeId?: string;
  unitId?: string;
  chapterId?: string;
};

export type WorkspaceCopy = {
  back: string;
  saving: string;
  saved: string;
  delete: string;
  deleteConfirm: string;
  publish: string;
  sharePreview: string;
  tocTitle: string;
  coverPrompt: string;
  chapterTitle: string;
  summary: string;
  keywords: string;
  resources: string;
  addResource: string;
  emptyResources: string;
  addUnit: string;
  addChapter: string;
  unitTitle: string;
  chapterLabel: string;
  resourceTitle: string;
  resourceType: string;
  resourceUrl: string;
  resourceDesc: string;
  removeResource: string;
  coverHint: string;
  titleHint: string;
  summaryHint: string;
  emptyWorkspace: string;
  emptyWorkspaceDesc: string;
};

type WorkspaceViewProps = {
  edition: K12TextbookEdition | null;
  selectionPath: TextbookSelectionPath;
  text: WorkspaceCopy;
  activeLocale: SupportedLocale;
  isBusy: boolean;
  onBack: () => void;
  onSelectPath: (path: TextbookSelectionPath) => void;
  onUpdateUnit: (patch: Partial<K12TextbookUnit>) => void;
  onUpdateChapter: (patch: Partial<K12TextbookChapter>) => void;
  onUpdateResource: (resourceId: string, patch: Partial<K12TextbookResource>) => void;
  onAddUnit: () => void;
  onAddChapter: () => void;
  onAddResource: () => void;
  onRemoveResource: (resourceId: string) => void;
  onDeleteCurrent: () => void;
  onDeleteUnit: (unitId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onPublish: () => void;
};

type DocumentInputProps = {
  as?: 'input' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
};

function getLocalizedValue(label: Record<SupportedLocale, string>, locale: SupportedLocale) {
  return label[locale] || label['zh-CN'] || label['en-US'] || '';
}

function DocumentInput({
  as = 'input',
  value,
  onChange,
  placeholder,
  className,
  rows = 3,
}: DocumentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (as !== 'textarea' || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [as, value]);

  const sharedClassName = cn(
    'w-full bg-transparent outline-none transition-colors placeholder:text-slate-300 dark:placeholder:text-slate-700',
    as === 'textarea' && 'resize-none overflow-hidden',
    className,
  );

  if (as === 'textarea') {
    return (
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={sharedClassName}
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={sharedClassName}
    />
  );
}

function TreeNode({
  label,
  icon: Icon,
  active = false,
  indent = 0,
  onClick,
  rightSlot,
  className,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  indent?: number;
  onClick: () => void;
  rightSlot?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `calc(${indent}rem + 0.75rem)` }}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-all duration-200',
        active
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-800'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100',
        className,
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
      <span className="truncate">{label || '未命名'}</span>
      {rightSlot}
    </button>
  );
}

function ResourceGlyph({
  type,
  className,
}: {
  type?: K12TextbookResource['type'];
  className?: string;
}) {
  if (type === 'html' || type === 'image') return <LinkIcon className={className} />;
  if (type === 'docx' || type === 'pdf') return <FileText className={className} />;
  return <BookOpen className={className} />;
}

function ResourceCard({
  resource,
  text,
  onUpdate,
  onRemove,
}: {
  resource: K12TextbookResource;
  text: WorkspaceCopy;
  onUpdate: (resourceId: string, patch: Partial<K12TextbookResource>) => void;
  onRemove: (resourceId: string) => void;
}) {
  return (
    <div className="group rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_22px_50px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-indigo-500/30">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
            <ResourceGlyph type={resource.type} className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{resource.title || text.resourceTitle}</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{resource.type}</p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          onClick={() => onRemove(resource.id)}
          aria-label={text.removeResource}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{text.resourceTitle}</label>
          <DocumentInput
            value={resource.title}
            onChange={(value) => onUpdate(resource.id, { title: value })}
            placeholder={text.resourceTitle}
            className="rounded-none border-b border-slate-200 py-2 text-sm text-slate-900 dark:border-slate-800 dark:text-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{text.resourceType}</label>
          <select
            value={resource.type}
            onChange={(event) => onUpdate(resource.id, { type: event.target.value as K12TextbookResource['type'] })}
            className="w-full border-none bg-transparent px-0 py-2 text-sm text-slate-900 outline-none dark:text-slate-50"
          >
            <option value="pdf">pdf</option>
            <option value="docx">docx</option>
            <option value="image">image</option>
            <option value="html">html</option>
            <option value="other">other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{text.resourceUrl}</label>
          <DocumentInput
            value={resource.url ?? ''}
            onChange={(value) => onUpdate(resource.id, { url: value })}
            placeholder={text.resourceUrl}
            className="rounded-none border-b border-slate-200 py-2 text-sm text-slate-900 dark:border-slate-800 dark:text-slate-50"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{text.resourceDesc}</label>
          <DocumentInput
            as="textarea"
            value={resource.description ?? ''}
            onChange={(value) => onUpdate(resource.id, { description: value })}
            placeholder={text.resourceDesc}
            className="min-h-16 rounded-2xl border border-slate-200/80 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceView({
  edition,
  selectionPath,
  text,
  activeLocale,
  isBusy,
  onBack,
  onSelectPath,
  onUpdateUnit,
  onUpdateChapter,
  onUpdateResource,
  onAddUnit,
  onAddChapter,
  onAddResource,
  onRemoveResource,
  onDeleteCurrent,
  onDeleteUnit,
  onDeleteChapter,
  onPublish,
}: WorkspaceViewProps) {
  const selectedVolume = useMemo(() => {
    if (!edition) return null;
    return edition.volumes.find((volume) => volume.id === selectionPath.volumeId) ?? edition.volumes[0] ?? null;
  }, [edition, selectionPath.volumeId]);

  const selectedUnit = useMemo(() => {
    if (!selectedVolume) return null;
    return selectedVolume.units.find((unit) => unit.id === selectionPath.unitId) ?? selectedVolume.units[0] ?? null;
  }, [selectedVolume, selectionPath.unitId]);

  const selectedChapter = useMemo(() => {
    if (!selectedUnit) return null;
    return selectedUnit.chapters.find((chapter) => chapter.id === selectionPath.chapterId) ?? null;
  }, [selectedUnit, selectionPath.chapterId]);

  const selectedKind = selectionPath.chapterId
    ? 'chapter'
    : selectionPath.unitId
      ? 'unit'
      : 'edition';
  const editionTitle = getLocalizedValue(edition?.label ?? { 'zh-CN': '', 'en-US': '' }, activeLocale);
  const selectionTag =
    selectedKind === 'chapter'
      ? text.chapterLabel
      : selectedKind === 'unit'
        ? text.unitTitle
        : text.tocTitle;
  const selectionTitle =
    selectedKind === 'chapter'
      ? selectedChapter?.title || text.chapterLabel
      : selectedKind === 'unit'
        ? selectedUnit?.title || text.unitTitle
        : editionTitle || text.chapterLabel;
  const currentStatus = isBusy ? text.saving : text.saved;

  if (!edition) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{text.emptyWorkspace}</p>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{text.emptyWorkspaceDesc}</p>
          <Button onClick={onBack} variant="outline" className="mt-6 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {text.back}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_42%,_#e8edf3_100%)] transition-colors dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#07111f_44%,_#020617_100%)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-cyan-300/15 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-200/40 via-transparent to-transparent dark:from-slate-900/40" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/50 bg-white/75 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 w-full max-w-[100rem] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="hidden min-w-0 items-center gap-2 text-sm font-medium text-slate-400 sm:flex">
              <span className="truncate text-slate-500 dark:text-slate-400">{editionTitle || text.chapterLabel}</span>
              {(selectedKind === 'unit' || selectedKind === 'chapter') && (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                  <span className="truncate text-slate-500 dark:text-slate-400">{selectedUnit?.title || text.unitTitle}</span>
                </>
              )}
              {selectedKind === 'chapter' && (
                <>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />
                  <span className="truncate text-slate-900 dark:text-slate-50">{selectedChapter?.title || text.chapterLabel}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className={cn('hidden text-xs font-medium transition-opacity sm:inline-flex', isBusy ? 'opacity-100 text-indigo-500' : 'opacity-90 text-slate-400')}>
              {currentStatus}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={onDeleteCurrent}
              className="rounded-full text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {text.delete}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-200 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5"
            >
              {text.sharePreview}
            </Button>
            <Button
              type="button"
              onClick={onPublish}
              disabled={isBusy}
              className="rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
            >
              <Send className="mr-2 h-4 w-4" />
              {text.publish}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-4rem)]">
        <aside className="hidden w-80 shrink-0 border-r border-slate-200/70 bg-slate-50/70 p-4 backdrop-blur dark:border-slate-800 dark:bg-white/[0.02] lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-[1.75rem] border border-slate-200/70 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{text.tocTitle}</div>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {selectionTitle}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectionTag}
                  </p>
                </div>
                <Badge variant="secondary" className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                  {selectedKind}
                </Badge>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onAddUnit}
                  className="h-8 w-8 rounded-full"
                  title={text.addUnit}
                >
                  <Folder className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onAddChapter}
                  className="h-8 w-8 rounded-full"
                  title={text.addChapter}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {selectedVolume?.units.map((unit) => {
                const isUnitActive = selectedUnit?.id === unit.id;
                return (
                  <div key={unit.id} className="group space-y-1">
                    <div className="flex items-center gap-1">
                      <TreeNode
                        className="flex-1"
                        label={unit.title || text.unitTitle}
                        icon={Folder}
                        active={isUnitActive}
                        indent={0}
                        onClick={() => onSelectPath({ editionId: edition.id, volumeId: selectedVolume.id, unitId: unit.id })}
                        rightSlot={<span className="ml-auto text-[10px] uppercase tracking-[0.22em] text-slate-400">{unit.chapters.length}</span>}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 rounded-full text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-500/10"
                        onClick={() => onDeleteUnit(unit.id)}
                        aria-label={text.delete}
                        title={text.delete}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-1 pl-2">
                      {unit.chapters.map((chapter) => (
                        <div key={chapter.id} className="group flex items-center gap-1">
                          <TreeNode
                            className="flex-1"
                            label={chapter.title || text.chapterLabel}
                            icon={FileText}
                            active={selectedChapter?.id === chapter.id}
                            indent={1}
                            onClick={() =>
                              onSelectPath({
                                editionId: edition.id,
                                volumeId: selectedVolume.id,
                                unitId: unit.id,
                                chapterId: chapter.id,
                              })
                            }
                            rightSlot={<ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 rounded-full text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-500/10"
                            onClick={() => onDeleteChapter(chapter.id)}
                            aria-label={text.delete}
                            title={text.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}

                      {isUnitActive && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={onAddChapter}
                          className="h-9 w-full justify-start rounded-lg pl-8 text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-900"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {text.addChapter}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-20 lg:py-28">
            <div className="group relative mb-12 flex h-32 items-center justify-center overflow-hidden rounded-[2rem] border border-slate-200/70 bg-gradient-to-r from-emerald-100 to-teal-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(15,23,42,0.10)] dark:border-white/5 dark:from-emerald-950/30 dark:to-teal-900/20 md:h-48">
              <span className="relative z-10 text-sm font-medium text-emerald-600/70 transition-transform group-hover:scale-105 dark:text-emerald-300/40">
                {text.coverPrompt}
              </span>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),transparent_40%)] opacity-70 dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_40%)]" />
            </div>

            <article className="space-y-12">
              <section className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  <span className="rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[10px] text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    {selectionTag}
                  </span>
                  <span>{selectionTitle}</span>
                </div>

                {selectedKind === 'chapter' && selectedChapter && (
                  <>
                    <DocumentInput
                      value={selectedChapter.title}
                      onChange={(value) => onUpdateChapter({ title: value })}
                      placeholder={text.titleHint}
                      className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50 md:text-5xl"
                    />

                    <DocumentInput
                      as="textarea"
                      value={selectedChapter.summary}
                      onChange={(value) => onUpdateChapter({ summary: value })}
                      placeholder={text.summaryHint}
                      className="min-h-[9rem] text-lg leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl"
                      rows={5}
                    />

                    <div className="flex flex-wrap gap-2">
                      {selectedChapter.keywords.length === 0 ? (
                        <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          {text.keywords}
                        </Badge>
                      ) : (
                        selectedChapter.keywords.map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="rounded-full bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {keyword}
                          </Badge>
                        ))
                      )}
                    </div>
                  </>
                )}

                {selectedKind === 'unit' && selectedUnit && (
                  <div className="space-y-6">
                    <DocumentInput
                      value={selectedUnit.title}
                      onChange={(value) => onUpdateUnit({ title: value })}
                      placeholder={text.unitTitle}
                      className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl"
                    />
                    <p className="text-base leading-7 text-slate-500 dark:text-slate-400">
                      {selectedUnit.chapters.length} {text.chapterLabel}
                    </p>
                  </div>
                )}

              </section>

              {selectedKind === 'chapter' && selectedChapter && (
                <section className="pt-10">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
                      <Settings2 className="h-4 w-4 text-indigo-500" />
                      {text.resources}
                    </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onAddResource}
                      className="rounded-full text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {text.addResource}
                    </Button>
                  </div>

                  {selectedChapter.sourceDocuments.length === 0 ? (
                    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/40">
                      <p className="text-sm text-slate-400">{text.emptyResources}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedChapter.sourceDocuments.map((resource) => (
                        <ResourceCard
                          key={resource.id}
                          resource={resource}
                          text={text}
                          onUpdate={onUpdateResource}
                          onRemove={onRemoveResource}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
