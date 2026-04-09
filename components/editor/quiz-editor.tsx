'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { QuizContent, QuizOption, QuizQuestion } from '@/lib/types/stage';

type QuestionType = QuizQuestion['type'];

interface QuizEditorProps {
  content: QuizContent;
  onSave: (updatedContent: QuizContent) => void;
  onRevert: () => void;
}

function createOption(index: number): QuizOption {
  return {
    value: String.fromCharCode(65 + index),
    label: '',
  };
}

function createQuestion(index: number, type: QuestionType = 'single'): QuizQuestion {
  return {
    id: `q${index + 1}`,
    type,
    question: '',
    options: type === 'short_answer' ? undefined : [0, 1, 2, 3].map(createOption),
    answer: type === 'short_answer' ? undefined : [],
    analysis: '',
    commentPrompt: '',
    hasAnswer: type !== 'short_answer',
    points: 1,
  };
}

export function QuizEditor({ content, onSave, onRevert }: QuizEditorProps) {
  const { t } = useI18n();
  const questionTypes: Array<{ value: QuestionType; label: string }> = [
    { value: 'single', label: t('quiz.singleChoice') },
    { value: 'multiple', label: t('quiz.multipleChoice') },
    { value: 'short_answer', label: t('quiz.shortAnswer') },
  ];
  const [questions, setQuestions] = useState<QuizQuestion[]>(content.questions);
  const [expandedId, setExpandedId] = useState<string | null>(content.questions[0]?.id ?? null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setQuestions(content.questions);
    setExpandedId(content.questions[0]?.id ?? null);
  }, [content]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasChanges = useMemo(
    () => JSON.stringify(questions) !== JSON.stringify(content.questions),
    [content.questions, questions],
  );

  const updateQuestion = useCallback(
    (questionId: string, updater: (question: QuizQuestion) => QuizQuestion) => {
      setQuestions((prev) =>
        prev.map((question) => (question.id === questionId ? updater(question) : question)),
      );
    },
    [],
  );

  const addQuestion = useCallback((type: QuestionType) => {
    setQuestions((prev) => {
      const next = [...prev, createQuestion(prev.length, type)];
      return next.map((question, index) => ({ ...question, id: `q${index + 1}` }));
    });
  }, []);

  const removeQuestion = useCallback((questionId: string) => {
    setQuestions((prev) =>
      prev
        .filter((question) => question.id !== questionId)
        .map((question, index) => ({ ...question, id: `q${index + 1}` })),
    );
    setExpandedId((prev) => (prev === questionId ? null : prev));
  }, []);

  const handleSave = useCallback(() => {
    onSave({
      type: 'quiz',
      questions,
    });
  }, [onSave, questions]);

  const handleRevert = useCallback(() => {
    setQuestions(content.questions);
    setExpandedId(content.questions[0]?.id ?? null);
    onRevert();
  }, [content.questions, onRevert]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t('stage.editingQuiz')} ({questions.length})
        </span>
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
          <Button
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {questions.map((question, index) => {
          const isExpanded = expandedId === question.id;
          return (
            <div key={question.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : question.id)}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">
                    {question.question.trim() || `${t('stage.questionText')} ${index + 1}`}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                <Button variant="ghost" size="icon-sm" onClick={() => removeQuestion(question.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              {isExpanded ? (
                <div className="space-y-3 border-t border-border px-3 py-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">{t('stage.questionType')}</label>
                    <div className="flex flex-wrap gap-2">
                      {questionTypes.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={question.type === option.value ? 'default' : 'outline'}
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            updateQuestion(question.id, (prev) => ({
                              ...prev,
                              type: option.value,
                              options:
                                option.value === 'short_answer'
                                  ? undefined
                                  : prev.options && prev.options.length > 0
                                    ? prev.options
                                    : [0, 1, 2, 3].map(createOption),
                              answer: option.value === 'short_answer' ? undefined : prev.answer ?? [],
                              hasAnswer: option.value !== 'short_answer',
                            }))
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">{t('stage.questionText')}</label>
                    <Textarea
                      value={question.question}
                      onChange={(event) =>
                        updateQuestion(question.id, (prev) => ({ ...prev, question: event.target.value }))
                      }
                      className="min-h-[72px] resize-none text-xs"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">{t('stage.points')}</label>
                      <Input
                        type="number"
                        min={1}
                        value={question.points ?? 1}
                        onChange={(event) =>
                          updateQuestion(question.id, (prev) => ({
                            ...prev,
                            points: Math.max(1, Number(event.target.value) || 1),
                          }))
                        }
                        className="text-xs"
                      />
                    </div>
                    {question.type === 'short_answer' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">{t('stage.commentPrompt')}</label>
                        <Input
                          value={question.commentPrompt ?? ''}
                          onChange={(event) =>
                            updateQuestion(question.id, (prev) => ({
                              ...prev,
                              commentPrompt: event.target.value,
                            }))
                          }
                          className="text-xs"
                        />
                      </div>
                    ) : null}
                  </div>

                  {question.type !== 'short_answer' && question.options ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">{t('stage.options')}</label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            updateQuestion(question.id, (prev) => ({
                              ...prev,
                              options: [...(prev.options ?? []), createOption(prev.options?.length ?? 0)],
                            }))
                          }
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {t('stage.addOption')}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => {
                          const selected = question.answer?.includes(option.value) ?? false;
                          return (
                            <div key={option.value} className="flex items-center gap-2">
                              <button
                                type="button"
                                className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                                  selected
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                                title={t('stage.correctAnswer')}
                                onClick={() =>
                                  updateQuestion(question.id, (prev) => {
                                    const previous = prev.answer ?? [];
                                    const nextAnswer =
                                      prev.type === 'single'
                                        ? [option.value]
                                        : previous.includes(option.value)
                                          ? previous.filter((value) => value !== option.value)
                                          : [...previous, option.value];
                                    return { ...prev, answer: nextAnswer };
                                  })
                                }
                              >
                                {option.value}
                              </button>
                              <Input
                                value={option.label}
                                onChange={(event) =>
                                  updateQuestion(question.id, (prev) => ({
                                    ...prev,
                                    options: (prev.options ?? []).map((currentOption, currentIndex) =>
                                      currentIndex === optionIndex
                                        ? { ...currentOption, label: event.target.value }
                                        : currentOption,
                                    ),
                                  }))
                                }
                                className="text-xs"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={(question.options?.length ?? 0) <= 2}
                                onClick={() =>
                                  updateQuestion(question.id, (prev) => {
                                    const nextOptions = (prev.options ?? []).filter(
                                      (_, currentIndex) => currentIndex !== optionIndex,
                                    );
                                    const normalizedOptions = nextOptions.map((currentOption, currentIndex) => ({
                                      ...currentOption,
                                      value: String.fromCharCode(65 + currentIndex),
                                    }));
                                    const nextAnswer = (prev.answer ?? []).filter(
                                      (answerValue) => answerValue !== option.value,
                                    );
                                    return {
                                      ...prev,
                                      options: normalizedOptions,
                                      answer: nextAnswer,
                                    };
                                  })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">{t('stage.analysis')}</label>
                    <Textarea
                      value={question.analysis ?? ''}
                      onChange={(event) =>
                        updateQuestion(question.id, (prev) => ({ ...prev, analysis: event.target.value }))
                      }
                      className="min-h-[72px] resize-none text-xs"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {questionTypes.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => addQuestion(option.value)}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t('stage.addQuestion')} {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
