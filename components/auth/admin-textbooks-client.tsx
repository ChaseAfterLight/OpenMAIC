'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { toast } from 'sonner';

import { BookshelfView, type BookshelfCopy, type CreateEditionInput } from '@/components/auth/admin-textbooks-bookshelf';
import {
  WorkspaceView,
  type TextbookSelectionPath,
  type WorkspaceCopy,
} from '@/components/auth/admin-textbooks-workspace';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { K12TextbookCatalogSnapshot } from '@/lib/k12-textbook-catalog/types';
import type {
  K12TextbookChapter,
  K12TextbookEdition,
  K12TextbookResource,
  K12TextbookUnit,
  K12TextbookVolume,
} from '@/lib/module-host/types';

type CatalogResponse = {
  draft?: K12TextbookCatalogSnapshot;
  published?: K12TextbookCatalogSnapshot | null;
  error?: string;
};

type AdminTextbooksCopy = BookshelfCopy &
  WorkspaceCopy & {
    saveSuccess: string;
    saveFailed: string;
    createSuccess: string;
    loadFailed: string;
    publishSuccess: string;
    publishFailed: string;
  };

const copy: Record<'zh-CN' | 'en-US', AdminTextbooksCopy> = {
  'zh-CN': {
    title: '教材管理中心',
    desc: '像翻开一整面书架一样管理教材版本、册次与章节。',
    users: '用户管理',
    addEdition: '新建教材',
    deleteEdition: '删除教材',
    emptyHub: '还没有任何教材版本，先放一本上书架吧。',
    emptyCta: '新教材会先以草稿形式进入书架，随后可以继续补全册次与章节。',
    loading: '创建中…',
    published: '已发布',
    draft: '草稿',
    editionCount: '本教材',
    chapterCount: '章',
    volumeCount: '册',
    publisherFallback: '未定出版社',
    saveSuccess: '教材目录已保存',
    saveFailed: '保存教材目录失败',
    createSuccess: '已创建新的教材版本',
    loadFailed: '加载教材数据失败',
    publishSuccess: '目录已成功发布',
    publishFailed: '发布失败',
    back: '返回书架',
    saving: '保存中…',
    saved: '已保存',
    delete: '删除',
    deleteConfirm: '确定要删除「{name}」吗？此操作不可逆。',
    publish: '发布更新',
    sharePreview: '分享预览',
    tocTitle: '目录结构',
    coverPrompt: '+ 添加封面题图',
    chapterTitle: '章节标题',
    summary: '章节摘要',
    keywords: '关键词',
    resources: '配套资源',
    addResource: '附加文件或链接',
    emptyResources: '暂无资源，点击右上角添加一个。',
    allSubjects: '全部学科',
    createDrawerTitle: '新建教材',
    createDrawerDesc: '先填写出版社、学科和年级，系统会自动生成第一册并进入工作台。',
    editionLabel: '教材版本名称',
    publisherLabel: '出版社',
    subjectLabel: '学科',
    gradeLabel: '适用年级',
    volumeLabelInput: '默认册次名称',
    cancel: '取消',
    createAndEnter: '创建并进入工作台',
    addUnit: '新建单元',
    addChapter: '新建章节',
    unitTitle: '单元名称',
    chapterLabel: '章节标题',
    resourceTitle: '资源标题',
    resourceType: '类型',
    resourceUrl: '链接',
    resourceDesc: '描述',
    removeResource: '移除资源',
    coverHint: '可在后续步骤替换为真实题图',
    titleHint: '输入章节标题…',
    summaryHint: '写点关于这一章的简介…',
    emptyWorkspace: '请选择一本教材开始编辑。',
    emptyWorkspaceDesc: '工作台会在这里显示章节文档、目录和资源卡片。',
  },
  'en-US': {
    title: 'Textbook Hub',
    desc: 'Manage textbook editions, volumes, and chapters through a bookshelf-inspired hub.',
    users: 'Users',
    addEdition: 'New Textbook',
    deleteEdition: 'Delete Textbook',
    emptyHub: 'No textbook editions yet. Put the first one on the shelf.',
    emptyCta: 'New books are created as drafts first so you can keep refining them.',
    loading: 'Creating…',
    published: 'Published',
    draft: 'Draft',
    editionCount: 'editions',
    chapterCount: 'chapters',
    volumeCount: 'volumes',
    publisherFallback: 'Unassigned publisher',
    saveSuccess: 'Catalog saved',
    saveFailed: 'Failed to save catalog',
    createSuccess: 'A new textbook edition has been created',
    loadFailed: 'Failed to load textbook data',
    publishSuccess: 'Catalog published successfully',
    publishFailed: 'Failed to publish catalog',
    back: 'Back to Shelf',
    saving: 'Saving…',
    saved: 'Saved',
    delete: 'Delete',
    deleteConfirm: 'Are you sure you want to delete "{name}"? This cannot be undone.',
    publish: 'Publish Updates',
    sharePreview: 'Share Preview',
    tocTitle: 'Table of Contents',
    coverPrompt: '+ Add cover art',
    chapterTitle: 'Chapter Title',
    summary: 'Chapter Summary',
    keywords: 'Keywords',
    resources: 'Resources',
    addResource: 'Add files or links',
    emptyResources: 'No resources yet. Use the button above to add one.',
    allSubjects: 'All Subjects',
    createDrawerTitle: 'Create Textbook',
    createDrawerDesc: 'Fill in the publisher, subject, and grade. The first volume will be created automatically.',
    editionLabel: 'Edition Name',
    publisherLabel: 'Publisher',
    subjectLabel: 'Subject',
    gradeLabel: 'Grade',
    volumeLabelInput: 'Default Volume Name',
    cancel: 'Cancel',
    createAndEnter: 'Create and Enter Workspace',
    addUnit: 'New Unit',
    addChapter: 'New Chapter',
    unitTitle: 'Unit Title',
    chapterLabel: 'Chapter Title',
    resourceTitle: 'Resource Title',
    resourceType: 'Type',
    resourceUrl: 'URL',
    resourceDesc: 'Description',
    removeResource: 'Remove Resource',
    coverHint: 'A real cover art replacement can land in a later step',
    titleHint: 'Enter chapter title...',
    summaryHint: 'Write a short introduction for this chapter...',
    emptyWorkspace: 'Pick a textbook to start editing.',
    emptyWorkspaceDesc: 'The workspace will show chapter documents, the outline, and resource cards here.',
  },
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeChapter(locale: 'zh-CN' | 'en-US'): K12TextbookChapter {
  return {
    id: createId('chapter'),
    title: locale === 'zh-CN' ? '新章节' : 'New Chapter',
    summary: '',
    keywords: [],
    sourceDocuments: [],
  };
}

function createStarterEdition(locale: 'zh-CN' | 'en-US', input: CreateEditionInput): K12TextbookEdition {
  const chapter = makeChapter(locale);
  const unit: K12TextbookUnit = {
    id: createId('unit'),
    title: locale === 'zh-CN' ? '第一单元' : 'Unit 1',
    chapters: [chapter],
  };
  const volume: K12TextbookVolume = {
    id: createId('volume'),
    label: {
      'zh-CN': input.volumeLabel,
      'en-US': input.volumeLabel,
    },
    gradeId: input.gradeId,
    subjectId: input.subjectId,
    semester: 'upper',
    units: [unit],
  };

  return {
    id: createId('edition'),
    label: {
      'zh-CN': input.editionLabel,
      'en-US': input.editionLabel,
    },
    publisher: input.publisher,
    volumes: [volume],
  };
}

function createBlankResource(locale: 'zh-CN' | 'en-US'): K12TextbookResource {
  return {
    id: createId('resource'),
    title: locale === 'zh-CN' ? '新资源' : 'New Resource',
    type: 'other',
    description: '',
    url: '',
  };
}

function buildSelectionPath(edition: K12TextbookEdition): TextbookSelectionPath {
  const volume = edition.volumes[0];
  const unit = volume?.units[0];
  const chapter = unit?.chapters[0];

  return {
    editionId: edition.id,
    volumeId: volume?.id,
    unitId: unit?.id,
    chapterId: chapter?.id,
  };
}

function buildSelectionPathForVolume(edition: K12TextbookEdition, volumeId: string): TextbookSelectionPath {
  const volume = edition.volumes.find((item) => item.id === volumeId) ?? edition.volumes[0];
  const unit = volume?.units[0];
  const chapter = unit?.chapters[0];

  return {
    editionId: edition.id,
    volumeId: volume?.id,
    unitId: unit?.id,
    chapterId: chapter?.id,
  };
}

function getEditionById(editions: K12TextbookEdition[], editionId?: string) {
  return editions.find((edition) => edition.id === editionId) ?? null;
}

function getEditionDisplayName(edition: K12TextbookEdition, locale: 'zh-CN' | 'en-US') {
  return edition.label[locale] || edition.label['zh-CN'] || edition.label['en-US'] || edition.id;
}

function getLocalizedLabel(label: Record<'zh-CN' | 'en-US', string>, locale: 'zh-CN' | 'en-US') {
  return label[locale] || label['zh-CN'] || label['en-US'] || '';
}

export function AdminTextbooksClient() {
  const { locale } = useI18n();
  const activeLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const text = copy[activeLocale];

  const [draft, setDraft] = useState<K12TextbookCatalogSnapshot | null>(null);
  const [published, setPublished] = useState<K12TextbookCatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'hub' | 'workspace'>('hub');
  const [selectionPath, setSelectionPath] = useState<TextbookSelectionPath>({});

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSequenceRef = useRef(0);
  const pendingEditsRef = useRef<K12TextbookEdition[] | null>(null);

  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/textbooks', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as CatalogResponse;
        if (!res.ok || !data.draft) {
          throw new Error(data.error || text.loadFailed);
        }
        setDraft(data.draft);
        setPublished(data.published ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : text.loadFailed);
      } finally {
        setLoading(false);
      }
    };

    void loadCatalog();
  }, [text.loadFailed]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    },
    [],
  );

  const activeEdition = useMemo(
    () => getEditionById(draft?.editions ?? [], selectionPath.editionId),
    [draft?.editions, selectionPath.editionId],
  );

  const flushAutosave = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  };

  const persistCatalog = async (editions: K12TextbookEdition[]) => {
    const res = await fetch('/api/admin/textbooks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editions }),
    });
    const data = (await res.json().catch(() => ({}))) as CatalogResponse;
    if (!res.ok || !data.draft) {
      throw new Error(data.error || text.saveFailed);
    }
    return data;
  };

  const runAutosave = async (sequence: number) => {
    const pendingEdits = pendingEditsRef.current;
    if (!pendingEdits) {
      return;
    }

    try {
      const result = await persistCatalog(pendingEdits);
      if (sequence !== autosaveSequenceRef.current) {
        return;
      }
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);
    } catch (error) {
      if (sequence === autosaveSequenceRef.current) {
        toast.error(error instanceof Error ? error.message : text.saveFailed);
      }
    } finally {
      if (sequence === autosaveSequenceRef.current) {
        setSyncing(false);
      }
    }
  };

  const scheduleAutosave = (editions: K12TextbookEdition[], immediate = false) => {
    pendingEditsRef.current = editions;
    setSyncing(true);

    flushAutosave();

    const sequence = ++autosaveSequenceRef.current;
    const trigger = () => {
      void runAutosave(sequence);
    };

    if (immediate) {
      trigger();
      return;
    }

    autosaveTimerRef.current = setTimeout(trigger, 700);
  };

  const updateSelectedEdition = (
    mutator: (edition: K12TextbookEdition) => K12TextbookEdition,
    immediate = false,
  ) => {
    setDraft((current) => {
      if (!current || !selectionPath.editionId) {
        return current;
      }

      const nextEditions = current.editions.map((edition) =>
        edition.id === selectionPath.editionId ? mutator(edition) : edition,
      );
      scheduleAutosave(nextEditions, immediate);

      return {
        ...current,
        editions: nextEditions,
        updatedAt: Date.now(),
      };
    });
  };

  const handleAddEdition = async (data: CreateEditionInput) => {
    if (saving) return;

    setSaving(true);
    try {
      const nextEdition = createStarterEdition(activeLocale, data);
      const nextEditions = [nextEdition, ...(draft?.editions ?? [])];
      const result = await persistCatalog(nextEditions);
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);
      setSelectionPath(buildSelectionPath(nextEdition));
      setViewMode('workspace');
      toast.success(text.createSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectVolume = (editionId: string, volumeId: string) => {
    const edition = getEditionById(draft?.editions ?? [], editionId);
    if (!edition) return;
    setSelectionPath(buildSelectionPathForVolume(edition, volumeId));
    setViewMode('workspace');
  };

  const handleDeleteEdition = async (editionId: string) => {
    const currentEditions = draft?.editions ?? [];
    const targetEdition = currentEditions.find((edition) => edition.id === editionId);
    if (!targetEdition) return;
    if (!window.confirm(text.deleteConfirm.replace('{name}', getEditionDisplayName(targetEdition, activeLocale)))) {
      return;
    }

    setSaving(true);
    try {
      flushAutosave();
      const nextEditions = currentEditions.filter((edition) => edition.id !== editionId);
      const result = await persistCatalog(nextEditions);
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);
      setSelectionPath({});
      setViewMode('hub');
      toast.success(text.saveSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleBackToShelf = () => {
    setViewMode('hub');
  };

  const handleUpdateUnit = (patch: Partial<K12TextbookUnit>) => {
    updateSelectedEdition((edition) => {
      if (!selectionPath.volumeId || !selectionPath.unitId) return edition;
      return {
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id === selectionPath.unitId ? { ...unit, ...patch } : unit,
                ),
              },
        ),
      };
    });
  };

  const handleUpdateChapter = (patch: Partial<K12TextbookChapter>) => {
    updateSelectedEdition((edition) => {
      if (!selectionPath.volumeId || !selectionPath.unitId || !selectionPath.chapterId) return edition;
      return {
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id !== selectionPath.unitId
                    ? unit
                    : {
                        ...unit,
                        chapters: unit.chapters.map((chapter) =>
                          chapter.id === selectionPath.chapterId ? { ...chapter, ...patch } : chapter,
                        ),
                      },
                ),
              },
        ),
      };
    });
  };

  const handleUpdateResource = (resourceId: string, patch: Partial<K12TextbookResource>) => {
    updateSelectedEdition((edition) => {
      if (!selectionPath.volumeId || !selectionPath.unitId || !selectionPath.chapterId) return edition;
      return {
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id !== selectionPath.unitId
                    ? unit
                    : {
                        ...unit,
                        chapters: unit.chapters.map((chapter) =>
                          chapter.id !== selectionPath.chapterId
                            ? chapter
                            : {
                                ...chapter,
                                sourceDocuments: chapter.sourceDocuments.map((resource) =>
                                  resource.id === resourceId ? { ...resource, ...patch } : resource,
                                ),
                              },
                        ),
                      },
                ),
              },
        ),
      };
    });
  };

  const handleDeleteVolume = async (editionId: string, volumeId: string, stayInHub = false) => {
    const currentEditions = draft?.editions ?? [];
    const currentEdition = getEditionById(currentEditions, editionId);
    if (!currentEdition) return;
    const targetVolume = currentEdition.volumes.find((volume) => volume.id === volumeId);
    if (!targetVolume) return;
    if (!window.confirm(text.deleteConfirm.replace('{name}', getLocalizedLabel(targetVolume.label, activeLocale) || volumeId))) {
      return;
    }

    setSaving(true);
    try {
      flushAutosave();
      const nextEditions = currentEditions.map((edition) =>
        edition.id !== currentEdition.id
          ? edition
          : { ...edition, volumes: edition.volumes.filter((volume) => volume.id !== volumeId) },
      );
      const result = await persistCatalog(nextEditions);
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);

      const updatedEdition = result.draft?.editions.find((edition) => edition.id === currentEdition.id);
      if (updatedEdition) {
        if (stayInHub) {
          setSelectionPath({});
          setViewMode('hub');
        } else {
          const nextVolume = updatedEdition.volumes[0];
          if (nextVolume) {
            setSelectionPath(buildSelectionPathForVolume(updatedEdition, nextVolume.id));
          } else {
            setSelectionPath({ editionId: updatedEdition.id });
            setViewMode('workspace');
          }
        }
      } else {
        setSelectionPath({});
        setViewMode('hub');
      }
      toast.success(text.saveSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    const currentEditions = draft?.editions ?? [];
    const currentEdition = getEditionById(currentEditions, selectionPath.editionId);
    const currentVolume = currentEdition?.volumes.find((volume) => volume.id === selectionPath.volumeId);
    if (!currentEdition || !currentVolume) return;
    const targetUnit = currentVolume.units.find((unit) => unit.id === unitId);
    if (!targetUnit) return;
    if (!window.confirm(text.deleteConfirm.replace('{name}', targetUnit.title || unitId))) {
      return;
    }

    setSaving(true);
    try {
      flushAutosave();
      const nextEditions = currentEditions.map((edition) =>
        edition.id !== currentEdition.id
          ? edition
          : {
              ...edition,
              volumes: edition.volumes.map((volume) =>
                volume.id !== currentVolume.id
                  ? volume
                  : { ...volume, units: volume.units.filter((unit) => unit.id !== unitId) },
              ),
            },
      );
      const result = await persistCatalog(nextEditions);
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);

      const updatedEdition = result.draft?.editions.find((edition) => edition.id === currentEdition.id);
      if (updatedEdition) {
        setSelectionPath(buildSelectionPath(updatedEdition));
      }
      toast.success(text.saveSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    const currentEditions = draft?.editions ?? [];
    const currentEdition = getEditionById(currentEditions, selectionPath.editionId);
    const currentVolume = currentEdition?.volumes.find((volume) => volume.id === selectionPath.volumeId);
    const currentUnit = currentVolume?.units.find((unit) => unit.id === selectionPath.unitId);
    if (!currentEdition || !currentVolume || !currentUnit) return;
    const targetChapter = currentUnit.chapters.find((chapter) => chapter.id === chapterId);
    if (!targetChapter) return;
    if (!window.confirm(text.deleteConfirm.replace('{name}', targetChapter.title || chapterId))) {
      return;
    }

    setSaving(true);
    try {
      flushAutosave();
      const nextEditions = currentEditions.map((edition) =>
        edition.id !== currentEdition.id
          ? edition
          : {
              ...edition,
              volumes: edition.volumes.map((volume) =>
                volume.id !== currentVolume.id
                  ? volume
                  : {
                      ...volume,
                      units: volume.units.map((unit) =>
                        unit.id !== currentUnit.id
                          ? unit
                          : { ...unit, chapters: unit.chapters.filter((chapter) => chapter.id !== chapterId) },
                      ),
                    },
              ),
            },
      );
      const result = await persistCatalog(nextEditions);
      setDraft(result.draft ?? null);
      setPublished(result.published ?? null);

      const updatedEdition = result.draft?.editions.find((edition) => edition.id === currentEdition.id);
      if (updatedEdition) {
        setSelectionPath(buildSelectionPath(updatedEdition));
      }
      toast.success(text.saveSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = () => {
    if (!selectionPath.editionId) return;
    if (selectionPath.chapterId) {
      void handleDeleteChapter(selectionPath.chapterId);
      return;
    }
    if (selectionPath.unitId) {
      void handleDeleteUnit(selectionPath.unitId);
      return;
    }
    if (selectionPath.volumeId) {
      void handleDeleteVolume(selectionPath.editionId, selectionPath.volumeId);
      return;
    }
    void handleDeleteEdition(selectionPath.editionId);
  };

  const handleAddUnit = () => {
    if (!selectionPath.editionId || !selectionPath.volumeId || !selectionPath.unitId) return;
    const unitId = createId('unit');
    const chapter = makeChapter(activeLocale);

    updateSelectedEdition(
      (edition) => ({
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: [
                  ...volume.units,
                  {
                    id: unitId,
                    title: activeLocale === 'zh-CN' ? '新单元' : 'New Unit',
                    chapters: [chapter],
                  },
                ],
              },
        ),
      }),
      true,
    );
    setSelectionPath({
      editionId: selectionPath.editionId,
      volumeId: selectionPath.volumeId,
      unitId,
      chapterId: chapter.id,
    });
  };

  const handleAddChapter = () => {
    if (!selectionPath.editionId || !selectionPath.volumeId || !selectionPath.unitId) return;
    const chapter = makeChapter(activeLocale);

    updateSelectedEdition(
      (edition) => ({
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id !== selectionPath.unitId
                    ? unit
                    : {
                        ...unit,
                        chapters: [...unit.chapters, chapter],
                      },
                ),
              },
        ),
      }),
      true,
    );
    setSelectionPath({
      editionId: selectionPath.editionId,
      volumeId: selectionPath.volumeId,
      unitId: selectionPath.unitId,
      chapterId: chapter.id,
    });
  };

  const handleAddResource = () => {
    if (!selectionPath.editionId || !selectionPath.volumeId || !selectionPath.unitId || !selectionPath.chapterId) return;
    const resource = createBlankResource(activeLocale);

    updateSelectedEdition(
      (edition) => ({
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id !== selectionPath.unitId
                    ? unit
                    : {
                        ...unit,
                        chapters: unit.chapters.map((chapter) =>
                          chapter.id !== selectionPath.chapterId
                            ? chapter
                            : {
                                ...chapter,
                                sourceDocuments: [...chapter.sourceDocuments, resource],
                              },
                        ),
                      },
                ),
              },
        ),
      }),
      true,
    );
  };

  const handleRemoveResource = (resourceId: string) => {
    updateSelectedEdition((edition) => {
      if (!selectionPath.volumeId || !selectionPath.unitId || !selectionPath.chapterId) return edition;
      return {
        ...edition,
        volumes: edition.volumes.map((volume) =>
          volume.id !== selectionPath.volumeId
            ? volume
            : {
                ...volume,
                units: volume.units.map((unit) =>
                  unit.id !== selectionPath.unitId
                    ? unit
                    : {
                        ...unit,
                        chapters: unit.chapters.map((chapter) =>
                          chapter.id !== selectionPath.chapterId
                            ? chapter
                            : {
                                ...chapter,
                                sourceDocuments: chapter.sourceDocuments.filter((resource) => resource.id !== resourceId),
                              },
                        ),
                      },
                ),
              },
        ),
      };
    }, true);
  };

  const handlePublish = async () => {
    if (!draft || saving) return;

    setSaving(true);
    try {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const saved = await persistCatalog(draft.editions);
      setDraft(saved.draft ?? null);
      setPublished(saved.published ?? null);

      const res = await fetch('/api/admin/textbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const data = (await res.json().catch(() => ({}))) as CatalogResponse;
      if (!res.ok || !data.published) {
        throw new Error(data.error || text.publishFailed);
      }

      setDraft(data.draft ?? saved.draft ?? null);
      setPublished(data.published);
      toast.success(text.publishSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.publishFailed);
    } finally {
      setSaving(false);
    }
  };

  const currentBusy = saving || syncing;

  if (viewMode === 'hub') {
    return (
      <BookshelfView
        editions={draft?.editions}
        loading={loading}
        saving={currentBusy}
        published={published}
      text={text}
      activeLocale={activeLocale}
      onAddEdition={handleAddEdition}
      onDeleteEdition={handleDeleteEdition}
      onSelectVolume={handleSelectVolume}
      onDeleteVolume={(editionId, volumeId) => void handleDeleteVolume(editionId, volumeId, true)}
    />
  );
  }

  return (
    <WorkspaceView
      edition={activeEdition}
      selectionPath={selectionPath}
      text={text}
      activeLocale={activeLocale}
      isBusy={currentBusy}
      onBack={handleBackToShelf}
      onSelectPath={setSelectionPath}
      onUpdateUnit={handleUpdateUnit}
      onUpdateChapter={handleUpdateChapter}
      onUpdateResource={handleUpdateResource}
      onAddUnit={handleAddUnit}
      onAddChapter={handleAddChapter}
      onAddResource={handleAddResource}
      onRemoveResource={handleRemoveResource}
      onDeleteCurrent={handleDeleteCurrent}
      onDeleteUnit={handleDeleteUnit}
      onDeleteChapter={handleDeleteChapter}
      onPublish={handlePublish}
    />
  );
}
