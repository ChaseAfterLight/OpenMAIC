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
    noChapter:
      'This textbook entry does not have chapter data yet. You can still continue with freeform notes and supplementary materials.',
    chapterSummary: 'Chapter summary',
    chapterKeywords: 'Keywords',
    chapterResources: 'Resources',
  },
} as const;

export function K12StructuredInputFields({
  presets,
  value,
  locale,
  onChange,
  compact = false,
  className,
  showTextbookSection = true,
}: K12StructuredInputProps) {
  const text = copy[locale];
  const selection = getK12TextbookSelection(presets, value);
  const triggerClassName = compact
    ? 'h-9 rounded-xl border-slate-200 bg-white text-xs shadow-none dark:border-slate-800 dark:bg-slate-900'
    : 'h-10 rounded-xl border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

  const update = (patch: Partial<K12StructuredInput>) => {
    onChange(syncK12StructuredInput({ ...value, ...patch }, presets));
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {text.structured}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            value={value.lessonTypeId}
            onValueChange={(lessonTypeId) => update({ lessonTypeId })}
          >
            <SelectTrigger className={triggerClassName}>
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

          <Select
            value={String(value.durationMinutes)}
            onValueChange={(durationMinutes) =>
              update({ durationMinutes: Number(durationMinutes) })
            }
          >
            <SelectTrigger className={triggerClassName}>
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
