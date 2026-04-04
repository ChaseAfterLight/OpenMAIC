'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, ArrowRight, BookOpen, Search, ChevronRight } from 'lucide-react';
import { nanoid } from 'nanoid';

import { AgentBar } from '@/components/agent/agent-bar';
import { SpeechButton } from '@/components/audio/speech-button';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { K12StructuredInputFields } from '@/components/k12/k12-structured-input';
import { SettingsDialog } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  TextbookLibraryModal,
  type Textbook,
  type TextbookSelection,
} from '@/components/workbench/TextbookLibraryModal';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { getActiveModule } from '@/lib/module-host/runtime';
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
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';

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

interface CreateLessonSheetCopy {
  createTitle: string;
  createHint: string;
}

interface CreateLessonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLocale: SupportedLocale;
  copy: CreateLessonSheetCopy;
}

const sheetCopy = {
  'zh-CN': {
    promptTitle: '你想怎么上这堂课？',
    promptHint: '把需求写得更具体，生成结果会更聚焦。',
    promptKeyboard: '支持 Ctrl/⌘ + Enter 立即生成',
    libraryTitle: '关联教材与章节',
    libraryHint: '从资源库里挑一份教材，作为这节课的章节锚点。',
    libraryPlaceholder: '从资源中心选择教材与章节...',
    libraryChange: '更换',
    libraryPick: '去选择',
    libraryChapterLabel: '已选章节：',
    libraryNoChapter: '尚未选择章节',
    k12Title: '基础教学信息',
    k12Hint: '这里只保留课型和时长，教材章节已经放在上方。',
    configTitle: '高级配置与参考',
    configHint: '语言、联网和 PDF 都放在这里。',
  },
  'en-US': {
    promptTitle: 'How do you want to teach this lesson?',
    promptHint: 'More specific prompts lead to sharper results.',
    promptKeyboard: 'Press Ctrl/⌘ + Enter to generate',
    libraryTitle: 'Link textbook chapter',
    libraryHint: 'Pick a textbook from the resource library as the chapter anchor.',
    libraryPlaceholder: 'Choose a textbook chapter from the library...',
    libraryChange: 'Change',
    libraryPick: 'Select',
    libraryChapterLabel: 'Selected chapter:',
    libraryNoChapter: 'No chapter selected yet',
    k12Title: 'Core lesson details',
    k12Hint: 'Only lesson type and duration remain here. The textbook chapter is already linked above.',
    configTitle: 'Advanced settings and references',
    configHint: 'Language, web search, and PDF inputs live here.',
  },
} as const;

export function CreateLessonSheet({
  open,
  onOpenChange,
  activeLocale,
  copy,
}: CreateLessonSheetProps) {
  const router = useRouter();

  const activeModule = getActiveModule();
  const isK12Module = activeModule.id === 'k12';
  const k12Presets = (isK12Module ? activeModule.presets : undefined) as
    | K12ModulePresets
    | undefined;
  const modulePlaceholder = resolveLocalizedText(
    activeModule.home.requirementPlaceholder,
    activeLocale,
  );
  const moduleSubmitLabel = resolveLocalizedText(activeModule.home.submitLabel, activeLocale);
  const quickPrompts = resolveLocalizedList(activeModule.home.quickPrompts, activeLocale);
  const text = sheetCopy[activeLocale];

  const currentModelId = useSettingsStore((s) => s.modelId);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [k12Form, setK12Form] = useState<K12StructuredInput>(() =>
    getDefaultK12StructuredInput(k12Presets),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setError(null);
      try {
        const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
        const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        setForm((prev) => ({
          ...prev,
          webSearch: savedWebSearch === 'true',
          language: savedLanguage === 'en-US' ? 'en-US' : 'zh-CN',
        }));
      } catch {}
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
    } catch {}
  };

  const handleGenerate = async () => {
    if (!currentModelId) {
      setSettingsOpen(true);
      setError(activeLocale === 'zh-CN' ? '请先完成模型配置' : 'Please configure a model first');
      return;
    }
    if (!isK12Module && !form.requirement.trim()) {
      setError(activeLocale === 'zh-CN' ? '请输入课堂需求' : 'Please describe the lesson');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const userProfile = useUserProfileStore.getState();
      const textbookContext = selectedTextbook
        ? [
            `${activeLocale === 'zh-CN' ? '关联教材' : 'Linked textbook'}：${selectedTextbook.name}`,
            `${activeLocale === 'zh-CN' ? '章节' : 'Chapter'}：${
              selectedChapterTitle ||
              (activeLocale === 'zh-CN' ? '尚未选择章节' : 'No chapter selected yet')
            }`,
          ].join('\n')
        : '';
      const requirements: UserRequirements = {
        moduleId: activeModule.id,
        k12: isK12Module ? k12Form : undefined,
        requirement:
          isK12Module && k12Presets
            ? buildK12RequirementText({
                input: k12Form,
                presets: k12Presets,
                locale: activeLocale,
                freeform: [textbookContext, form.requirement].filter(Boolean).join('\n'),
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
          selectedTextbookResourcesParsed: false,
          sceneOutlines: null,
          currentStep: 'generating' as const,
        }),
      );

      onOpenChange(false);
      router.push('/generation-preview');
    } catch (err) {
      console.error(err);
      setError(activeLocale === 'zh-CN' ? '生成准备失败，请重试' : 'Failed to prepare generation');
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex w-full flex-col gap-0 border-l-0 bg-white/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:bg-slate-950/95 sm:max-w-[760px] lg:max-w-[960px] xl:max-w-[1120px]"
          side="right"
        >
          <SheetHeader className="px-6 pb-5 pt-6 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <SheetTitle className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 ring-1 ring-indigo-600/10 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <Sparkles className="size-4" />
                  </div>
                  {copy.createTitle}
                </SheetTitle>
                <SheetDescription className="max-w-[32rem] text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {copy.createHint}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200/70 to-transparent dark:via-slate-800/70" />

          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.07),_transparent_44%)] px-6 py-6">
            <div className="space-y-6">
              <section className="space-y-3">
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {text.promptTitle}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {text.promptHint}
                  </p>
                </div>

                <div className="group rounded-[28px] bg-white/88 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 transition-all duration-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/35 dark:bg-slate-900/68 dark:ring-slate-800/70 dark:focus-within:bg-slate-900">
                  <Textarea
                    value={form.requirement}
                    onChange={(e) => updateForm('requirement', e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleGenerate();
                    }}
                    placeholder={modulePlaceholder}
                    className="min-h-[160px] resize-none border-0 bg-transparent px-0 py-0 text-base leading-6 placeholder:text-slate-400 focus-visible:ring-0 dark:placeholder:text-slate-500"
                  />

                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-800/70 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {text.promptKeyboard}
                    </p>
                    <SpeechButton
                      size="md"
                      onTranscription={(textValue) =>
                        updateForm(
                          'requirement',
                          form.requirement ? `${form.requirement}\n${textValue}` : textValue,
                        )
                      }
                      className="h-9 w-9 rounded-full bg-indigo-50 text-indigo-600 shadow-sm transition-colors hover:bg-indigo-100 hover:text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
                    />
                  </div>
                </div>

                {quickPrompts.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {quickPrompts.slice(0, 4).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => updateForm('requirement', prompt)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-2 text-[13px] font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100 hover:text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-200"
                      >
                        <ArrowRight className="size-3.5 opacity-60" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>

              {isK12Module && k12Presets ? (
                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-10 w-1.5 rounded-full bg-emerald-500" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {text.libraryTitle}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {text.libraryHint}
                      </p>
                    </div>
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLibraryOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setLibraryOpen(true);
                      }
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-4 rounded-[24px] border border-dashed border-slate-200/90 bg-slate-50/80 p-4 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
                  >
                    {selectedTextbook ? (
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 ring-1 ring-indigo-500/10 dark:bg-indigo-500/20 dark:text-indigo-300">
                          <BookOpen className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {selectedTextbook.name}
                          </h4>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {selectedTextbook.edition}
                          </p>
                          <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {text.libraryChapterLabel}
                            </span>{' '}
                            {selectedChapterTitle || text.libraryNoChapter}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <Search className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {text.libraryPlaceholder}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {text.libraryHint}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex shrink-0 items-center gap-1 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-colors group-hover:bg-white group-hover:text-indigo-600 dark:bg-slate-900/60 dark:text-slate-300 dark:group-hover:bg-slate-800 dark:group-hover:text-indigo-300">
                      {selectedTextbook ? text.libraryChange : text.libraryPick}
                      <ChevronRight className="size-3.5" />
                    </div>
                  </div>
                </section>
              ) : null}

              {isK12Module && k12Presets ? (
                <section className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-10 w-1.5 rounded-full bg-cyan-500" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {text.k12Title}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {text.k12Hint}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[28px] bg-slate-50/80 p-4 ring-1 ring-slate-200/70 dark:bg-slate-900/50 dark:ring-slate-800/70">
                    <K12StructuredInputFields
                      presets={k12Presets}
                      value={k12Form}
                      locale={activeLocale}
                      onChange={setK12Form}
                      compact
                      showTextbookSection={false}
                    />
                  </div>
                </section>
              ) : null}

              <section className="space-y-3 pb-8">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-10 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {text.configTitle}
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {text.configHint}
                    </p>
                  </div>
                </div>

                <div className="rounded-[28px] bg-slate-50/80 p-4 ring-1 ring-slate-200/70 dark:bg-slate-900/50 dark:ring-slate-800/70">
                  <div className="flex flex-col gap-4">
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
                    <div className="h-px w-full bg-slate-200/70 dark:bg-slate-800/70" />
                    <AgentBar />
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="border-t border-slate-200/50 bg-white/90 px-6 pb-6 pt-4 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/90">
            {error ? (
              <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 shadow-sm dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            ) : null}
            <Button
              className="h-12 w-full rounded-2xl bg-indigo-600 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 size-5 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 size-5" />
              )}
              {moduleSubmitLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TextbookLibraryModal
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        presets={k12Presets}
        value={k12Form}
        locale={activeLocale}
        onSelect={(selection: TextbookSelection) => {
          setSelectedTextbook(selection.textbook);
          setSelectedChapterTitle(
            selection.chapterTitlePath.join(' · ') || selection.chapterPath.join(' · '),
          );
          setK12Form((current) => ({
            ...current,
            textbookSource: selection.textbook.source,
            textbookLibraryId: selection.libraryId,
            textbookPublisher: selection.publisher,
            textbookEditionId: selection.editionId,
            textbookEditionLabel: selection.textbook.edition,
            volumeId: selection.volumeId,
            volumeLabel: selection.volumeLabel,
            unitId: selection.unitId,
            unitTitle: selection.unitTitle,
            chapterId: selection.chapterId,
            chapterTitle: selection.chapterTitle,
            chapterSummary: selection.chapterSummary,
            chapterKeywords: selection.chapterKeywords ?? [],
            chapterResources: selection.chapterResources ?? [],
          }));
        }}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
