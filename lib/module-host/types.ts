export type SupportedLocale = 'zh-CN' | 'en-US';
export type ModuleId = 'core' | 'k12';

export type LocalizedText = Record<SupportedLocale, string>;
export type LocalizedList = Record<SupportedLocale, string[]>;

export interface ModuleOption {
  id: string;
  label: LocalizedText;
}

export interface K12TextbookResource {
  id: string;
  title: string;
  type: 'pdf' | 'docx' | 'image' | 'html' | 'other';
  description?: string;
  url?: string;
}

export interface K12TextbookChapter {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  sourceDocuments: K12TextbookResource[];
  suggestedLessonTypeIds?: string[];
}

export interface K12TextbookUnit {
  id: string;
  title: string;
  chapters: K12TextbookChapter[];
}

export interface K12TextbookVolume {
  id: string;
  label: LocalizedText;
  gradeId: string;
  subjectId: string;
  semester?: 'upper' | 'lower' | 'full-year';
  units: K12TextbookUnit[];
}

export interface K12TextbookEdition {
  id: string;
  label: LocalizedText;
  publisher?: string;
  volumes: K12TextbookVolume[];
}

export interface K12StructuredInput {
  gradeId: string;
  gradeLabel?: string;
  subjectId: string;
  subjectLabel?: string;
  lessonTypeId: string;
  durationMinutes: number;
  textbookSource?: 'preset' | 'official' | 'personal';
  textbookLibraryId?: string;
  textbookPublisher?: string;
  textbookEditionId?: string;
  textbookEditionLabel?: string;
  volumeId?: string;
  volumeLabel?: string;
  unitId?: string;
  unitTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  chapterSummary?: string;
  chapterKeywords?: string[];
  chapterResources?: K12TextbookResource[];
}

export interface K12ModulePresets {
  grades: ModuleOption[];
  subjects: ModuleOption[];
  lessonTypes: ModuleOption[];
  durations: number[];
  textbookEditions: K12TextbookEdition[];
  defaults: K12StructuredInput;
}

export interface BusinessModuleMetadata {
  applicationName: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface BusinessModuleHomeCopy {
  badge: LocalizedText;
  slogan: LocalizedText;
  requirementPlaceholder: LocalizedText;
  submitLabel: LocalizedText;
  footerText: LocalizedText;
  quickPrompts: LocalizedList;
}

export interface BusinessModule {
  id: ModuleId;
  name: string;
  version: string;
  enabled: boolean;
  routes?: {
    home?: string;
    setup?: string;
    generator?: string;
    preview?: string;
  };
  capabilities: Array<'generation' | 'validation' | 'export' | 'template' | 'ui' | 'analytics'>;
  metadata: BusinessModuleMetadata;
  home: BusinessModuleHomeCopy;
  settingsSchema?: unknown;
  presets?: Record<string, unknown>;
  hooks?: {
    beforeInput?: (ctx: unknown) => Promise<unknown> | unknown;
    validateInput?: (
      ctx: unknown,
    ) => Promise<{ ok: boolean; errors?: string[] }> | { ok: boolean; errors?: string[] };
    beforeGeneration?: (ctx: unknown) => Promise<unknown> | unknown;
    afterGeneration?: (result: unknown) => Promise<unknown> | unknown;
    beforeExport?: (ctx: unknown) => Promise<unknown> | unknown;
  };
  uiSlots?: {
    homeHero?: string;
    settingsPanel?: string;
    generationWizard?: string;
    emptyState?: string;
  };
}

export function resolveLocalizedText(text: LocalizedText, locale: SupportedLocale): string {
  return text[locale] ?? text['en-US'];
}

export function resolveLocalizedList(list: LocalizedList, locale: SupportedLocale): string[] {
  return list[locale] ?? list['en-US'];
}

export function resolveOptionLabel(option: ModuleOption, locale: SupportedLocale): string {
  return resolveLocalizedText(option.label, locale);
}
