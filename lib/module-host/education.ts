import { getModuleById } from './runtime';
import {
  buildK12LessonPackTitle,
  buildK12RequirementText,
  buildK12StructuredContext,
  buildK12TextbookResourceReferenceText,
  getDefaultK12StructuredInput,
  getK12OptionLabel,
  getK12TextbookSelection,
  mergeK12TextbookResourcesIntoReferenceText,
  resolveK12LessonPackMetadata,
} from './k12';
import type {
  K12ModulePresets,
  K12StructuredInput,
  K12TextbookResource,
  ModuleId,
  SupportedLocale,
} from './types';

export type EducationStructuredInput = K12StructuredInput;
export type EducationModulePresets = K12ModulePresets;
export type EducationResource = K12TextbookResource;
export type EducationWorkbenchModuleId = Extract<ModuleId, 'k12' | 'adult-education'>;

export const EDUCATION_WORKBENCH_MODULE_IDS = [
  'k12',
  'adult-education',
] as const satisfies readonly EducationWorkbenchModuleId[];

export function isEducationWorkbenchModuleId(
  moduleId: ModuleId | undefined,
): moduleId is EducationWorkbenchModuleId {
  return (
    typeof moduleId === 'string' &&
    (EDUCATION_WORKBENCH_MODULE_IDS as readonly string[]).includes(moduleId)
  );
}

export function getEducationModulePresets(
  moduleId: ModuleId | undefined,
): EducationModulePresets | undefined {
  if (!moduleId || !isEducationWorkbenchModuleId(moduleId)) {
    return undefined;
  }
  return getModuleById(moduleId).presets as EducationModulePresets | undefined;
}

export function getDefaultEducationStructuredInput(
  presets?: EducationModulePresets,
  options?: {
    includeGradeAndSubject?: boolean;
  },
): EducationStructuredInput {
  return getDefaultK12StructuredInput(presets, options);
}

export function buildEducationRequirementText(args: {
  moduleId?: ModuleId;
  input: EducationStructuredInput;
  presets?: EducationModulePresets;
  locale: SupportedLocale;
  freeform: string;
  supplementaryPdfName?: string;
}): string {
  if (args.moduleId !== 'adult-education') {
    return buildK12RequirementText({
      input: args.input,
      presets: args.presets,
      locale: args.locale,
      freeform: args.freeform,
      supplementaryPdfName: args.supplementaryPdfName,
    });
  }

  const { input, presets, locale, supplementaryPdfName } = args;
  const freeform = args.freeform.trim();
  const selection =
    input.textbookSource === 'preset' &&
    (input.textbookEditionId || input.volumeId || input.unitId || input.chapterId)
      ? getK12TextbookSelection(presets, input)
      : undefined;
  const lessonTypeLabel =
    getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale) ?? input.lessonTypeId;
  const editionLabel = selection?.edition?.label
    ? selection.edition.label[locale] ?? selection.edition.label['en-US']
    : input.textbookEditionLabel;
  const volumeLabel = selection?.volume?.label
    ? selection.volume.label[locale] ?? selection.volume.label['en-US']
    : input.volumeLabel;
  const unitTitle = selection?.unit?.title ?? input.unitTitle;
  const chapterTitle = selection?.chapter?.title ?? input.chapterTitle;
  const chapterResources = input.chapterResources ?? [];
  const resourceReference = buildEducationResourceReferenceText({
    resources: chapterResources,
    locale,
  });
  const hasLinkedChapter = Boolean(chapterTitle);

  if (locale === 'zh-CN') {
    return [
      hasLinkedChapter
        ? `请基于当前关联资源设计一节${input.durationMinutes}分钟的${lessonTypeLabel}培训课程。`
        : `请设计一节${input.durationMinutes}分钟的${lessonTypeLabel}培训课程。`,
      hasLinkedChapter
        ? `优先围绕${editionLabel ?? '当前资料'}${volumeLabel ? ` ${volumeLabel}` : ''}${unitTitle ? `中的“${unitTitle}”` : ''}里“${chapterTitle}”的内容组织课程。`
        : '如果未关联资源章节，请结合讲师补充要求与上传资料组织内容。',
      input.chapterSummary ? `内容摘要：${input.chapterSummary}` : null,
      input.chapterKeywords?.length ? `关键主题：${input.chapterKeywords.join('、')}` : null,
      chapterResources.length > 0
        ? `可参考资料：${chapterResources.map((resource) => resource.title).join('；')}`
        : null,
      resourceReference || null,
      supplementaryPdfName ? `讲师额外上传了补充资料 PDF《${supplementaryPdfName}》。` : null,
      '输出应适合成人学习或培训场景，包含导入、讲解、案例、练习、复盘和迁移建议。',
      freeform ? `补充要求：${freeform}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    hasLinkedChapter
      ? `Design a ${input.durationMinutes}-minute ${lessonTypeLabel.toLowerCase()} training session based on the linked resource section.`
      : `Design a ${input.durationMinutes}-minute ${lessonTypeLabel.toLowerCase()} training session.`,
    hasLinkedChapter
      ? `Prioritize the section "${chapterTitle}" from ${editionLabel ?? 'the linked resource'}${volumeLabel ? ` (${volumeLabel})` : ''}${unitTitle ? `, module "${unitTitle}"` : ''}.`
      : 'If no linked section is available, rely on the trainer notes and uploaded supporting materials.',
    input.chapterSummary ? `Content summary: ${input.chapterSummary}` : null,
    input.chapterKeywords?.length ? `Key topics: ${input.chapterKeywords.join(', ')}` : null,
    chapterResources.length > 0
      ? `Reference materials: ${chapterResources.map((resource) => resource.title).join('; ')}`
      : null,
    resourceReference || null,
    supplementaryPdfName
      ? `The trainer also uploaded a supplementary PDF named "${supplementaryPdfName}".`
      : null,
    'The output should fit adult learning or training delivery, including context, explanation, cases, practice, review, and transfer guidance.',
    freeform ? `Additional requirements: ${freeform}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildEducationStructuredContext(
  input: EducationStructuredInput | undefined,
  presets: EducationModulePresets | undefined,
  locale: SupportedLocale,
): string {
  return buildK12StructuredContext(input, presets, locale);
}

export function buildEducationResourceReferenceText(args: {
  resources: Array<{ title: string; description?: string; url?: string }>;
  locale: SupportedLocale;
}): string {
  return buildK12TextbookResourceReferenceText(args);
}

export function mergeEducationResourcesIntoReferenceText(args: {
  baseText?: string;
  resources: Array<{ title: string; description?: string; url?: string }>;
  locale: SupportedLocale;
}): string {
  return mergeK12TextbookResourcesIntoReferenceText(args);
}

export function buildEducationLessonPackTitle(args: {
  input: EducationStructuredInput | undefined;
  presets: EducationModulePresets | undefined;
  locale: SupportedLocale;
  requirement?: string;
  supplementaryPdfName?: string;
}): string {
  return buildK12LessonPackTitle(args);
}

export function resolveEducationLessonPackMetadata(args: {
  input: EducationStructuredInput | undefined;
  presets: EducationModulePresets | undefined;
  locale: SupportedLocale;
}): {
  grade?: string;
  subject?: string;
  lessonType?: string;
  durationMinutes?: number;
  textbookEdition?: string;
  volume?: string;
  unit?: string;
  chapter?: string;
  chapterId?: string;
} {
  return resolveK12LessonPackMetadata(args);
}
