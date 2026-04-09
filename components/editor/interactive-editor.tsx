'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { InteractiveContent } from '@/lib/types/stage';

interface InteractiveEditorProps {
  content: InteractiveContent;
  onSave: (updatedContent: InteractiveContent) => void;
  onRevert: () => void;
}

export function InteractiveEditor({ content, onSave, onRevert }: InteractiveEditorProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState(content.url ?? '');
  const [html, setHtml] = useState(content.html ?? '');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setUrl(content.url ?? '');
    setHtml(content.html ?? '');
  }, [content]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasChanges = useMemo(
    () => url !== (content.url ?? '') || html !== (content.html ?? ''),
    [content.html, content.url, html, url],
  );

  const handleSave = useCallback(() => {
    onSave({
      type: 'interactive',
      url: url.trim(),
      html: html.trim() || undefined,
    });
  }, [html, onSave, url]);

  const handleRevert = useCallback(() => {
    setUrl(content.url ?? '');
    setHtml(content.html ?? '');
    onRevert();
  }, [content.html, content.url, onRevert]);

  const isRelativeUrl = url.trim().length > 0 && !/^https?:\/\//i.test(url.trim());

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t('stage.editingInteractive')}</span>
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasChanges}
            onClick={handleRevert}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t('stage.revert')}
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" disabled={!hasChanges} onClick={handleSave}>
            <Check className="mr-1 h-3 w-3" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.interactiveUrl')}</label>
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t('stage.interactiveUrlHint')}
          className="text-xs"
        />
        <p className="text-xs text-muted-foreground">{t('stage.interactiveUrlHint')}</p>
        {isRelativeUrl ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('stage.interactiveUrlRelativeHint')}
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.interactiveHtml')}</label>
        <Textarea
          value={html}
          onChange={(event) => setHtml(event.target.value)}
          className="min-h-0 flex-1 resize-none font-mono text-xs leading-5"
          placeholder="<html>...</html>"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">{t('stage.interactiveHtmlHint')}</p>
      </div>
    </div>
  );
}
