import {
  resolveLocalizedText,
  resolveOptionLabel,
  type K12ModulePresets,
  type K12StructuredInput,
  type K12TextbookChapter,
  type K12TextbookEdition,
  type K12TextbookUnit,
  type K12TextbookVolume,
  type ModuleOption,
  type SupportedLocale,
} from './types';

const FALLBACK_K12_INPUT: K12StructuredInput = {
  gradeId: 'grade-4',
  subjectId: 'math',
  lessonTypeId: 'new-lesson',
  durationMinutes: 40,
};

function resolveOption<T extends ModuleOption>(options: T[] | undefined, id: string | undefined): T | undefined {
  if (!options?.length || !id) return undefined;
  return options.find((option) => option.id === id);
}

export function getK12OptionLabel(
  options: ModuleOption[] | undefined,
  id: string | undefined,
  locale: SupportedLocale,
): string | undefined {
  const option = resolveOption(options, id);
  return option ? resolveOptionLabel(option, locale) : undefined;
}

export function getDefaultK12StructuredInput(
  presets?: K12ModulePresets,
): K12StructuredInput {
  return syncK12StructuredInput(presets?.defaults ?? FALLBACK_K12_INPUT, presets);
}

export function getMatchingTextbookEditions(
  presets: K12ModulePresets | undefined,
  input: Pick<K12StructuredInput, 'gradeId' | 'subjectId'>,
): K12TextbookEdition[] {
  if (!presets?.textbookEditions?.length) return [];

  return presets.textbookEditions.filter((edition) =>
    edition.volumes.some(
      (volume) => volume.gradeId === input.gradeId && volume.subjectId === input.subjectId,
    ),
  );
}

export function getK12TextbookSelection(
  presets: K12ModulePresets | undefined,
  input: K12StructuredInput,
): {
  editions: K12TextbookEdition[];
  edition?: K12TextbookEdition;
  volumes: K12TextbookVolume[];
  volume?: K12TextbookVolume;
  units: K12TextbookUnit[];
  unit?: K12TextbookUnit;
  chapters: K12TextbookChapter[];
  chapter?: K12TextbookChapter;
} {
  const editions = getMatchingTextbookEditions(presets, input);
  const edition =
    editions.find((candidate) => candidate.id === input.textbookEditionId) ?? editions[0];
  const volumes =
    edition?.volumes.filter(
      (candidate) =>
        candidate.gradeId === input.gradeId && candidate.subjectId === input.subjectId,
    ) ?? [];
  const volume = volumes.find((candidate) => candidate.id === input.volumeId) ?? volumes[0];
  const units = volume?.units ?? [];
  const unit = units.find((candidate) => candidate.id === input.unitId) ?? units[0];
  const chapters = unit?.chapters ?? [];
  const chapter = chapters.find((candidate) => candidate.id === input.chapterId) ?? chapters[0];

  return {
    editions,
    edition,
    volumes,
    volume,
    units,
    unit,
    chapters,
    chapter,
  };
}

export function syncK12StructuredInput(
  input: K12StructuredInput,
  presets?: K12ModulePresets,
): K12StructuredInput {
  const base: K12StructuredInput = {
    ...FALLBACK_K12_INPUT,
    ...input,
  };

  const selection = getK12TextbookSelection(presets, base);

  return {
    ...base,
    textbookEditionId: selection.edition?.id,
    volumeId: selection.volume?.id,
    unitId: selection.unit?.id,
    chapterId: selection.chapter?.id,
    chapterSummary: selection.chapter?.summary,
    chapterKeywords: selection.chapter?.keywords ?? [],
    chapterResources: selection.chapter?.sourceDocuments ?? [],
  };
}

export function buildK12RequirementText(args: {
  input: K12StructuredInput;
  presets?: K12ModulePresets;
  locale: SupportedLocale;
  freeform: string;
  supplementaryPdfName?: string;
}): string {
  const { input, presets, locale, supplementaryPdfName } = args;
  const freeform = args.freeform.trim();
  const selection = getK12TextbookSelection(presets, input);
  const gradeLabel = getK12OptionLabel(presets?.grades, input.gradeId, locale) ?? input.gradeId;
  const subjectLabel =
    getK12OptionLabel(presets?.subjects, input.subjectId, locale) ?? input.subjectId;
  const lessonTypeLabel =
    getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale) ?? input.lessonTypeId;
  const editionLabel = selection.edition
    ? resolveLocalizedText(selection.edition.label, locale)
    : undefined;
  const volumeLabel = selection.volume
    ? resolveLocalizedText(selection.volume.label, locale)
    : undefined;
  const chapterKeywords = input.chapterKeywords ?? [];
  const chapterResources = input.chapterResources ?? [];

  if (locale === 'zh-CN') {
    return [
      `请为${gradeLabel}${subjectLabel}设计一节${input.durationMinutes}分钟的${lessonTypeLabel}课堂。`,
      selection.chapter
        ? `优先基于${editionLabel ?? '教材'}${volumeLabel ? ` ${volumeLabel}` : ''}中“${selection.unit?.title ?? '当前单元'}”的“${selection.chapter.title}”组织内容。`
        : '如果教材章节信息不完整，请结合老师补充要求组织内容。',
      input.chapterSummary ? `章节摘要：${input.chapterSummary}` : null,
      chapterKeywords.length > 0 ? `核心关键词：${chapterKeywords.join('、')}` : null,
      chapterResources.length > 0
        ? `章节可参考资料：${chapterResources.map((resource) => resource.title).join('；')}`
        : null,
      supplementaryPdfName ? `老师额外上传了补充资料 PDF《${supplementaryPdfName}》。` : null,
      '输出应适合小学课堂使用，包含导入、讲解、例题、随堂提问、练习和总结。',
      freeform ? `补充要求：${freeform}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `Design a ${input.durationMinutes}-minute ${lessonTypeLabel.toLowerCase()} lesson for ${gradeLabel} ${subjectLabel}.`,
    selection.chapter
      ? `Prioritize the chapter "${selection.chapter.title}" from ${editionLabel ?? 'the selected textbook'}${volumeLabel ? ` (${volumeLabel})` : ''}${selection.unit?.title ? `, unit "${selection.unit.title}"` : ''}.`
      : 'If textbook chapter data is incomplete, rely on the teacher notes and any uploaded supporting materials.',
    input.chapterSummary ? `Chapter summary: ${input.chapterSummary}` : null,
    chapterKeywords.length > 0 ? `Key concepts: ${chapterKeywords.join(', ')}` : null,
    chapterResources.length > 0
      ? `Reference chapter resources: ${chapterResources.map((resource) => resource.title).join('; ')}`
      : null,
    supplementaryPdfName
      ? `The teacher also uploaded a supplementary PDF named "${supplementaryPdfName}".`
      : null,
    'The output should be ready for an elementary classroom and include warm-up, explanation, worked examples, in-class questions, practice, and wrap-up.',
    freeform ? `Additional requirements: ${freeform}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildK12StructuredContext(
  input: K12StructuredInput | undefined,
  presets: K12ModulePresets | undefined,
  locale: SupportedLocale,
): string {
  if (!input) return '';

  const selection = getK12TextbookSelection(presets, input);
  const gradeLabel = getK12OptionLabel(presets?.grades, input.gradeId, locale);
  const subjectLabel = getK12OptionLabel(presets?.subjects, input.subjectId, locale);
  const lessonTypeLabel = getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale);
  const editionLabel = selection.edition
    ? resolveLocalizedText(selection.edition.label, locale)
    : undefined;
  const volumeLabel = selection.volume
    ? resolveLocalizedText(selection.volume.label, locale)
    : undefined;

  const lines =
    locale === 'zh-CN'
      ? [
          '',
          '### 当前结构化备课参数',
          gradeLabel ? `- 年级：${gradeLabel}` : null,
          subjectLabel ? `- 学科：${subjectLabel}` : null,
          lessonTypeLabel ? `- 课型：${lessonTypeLabel}` : null,
          input.durationMinutes ? `- 课时：${input.durationMinutes} 分钟` : null,
          editionLabel ? `- 教材版本：${editionLabel}` : null,
          volumeLabel ? `- 册次：${volumeLabel}` : null,
          selection.unit?.title ? `- 单元：${selection.unit.title}` : null,
          selection.chapter?.title ? `- 章节：${selection.chapter.title}` : null,
          input.chapterSummary ? `- 章节摘要：${input.chapterSummary}` : null,
          input.chapterKeywords?.length ? `- 章节关键词：${input.chapterKeywords.join('、')}` : null,
          input.chapterResources?.length
            ? `- 章节资料：${input.chapterResources.map((resource) => resource.title).join('；')}`
            : null,
        ]
      : [
          '',
          '### Structured lesson settings',
          gradeLabel ? `- Grade: ${gradeLabel}` : null,
          subjectLabel ? `- Subject: ${subjectLabel}` : null,
          lessonTypeLabel ? `- Lesson type: ${lessonTypeLabel}` : null,
          input.durationMinutes ? `- Duration: ${input.durationMinutes} minutes` : null,
          editionLabel ? `- Textbook edition: ${editionLabel}` : null,
          volumeLabel ? `- Volume: ${volumeLabel}` : null,
          selection.unit?.title ? `- Unit: ${selection.unit.title}` : null,
          selection.chapter?.title ? `- Chapter: ${selection.chapter.title}` : null,
          input.chapterSummary ? `- Chapter summary: ${input.chapterSummary}` : null,
          input.chapterKeywords?.length
            ? `- Chapter keywords: ${input.chapterKeywords.join(', ')}`
            : null,
          input.chapterResources?.length
            ? `- Chapter resources: ${input.chapterResources.map((resource) => resource.title).join('; ')}`
            : null,
        ];

  return lines.filter(Boolean).join('\n');
}

export function resolveK12LessonPackMetadata(args: {
  input: K12StructuredInput | undefined;
  presets: K12ModulePresets | undefined;
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
  const { input, presets, locale } = args;
  if (!input) return {};

  const selection = getK12TextbookSelection(presets, input);

  return {
    grade: getK12OptionLabel(presets?.grades, input.gradeId, locale),
    subject: getK12OptionLabel(presets?.subjects, input.subjectId, locale),
    lessonType: getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale),
    durationMinutes: input.durationMinutes,
    textbookEdition: selection.edition
      ? resolveLocalizedText(selection.edition.label, locale)
      : undefined,
    volume: selection.volume ? resolveLocalizedText(selection.volume.label, locale) : undefined,
    unit: selection.unit?.title,
    chapter: selection.chapter?.title,
    chapterId: selection.chapter?.id,
  };
}
