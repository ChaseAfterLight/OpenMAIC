'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Image as ImageIcon,
  BookOpen,
  HelpCircle,
  MousePointerClick,
  Rocket,
  Clock,
  Check,
  FileImage
} from 'lucide-react';
import { nanoid } from 'nanoid';
import type { PdfImage, SceneOutline } from '@/lib/types/generation';
import type { MediaGenerationRequest } from '@/lib/media/types';
import { useI18n } from '@/lib/hooks/use-i18n';

interface OutlinesEditorProps {
  outlines: SceneOutline[];
  onChange: (outlines: SceneOutline[]) => void;
  onConfirm: (outlines: SceneOutline[]) => void;
  onBack: () => void;
  availableImages?: PdfImage[];
  imagePreviewMap?: Record<string, string>;
  isLoading?: boolean;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  slide: <BookOpen className="size-4 text-blue-500" />,
  quiz: <HelpCircle className="size-4 text-purple-500" />,
  interactive: <MousePointerClick className="size-4 text-emerald-500" />,
  pbl: <Rocket className="size-4 text-orange-500" />,
};

type TabValue = 'content' | 'advanced' | 'materials' | 'aigen';
type QuizQuestionType = 'single' | 'multiple' | 'text';

const DEFAULT_QUIZ_QUESTION_TYPES: QuizQuestionType[] = ['single'];

function supportsAdvancedTab(_type: SceneOutline['type']) {
  return false;
}

function supportsMaterialsTab(type: SceneOutline['type']) {
  return type !== 'quiz' && type !== 'interactive';
}

function resolveNextTab(tab: TabValue, type: SceneOutline['type']): TabValue {
  if (tab === 'advanced' && !supportsAdvancedTab(type)) {
    return 'content';
  }
  if (tab === 'materials' && !supportsMaterialsTab(type)) {
    return supportsAdvancedTab(type) ? 'advanced' : 'content';
  }
  return tab;
}

export function OutlinesEditor({
  outlines,
  onChange,
  onConfirm,
  onBack,
  availableImages = [],
  imagePreviewMap = {},
  isLoading = false,
}: OutlinesEditorProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number>(outlines.length > 0 ? 0 : -1);
  const [activeTab, setActiveTab] = useState<TabValue>('content');

  const availableImageIds = useMemo(
    () => new Set(availableImages.map((image) => image.id)),
    [availableImages]
  );
  
  const totalEstimatedDuration = outlines.reduce((sum, outline) => sum + (outline.estimatedDuration || 0), 0);

  const sanitizeOutlines = (nextOutlines: SceneOutline[]) =>
    nextOutlines.map((outline) => ({
      ...outline,
      suggestedImageIds: supportsMaterialsTab(outline.type)
        ? (outline.suggestedImageIds || []).filter((id) => availableImageIds.has(id))
        : [],
    }));

  // === 列表操作 ===
  const addOutline = () => {
    const newOutline: SceneOutline = {
      id: nanoid(8),
      type: 'slide',
      title: t('generation.newSceneDefaultTitle') || '新教学环节',
      description: '',
      keyPoints: [],
      order: outlines.length + 1,
    };
    onChange([...outlines, newOutline]);
    setActiveIndex(outlines.length);
    setActiveTab('content');
  };

  const removeOutline = (index: number) => {
    const newOutlines = outlines.filter((_, i) => i !== index);
    newOutlines.forEach((outline, i) => { outline.order = i + 1; });
    onChange(newOutlines);
    if (activeIndex === index) setActiveIndex(Math.max(0, index - 1));
    else if (activeIndex > index) setActiveIndex(activeIndex - 1);
    if (newOutlines.length === 0) setActiveIndex(-1);
  };

  const moveOutline = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= outlines.length) return;
    const newOutlines = [...outlines];
    [newOutlines[index], newOutlines[newIndex]] = [newOutlines[newIndex], newOutlines[index]];
    newOutlines.forEach((outline, i) => { outline.order = i + 1; });
    onChange(newOutlines);
    if (activeIndex === index) setActiveIndex(newIndex);
    else if (activeIndex === newIndex) setActiveIndex(index);
  };

  const updateOutline = (updates: Partial<SceneOutline>) => {
    if (activeIndex === -1) return;
    const newOutlines = [...outlines];
    newOutlines[activeIndex] = { ...newOutlines[activeIndex], ...updates };
    onChange(newOutlines);
  };

  const activeOutline = outlines[activeIndex];
  const activeSuggestedImageIds = activeOutline?.suggestedImageIds || [];
  const activeInteractiveConfig: NonNullable<SceneOutline['interactiveConfig']> =
    activeOutline?.interactiveConfig ?? {
      conceptName: '',
      conceptOverview: '',
      designIdea: '',
    };
  const activePblConfig: NonNullable<SceneOutline['pblConfig']> = activeOutline?.pblConfig
    ? activeOutline.pblConfig
    : {
        projectTopic: '',
        projectDescription: '',
        targetSkills: [],
        language: (activeOutline?.language || 'zh-CN') as 'zh-CN' | 'en-US',
      };

  // === 业务逻辑函数 ===
  const toggleSuggestedImage = (imageId: string) => {
    const currentIds = new Set(activeSuggestedImageIds);
    if (currentIds.has(imageId)) currentIds.delete(imageId);
    else currentIds.add(imageId);
    updateOutline({ suggestedImageIds: Array.from(currentIds) });
  };

  const toggleQuizQuestionType = (questionType: QuizQuestionType, checked: boolean) => {
    if (!activeOutline) return;
    const currentTypes = new Set<QuizQuestionType>(
      activeOutline.quizConfig?.questionTypes || DEFAULT_QUIZ_QUESTION_TYPES,
    );
    if (checked) currentTypes.add(questionType);
    else if (currentTypes.size > 1) currentTypes.delete(questionType);
    
    updateOutline({
      quizConfig: {
        ...(activeOutline.quizConfig || {}),
        questionCount: activeOutline.quizConfig?.questionCount || 3,
        difficulty: activeOutline.quizConfig?.difficulty || 'medium',
        questionTypes: Array.from(currentTypes),
      },
    });
  };

  const updateMediaGeneration = (mediaIndex: number, updates: Partial<MediaGenerationRequest>) => {
    if (!activeOutline) return;
    const currentMedia = [...(activeOutline.mediaGenerations || [])];
    currentMedia[mediaIndex] = { ...currentMedia[mediaIndex], ...updates };
    updateOutline({ mediaGenerations: currentMedia });
  };

  const addMediaGeneration = () => {
    if (!activeOutline) return;
    const currentMedia = [...(activeOutline.mediaGenerations || [])];
    currentMedia.push({
      type: 'image',
      prompt: '',
      elementId: `gen_img_${nanoid(6)}`,
      aspectRatio: '16:9',
    });
    updateOutline({ mediaGenerations: currentMedia });
  };

  const removeMediaGeneration = (mediaIndex: number) => {
    if (!activeOutline) return;
    const currentMedia = [...(activeOutline.mediaGenerations || [])];
    currentMedia.splice(mediaIndex, 1);
    updateOutline({ mediaGenerations: currentMedia });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4 overflow-hidden">
      {/* 头部区域 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('generation.outlineEditorTitle')}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><BookOpen className="size-3.5" /> {outlines.length} 个环节</span>
            <span className="flex items-center gap-1"><Clock className="size-3.5" /> {Math.max(1, Math.round(totalEstimatedDuration / 60))} 分钟</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} disabled={isLoading}>返回上一步</Button>
          <Button onClick={() => onConfirm(sanitizeOutlines(outlines))} disabled={isLoading || outlines.length === 0}>
            {isLoading ? '生成中...' : '确认并生成教案'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden border rounded-xl bg-background shadow-sm">
        
        {/* === 左侧：大纲列表 === */}
        <div className="w-72 border-r flex flex-col bg-muted/10">
          <div className="p-3 border-b flex justify-between items-center bg-background/50">
            <span className="text-sm font-semibold pl-1">教学大纲序列</span>
            <Button variant="outline" size="icon" className="size-7 h-7 shadow-sm" onClick={addOutline} disabled={isLoading}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
            <div className="space-y-1">
              {outlines.length === 0 ? (
                <div className="text-center p-6 text-sm text-muted-foreground">{t('generation.noOutlines')}</div>
              ) : (
                outlines.map((outline, index) => (
                  <div
                    key={outline.id}
                    onClick={() => {
                      setActiveIndex(index);
                      setActiveTab((currentTab) => resolveNextTab(currentTab, outline.type));
                    }}
                    className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all border ${
                      activeIndex === index ? 'bg-primary/10 border-primary/20 font-medium text-primary' : 'bg-transparent border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity absolute -left-1">
                       <button onClick={(e) => { e.stopPropagation(); moveOutline(index, 'up'); }} disabled={index === 0} className="p-0.5 hover:text-primary"><ChevronUp className="size-3" /></button>
                       <button onClick={(e) => { e.stopPropagation(); moveOutline(index, 'down'); }} disabled={index === outlines.length - 1} className="p-0.5 hover:text-primary"><ChevronDown className="size-3" /></button>
                    </div>
                    <div className="flex items-center justify-center size-6 rounded-md bg-background border shrink-0 ml-2">
                      {TYPE_ICONS[outline.type] || <BookOpen className="size-3.5" />}
                    </div>
                    <div className="flex-1 truncate">{outline.title || <span className="text-muted-foreground italic">未命名环节</span>}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* === 右侧：配置详情区 === */}
        <div className="flex-1 min-h-0 relative flex flex-col bg-background">
          {activeIndex === -1 || !activeOutline ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
              <MousePointerClick className="size-12 mb-4 opacity-20" />
              <p>请在左侧选择一个教学环节，或点击新建</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col h-full animate-in fade-in duration-300">
              
              {/* 顶部常驻：环节标题与类型切换 */}
              <div className="shrink-0 p-6 border-b bg-background z-10 flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">当前环节名称</Label>
                  <Input
                    value={activeOutline.title}
                    onChange={(e) => updateOutline({ title: e.target.value })}
                    placeholder="输入场景标题，如：引入牛顿第一定律"
                    className="text-lg font-bold h-12 bg-transparent border-none px-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 border-b-2 focus-visible:border-primary"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col items-end gap-2 pt-4">
                  <Select value={activeOutline.type} onValueChange={(v) => {
                    const nextType = v as SceneOutline['type'];
                    updateOutline({ type: nextType });
                    setActiveTab((currentTab) => resolveNextTab(currentTab, nextType));
                  }} disabled={isLoading}>
                    <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slide">演示讲解</SelectItem>
                      <SelectItem value="quiz">随堂测验</SelectItem>
                      <SelectItem value="interactive">互动实验</SelectItem>
                      <SelectItem value="pbl">PBL 探究</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10" onClick={() => removeOutline(activeIndex)} disabled={isLoading}>
                    <Trash2 className="size-3 mr-1" /> 删除
                  </Button>
                </div>
              </div>

              {/* 手写 Tabs 导航条 (彻底摆脱组件库限制) */}
              <div className="px-6 pt-4 bg-muted/5 border-b flex gap-2 overflow-x-auto shrink-0">
                <button
                  onClick={() => setActiveTab('content')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'content' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  <BookOpen className="size-4"/> 基础内容
                </button>
                
                {supportsMaterialsTab(activeOutline.type) && (
                  <button
                    onClick={() => setActiveTab('materials')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 relative ${activeTab === 'materials' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    <FileImage className="size-4"/> 图片素材
                    {activeSuggestedImageIds.length > 0 && (
                      <span className="ml-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                        {activeSuggestedImageIds.length}
                      </span>
                    )}
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('aigen')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'aigen' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  <Sparkles className="size-4"/> AI 多媒体
                </button>
              </div>

              {/* Tab 内容区 */}
              <div className="min-h-0 flex-1 overflow-hidden bg-muted/5">
                <div className="h-full p-6">
                  {/* 1. 基础内容 */}
                  {activeTab === 'content' && (
                    <div className="h-full overflow-y-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 scrollbar-hide">
                    <div className="space-y-2 max-w-sm">
                      <Label>预计教学时长 (秒)</Label>
                      <Input
                        type="number" min={1} step={30}
                        value={activeOutline.estimatedDuration || ''}
                        onChange={(e) => updateOutline({ estimatedDuration: Math.max(30, Number(e.target.value) || 0) })}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>教学目标与概述</Label>
                      <Textarea
                        value={activeOutline.teachingObjective || activeOutline.description}
                        onChange={(e) => updateOutline({ teachingObjective: e.target.value, description: e.target.value })}
                        className="resize-none h-24 bg-background"
                        placeholder="清晰描述这段内容的教学目的..."
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>核心知识点提取</Label>
                      <Textarea
                        value={activeOutline.keyPoints?.join('\n') || ''}
                        onChange={(e) => updateOutline({ keyPoints: e.target.value.split('\n').map(p => p.trim()).filter(Boolean) })}
                        className="resize-none h-32 bg-background font-mono text-sm leading-relaxed"
                        placeholder="每行输入一个关键知识点..."
                        disabled={isLoading}
                      />
                    </div>
                    </div>
                  )}

                  {/* 2. 动态高级配置 */}
                  {activeTab === 'advanced' && supportsAdvancedTab(activeOutline.type) && (
                    <div className="h-full overflow-y-auto rounded-xl border bg-background p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 scrollbar-hide">
                    
                    {/* === 测验 Quiz 完整配置 === */}
                    {activeOutline.type === 'quiz' && (
                      <div className="space-y-6">
                        <h3 className="font-semibold text-purple-600 flex items-center gap-2"><HelpCircle className="size-5"/> 测验题目生成规则</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">{t('generation.quizQuestionCount')}</Label>
                            <Input
                              type="number" min={1} max={10}
                              value={activeOutline.quizConfig?.questionCount || 3}
                              onChange={(e) => updateOutline({ quizConfig: { ...activeOutline.quizConfig, difficulty: activeOutline.quizConfig?.difficulty || 'medium', questionTypes: activeOutline.quizConfig?.questionTypes || DEFAULT_QUIZ_QUESTION_TYPES, questionCount: parseInt(e.target.value) || 3 }})}
                              disabled={isLoading}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">{t('generation.quizDifficulty')}</Label>
                            <Select
                              value={activeOutline.quizConfig?.difficulty || 'medium'}
                              onValueChange={(value: 'easy'|'medium'|'hard') => updateOutline({ quizConfig: { ...activeOutline.quizConfig, questionCount: activeOutline.quizConfig?.questionCount || 3, questionTypes: activeOutline.quizConfig?.questionTypes || DEFAULT_QUIZ_QUESTION_TYPES, difficulty: value }})}
                              disabled={isLoading}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="easy">{t('generation.quizDifficultyEasy')}</SelectItem>
                                <SelectItem value="medium">{t('generation.quizDifficultyMedium')}</SelectItem>
                                <SelectItem value="hard">{t('generation.quizDifficultyHard')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs">{t('generation.quizTypesLabel')}</Label>
                          <div className="grid gap-2 md:grid-cols-3">
                            {(['single', 'multiple', 'text'] as const).map((qType) => (
                              <label key={qType} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-muted/10 cursor-pointer hover:bg-muted/30">
                                <Checkbox
                                  checked={activeOutline.quizConfig?.questionTypes?.includes(qType) || false}
                                  onCheckedChange={(val) => toggleQuizQuestionType(qType, val === true)}
                                  disabled={isLoading}
                                />
                                <span>{qType === 'single' ? t('generation.quizTypeSingle') : qType === 'multiple' ? t('generation.quizTypeMultiple') : t('generation.quizTypeText')}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* === 互动实验 Interactive 完整配置 === */}
                    {activeOutline.type === 'interactive' && (
                      <div className="space-y-6">
                        <h3 className="font-semibold text-emerald-600 flex items-center gap-2"><MousePointerClick className="size-5"/> 互动实验设计</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('generation.interactiveConceptName')}</Label>
                            <Input value={activeInteractiveConfig.conceptName} onChange={(e) => updateOutline({ interactiveConfig: { ...activeInteractiveConfig, conceptName: e.target.value } })} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2">
                            <Label>{t('generation.interactiveSubject')}</Label>
                            <Input value={activeInteractiveConfig.subject || ''} onChange={(e) => updateOutline({ interactiveConfig: { ...activeInteractiveConfig, subject: e.target.value } })} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t('generation.interactiveOverview')}</Label>
                            <Textarea value={activeInteractiveConfig.conceptOverview} onChange={(e) => updateOutline({ interactiveConfig: { ...activeInteractiveConfig, conceptOverview: e.target.value } })} rows={2} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t('generation.interactiveDesignIdea')}</Label>
                            <Textarea value={activeInteractiveConfig.designIdea} onChange={(e) => updateOutline({ interactiveConfig: { ...activeInteractiveConfig, designIdea: e.target.value } })} rows={3} disabled={isLoading}/>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* === PBL 探究完整配置 === */}
                    {activeOutline.type === 'pbl' && (
                      <div className="space-y-6">
                        <h3 className="font-semibold text-orange-600 flex items-center gap-2"><Rocket className="size-5"/> 项目式学习参数</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('generation.pblTopic')}</Label>
                            <Input value={activePblConfig.projectTopic} onChange={(e) => updateOutline({ pblConfig: { ...activePblConfig, projectTopic: e.target.value } })} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2">
                            <Label>{t('generation.pblIssueCount')}</Label>
                            <Input type="number" min={1} value={activePblConfig.issueCount || 3} onChange={(e) => updateOutline({ pblConfig: { ...activePblConfig, issueCount: Math.max(1, Number(e.target.value) || 1) } })} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2">
                            <Label>{t('generation.pblLanguage')}</Label>
                            <Select
                              value={activePblConfig.language}
                              onValueChange={(v: 'zh-CN' | 'en-US') =>
                                updateOutline({ pblConfig: { ...activePblConfig, language: v } })
                              }
                              disabled={isLoading}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="zh-CN">简体中文 (zh-CN)</SelectItem>
                                <SelectItem value="en-US">English (en-US)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t('generation.pblDescription')}</Label>
                            <Textarea value={activePblConfig.projectDescription} onChange={(e) => updateOutline({ pblConfig: { ...activePblConfig, projectDescription: e.target.value } })} rows={2} disabled={isLoading}/>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t('generation.pblSkills')}</Label>
                            <Textarea value={activePblConfig.targetSkills.join('\n')} onChange={(e) => updateOutline({ pblConfig: { ...activePblConfig, targetSkills: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })} rows={2} placeholder="每行输入一项核心素养/技能" disabled={isLoading}/>
                          </div>
                        </div>
                      </div>
                    )}
                    </div>
                  )}

                  {/* 3. 图片素材画廊 (绝不裁切，保证阅读体验) */}
                  {activeTab === 'materials' && supportsMaterialsTab(activeOutline.type) && (
                    <div className="flex h-full min-h-0 flex-col space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <div>
                        <h3 className="font-medium text-sm">挂载参考文档/图片</h3>
                        <p className="text-xs text-muted-foreground mt-1">选中的素材将作为 AI 生成当前环节内容的核心依据。</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => updateOutline({ suggestedImageIds: [] })} disabled={activeSuggestedImageIds.length === 0}>
                        清除已选 ({activeSuggestedImageIds.length})
                      </Button>
                    </div>

                    {availableImages.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl bg-background">
                        <ImageIcon className="size-8 mx-auto mb-3 opacity-20" />
                        无可用参考图片，请先解析文档。
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                          {availableImages.map((image) => {
                            const isSelected = activeSuggestedImageIds.includes(image.id);
                            const previewSrc = imagePreviewMap[image.id] || image.src;

                            return (
                              <div
                                key={image.id}
                                onClick={() => toggleSuggestedImage(image.id)}
                                className={`
                                  relative cursor-pointer group rounded-xl overflow-hidden bg-background transition-all duration-200 border-2
                                  ${isSelected ? 'border-primary shadow-[0_0_0_4px_rgba(var(--primary),0.1)]' : 'border-border/60 hover:border-primary/40 hover:shadow-md'}
                                `}
                              >
                                {isSelected && (
                                  <div className="absolute top-2 right-2 z-20 bg-primary text-primary-foreground p-1 rounded-full shadow-lg">
                                    <Check className="size-4 stroke-[3]" />
                                  </div>
                                )}

                                {/* 强制缩放适应 object-contain 保证文字可见 */}
                                <div className={`relative aspect-[3/4] w-full bg-muted/30 p-2 flex items-center justify-center transition-opacity ${isSelected ? 'opacity-100' : 'group-hover:opacity-90'}`}>
                                  {previewSrc ? (
                                    <img src={previewSrc} alt={`Page ${image.pageNumber}`} className="max-w-full max-h-full object-contain shadow-sm bg-white" />
                                  ) : (
                                    <div className="text-xs text-muted-foreground">加载预览失败</div>
                                  )}
                                </div>

                                <div className={`p-3 border-t text-sm transition-colors ${isSelected ? 'bg-primary/5 border-primary/20' : ''}`}>
                                  <div className="font-semibold flex items-center justify-between">
                                    <span>第 {image.pageNumber} 页</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">{image.id.slice(-4)}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={image.description}>
                                    {image.description || '无详细描述文本'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </div>
                  )}

                  {/* 4. AI 多媒体配置完整版 */}
                  {activeTab === 'aigen' && (
                    <div className="h-full overflow-y-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 scrollbar-hide">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <div>
                        <h3 className="font-medium text-sm">AI 自动生成多媒体 ({activeOutline.mediaGenerations?.length || 0})</h3>
                        <p className="text-xs text-muted-foreground mt-1">配置需要系统在生成课件时自动生成的插图或视频素材。</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={addMediaGeneration} disabled={isLoading}>
                        <Plus className="size-3 mr-1"/> 添加媒体请求
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {(activeOutline.mediaGenerations || []).length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground bg-background rounded-xl border border-dashed">
                           <Sparkles className="size-8 mx-auto mb-3 opacity-20" />
                           当前环节没有配置自动生成多媒体的需求
                        </div>
                      ) : (
                        (activeOutline.mediaGenerations || []).map((media, mIndex) => (
                          <div key={`${media.elementId}-${mIndex}`} className="space-y-4 rounded-xl border p-5 bg-background shadow-sm">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label>媒体类型</Label>
                                <Select value={media.type} onValueChange={(v) => updateMediaGeneration(mIndex, { type: v as 'image'|'video', elementId: v === 'video' ? `gen_vid_${nanoid(6)}` : media.elementId })} disabled={isLoading}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="image">图像 (Image)</SelectItem>
                                    <SelectItem value="video">视频 (Video)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>期望比例 (Aspect Ratio)</Label>
                                <Select value={media.aspectRatio || '16:9'} onValueChange={(v) => updateMediaGeneration(mIndex, { aspectRatio: v as '16:9'|'4:3'|'1:1'|'9:16' })} disabled={isLoading}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="16:9">宽屏 16:9</SelectItem>
                                    <SelectItem value="4:3">传统 4:3</SelectItem>
                                    <SelectItem value="1:1">正方形 1:1</SelectItem>
                                    <SelectItem value="9:16">竖屏 9:16</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>绑定元素 ID</Label>
                                <Input value={media.elementId} onChange={(e) => updateMediaGeneration(mIndex, { elementId: e.target.value })} disabled={isLoading} className="font-mono text-sm"/>
                              </div>
                              <div className="space-y-2">
                                <Label>艺术风格 (Style)</Label>
                                <Input value={media.style || ''} onChange={(e) => updateMediaGeneration(mIndex, { style: e.target.value || undefined })} disabled={isLoading} placeholder="如：水彩插画、3D卡通、写实摄影"/>
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <Label>生成提示词 (Prompt)</Label>
                                <Textarea value={media.prompt} onChange={(e) => updateMediaGeneration(mIndex, { prompt: e.target.value })} rows={2} disabled={isLoading} placeholder="详细描述你想生成的画面内容，例如：一个正在下落的苹果，背景是实验室..."/>
                              </div>
                            </div>
                            <div className="flex justify-end pt-3 border-t border-border/50">
                              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeMediaGeneration(mIndex)} disabled={isLoading}>
                                <Trash2 className="size-4 mr-1" /> 删除该请求
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
