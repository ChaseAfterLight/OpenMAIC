'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getK12TextbookSelection, syncK12StructuredInput } from '@/lib/module-host/k12';
import {
  resolveLocalizedText,
  resolveOptionLabel,
  type K12ModulePresets,
  type K12StructuredInput,
  type SupportedLocale,
} from '@/lib/module-host/types';

interface K12StructuredInputProps {
  presets: K12ModulePresets;
  value: K12StructuredInput;
  locale: SupportedLocale;
  onChange: (next: K12StructuredInput) => void;
  compact?: boolean;
  className?: string;
  showTextbookSection?: boolean;
  copyVariant?: 'k12' | 'adult-education';
}

const copy = {
  'zh-CN': {
    structured: '基础参数',
    textbook: '教材章节',
    lessonType: '课型',
    duration: '时长',
    edition: '教材版本',
    volume: '册次',
    unit: '单元',
    chapter: '章节',
    durationUnit: '分钟',
    noEdition: '当前学科暂无教材目录，可直接补充需求或上传资料。',
    noSelection: '可按需选择教材章节；如果不选，系统只会使用你的需求和上传资料生成。',
    noChapter: '当前教材还没有配置章节数据，可继续通过自由描述和补充资料生成。',
    chapterSummary: '章节摘要',
    chapterKeywords: '关键词',
    chapterResources: '章节资料',
  },
  'en-US': {
    structured: 'Lesson setup',
    textbook: 'Textbook chapter',
    lessonType: 'Lesson type',
    duration: 'Duration',
    edition: 'Edition',
    volume: 'Volume',
    unit: 'Unit',
    chapter: 'Chapter',
    durationUnit: 'min',
    noEdition:
      'No textbook catalog is available for this subject yet. You can still continue with freeform notes and uploaded materials.',
    noSelection:
      'Selecting a textbook chapter is optional. If you skip it, generation will only use your prompt and uploaded materials.',
    noChapter:
      'This textbook entry does not have chapter data yet. You can still continue with freeform notes and supplementary materials.',
    chapterSummary: 'Chapter summary',
    chapterKeywords: 'Keywords',
    chapterResources: 'Resources',
  },
} as const;

function getStructuredInputCopy(
  locale: SupportedLocale,
  copyVariant: 'k12' | 'adult-education',
) {
  const base = copy[locale];
  if (copyVariant !== 'adult-education') {
    return base;
  }

  return {
    ...base,
    structured: locale === 'zh-CN' ? '培训参数' : 'Training setup',
    textbook: locale === 'zh-CN' ? '课程资料' : 'Course materials',
    lessonType: locale === 'zh-CN' ? '训练方式' : 'Delivery format',
    edition: locale === 'zh-CN' ? '资料版本' : 'Resource edition',
    volume: locale === 'zh-CN' ? '资料集' : 'Collection',
    unit: locale === 'zh-CN' ? '模块' : 'Module',
    chapter: locale === 'zh-CN' ? '章节主题' : 'Section',
    noEdition:
      locale === 'zh-CN'
        ? '当前方向下还没有可用资料目录，可直接补充培训要求或上传参考资料。'
        : 'No resource catalog is available for this focus area yet. You can still continue with trainer notes and uploaded materials.',
    noSelection:
      locale === 'zh-CN'
        ? '选择课程资料是可选的；如果跳过，系统会只根据你的培训要求和上传资料生成。'
        : 'Linking a course resource is optional. If you skip it, generation will rely on your training brief and uploaded materials.',
    noChapter:
      locale === 'zh-CN'
        ? '当前资料还没有配置细分章节，可继续通过补充说明和资料生成。'
        : 'This resource does not have section data yet. You can still continue with trainer notes and supporting files.',
    chapterSummary: locale === 'zh-CN' ? '内容摘要' : 'Content summary',
    chapterResources: locale === 'zh-CN' ? '配套资料' : 'Linked resources',
  };
}

export function K12StructuredInputFields({
  presets,
  value,
  locale,
  onChange,
  compact = false,
  className,
  showTextbookSection = true,
  copyVariant = 'k12',
}: K12StructuredInputProps) {
  const text = getStructuredInputCopy(locale, copyVariant);
  const selection = getK12TextbookSelection(presets, value);
  const triggerClassName = compact
    ? 'h-10 rounded-2xl border-slate-200 bg-white text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900'
    : 'h-10 rounded-xl border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  const sectionWrapClassName = compact
    ? 'space-y-3 rounded-[24px] border border-slate-200/70 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50'
    : 'space-y-2';

  const update = (patch: Partial<K12StructuredInput>) => {
    onChange(syncK12StructuredInput({ ...value, ...patch }, presets));
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className={sectionWrapClassName}>
        <div className={cn('flex items-center justify-between', compact && 'px-0.5')}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {text.structured}
          </p>
          {compact ? <span className="text-[11px] text-slate-400">2</span> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {text.lessonType}
            </p>
            <Select
              value={value.lessonTypeId}
              onValueChange={(lessonTypeId) => update({ lessonTypeId })}
            >
              <SelectTrigger className={cn(triggerClassName, 'w-full min-w-0 justify-between')}>
                <SelectValue placeholder={text.lessonType} />
              </SelectTrigger>
              <SelectContent>
                {presets.lessonTypes.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {resolveOptionLabel(option, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {text.duration}
            </p>
            <Select
              value={String(value.durationMinutes)}
              onValueChange={(durationMinutes) =>
                update({ durationMinutes: Number(durationMinutes) })
              }
            >
              <SelectTrigger className={cn(triggerClassName, 'w-full min-w-0 justify-between')}>
                <SelectValue placeholder={text.duration} />
              </SelectTrigger>
              <SelectContent>
                {presets.durations.map((duration) => (
                  <SelectItem key={duration} value={String(duration)}>
                    {duration} {text.durationUnit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {showTextbookSection ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {text.textbook}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              value={selection.edition?.id}
              onValueChange={(textbookEditionId) => update({ textbookEditionId })}
              disabled={selection.editions.length === 0}
            >
              <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder={text.edition} />
              </SelectTrigger>
              <SelectContent>
                {selection.editions.map((edition) => (
                  <SelectItem key={edition.id} value={edition.id}>
                    {resolveLocalizedText(edition.label, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selection.volume?.id}
              onValueChange={(volumeId) => update({ volumeId })}
              disabled={selection.volumes.length === 0}
            >
              <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder={text.volume} />
              </SelectTrigger>
              <SelectContent>
                {selection.volumes.map((volume) => (
                  <SelectItem key={volume.id} value={volume.id}>
                    {resolveLocalizedText(volume.label, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selection.unit?.id}
              onValueChange={(unitId) => update({ unitId })}
              disabled={selection.units.length === 0}
            >
              <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder={text.unit} />
              </SelectTrigger>
              <SelectContent>
                {selection.units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selection.chapter?.id}
              onValueChange={(chapterId) => update({ chapterId })}
              disabled={selection.chapters.length === 0}
            >
              <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder={text.chapter} />
              </SelectTrigger>
              <SelectContent>
                {selection.chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 text-left dark:border-slate-800 dark:bg-slate-950/60">
            {selection.editions.length === 0 ? (
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {text.noEdition}
              </p>
            ) : !selection.edition ? (
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {text.noSelection}
              </p>
            ) : selection.chapter ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selection.unit?.title} / {selection.chapter.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {text.chapterSummary}:
                    </span>{' '}
                    {selection.chapter.summary}
                  </p>
                </div>
                {selection.chapter.keywords.length > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{text.chapterKeywords}:</span>{' '}
                    {selection.chapter.keywords.join(locale === 'zh-CN' ? '、' : ', ')}
                  </p>
                ) : null}
                {selection.chapter.sourceDocuments.length > 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{text.chapterResources}:</span>{' '}
                    {selection.chapter.sourceDocuments
                      .map((resource) => resource.title)
                      .join(locale === 'zh-CN' ? '；' : '; ')}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {text.noChapter}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
