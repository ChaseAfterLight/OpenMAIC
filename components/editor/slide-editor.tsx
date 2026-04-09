'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type {
  PPTAudioElement,
  PPTChartElement,
  PPTElement,
  PPTImageElement,
  PPTLatexElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  PPTVideoElement,
  Slide,
} from '@/lib/types/slides';

interface SlideEditorProps {
  slide: Slide;
  onSave: (updatedSlide: Slide) => void;
  onRevert: () => void;
}

function createElementId(type: PPTElement['type']) {
  return `${type}_${Math.random().toString(36).slice(2, 10)}`;
}

function getElementSummary(element: PPTElement) {
  switch (element.type) {
    case 'text':
      return element.content.replace(/<[^>]+>/g, '').slice(0, 40) || element.id;
    case 'image':
    case 'video':
    case 'audio':
      return element.src || element.id;
    case 'shape':
      return element.text?.content?.replace(/<[^>]+>/g, '').slice(0, 40) || element.id;
    case 'latex':
      return element.latex;
    case 'line':
      return `${element.start.join(',')} → ${element.end.join(',')}`;
    case 'chart':
      return `${element.chartType} chart`;
    case 'table':
      return `${element.data.length} rows`;
    default:
      return '';
  }
}

export function SlideEditor({ slide, onSave, onRevert }: SlideEditorProps) {
  const { t } = useI18n();
  const [localSlide, setLocalSlide] = useState(slide);
  const [expandedId, setExpandedId] = useState<string | null>(slide.elements[0]?.id ?? null);
  const [newElementType, setNewElementType] = useState<PPTElement['type']>('text');

  const elementTypeOptions: Array<{ value: PPTElement['type']; label: string }> = useMemo(
    () => [
      { value: 'text', label: t('stage.elementTypeText') },
      { value: 'image', label: t('stage.elementTypeImage') },
      { value: 'shape', label: t('stage.elementTypeShape') },
      { value: 'line', label: t('stage.elementTypeLine') },
      { value: 'chart', label: t('stage.elementTypeChart') },
      { value: 'table', label: t('stage.elementTypeTable') },
      { value: 'latex', label: t('stage.elementTypeLatex') },
      { value: 'video', label: t('stage.elementTypeVideo') },
      { value: 'audio', label: t('stage.elementTypeAudio') },
    ],
    [t],
  );

  const createDefaultElement = useCallback(
    (type: PPTElement['type']): PPTElement => {
      const base = {
        id: createElementId(type),
        left: 80,
        top: 80,
        width: 220,
        height: 80,
        rotate: 0,
      };

      switch (type) {
        case 'text':
          return {
            ...base,
            type,
            content: '<p>新文本</p>',
            defaultFontName: 'Arial',
            defaultColor: '#1f2937',
          } satisfies PPTTextElement;
        case 'image':
          return { ...base, type, fixedRatio: true, src: '' } satisfies PPTImageElement;
        case 'shape':
          return {
            ...base,
            type,
            viewBox: [1000, 1000],
            path: 'M0,0 L1000,0 L1000,1000 L0,1000 Z',
            fixedRatio: false,
            fill: '#5b9bd5',
          } satisfies PPTShapeElement;
        case 'line':
          return {
            id: createElementId(type),
            type,
            left: 80,
            top: 80,
            width: 220,
            start: [80, 80],
            end: [300, 80],
            style: 'solid',
            color: '#1f2937',
            points: ['', 'arrow'],
          } satisfies PPTLineElement;
        case 'chart':
          return {
            ...base,
            type,
            chartType: 'bar',
            data: { labels: ['A', 'B'], legends: ['Series'], series: [[10, 20]] },
            themeColors: ['#5b9bd5', '#f97316', '#10b981'],
          } satisfies PPTChartElement;
        case 'table':
          return {
            ...base,
            type,
            outline: { width: 1, style: 'solid', color: '#1f2937' },
            colWidths: [0.5, 0.5],
            cellMinHeight: 40,
            data: [
              [
                { id: 'c1', colspan: 1, rowspan: 1, text: 'Header 1' },
                { id: 'c2', colspan: 1, rowspan: 1, text: 'Header 2' },
              ],
              [
                { id: 'c3', colspan: 1, rowspan: 1, text: 'Value 1' },
                { id: 'c4', colspan: 1, rowspan: 1, text: 'Value 2' },
              ],
            ],
          } satisfies PPTTableElement;
        case 'latex':
          return { ...base, type, latex: 'E = mc^2' } satisfies PPTLatexElement;
        case 'video':
          return { ...base, type, src: '', autoplay: false } satisfies PPTVideoElement;
        case 'audio':
          return {
            ...base,
            type,
            src: '',
            autoplay: false,
            loop: false,
            fixedRatio: true,
            color: '#5b9bd5',
          } satisfies PPTAudioElement;
        default:
          return {
            ...base,
            type: 'text',
            content: '<p>新文本</p>',
            defaultFontName: 'Arial',
            defaultColor: '#1f2937',
          };
      }
    },
    [],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocalSlide(slide);
    setExpandedId(slide.elements[0]?.id ?? null);
  }, [slide]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasChanges = useMemo(
    () => JSON.stringify(localSlide) !== JSON.stringify(slide),
    [localSlide, slide],
  );

  const updateElement = useCallback((elementId: string, updater: (element: PPTElement) => PPTElement) => {
    setLocalSlide((prev) => ({
      ...prev,
      elements: prev.elements.map((element) => (element.id === elementId ? updater(element) : element)),
    }));
  }, []);

  const removeElement = useCallback((elementId: string) => {
    setLocalSlide((prev) => ({
      ...prev,
      elements: prev.elements.filter((element) => element.id !== elementId),
    }));
    setExpandedId((prev) => (prev === elementId ? null : prev));
  }, []);

  const addElement = useCallback(() => {
    const nextElement = createDefaultElement(newElementType);
    setLocalSlide((prev) => ({
      ...prev,
      elements: [...prev.elements, nextElement],
    }));
    setExpandedId(nextElement.id);
  }, [createDefaultElement, newElementType]);

  const handleSave = useCallback(() => {
    onSave(localSlide);
  }, [localSlide, onSave]);

  const handleRevert = useCallback(() => {
    setLocalSlide(slide);
    setExpandedId(slide.elements[0]?.id ?? null);
    onRevert();
  }, [onRevert, slide]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t('stage.elementsCount', { count: localSlide.elements.length })}
        </span>
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          ) : null}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!hasChanges} onClick={handleRevert}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('stage.revert')}
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" disabled={!hasChanges} onClick={handleSave}>
            <Check className="mr-1 h-3 w-3" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="elements" className="min-h-0 flex-1">
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="elements">{t('stage.slideTab')}</TabsTrigger>
          <TabsTrigger value="background">{t('stage.backgroundTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="elements" className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <select
              value={newElementType}
              onChange={(event) => setNewElementType(event.target.value as PPTElement['type'])}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {elementTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={addElement}>
              <Plus className="mr-1 h-3 w-3" />
              {t('stage.addElement')}
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {localSlide.elements.map((element, index) => {
              const isExpanded = expandedId === element.id;
              return (
                <div key={element.id} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : element.id)}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {elementTypeOptions.find((option) => option.value === element.type)?.label ?? element.type}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">{getElementSummary(element)}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeElement(element.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  {isExpanded ? (
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input type="number" value={Math.round(element.left)} onChange={(event) => updateElement(element.id, (prev) => ({ ...prev, left: Number(event.target.value) || 0 }))} className="text-xs" />
                        <Input type="number" value={Math.round(element.top)} onChange={(event) => updateElement(element.id, (prev) => ({ ...prev, top: Number(event.target.value) || 0 }))} className="text-xs" />
                        <Input type="number" value={Math.round(element.width)} onChange={(event) => updateElement(element.id, (prev) => ({ ...prev, width: Number(event.target.value) || 0 }))} className="text-xs" />
                        {'height' in element ? <Input type="number" value={Math.round((element as PPTElement & { height?: number }).height ?? 0)} onChange={(event) => updateElement(element.id, (prev) => ({ ...prev, height: Number(event.target.value) || 0 }))} className="text-xs" /> : null}
                      </div>

                      {element.type === 'text' ? <Textarea value={element.content} onChange={(event) => updateElement(element.id, (prev) => ({ ...(prev as PPTTextElement), content: event.target.value }))} className="min-h-[80px] resize-none text-xs" /> : null}
                      {element.type === 'image' || element.type === 'video' || element.type === 'audio' ? <Input value={element.src} onChange={(event) => updateElement(element.id, (prev) => ({ ...prev, src: event.target.value } as PPTElement))} className="text-xs" placeholder={t('stage.sourceUrl')} /> : null}
                      {element.type === 'shape' ? <Textarea value={element.text?.content ?? ''} onChange={(event) => updateElement(element.id, (prev) => ({ ...(prev as PPTShapeElement), text: { content: event.target.value, defaultFontName: prev.type === 'shape' ? prev.text?.defaultFontName ?? localSlide.theme.fontName : localSlide.theme.fontName, defaultColor: prev.type === 'shape' ? prev.text?.defaultColor ?? localSlide.theme.fontColor : localSlide.theme.fontColor, align: prev.type === 'shape' ? prev.text?.align ?? 'middle' : 'middle' } }))} className="min-h-[72px] resize-none text-xs" placeholder={t('stage.shapeText')} /> : null}
                      {element.type === 'latex' ? <Textarea value={element.latex} onChange={(event) => updateElement(element.id, (prev) => ({ ...(prev as PPTLatexElement), latex: event.target.value }))} className="min-h-[72px] resize-none text-xs" /> : null}

                      <p className="text-xs text-muted-foreground">{t('stage.advancedElementHint')}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="background" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('stage.backgroundType')}</label>
            <select
              value={localSlide.background?.type ?? 'solid'}
              onChange={(event) =>
                setLocalSlide((prev) => ({
                  ...prev,
                  background:
                    event.target.value === 'image'
                      ? { type: 'image', image: { src: '', size: 'cover' } }
                      : event.target.value === 'gradient'
                        ? {
                            type: 'gradient',
                            gradient: {
                              type: 'linear',
                              colors: [
                                { pos: 0, color: prev.theme.backgroundColor },
                                { pos: 100, color: '#ffffff' },
                              ],
                              rotate: 0,
                            },
                          }
                        : { type: 'solid', color: prev.theme.backgroundColor },
                }))
              }
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="solid">{t('stage.backgroundTypeSolid')}</option>
              <option value="image">{t('stage.backgroundTypeImage')}</option>
              <option value="gradient">{t('stage.backgroundTypeGradient')}</option>
            </select>
          </div>

          {localSlide.background?.type === 'solid' ? <Input value={localSlide.background.color ?? ''} onChange={(event) => setLocalSlide((prev) => ({ ...prev, background: { type: 'solid', color: event.target.value } }))} className="text-xs" placeholder={t('stage.backgroundColor')} /> : null}
          {localSlide.background?.type === 'image' ? <Input value={localSlide.background.image?.src ?? ''} onChange={(event) => setLocalSlide((prev) => ({ ...prev, background: { type: 'image', image: { src: event.target.value, size: prev.background?.type === 'image' ? prev.background.image?.size ?? 'cover' : 'cover' } } }))} className="text-xs" placeholder={t('stage.imageUrl')} /> : null}
          {localSlide.background?.type === 'gradient' ? <p className="text-xs text-muted-foreground">{t('stage.advancedBackgroundHint')}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={localSlide.theme.backgroundColor} onChange={(event) => setLocalSlide((prev) => ({ ...prev, theme: { ...prev.theme, backgroundColor: event.target.value } }))} className="text-xs" placeholder={t('stage.themeBackground')} />
            <Input value={localSlide.theme.fontColor} onChange={(event) => setLocalSlide((prev) => ({ ...prev, theme: { ...prev.theme, fontColor: event.target.value } }))} className="text-xs" placeholder={t('stage.fontColor')} />
            <Input value={localSlide.theme.fontName} onChange={(event) => setLocalSlide((prev) => ({ ...prev, theme: { ...prev.theme, fontName: event.target.value } }))} className="text-xs" placeholder={t('stage.fontName')} />
            <Input value={localSlide.theme.themeColors.join(', ')} onChange={(event) => setLocalSlide((prev) => ({ ...prev, theme: { ...prev.theme, themeColors: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) } }))} className="text-xs" placeholder={t('stage.themeColors')} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
