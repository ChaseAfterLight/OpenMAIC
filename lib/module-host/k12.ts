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

function hasPresetTextbookIdentifiers(input: K12StructuredInput | undefined): boolean {
  return Boolean(
    input?.textbookEditionId || input?.volumeId || input?.unitId || input?.chapterId,
  );
}

function usesPresetTextbookSnapshot(input: K12StructuredInput | undefined): boolean {
  if (!input) return false;
  return (
    hasPresetTextbookIdentifiers(input) &&
    (!input.textbookSource || input.textbookSource === 'preset')
  );
}

function resolveOption<T extends ModuleOption>(options: T[] | undefined, id: string | undefined): T | undefined {
  if (!options?.length || !id) return undefined;
  return options.find((option) => option.id === id);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  const normalized = collapseWhitespace(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function firstSentence(text: string): string {
  return collapseWhitespace(text)
    .split(/[。！？.!?\n]/)
    .map((part) => part.trim())
    .find(Boolean)
    ?? '';
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
  options?: {
    includeGradeAndSubject?: boolean;
  },
): K12StructuredInput {
  const synced = syncK12StructuredInput(presets?.defaults ?? FALLBACK_K12_INPUT, presets);
  if (options?.includeGradeAndSubject === false) {
    return {
      ...synced,
      gradeId: '',
      gradeLabel: undefined,
      subjectId: '',
      subjectLabel: undefined,
    };
  }
  return synced;
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
  const hasPresetSelection = usesPresetTextbookSnapshot(input);
  const editions = getMatchingTextbookEditions(presets, input);
  const edition =
    hasPresetSelection
      ? editions.find((candidate) => candidate.id === input.textbookEditionId) ?? editions[0]
      : undefined;
  const volumes =
    edition?.volumes.filter(
      (candidate) =>
        candidate.gradeId === input.gradeId && candidate.subjectId === input.subjectId,
    ) ?? [];
  const volume = hasPresetSelection
    ? volumes.find((candidate) => candidate.id === input.volumeId) ?? volumes[0]
    : undefined;
  const units = volume?.units ?? [];
  const unit = hasPresetSelection
    ? units.find((candidate) => candidate.id === input.unitId) ?? units[0]
    : undefined;
  const chapters = unit?.chapters ?? [];
  const chapter = hasPresetSelection
    ? chapters.find((candidate) => candidate.id === input.chapterId) ?? chapters[0]
    : undefined;

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

function clearPresetTextbookSnapshot(input: K12StructuredInput): K12StructuredInput {
  return {
    ...input,
    textbookSource: undefined,
    textbookLibraryId: undefined,
    textbookPublisher: undefined,
    textbookEditionId: undefined,
    textbookEditionLabel: undefined,
    volumeId: undefined,
    volumeLabel: undefined,
    unitId: undefined,
    unitTitle: undefined,
    chapterId: undefined,
    chapterTitle: undefined,
    chapterSummary: undefined,
    chapterKeywords: [],
    chapterResources: [],
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

  if (base.textbookSource && base.textbookSource !== 'preset') {
    return {
      ...base,
      chapterKeywords: base.chapterKeywords ?? [],
      chapterResources: base.chapterResources ?? [],
    };
  }

  if (!hasPresetTextbookIdentifiers(base)) {
    return clearPresetTextbookSnapshot(base);
  }

  const selection = getK12TextbookSelection(presets, base);
  if (!selection.edition || !selection.volume || !selection.unit || !selection.chapter) {
    return clearPresetTextbookSnapshot(base);
  }

  return {
    ...base,
    textbookSource: 'preset',
    textbookPublisher: selection.edition?.publisher,
    textbookEditionId: selection.edition?.id,
    textbookEditionLabel: selection.edition
      ? resolveLocalizedText(selection.edition.label, 'zh-CN')
      : undefined,
    volumeId: selection.volume?.id,
    volumeLabel: selection.volume ? resolveLocalizedText(selection.volume.label, 'zh-CN') : undefined,
    unitId: selection.unit?.id,
    unitTitle: selection.unit?.title,
    chapterId: selection.chapter?.id,
    chapterTitle: selection.chapter?.title,
    chapterSummary: selection.chapter?.summary,
    chapterKeywords: selection.chapter?.keywords ?? [],
    chapterResources: selection.chapter?.sourceDocuments ?? [],
  };
}

export function buildK12TextbookResourceReferenceText(args: {
  resources: Array<{ title: string; description?: string; url?: string }>;
  locale: SupportedLocale;
}): string {
  const { resources, locale } = args;
  if (!resources.length) {
    return '';
  }

  const lines = resources.map((resource, index) => {
    const detail = [resource.description, resource.url].filter(Boolean).join('；');
    if (locale === 'zh-CN') {
      return `${index + 1}. ${resource.title}${detail ? `：${detail}` : ''}`;
    }
    return `${index + 1}. ${resource.title}${detail ? `: ${detail}` : ''}`;
  });

  return locale === 'zh-CN'
    ? ['章节参考资料：', ...lines].join('\n')
    : ['Chapter reference materials:', ...lines].join('\n');
}

export function mergeK12TextbookResourcesIntoReferenceText(args: {
  baseText?: string;
  resources: Array<{ title: string; description?: string; url?: string }>;
  locale: SupportedLocale;
}): string {
  const { baseText = '', resources, locale } = args;
  const resourceReference = buildK12TextbookResourceReferenceText({
    resources,
    locale,
  });
  if (!resourceReference) {
    return baseText;
  }
  if (baseText.includes(resourceReference)) {
    return baseText;
  }
  return [baseText, resourceReference].filter(Boolean).join('\n\n');
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
  const selection = usesPresetTextbookSnapshot(input)
    ? getK12TextbookSelection(presets, input)
    : undefined;
  const lessonTypeLabel =
    getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale) ?? input.lessonTypeId;
  const editionLabel = selection?.edition
    ? resolveLocalizedText(selection.edition.label, locale)
    : input.textbookEditionLabel;
  const volumeLabel = selection?.volume
    ? resolveLocalizedText(selection.volume.label, locale)
    : input.volumeLabel;
  const unitTitle = selection?.unit?.title ?? input.unitTitle;
  const chapterTitle = selection?.chapter?.title ?? input.chapterTitle;
  const chapterKeywords = input.chapterKeywords ?? [];
  const chapterResources = input.chapterResources ?? [];
  const chapterResourceReference = buildK12TextbookResourceReferenceText({
    resources: chapterResources,
    locale,
  });
  const hasLinkedChapter = Boolean(chapterTitle);

  if (locale === 'zh-CN') {
    return [
      hasLinkedChapter
        ? `请基于当前关联教材章节设计一节${input.durationMinutes}分钟的${lessonTypeLabel}课堂。`
        : `请设计一节${input.durationMinutes}分钟的${lessonTypeLabel}课堂。`,
      hasLinkedChapter
        ? `优先基于${editionLabel ?? '教材'}${volumeLabel ? ` ${volumeLabel}` : ''}中“${unitTitle ?? '当前单元'}”的“${chapterTitle}”组织内容。`
        : '如果未关联教材章节，请结合老师补充要求和上传资料组织内容。',
      input.chapterSummary ? `章节摘要：${input.chapterSummary}` : null,
      chapterKeywords.length > 0 ? `核心关键词：${chapterKeywords.join('、')}` : null,
      chapterResources.length > 0
        ? `章节可参考资料：${chapterResources.map((resource) => resource.title).join('；')}`
        : null,
      chapterResourceReference || null,
      supplementaryPdfName ? `老师额外上传了补充资料 PDF《${supplementaryPdfName}》。` : null,
      '输出应适合小学课堂使用，包含导入、讲解、例题、随堂提问、练习和总结。',
      freeform ? `补充要求：${freeform}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    hasLinkedChapter
      ? `Design a ${input.durationMinutes}-minute ${lessonTypeLabel.toLowerCase()} lesson based on the linked textbook chapter.`
      : `Design a ${input.durationMinutes}-minute ${lessonTypeLabel.toLowerCase()} lesson.`,
    hasLinkedChapter
      ? `Prioritize the chapter "${chapterTitle}" from ${editionLabel ?? 'the selected textbook'}${volumeLabel ? ` (${volumeLabel})` : ''}${unitTitle ? `, unit "${unitTitle}"` : ''}.`
      : 'If no textbook chapter is linked, rely on the teacher notes and any uploaded supporting materials.',
    input.chapterSummary ? `Chapter summary: ${input.chapterSummary}` : null,
    chapterKeywords.length > 0 ? `Key concepts: ${chapterKeywords.join(', ')}` : null,
    chapterResources.length > 0
      ? `Reference chapter resources: ${chapterResources.map((resource) => resource.title).join('; ')}` 
      : null,
    chapterResourceReference || null,
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

  const selection = usesPresetTextbookSnapshot(input)
    ? getK12TextbookSelection(presets, input)
    : undefined;
  const gradeLabel = getK12OptionLabel(presets?.grades, input.gradeId, locale);
  const subjectLabel = getK12OptionLabel(presets?.subjects, input.subjectId, locale);
  const lessonTypeLabel = getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale);
  const editionLabel = selection?.edition
    ? resolveLocalizedText(selection.edition.label, locale)
    : input.textbookEditionLabel;
  const volumeLabel = selection?.volume
    ? resolveLocalizedText(selection.volume.label, locale)
    : input.volumeLabel;
  const unitTitle = selection?.unit?.title ?? input.unitTitle;
  const chapterTitle = selection?.chapter?.title ?? input.chapterTitle;
  const chapterResourceReference = buildK12TextbookResourceReferenceText({
    resources: input.chapterResources ?? [],
    locale,
  });

  const lines =
    locale === 'zh-CN'
      ? [
          '',
          '### 当前结构化备课参数',
          gradeLabel ? `- 年级：${gradeLabel}` : null,
          subjectLabel ? `- 学科：${subjectLabel}` : null,
          lessonTypeLabel ? `- 课型：${lessonTypeLabel}` : null,
          input.durationMinutes ? `- 课时：${input.durationMinutes} 分钟` : null,
          input.textbookPublisher ? `- 出版社：${input.textbookPublisher}` : null,
          editionLabel ? `- 教材版本：${editionLabel}` : null,
          volumeLabel ? `- 册次：${volumeLabel}` : null,
          unitTitle ? `- 单元：${unitTitle}` : null,
          chapterTitle ? `- 章节：${chapterTitle}` : null,
          input.chapterSummary ? `- 章节摘要：${input.chapterSummary}` : null,
          input.chapterKeywords?.length ? `- 章节关键词：${input.chapterKeywords.join('、')}` : null,
          input.chapterResources?.length
            ? `- 章节资料：${input.chapterResources.map((resource) => resource.title).join('；')}`
            : null,
          chapterResourceReference ? `- 章节资料详情：\n${chapterResourceReference}` : null,
        ]
      : [
          '',
          '### Structured lesson settings',
          gradeLabel ? `- Grade: ${gradeLabel}` : null,
          subjectLabel ? `- Subject: ${subjectLabel}` : null,
          lessonTypeLabel ? `- Lesson type: ${lessonTypeLabel}` : null,
          input.durationMinutes ? `- Duration: ${input.durationMinutes} minutes` : null,
          input.textbookPublisher ? `- Publisher: ${input.textbookPublisher}` : null,
          editionLabel ? `- Textbook edition: ${editionLabel}` : null,
          volumeLabel ? `- Volume: ${volumeLabel}` : null,
          unitTitle ? `- Unit: ${unitTitle}` : null,
          chapterTitle ? `- Chapter: ${chapterTitle}` : null,
          input.chapterSummary ? `- Chapter summary: ${input.chapterSummary}` : null,
          input.chapterKeywords?.length
            ? `- Chapter keywords: ${input.chapterKeywords.join(', ')}`
            : null,
          input.chapterResources?.length
            ? `- Chapter resources: ${input.chapterResources.map((resource) => resource.title).join('; ')}`
            : null,
          chapterResourceReference ? `- Resource details:\n${chapterResourceReference}` : null,
        ];

  return lines.filter(Boolean).join('\n');
}

export function buildK12LessonPackTitle(args: {
  input: K12StructuredInput | undefined;
  presets: K12ModulePresets | undefined;
  locale: SupportedLocale;
  requirement?: string;
}): string {
  const { input, presets, locale, requirement } = args;
  const fallbackRequirement = firstSentence(requirement || '');

  if (!input) {
    return truncateText(fallbackRequirement || '未命名备课包', 40);
  }

  const selection = usesPresetTextbookSnapshot(input)
    ? getK12TextbookSelection(presets, input)
    : undefined;
  const lessonTypeLabel =
    getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale) ?? input.lessonTypeId;
  const chapterTitle = selection?.chapter?.title
    ? collapseWhitespace(selection.chapter.title)
    : collapseWhitespace(input.chapterTitle ?? '');
  const unitTitle = selection?.unit?.title
    ? collapseWhitespace(selection.unit.title)
    : collapseWhitespace(input.unitTitle ?? '');
  const chapterSummary = input.chapterSummary ? collapseWhitespace(input.chapterSummary) : '';
  const mainTopic = chapterTitle || chapterSummary || unitTitle;

  if (mainTopic) {
    const prefix = lessonTypeLabel ? `${lessonTypeLabel} · ` : '';
    return truncateText(`${prefix}${mainTopic}`, 48);
  }

  const gradeLabel = getK12OptionLabel(presets?.grades, input.gradeId, locale);
  const subjectLabel = getK12OptionLabel(presets?.subjects, input.subjectId, locale);
  const fallbackParts = [gradeLabel, subjectLabel, lessonTypeLabel, fallbackRequirement].filter(Boolean);

  return truncateText(fallbackParts.join(' · '), 48) || '未命名备课包';
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

  const selection = usesPresetTextbookSnapshot(input)
    ? getK12TextbookSelection(presets, input)
    : undefined;

  return {
    // Use label from presets first, fallback to input's saved label
    grade: getK12OptionLabel(presets?.grades, input.gradeId, locale) ?? input.gradeLabel,
    subject: getK12OptionLabel(presets?.subjects, input.subjectId, locale) ?? input.subjectLabel,
    lessonType: getK12OptionLabel(presets?.lessonTypes, input.lessonTypeId, locale),
    durationMinutes: input.durationMinutes,
    textbookEdition: selection?.edition
      ? resolveLocalizedText(selection.edition.label, locale)
      : input.textbookEditionLabel,
    volume: selection?.volume ? resolveLocalizedText(selection.volume.label, locale) : input.volumeLabel,
    unit: selection?.unit?.title ?? input.unitTitle,
    chapter: selection?.chapter?.title ?? input.chapterTitle,
    chapterId: selection?.chapter?.id ?? input.chapterId,
  };
}
