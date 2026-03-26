export type SupportedLocale = 'zh-CN' | 'en-US';
export type ModuleId = 'core' | 'k12';

export type LocalizedText = Record<SupportedLocale, string>;
export type LocalizedList = Record<SupportedLocale, string[]>;

export interface ModuleOption {
  id: string;
  label: LocalizedText;
}

export interface K12StructuredInput {
  gradeId: string;
  subjectId: string;
  lessonTypeId: string;
  durationMinutes: number;
}

export interface K12ModulePresets {
  grades: ModuleOption[];
  subjects: ModuleOption[];
  lessonTypes: ModuleOption[];
  durations: number[];
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
  promptPacks?: Record<string, string>;
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
