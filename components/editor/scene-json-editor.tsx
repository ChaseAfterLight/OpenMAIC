'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Scene } from '@/lib/types/stage';

interface SceneJsonEditorProps {
  scene: Scene;
  onSave: (updatedScene: Scene) => void;
  onRevert: () => void;
  className?: string;
}

function stringifyScene(scene: Scene) {
  return JSON.stringify(scene, null, 2);
}

export function SceneJsonEditor({
  scene,
  onSave,
  onRevert,
  className,
}: SceneJsonEditorProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(() => stringifyScene(scene));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(stringifyScene(scene));
    setError(null);
  }, [scene]);

  const hasChanges = useMemo(() => value !== stringifyScene(scene), [scene, value]);

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(value) as Scene;
      if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.stageId || !parsed.type) {
        throw new Error(t('stage.invalidSceneStructure'));
      }
      if (parsed.id !== scene.id) {
        throw new Error(t('stage.sceneIdImmutable'));
      }
      if (parsed.stageId !== scene.stageId) {
        throw new Error(t('stage.stageIdImmutable'));
      }
      setError(null);
      onSave(parsed);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('stage.invalidSceneStructure'));
    }
  }, [onSave, scene.id, scene.stageId, t, value]);

  const handleRevert = useCallback(() => {
    setValue(stringifyScene(scene));
    setError(null);
    onRevert();
  }, [onRevert, scene]);

  return (
    <div className={`flex h-full flex-col gap-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {t('stage.editScene')}: <span className="font-medium">{scene.title}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t('stage.editHelpText')}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasChanges}
            onClick={handleRevert}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('stage.revert')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasChanges}
            onClick={handleSave}
          >
            <Check className="mr-1 h-3 w-3" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        className="min-h-0 flex-1 resize-none font-mono text-xs leading-5"
        spellCheck={false}
      />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t('stage.closeShortcut')}</span>
        {error ? <span className="text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
