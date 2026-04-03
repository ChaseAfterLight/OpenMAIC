'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  FileUp,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { TextbookLibraryRecord } from '@/lib/server/textbook-library-types';

interface TextbookLibraryManagerProps {
  scope: 'official' | 'personal';
}

function createEmptyLibrary(scope: 'official' | 'personal'): TextbookLibraryRecord {
  const now = Date.now();
  return {
    id: `library-${now}`,
    scope,
    publisher: '',
    subjectId: 'math',
    gradeId: 'grade-4',
    editionId: `edition-${now}`,
    editionLabel: '',
    createdAt: now,
    updatedAt: now,
    volumes: [
      {
        id: `volume-${now}`,
        label: '四年级上册',
        order: 0,
        gradeId: 'grade-4',
        semester: 'upper',
        units: [
          {
            id: `unit-${now}`,
            title: '单元 1',
            order: 0,
            chapters: [
              {
                id: `chapter-${now}`,
                title: '章节 1',
                summary: '',
                keywords: [],
                order: 0,
                attachments: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

function getChapterOptions(library: TextbookLibraryRecord | null) {
  if (!library) return [];
  return library.volumes.flatMap((volume) =>
    volume.units.flatMap((unit) =>
      unit.chapters.map((chapter) => ({
        id: chapter.id,
        label: `${volume.label} / ${unit.title} / ${chapter.title}`,
        attachments: chapter.attachments,
      })),
    ),
  );
}

export function TextbookLibraryManager({ scope }: TextbookLibraryManagerProps) {
  const router = useRouter();
  const isOfficial = scope === 'official';
  const [libraries, setLibraries] = useState<TextbookLibraryRecord[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TextbookLibraryRecord | null>(null);
  const [volumesJson, setVolumesJson] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const title = isOfficial ? '官方教材库' : '我的教材库';
  const description = isOfficial
    ? '维护全站可见的教材目录、章节结构与附件，并通过发布控制老师端可见内容。'
    : '维护仅供自己使用的教材目录与章节附件，沉淀个人备课资料。';

  const chapterOptions = useMemo(() => getChapterOptions(draft), [draft]);
  const selectedChapter = chapterOptions.find((chapter) => chapter.id === selectedChapterId) ?? null;

  async function loadLibraries(nextSelectedId?: string | null) {
    setLoading(true);
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'listLibraries',
          scope,
          ...(isOfficial ? { view: 'draft' } : {}),
        }),
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        libraries?: TextbookLibraryRecord[];
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '加载教材库失败');
      }

      const nextLibraries = data.libraries ?? [];
      setLibraries(nextLibraries);
      const nextId = nextSelectedId ?? selectedLibraryId ?? nextLibraries[0]?.id ?? null;
      const nextDraft =
        nextLibraries.find((library) => library.id === nextId) ?? nextLibraries[0] ?? null;
      setSelectedLibraryId(nextDraft?.id ?? null);
      setDraft(nextDraft ? structuredClone(nextDraft) : null);
      setVolumesJson(nextDraft ? JSON.stringify(nextDraft.volumes, null, 2) : '');
      setSelectedChapterId(
        nextDraft
          ? getChapterOptions(nextDraft)[0]?.id ?? ''
          : '',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载教材库失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLibraries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function selectLibrary(library: TextbookLibraryRecord) {
    setSelectedLibraryId(library.id);
    setDraft(structuredClone(library));
    setVolumesJson(JSON.stringify(library.volumes, null, 2));
    setSelectedChapterId(getChapterOptions(library)[0]?.id ?? '');
    setUploadFile(null);
    setUploadTitle('');
    setUploadDescription('');
  }

  function updateDraft(patch: Partial<TextbookLibraryRecord>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveLibrary() {
    if (!draft) return;

    setSaving(true);
    try {
      const parsedVolumes = JSON.parse(volumesJson) as TextbookLibraryRecord['volumes'];
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveLibrary',
          payload: {
            library: {
              ...draft,
              volumes: parsedVolumes,
            },
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        library?: TextbookLibraryRecord;
        error?: string;
      };
      if (!response.ok || !data.success || !data.library) {
        throw new Error(data.error || '保存教材库失败');
      }
      toast.success('教材库已保存');
      await loadLibraries(data.library.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存教材库失败');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLibrary() {
    if (!draft) return;
    const confirmed = window.confirm(`确认删除“${draft.editionLabel || draft.publisher || draft.id}”吗？`);
    if (!confirmed) return;

    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteLibrary',
          scope,
          libraryId: draft.id,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '删除教材库失败');
      }
      toast.success('教材库已删除');
      await loadLibraries(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除教材库失败');
    }
  }

  async function publishOfficialLibraries() {
    if (!isOfficial) return;
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publishOfficialLibraries' }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '发布失败');
      }
      toast.success('官方教材库已发布');
      await loadLibraries(selectedLibraryId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败');
    }
  }

  async function uploadAttachment() {
    if (!draft || !selectedChapterId || !uploadFile) {
      toast.error('请先选择章节并选择附件');
      return;
    }

    try {
      const formData = new FormData();
      formData.set('action', 'uploadChapterAttachment');
      formData.set(
        'metadata',
        JSON.stringify({
          scope,
          ...(isOfficial ? { view: 'draft' } : {}),
          libraryId: draft.id,
          chapterId: selectedChapterId,
          title: uploadTitle || uploadFile.name,
          description: uploadDescription || undefined,
        }),
      );
      formData.set('file', uploadFile);

      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '上传附件失败');
      }
      toast.success('章节附件已上传');
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      await loadLibraries(draft.id);
      setSelectedChapterId(selectedChapterId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传附件失败');
    }
  }

  async function deleteAttachment(attachmentId: string) {
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteAttachment',
          attachmentId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '删除附件失败');
      }
      toast.success('章节附件已删除');
      if (draft) {
        await loadLibraries(draft.id);
        setSelectedChapterId(selectedChapterId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除附件失败');
    }
  }

  async function retryAttachmentProcessing(attachmentId: string) {
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retryAttachmentProcessing',
          attachmentId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || '重试解析失败');
      }
      toast.success('已重新提交解析');
      if (draft) {
        await loadLibraries(draft.id);
        setSelectedChapterId(selectedChapterId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重试解析失败');
    }
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50/60 dark:bg-slate-950 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
              className="shrink-0 rounded-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回工作台
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h1>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isOfficial ? (
              <Button variant="outline" onClick={() => void publishOfficialLibraries()}>
                <Send className="mr-2 h-4 w-4" />
                发布
              </Button>
            ) : null}
            <Button
              onClick={() => {
                const library = createEmptyLibrary(scope);
                setDraft(library);
                setSelectedLibraryId(library.id);
                setVolumesJson(JSON.stringify(library.volumes, null, 2));
                setSelectedChapterId(getChapterOptions(library)[0]?.id ?? '');
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建教材
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr)]">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <BookOpen className="h-4 w-4 text-indigo-500" />
                教材列表
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {loading ? (
                <p className="text-sm text-slate-500">加载中...</p>
              ) : libraries.length === 0 ? (
                <p className="text-sm text-slate-500">当前还没有教材，先新建一个吧。</p>
              ) : (
                <div className="space-y-2">
                  {libraries.map((library) => (
                    <button
                      key={library.id}
                      type="button"
                      onClick={() => selectLibrary(library)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selectedLibraryId === library.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {library.editionLabel || library.publisher || library.id}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {library.publisher || '未填写出版社'} / {library.subjectId} / {library.gradeId}
                          </p>
                        </div>
                        <Badge variant="secondary" className="rounded-full">
                          {library.volumes.length} 册
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    基础信息
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => void deleteLibrary()} disabled={!draft}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                    <Button onClick={() => void saveLibrary()} disabled={!draft || saving}>
                      <Save className="mr-2 h-4 w-4" />
                      保存
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                <Input
                  placeholder="出版社"
                  value={draft?.publisher ?? ''}
                  onChange={(event) => updateDraft({ publisher: event.target.value })}
                  disabled={!draft}
                />
                <Input
                  placeholder="版本标题"
                  value={draft?.editionLabel ?? ''}
                  onChange={(event) => updateDraft({ editionLabel: event.target.value })}
                  disabled={!draft}
                />
                <Input
                  placeholder="学科 ID，例如 math"
                  value={draft?.subjectId ?? ''}
                  onChange={(event) => updateDraft({ subjectId: event.target.value })}
                  disabled={!draft}
                />
                <Input
                  placeholder="年级 ID，例如 grade-4"
                  value={draft?.gradeId ?? ''}
                  onChange={(event) => updateDraft({ gradeId: event.target.value })}
                  disabled={!draft}
                />
                <Input
                  placeholder="版本 ID"
                  value={draft?.editionId ?? ''}
                  onChange={(event) => updateDraft({ editionId: event.target.value })}
                  disabled={!draft}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  层级结构 JSON
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Textarea
                  value={volumesJson}
                  onChange={(event) => setVolumesJson(event.target.value)}
                  className="min-h-[320px] font-mono text-xs"
                  placeholder="在这里编辑 volumes / units / chapters 结构"
                  disabled={!draft}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <FileUp className="h-4 w-4 text-indigo-500" />
                  章节附件
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),160px,160px]">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      章节
                    </label>
                    <select
                      value={selectedChapterId}
                      onChange={(event) => setSelectedChapterId(event.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                      disabled={!draft}
                    >
                      {chapterOptions.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    placeholder="附件标题"
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    disabled={!draft}
                  />
                  <Input
                    placeholder="附件说明"
                    value={uploadDescription}
                    onChange={(event) => setUploadDescription(event.target.value)}
                    disabled={!draft}
                  />
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    type="file"
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    disabled={!draft}
                  />
                  <Button onClick={() => void uploadAttachment()} disabled={!draft || !uploadFile}>
                    <Upload className="mr-2 h-4 w-4" />
                    上传到章节
                  </Button>
                </div>

                {selectedChapter ? (
                  <div className="space-y-3">
                    {selectedChapter.attachments.length === 0 ? (
                      <p className="text-sm text-slate-500">当前章节还没有附件。</p>
                    ) : (
                      selectedChapter.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {attachment.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {attachment.filename} / {attachment.mimeType} / {attachment.size} bytes
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="rounded-full">
                                {attachment.status}
                              </Badge>
                              {attachment.status !== 'ready' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void retryAttachmentProcessing(attachment.id)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void deleteAttachment(attachment.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {attachment.description ? (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {attachment.description}
                            </p>
                          ) : null}
                          {attachment.extractedSummary ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              解析摘要：{attachment.extractedSummary}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">请先在上方选择一个章节。</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
