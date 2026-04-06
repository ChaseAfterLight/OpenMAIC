'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { nanoid } from 'nanoid';
import type { PdfImage, SceneOutline } from '@/lib/types/generation';
import { useI18n } from '@/lib/hooks/use-i18n';

interface OutlinesEditorProps {
  outlines: SceneOutline[];
  onChange: (outlines: SceneOutline[]) => void;
  onConfirm: (outlines: SceneOutline[]) => void;
  onBack: () => void;
  availableImages?: PdfImage[];
  isLoading?: boolean;
}

export function OutlinesEditor({
  outlines,
  onChange,
  onConfirm,
  onBack,
  availableImages = [],
  isLoading = false,
}: OutlinesEditorProps) {
  const { t } = useI18n();
  const availableImageIds = useMemo(() => new Set(availableImages.map((image) => image.id)), [availableImages]);
  const totalEstimatedDuration = outlines.reduce(
    (sum, outline) => sum + (outline.estimatedDuration || 0),
    0,
  );
  const selectedImageCount = outlines.reduce(
    (sum, outline) => sum + (outline.suggestedImageIds?.length || 0),
    0,
  );
  const linkedImageScenes = outlines.filter((outline) => (outline.suggestedImageIds?.length || 0) > 0)
    .length;

  const sanitizeOutlines = (nextOutlines: SceneOutline[]) =>
    nextOutlines.map((outline) => ({
      ...outline,
      suggestedImageIds: (outline.suggestedImageIds || []).filter((id) => availableImageIds.has(id)),
    }));

  const addOutline = () => {
    const newOutline: SceneOutline = {
      id: nanoid(8),
      type: 'slide',
      title: '',
      description: '',
      keyPoints: [],
      order: outlines.length + 1,
    };
    onChange([...outlines, newOutline]);
  };

  const updateOutline = (index: number, updates: Partial<SceneOutline>) => {
    const newOutlines = [...outlines];
    newOutlines[index] = { ...newOutlines[index], ...updates };
    onChange(newOutlines);
  };

  const removeOutline = (index: number) => {
    const newOutlines = outlines.filter((_, i) => i !== index);
    // Update order
    newOutlines.forEach((outline, i) => {
      outline.order = i + 1;
    });
    onChange(newOutlines);
  };

  const moveOutline = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= outlines.length) return;
    const newOutlines = [...outlines];
    [newOutlines[index], newOutlines[newIndex]] = [newOutlines[newIndex], newOutlines[index]];
    // Update order
    newOutlines.forEach((outline, i) => {
      outline.order = i + 1;
    });
    onChange(newOutlines);
  };

  const updateKeyPoints = (index: number, keyPointsText: string) => {
    const keyPoints = keyPointsText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    updateOutline(index, { keyPoints });
  };

  const toggleSuggestedImage = (index: number, imageId: string, checked: boolean) => {
    const currentIds = new Set(outlines[index].suggestedImageIds || []);
    if (checked) {
      currentIds.add(imageId);
    } else {
      currentIds.delete(imageId);
    }
    updateOutline(index, { suggestedImageIds: Array.from(currentIds) });
  };

  const clearSuggestedImages = (index: number) => {
    updateOutline(index, { suggestedImageIds: [] });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{t('generation.outlineEditorTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('generation.outlineEditorSummary', { count: outlines.length })}
          </p>
        </div>
        <Button variant="outline" onClick={addOutline} disabled={isLoading}>
          <Plus className="size-4 mr-1" />
          {t('generation.addScene')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('generation.summaryScenes')}
            </p>
            <p className="mt-2 text-2xl font-semibold">{outlines.length}</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('generation.summaryDuration')}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {totalEstimatedDuration > 0 ? (
                <>
                  {Math.max(1, Math.round(totalEstimatedDuration / 60))}{' '}
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('generation.summaryMinutes')}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('generation.summaryImages')}
            </p>
            <p className="mt-2 text-2xl font-semibold">{selectedImageCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('generation.summaryLinkedScenes', { count: linkedImageScenes })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {outlines.map((outline, index) => (
          <Card key={outline.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveOutline(index, 'up')}
                    disabled={index === 0 || isLoading}
                    className="size-6"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveOutline(index, 'down')}
                    disabled={index === outlines.length - 1 || isLoading}
                    className="size-6"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground size-6 rounded-full flex items-center justify-center text-sm">
                      {index + 1}
                    </span>
                    <Input
                      value={outline.title}
                      onChange={(e) => updateOutline(index, { title: e.target.value })}
                      placeholder={t('generation.sceneTitlePlaceholder')}
                      className="flex-1"
                      disabled={isLoading}
                    />
                  </CardTitle>
                </div>
                <Select
                  value={outline.type}
                  onValueChange={(value) =>
                    updateOutline(index, {
                      type: value as SceneOutline['type'],
                    })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slide">{t('generation.sceneTypeSlide')}</SelectItem>
                    <SelectItem value="quiz">{t('generation.sceneTypeQuiz')}</SelectItem>
                    <SelectItem value="interactive">
                      {t('generation.sceneTypeInteractive')}
                    </SelectItem>
                    <SelectItem value="pbl">{t('generation.sceneTypePbl')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOutline(index)}
                  disabled={isLoading}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('generation.teachingObjectiveLabel')}</Label>
                <Textarea
                  value={outline.teachingObjective || outline.description}
                  onChange={(e) =>
                    updateOutline(index, {
                      teachingObjective: e.target.value,
                      description: e.target.value,
                    })
                  }
                  placeholder={t('generation.teachingObjectivePlaceholder')}
                  rows={2}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('generation.estimatedDurationLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  step={30}
                  value={outline.estimatedDuration || ''}
                  onChange={(e) =>
                    updateOutline(index, {
                      estimatedDuration:
                        e.target.value.trim().length === 0
                          ? undefined
                          : Math.max(30, Number(e.target.value) || 0),
                    })
                  }
                  placeholder={t('generation.estimatedDurationPlaceholder')}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('generation.keyPointsLabel')}</Label>
                <Textarea
                  value={outline.keyPoints?.join('\n') || ''}
                  onChange={(e) => updateKeyPoints(index, e.target.value)}
                  placeholder={t('generation.keyPointsPlaceholder')}
                  rows={3}
                  disabled={isLoading}
                />
              </div>

              {availableImages.length > 0 && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label>{t('generation.referenceImagesLabel')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('generation.referenceImagesHint')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => clearSuggestedImages(index)}
                      disabled={isLoading || (outline.suggestedImageIds?.length || 0) === 0}
                    >
                      {t('generation.clearSelectedImages')}
                    </Button>
                  </div>

                  <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                    {t('generation.selectedImagesCount', {
                      count: outline.suggestedImageIds?.length || 0,
                    })}
                    {outline.suggestedImageIds?.some((id) => !availableImageIds.has(id)) && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        {t('generation.invalidImageSelections')}
                      </span>
                    )}
                  </div>

                  <ScrollArea className="h-48 rounded-lg border border-border/60 bg-background/80">
                    <div className="space-y-2 p-3">
                      {availableImages.map((image) => {
                        const checked = outline.suggestedImageIds?.includes(image.id) || false;
                        return (
                          <label
                            key={image.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:bg-muted/40"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggleSuggestedImage(index, image.id, value === true)
                              }
                              disabled={isLoading}
                            />
                            <div className="min-w-0 space-y-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {t('generation.referenceImagePage', { page: image.pageNumber })}
                                </span>
                                <span className="text-xs text-muted-foreground">{image.id}</span>
                              </div>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {image.description || t('generation.referenceImageNoDescription')}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {outline.type === 'quiz' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <Label className="text-sm font-medium">{t('generation.quizConfigLabel')}</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizQuestionCount')}</Label>
                      <Input
                        type="number"
                        value={outline.quizConfig?.questionCount || 3}
                        onChange={(e) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              questionCount: parseInt(e.target.value) || 3,
                              difficulty: outline.quizConfig?.difficulty || 'medium',
                              questionTypes: outline.quizConfig?.questionTypes || ['single'],
                            },
                          })
                        }
                        min={1}
                        max={10}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizDifficulty')}</Label>
                      <Select
                        value={outline.quizConfig?.difficulty || 'medium'}
                        onValueChange={(value) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              difficulty: value as 'easy' | 'medium' | 'hard',
                              questionCount: outline.quizConfig?.questionCount || 3,
                              questionTypes: outline.quizConfig?.questionTypes || ['single'],
                            },
                          })
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">{t('generation.quizDifficultyEasy')}</SelectItem>
                          <SelectItem value="medium">
                            {t('generation.quizDifficultyMedium')}
                          </SelectItem>
                          <SelectItem value="hard">{t('generation.quizDifficultyHard')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('generation.quizType')}</Label>
                      <Select
                        value={outline.quizConfig?.questionTypes?.[0] || 'single'}
                        onValueChange={(value) =>
                          updateOutline(index, {
                            quizConfig: {
                              ...outline.quizConfig,
                              questionTypes: [value as 'single' | 'multiple' | 'text'],
                              questionCount: outline.quizConfig?.questionCount || 3,
                              difficulty: outline.quizConfig?.difficulty || 'medium',
                            },
                          })
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">{t('generation.quizTypeSingle')}</SelectItem>
                          <SelectItem value="multiple">
                            {t('generation.quizTypeMultiple')}
                          </SelectItem>
                          <SelectItem value="text">{t('generation.quizTypeText')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {outlines.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">{t('generation.noOutlines')}</p>
          <Button variant="outline" onClick={addOutline} disabled={isLoading}>
            <Plus className="size-4 mr-1" />
            {t('generation.addFirstScene')}
          </Button>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          {t('generation.backToRequirements')}
        </Button>
        <Button
          onClick={() => onConfirm(sanitizeOutlines(outlines))}
          disabled={isLoading || outlines.length === 0}
        >
          {isLoading
            ? t('generation.generatingInProgress')
            : t('generation.confirmAndGenerateCourse')}
        </Button>
      </div>
    </div>
  );
}
