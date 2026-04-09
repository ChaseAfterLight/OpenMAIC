'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type {
  Action,
  ActionType,
  DiscussionAction,
  LaserAction,
  SpeechAction,
} from '@/lib/types/action';
import type { PPTElement } from '@/lib/types/slides';

interface ActionsEditorProps {
  actions: Action[];
  onSave: (updatedActions: Action[]) => void;
  onRevert: () => void;
  elements?: PPTElement[];
}

function createAction(type: ActionType, index: number): Action {
  const id = `action_${Date.now()}_${index}`;
  switch (type) {
    case 'speech':
      return { id, type, text: '' };
    case 'discussion':
      return { id, type, topic: '' };
    case 'spotlight':
      return { id, type, elementId: '' };
    case 'laser':
      return { id, type, elementId: '', color: '#ff0000' };
    case 'play_video':
      return { id, type, elementId: '' };
    case 'wb_delete':
      return { id, type, elementId: '' };
    case 'wb_open':
    case 'wb_close':
    case 'wb_clear':
      return { id, type };
    default:
      return { id, type: 'speech', text: '' };
  }
}

function getActionSummary(action: Action) {
  if (action.type === 'speech') return action.text || action.type;
  if (action.type === 'discussion') return action.topic || action.type;
  if ('elementId' in action) return action.elementId || action.type;
  return action.type;
}

export function ActionsEditor({ actions, onSave, onRevert, elements }: ActionsEditorProps) {
  const { t } = useI18n();
  const actionTypeOptions: Array<{ value: ActionType; label: string }> = useMemo(
    () => [
      { value: 'speech', label: t('stage.actionTypeSpeech') },
      { value: 'discussion', label: t('stage.actionTypeDiscussion') },
      { value: 'spotlight', label: t('stage.actionTypeSpotlight') },
      { value: 'laser', label: t('stage.actionTypeLaser') },
      { value: 'play_video', label: t('stage.actionTypePlayVideo') },
      { value: 'wb_open', label: t('stage.actionTypeWbOpen') },
      { value: 'wb_close', label: t('stage.actionTypeWbClose') },
      { value: 'wb_clear', label: t('stage.actionTypeWbClear') },
      { value: 'wb_delete', label: t('stage.actionTypeWbDelete') },
    ],
    [t],
  );

  const [localActions, setLocalActions] = useState(actions);
  const [expandedId, setExpandedId] = useState<string | null>(actions[0]?.id ?? null);
  const [newActionType, setNewActionType] = useState<ActionType>('speech');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocalActions(actions);
    setExpandedId(actions[0]?.id ?? null);
  }, [actions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasChanges = useMemo(
    () => JSON.stringify(localActions) !== JSON.stringify(actions),
    [actions, localActions],
  );

  const updateAction = useCallback((actionId: string, updater: (action: Action) => Action) => {
    setLocalActions((prev) =>
      prev.map((action) => (action.id === actionId ? updater(action) : action)),
    );
  }, []);

  const removeAction = useCallback((actionId: string) => {
    setLocalActions((prev) => prev.filter((action) => action.id !== actionId));
    setExpandedId((prev) => (prev === actionId ? null : prev));
  }, []);

  const addAction = useCallback(() => {
    setLocalActions((prev) => [...prev, createAction(newActionType, prev.length)]);
  }, [newActionType]);

  const handleSave = useCallback(() => {
    onSave(localActions);
  }, [localActions, onSave]);

  const handleRevert = useCallback(() => {
    setLocalActions(actions);
    setExpandedId(actions[0]?.id ?? null);
    onRevert();
  }, [actions, onRevert]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t('stage.editingActions')}</span>
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

      <div className="flex items-center gap-2">
        <select
          value={newActionType}
          onChange={(event) => setNewActionType(event.target.value as ActionType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {actionTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={addAction}>
          <Plus className="mr-1 h-3 w-3" />
          {t('stage.addAction')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {localActions.map((action, index) => {
          const isExpanded = expandedId === action.id;
          return (
            <div key={action.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : action.id)}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {actionTypeOptions.find((option) => option.value === action.type)?.label ?? action.type}
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">{getActionSummary(action)}</span>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <Button variant="ghost" size="icon-sm" onClick={() => removeAction(action.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              {isExpanded ? (
                <div className="space-y-3 border-t border-border px-3 py-3">
                  {'elementId' in action ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">{t('stage.actionElementId')}</label>
                      {elements && elements.length > 0 ? (
                        <select
                          value={action.elementId}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({ ...prev, elementId: event.target.value } as Action))
                          }
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">--</option>
                          {elements.map((element) => (
                            <option key={element.id} value={element.id}>
                              {element.id}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={action.elementId}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({ ...prev, elementId: event.target.value } as Action))
                          }
                          className="text-xs"
                        />
                      )}
                    </div>
                  ) : null}

                  {action.type === 'speech' ? (
                    <div className="grid gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">{t('stage.actionText')}</label>
                        <Textarea
                          value={(action as SpeechAction).text}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({
                              ...(prev as SpeechAction),
                              text: event.target.value,
                            }))
                          }
                          className="min-h-[88px] resize-none text-xs"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">{t('stage.actionVoice')}</label>
                          <Input
                            value={(action as SpeechAction).voice ?? ''}
                            onChange={(event) =>
                              updateAction(action.id, (prev) => ({
                                ...(prev as SpeechAction),
                                voice: event.target.value || undefined,
                              }))
                            }
                            className="text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">{t('stage.actionSpeed')}</label>
                          <Input
                            type="number"
                            step="0.1"
                            value={(action as SpeechAction).speed ?? 1}
                            onChange={(event) =>
                              updateAction(action.id, (prev) => ({
                                ...(prev as SpeechAction),
                                speed: Number(event.target.value) || 1,
                              }))
                            }
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {action.type === 'discussion' ? (
                    <div className="grid gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">{t('stage.actionTopic')}</label>
                        <Input
                          value={(action as DiscussionAction).topic}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({
                              ...(prev as DiscussionAction),
                              topic: event.target.value,
                            }))
                          }
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">{t('stage.actionPrompt')}</label>
                        <Textarea
                          value={(action as DiscussionAction).prompt ?? ''}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({
                              ...(prev as DiscussionAction),
                              prompt: event.target.value || undefined,
                            }))
                          }
                          className="min-h-[72px] resize-none text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">{t('stage.actionAgentId')}</label>
                        <Input
                          value={(action as DiscussionAction).agentId ?? ''}
                          onChange={(event) =>
                            updateAction(action.id, (prev) => ({
                              ...(prev as DiscussionAction),
                              agentId: event.target.value || undefined,
                            }))
                          }
                          className="text-xs"
                        />
                      </div>
                    </div>
                  ) : null}

                  {action.type === 'laser' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">{t('stage.actionColor')}</label>
                      <Input
                        value={(action as LaserAction).color ?? '#ff0000'}
                        onChange={(event) =>
                          updateAction(action.id, (prev) => ({
                            ...(prev as LaserAction),
                            color: event.target.value,
                          }))
                        }
                        className="text-xs"
                      />
                    </div>
                  ) : null}

                  <p className="text-xs text-muted-foreground">{t('stage.actionAdvancedHint')}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
