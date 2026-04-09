'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ActionsEditor } from './actions-editor';
import { InteractiveEditor } from './interactive-editor';
import { QuizEditor } from './quiz-editor';
import { SceneJsonEditor } from './scene-json-editor';
import { SlideEditor } from './slide-editor';
import type { InteractiveContent, QuizContent, Scene, SlideContent } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { Slide } from '@/lib/types/slides';

interface SceneEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  onSave: (updatedScene: Scene) => void;
}

function getDefaultTab(scene: Scene | null) {
  if (!scene) return 'json';
  if (scene.type === 'quiz' && scene.content.type === 'quiz') return 'quiz';
  if (scene.type === 'interactive' && scene.content.type === 'interactive') return 'interactive';
  if (scene.type === 'slide' && scene.content.type === 'slide') return 'slide';
  if (scene.actions && scene.actions.length > 0) return 'actions';
  return 'json';
}

export function SceneEditorModal({ open, onOpenChange, scene, onSave }: SceneEditorModalProps) {
  const { t } = useI18n();
  const defaultTab = useMemo(() => getDefaultTab(scene), [scene]);
  const [activeTab, setActiveTab] = useState(defaultTab);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setActiveTab(getDefaultTab(scene));
  }, [open, scene]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSlideSave = useCallback(
    (updatedSlide: Slide) => {
      if (!scene || scene.type !== 'slide') return;
      onSave({ ...scene, content: { type: 'slide', canvas: updatedSlide } });
      onOpenChange(false);
    },
    [onOpenChange, onSave, scene],
  );

  const handleQuizSave = useCallback(
    (updatedContent: QuizContent) => {
      if (!scene) return;
      onSave({ ...scene, content: updatedContent });
      onOpenChange(false);
    },
    [onOpenChange, onSave, scene],
  );

  const handleInteractiveSave = useCallback(
    (updatedContent: InteractiveContent) => {
      if (!scene) return;
      onSave({ ...scene, content: updatedContent });
      onOpenChange(false);
    },
    [onOpenChange, onSave, scene],
  );

  const handleActionsSave = useCallback(
    (updatedActions: Action[]) => {
      if (!scene) return;
      onSave({ ...scene, actions: updatedActions });
      onOpenChange(false);
    },
    [onOpenChange, onSave, scene],
  );

  const handleJsonSave = useCallback(
    (updatedScene: Scene) => {
      onSave(updatedScene);
      onOpenChange(false);
    },
    [onOpenChange, onSave],
  );

  if (!scene) return null;

  const hasQuizEditor = scene.type === 'quiz' && scene.content.type === 'quiz';
  const hasInteractiveEditor = scene.type === 'interactive' && scene.content.type === 'interactive';
  const hasSlideEditor = scene.type === 'slide' && scene.content.type === 'slide';
  const hasActionsEditor = Boolean(scene.actions && scene.actions.length > 0);
  const slideElements =
    scene.type === 'slide' && scene.content.type === 'slide'
      ? (scene.content as SlideContent).canvas.elements
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            {t('stage.editSceneTitle')}: {scene.title}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsList variant="line" className="w-fit">
              {hasQuizEditor ? <TabsTrigger value="quiz">{t('stage.quizTab')}</TabsTrigger> : null}
              {hasInteractiveEditor ? (
                <TabsTrigger value="interactive">{t('stage.interactiveTab')}</TabsTrigger>
              ) : null}
              {hasActionsEditor ? (
                <TabsTrigger value="actions">{t('stage.actionsTab')}</TabsTrigger>
              ) : null}
              {hasSlideEditor ? <TabsTrigger value="slide">{t('stage.slideTab')}</TabsTrigger> : null}
              <TabsTrigger value="json">{t('stage.jsonTab')}</TabsTrigger>
            </TabsList>

            {hasQuizEditor ? (
              <TabsContent value="quiz" className="h-full min-h-0">
                <QuizEditor
                  content={scene.content as QuizContent}
                  onSave={handleQuizSave}
                  onRevert={() => undefined}
                />
              </TabsContent>
            ) : null}

            {hasInteractiveEditor ? (
              <TabsContent value="interactive" className="h-full min-h-0">
                <InteractiveEditor
                  content={scene.content as InteractiveContent}
                  onSave={handleInteractiveSave}
                  onRevert={() => undefined}
                />
              </TabsContent>
            ) : null}

            {hasActionsEditor ? (
              <TabsContent value="actions" className="h-full min-h-0">
                <ActionsEditor
                  actions={scene.actions ?? []}
                  onSave={handleActionsSave}
                  onRevert={() => undefined}
                  elements={slideElements}
                />
              </TabsContent>
            ) : null}

            {hasSlideEditor ? (
              <TabsContent value="slide" className="h-full min-h-0">
                <SlideEditor
                  slide={(scene.content as SlideContent).canvas}
                  onSave={handleSlideSave}
                  onRevert={() => undefined}
                />
              </TabsContent>
            ) : null}

            <TabsContent value="json" className="h-full min-h-0">
              <SceneJsonEditor
                scene={scene}
                onSave={handleJsonSave}
                onRevert={() => undefined}
                className="h-full"
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
