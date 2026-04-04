'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, FileUp, Plus, RefreshCw, Save, Send, Trash2,
  Layers, FileText, Settings2, Folder, X, PanelRightClose,
  Search, BookDashed, BookOpen, ChevronRight, Download
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TextbookPdfImportReviewPanel } from './textbook-pdf-import-review-panel';
import { downloadTextbookFile } from './textbook-download';
import { k12ModuleManifest } from '@/modules/k12/manifest';
import {
  resolveLocalizedText,
  type K12ModulePresets,
  type ModuleOption,
} from '@/lib/module-host/types';
import type {
  TextbookChapterRecord,
  TextbookLibraryRecord,
  TextbookPdfImportDraftRecord,
  TextbookUnitRecord,
  TextbookVolumeRecord,
} from '@/lib/server/textbook-library-types';

// ============================================================================
// 1. 基础辅助函数与类型 (保持不变)
// ============================================================================
interface TextbookLibraryManagerProps { scope: 'official' | 'personal'; }

function createId(prefix: string) { return `${prefix}-${Date.now()}`; }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('封面读取失败'));
    reader.readAsDataURL(file);
  });
}

function getAttachmentDownloadUrl(attachment: TextbookChapterRecord['attachments'][number]) {
  return (
    attachment.externalUrl ??
    `/api/textbook-libraries?action=downloadAttachment&id=${encodeURIComponent(attachment.id)}`
  );
}

function getImportDraftDownloadUrl(importDraftId: string) {
  return `/api/textbook-libraries?action=downloadImportDraftSource&id=${encodeURIComponent(importDraftId)}`;
}

const K12_PRESETS = k12ModuleManifest.presets as unknown as K12ModulePresets;
const EXTRA_SUBJECT_OPTIONS: ModuleOption[] = [
  { id: 'science', label: { 'zh-CN': '科学', 'en-US': 'Science' } },
  { id: 'physics', label: { 'zh-CN': '物理', 'en-US': 'Physics' } },
  { id: 'chemistry', label: { 'zh-CN': '化学', 'en-US': 'Chemistry' } },
  { id: 'biology', label: { 'zh-CN': '生物', 'en-US': 'Biology' } },
  { id: 'history', label: { 'zh-CN': '历史', 'en-US': 'History' } },
  { id: 'geography', label: { 'zh-CN': '地理', 'en-US': 'Geography' } },
  { id: 'politics', label: { 'zh-CN': '道德与法治', 'en-US': 'Morality and Rule of Law' } },
  { id: 'music', label: { 'zh-CN': '音乐', 'en-US': 'Music' } },
  { id: 'art', label: { 'zh-CN': '美术', 'en-US': 'Art' } },
  { id: 'pe', label: { 'zh-CN': '体育与健康', 'en-US': 'Physical Education' } },
  { id: 'it', label: { 'zh-CN': '信息科技', 'en-US': 'Information Technology' } },
  { id: 'labor', label: { 'zh-CN': '劳动', 'en-US': 'Labor' } },
  { id: 'comprehensive-practice', label: { 'zh-CN': '综合实践', 'en-US': 'Comprehensive Practice' } },
];
const EXTRA_GRADE_OPTIONS: ModuleOption[] = [
  { id: 'kindergarten-small', label: { 'zh-CN': '小班', 'en-US': 'Kindergarten Small' } },
  { id: 'kindergarten-middle', label: { 'zh-CN': '中班', 'en-US': 'Kindergarten Middle' } },
  { id: 'kindergarten-large', label: { 'zh-CN': '大班', 'en-US': 'Kindergarten Large' } },
  { id: 'grade-1', label: { 'zh-CN': '一年级', 'en-US': 'Grade 1' } },
  { id: 'grade-2', label: { 'zh-CN': '二年级', 'en-US': 'Grade 2' } },
  { id: 'grade-7', label: { 'zh-CN': '七年级', 'en-US': 'Grade 7' } },
  { id: 'grade-8', label: { 'zh-CN': '八年级', 'en-US': 'Grade 8' } },
  { id: 'grade-9', label: { 'zh-CN': '九年级', 'en-US': 'Grade 9' } },
  { id: 'grade-10', label: { 'zh-CN': '高一', 'en-US': 'Grade 10' } },
  { id: 'grade-11', label: { 'zh-CN': '高二', 'en-US': 'Grade 11' } },
  { id: 'grade-12', label: { 'zh-CN': '高三', 'en-US': 'Grade 12' } },
];

function mergeOptions(base: ModuleOption[], extras: ModuleOption[]) {
  const map = new Map<string, ModuleOption>();
  for (const option of [...base, ...extras]) {
    map.set(option.id, option);
  }
  return [...map.values()];
}

function sortOptions(options: ModuleOption[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index] as const));
  return [...options].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return resolveLocalizedText(left.label, 'zh-CN').localeCompare(
      resolveLocalizedText(right.label, 'zh-CN'),
      'zh-CN',
    );
  });
}

const SUBJECT_OPTIONS = mergeOptions(K12_PRESETS.subjects, EXTRA_SUBJECT_OPTIONS);
const GRADE_OPTIONS = sortOptions(
  mergeOptions(K12_PRESETS.grades, EXTRA_GRADE_OPTIONS),
  [
    'kindergarten-small', 'kindergarten-middle', 'kindergarten-large',
    'grade-1', 'grade-2', 'grade-3', 'grade-4', 'grade-5', 'grade-6',
    'grade-7', 'grade-8', 'grade-9', 'grade-10', 'grade-11', 'grade-12',
  ],
);
const EXTRA_PUBLISHER_OPTIONS = [
  '人民教育出版社', '北京师范大学出版社', '华东师范大学出版社', '江苏凤凰教育出版社',
  '教育科学出版社', '上海教育出版社', '湖南教育出版社', '广东教育出版社',
  '河北教育出版社', '辽宁教育出版社', '语文出版社', '高等教育出版社',
  '外语教学与研究出版社', '人民音乐出版社', '人民美术出版社', '电子工业出版社',
];
const PUBLISHER_OPTIONS = Array.from(
  new Set([
    ...K12_PRESETS.textbookEditions
      .map((edition) => edition.publisher?.trim())
      .filter((publisher): publisher is string => Boolean(publisher)),
    ...EXTRA_PUBLISHER_OPTIONS,
  ]),
);
const CUSTOM_PUBLISHER_VALUE = '__custom__';
type PublisherMode = 'preset' | 'custom';
type FieldMode = 'preset' | 'custom';

function resolvePresetOptionLabel(value: string, options: ModuleOption[]) {
  const matched = options.find((option) => option.id === value || resolveLocalizedText(option.label, 'zh-CN') === value);
  return matched ? resolveLocalizedText(matched.label, 'zh-CN') : value;
}

function buildPresetSelectOptions(options: ModuleOption[], currentValue: string) {
  if (!currentValue) return options;
  const matched = options.some((option) => option.id === currentValue || resolveLocalizedText(option.label, 'zh-CN') === currentValue);
  if (matched) return options;
  return [...options, { id: currentValue, label: { 'zh-CN': `${currentValue}（当前值）`, 'en-US': currentValue } }];
}

function getPublisherDisplayValue(publisher: string) { return publisher || '未指定出版社'; }
function isPresetPublisher(publisher: string) { return PUBLISHER_OPTIONS.includes(publisher); }
function isPresetOption(value: string, options: ModuleOption[]) { return options.some((option) => option.id === value || resolveLocalizedText(option.label, 'zh-CN') === value); }

function createEmptyLibrary(scope: 'official' | 'personal'): TextbookLibraryRecord {
  const now = Date.now();
  const defaultSubject = SUBJECT_OPTIONS.find((option) => option.id === K12_PRESETS.defaults.subjectId) ?? SUBJECT_OPTIONS[0];
  const defaultGrade = GRADE_OPTIONS.find((option) => option.id === K12_PRESETS.defaults.gradeId) ?? GRADE_OPTIONS[0];
  const defaultPublisher = PUBLISHER_OPTIONS[0] ?? '';
  return {
    id: `library-${now}`, scope, cover: undefined, publisher: defaultPublisher,
    subjectId: defaultSubject?.id ?? K12_PRESETS.defaults.subjectId,
    subjectLabel: defaultSubject ? resolveLocalizedText(defaultSubject.label, 'zh-CN') : undefined,
    gradeId: defaultGrade?.id ?? K12_PRESETS.defaults.gradeId,
    gradeLabel: defaultGrade ? resolveLocalizedText(defaultGrade.label, 'zh-CN') : undefined,
    editionId: `edition-${now}`, editionLabel: '新建教材', createdAt: now, updatedAt: now,
    volumes: [
      {
        id: createId('volume'), label: '第一册', order: 0,
        gradeId: defaultGrade?.id ?? K12_PRESETS.defaults.gradeId, semester: 'upper',
        units: [{ id: createId('unit'), title: '第一单元', order: 0, chapters: [{ id: createId('chapter'), title: '第一课', summary: '', keywords: [], order: 0, attachments: [] }] }],
      }
    ],
  };
}

function getBookGradient(id: string) {
  const gradients = ['from-blue-500 to-cyan-400', 'from-indigo-500 to-purple-500', 'from-emerald-400 to-teal-500', 'from-orange-400 to-rose-400', 'from-slate-700 to-slate-500'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[index % gradients.length];
}

function getImportDraftStatusLabel(status: TextbookPdfImportDraftRecord['status']) {
  switch (status) {
    case 'uploaded':
    case 'parsing':
      return '解析中';
    case 'ready':
      return '可审核';
    case 'confirmed':
      return '已确认';
    case 'failed':
      return '解析失败';
    default:
      return status;
  }
}

function computeImportBindingDiagnostics(importDraft: TextbookPdfImportDraftRecord | null) {
  if (!importDraft?.pageCount) return { unboundPages: [] as number[], overlappingPages: [] as number[] };
  const coveredPages = new Map<number, number>();
  for (const unit of importDraft.units) {
    for (const chapter of unit.chapters) {
      const start = Math.max(1, Number(chapter.pageStart) || 1);
      const end = Math.max(start, Number(chapter.pageEnd) || start);
      for (let page = start; page <= end; page += 1) coveredPages.set(page, (coveredPages.get(page) ?? 0) + 1);
    }
  }
  const unboundPages: number[] = [];
  const overlappingPages: number[] = [];
  for (let page = 1; page <= importDraft.pageCount; page += 1) {
    const count = coveredPages.get(page) ?? 0;
    if (count === 0) unboundPages.push(page);
    else if (count > 1) overlappingPages.push(page);
  }
  return { unboundPages, overlappingPages };
}

function buildImportDraftReviewPayload(importDraft: TextbookPdfImportDraftRecord) {
  return {
    ...importDraft, pageTexts: undefined,
    units: importDraft.units.map((unit) => ({
      ...unit,
      chapters: unit.chapters.map((chapter) => ({ ...chapter })),
    })),
  };
}

// ============================================================================
// 2. UI 组件：沉浸式书籍封面 (保持不变)
// ============================================================================
const BookCover = ({ library, onClick }: { library: TextbookLibraryRecord; onClick: () => void }) => {
  const gradient = useMemo(() => getBookGradient(library.id), [library.id]);
  const subjectLabel = library.subjectLabel ?? resolvePresetOptionLabel(library.subjectId, SUBJECT_OPTIONS);
  const gradeLabel = library.gradeLabel ?? resolvePresetOptionLabel(library.gradeId, GRADE_OPTIONS);
  const unitCount = useMemo(() => library.volumes.reduce((total, volume) => total + volume.units.length, 0), [library.volumes]);
  const hasCover = Boolean(library.cover);
  return (
    <div onClick={onClick} className="group relative cursor-pointer perspective-1000 transition-all duration-500 hover:-translate-y-2">
      <div className={`relative w-full aspect-[2/3] rounded-r-2xl rounded-l-md shadow-lg transition-all duration-500 group-hover:shadow-2xl overflow-hidden ${hasCover ? 'bg-slate-900' : `bg-gradient-to-br ${gradient}`}`}>
        {hasCover ? (
          <img src={library.cover} alt={library.editionLabel || '教材封面'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/20 via-white/10 to-transparent z-10" />
            <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-white/30 z-20" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
        <div className="absolute inset-0 p-5 flex flex-col justify-between text-white z-20">
          <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-0 self-start text-xs shadow-sm">
            {getPublisherDisplayValue(library.publisher)}
          </Badge>
          <div className="space-y-1 mt-auto mb-6">
            <h3 className="font-bold text-xl leading-tight drop-shadow-md line-clamp-3">{library.editionLabel || '未命名教材'}</h3>
            <p className="text-xs text-white/80">{subjectLabel} • {gradeLabel}</p>
          </div>
          <div className="flex gap-3 text-xs font-medium text-white/80 backdrop-blur-sm bg-black/10 p-2.5 rounded-xl -mx-1">
            <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {unitCount} 单元</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. 主控组件 
// ============================================================================
export function TextbookLibraryManager({ scope }: TextbookLibraryManagerProps) {
  const router = useRouter();
  const isOfficial = scope === 'official';
  
  // --- 状态管理 ---
  const [libraries, setLibraries] = useState<TextbookLibraryRecord[]>([]);
  const [draft, setDraft] = useState<TextbookLibraryRecord | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [importDrafts, setImportDrafts] = useState<TextbookPdfImportDraftRecord[]>([]);
  const [activeImportDraftId, setActiveImportDraftId] = useState<string | null>(null);
  const [pendingImportDraftId, setPendingImportDraftId] = useState<string | null>(null);
  const [publisherMode, setPublisherMode] = useState<PublisherMode>('preset');
  const [subjectMode, setSubjectMode] = useState<FieldMode>('preset');
  const [gradeMode, setGradeMode] = useState<FieldMode>('preset');
  const [coverUploading, setCoverUploading] = useState(false);
  const [importingVolumeId, setImportingVolumeId] = useState<string | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  
  // 附件上传状态
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  
  // 视图与检索状态
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'hub' | 'studio'>('hub');
  const [activeTab, setActiveTab] = useState<'settings' | 'structure'>('structure');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubject, setActiveSubject] = useState<string>('全部');

  const title = isOfficial ? '官方教材库' : '我的私人教材库';
  const description = isOfficial ? '维护全站可见的教材目录、章节结构与附件。' : '维护仅供自己使用的教材目录与章节附件，沉淀个人备课资料。';

  const selectedChapter = useMemo(() => {
    if (!draft || !selectedChapterId) return null;
    for (const vol of draft.volumes) {
      for (const unit of vol.units) {
        const chap = unit.chapters.find(c => c.id === selectedChapterId);
        if (chap) return { volumeId: vol.id, unitId: unit.id, chapter: chap };
      }
    }
    return null;
  }, [draft, selectedChapterId]);

  const activeImportDraft = useMemo(() => importDrafts.find((item) => item.id === activeImportDraftId) ?? null, [importDrafts, activeImportDraftId]);
  const pendingImportDraft = useMemo(() => importDrafts.find((item) => item.id === pendingImportDraftId) ?? null, [importDrafts, pendingImportDraftId]);
  const importBindingDiagnostics = useMemo(() => computeImportBindingDiagnostics(activeImportDraft), [activeImportDraft]);

  const selectedPublisherValue = publisherMode === 'custom' ? CUSTOM_PUBLISHER_VALUE : (isPresetPublisher(draft?.publisher ?? '') ? draft?.publisher ?? '' : CUSTOM_PUBLISHER_VALUE);
  const selectedSubjectValue = subjectMode === 'custom' ? CUSTOM_PUBLISHER_VALUE : (isPresetOption(draft?.subjectId ?? '', SUBJECT_OPTIONS) ? draft?.subjectId ?? '' : CUSTOM_PUBLISHER_VALUE);
  const selectedGradeValue = gradeMode === 'custom' ? CUSTOM_PUBLISHER_VALUE : (isPresetOption(draft?.gradeId ?? '', GRADE_OPTIONS) ? draft?.gradeId ?? '' : CUSTOM_PUBLISHER_VALUE);

  const subjectSelectOptions = useMemo(() => buildPresetSelectOptions(SUBJECT_OPTIONS, draft?.subjectId ?? ''), [draft?.subjectId]);
  const gradeSelectOptions = useMemo(() => buildPresetSelectOptions(GRADE_OPTIONS, draft?.gradeId ?? ''), [draft?.gradeId]);

  const subjectList = useMemo(() => {
    const subjects = new Set(libraries.map((lib) => lib.subjectLabel ?? resolvePresetOptionLabel(lib.subjectId, SUBJECT_OPTIONS)).filter(Boolean));
    return ['全部', ...Array.from(subjects)];
  }, [libraries]);

  const filteredLibraries = useMemo(() => {
    return libraries.filter(lib => {
      const matchesSearch = !searchQuery || 
        (lib.editionLabel?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
        (lib.publisher?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (lib.subjectLabel ?? resolvePresetOptionLabel(lib.subjectId, SUBJECT_OPTIONS)).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lib.gradeLabel ?? resolvePresetOptionLabel(lib.gradeId, GRADE_OPTIONS)).toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSubject = activeSubject === '全部' || (lib.subjectLabel ?? resolvePresetOptionLabel(lib.subjectId, SUBJECT_OPTIONS)) === activeSubject;
      return matchesSearch && matchesSubject;
    });
  }, [libraries, searchQuery, activeSubject]);

  const loadImportDrafts = useCallback(async (libraryId: string, nextActiveId?: string | null) => {
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listImportDrafts', scope, libraryId }), cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '加载导入草稿失败');
      const nextDrafts = (data.importDrafts ?? []) as TextbookPdfImportDraftRecord[];
      setImportDrafts(nextDrafts);
      setActiveImportDraftId((currentActiveId) => {
        const targetActiveId = nextActiveId ?? currentActiveId;
        if (!targetActiveId) return null;
        return nextDrafts.some((item) => item.id === targetActiveId) ? targetActiveId : null;
      });
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载导入草稿失败'); }
  }, [scope]);

  useEffect(() => {
    const draftId = draft?.id;
    if (!draftId || !pendingImportDraftId) {
      return;
    }

    const refreshPendingDrafts = () => {
      void loadImportDrafts(draftId);
    };

    refreshPendingDrafts();
    const timer = window.setInterval(refreshPendingDrafts, 2000);
    return () => window.clearInterval(timer);
  }, [loadImportDrafts, pendingImportDraftId, draft?.id]);

  useEffect(() => {
    if (!pendingImportDraftId) {
      return;
    }

    if (!pendingImportDraft) {
      return;
    }

    if (pendingImportDraft.status === 'ready' && !activeImportDraftId) {
      setActiveImportDraftId(pendingImportDraft.id);
      setPendingImportDraftId(null);
      toast.success('PDF 解析完成，已打开审核页面');
      return;
    }

    if (pendingImportDraft.status === 'failed') {
      setPendingImportDraftId(null);
      toast.error('PDF 解析失败，请检查文件后重试');
    }
  }, [activeImportDraftId, pendingImportDraft, pendingImportDraftId]);

  const loadLibraries = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    try {
      const response = await fetch('/api/textbook-libraries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listLibraries', scope, ...(isOfficial ? { view: 'draft' } : {}) }), cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '加载失败');

      const nextLibraries = (data.libraries ?? []) as TextbookLibraryRecord[];
      setLibraries(nextLibraries);
      if (nextSelectedId) {
        const nextDraft = nextLibraries.find((library) => library.id === nextSelectedId);
        if (nextDraft) {
          setDraft(structuredClone(nextDraft));
          setPublisherMode(isPresetPublisher(nextDraft.publisher) ? 'preset' : 'custom');
          setSubjectMode(isPresetOption(nextDraft.subjectId, SUBJECT_OPTIONS) ? 'preset' : 'custom');
          setGradeMode(isPresetOption(nextDraft.gradeId, GRADE_OPTIONS) ? 'preset' : 'custom');
          void loadImportDrafts(nextDraft.id);
        }
      } else {
        setImportDrafts([]); setActiveImportDraftId(null);
        setPendingImportDraftId(null);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载失败'); } 
    finally { setLoading(false); }
  }, [scope, isOfficial, loadImportDrafts]);

  useEffect(() => { void loadLibraries(); }, [loadLibraries]);

  function selectLibrary(library: TextbookLibraryRecord) {
    setDraft(structuredClone(library));
    setPublisherMode(isPresetPublisher(library.publisher) ? 'preset' : 'custom');
    setSubjectMode(isPresetOption(library.subjectId, SUBJECT_OPTIONS) ? 'preset' : 'custom');
    setGradeMode(isPresetOption(library.gradeId, GRADE_OPTIONS) ? 'preset' : 'custom');
    setSelectedChapterId(null); setUploadFile(null); setUploadTitle(''); setUploadDescription('');
    setActiveImportDraftId(null);
    setPendingImportDraftId(null);
    void loadImportDrafts(library.id);
    setViewMode('studio'); setActiveTab('settings');
  }

  function updateDraft(patch: Partial<TextbookLibraryRecord>) { setDraft((current) => (current ? { ...current, ...patch } : current)); }
  async function updateCover(file: File | null) {
    if (!file || !draft) return;
    setCoverUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      updateDraft({ cover: dataUrl });
      toast.success('封面已添加');
    } catch (error) { toast.error(error instanceof Error ? error.message : '封面上传失败'); } 
    finally { setCoverUploading(false); }
  }
  const updateVolume = (vId: string, patch: Partial<TextbookVolumeRecord>) => updateDraft({ volumes: draft!.volumes.map(v => v.id === vId ? { ...v, ...patch } : v) });
  const updateUnit = (vId: string, uId: string, patch: Partial<TextbookUnitRecord>) => updateDraft({ volumes: draft!.volumes.map(v => v.id === vId ? { ...v, units: v.units.map(u => u.id === uId ? { ...u, ...patch } : u) } : v) });
  const updateChapter = (vId: string, uId: string, cId: string, patch: Partial<TextbookChapterRecord>) => updateDraft({ volumes: draft!.volumes.map(v => v.id === vId ? { ...v, units: v.units.map(u => u.id === uId ? { ...u, chapters: u.chapters.map(c => c.id === cId ? { ...c, ...patch } : c) } : u) } : v) });
  
  const addVolume = () => updateDraft({ volumes: [...draft!.volumes, { id: createId('volume'), label: '新册次', order: draft!.volumes.length, gradeId: '', semester: 'upper', units: [] }] });
  const addUnit = (vId: string) => updateVolume(vId, { units: [...draft!.volumes.find(v => v.id === vId)!.units, { id: createId('unit'), title: '新单元', order: 0, chapters: [] }] });
  const addChapter = (vId: string, uId: string) => {
    const newId = createId('chapter');
    updateUnit(vId, uId, { chapters: [...draft!.volumes.find(v => v.id === vId)!.units.find(u => u.id === uId)!.chapters, { id: newId, title: '新章节', summary: '', keywords: [], order: 0, attachments: [] }] });
    setSelectedChapterId(newId);
  };
  
  const removeVolume = (vId: string) => updateDraft({ volumes: draft!.volumes.filter(v => v.id !== vId) });
  const removeUnit = (vId: string, uId: string) => updateVolume(vId, { units: draft!.volumes.find(v => v.id === vId)!.units.filter(u => u.id !== uId) });
  const removeChapter = (vId: string, uId: string, cId: string) => { updateUnit(vId, uId, { chapters: draft!.volumes.find(v => v.id === vId)!.units.find(u => u.id === uId)!.chapters.filter(c => c.id !== cId) }); if (selectedChapterId === cId) setSelectedChapterId(null); };

  function syncSavedLibrary(savedLibrary: TextbookLibraryRecord) {
    setDraft(structuredClone(savedLibrary));
    setLibraries((current) => {
      const nextLibrary = structuredClone(savedLibrary);
      const existingIndex = current.findIndex((library) => library.id === savedLibrary.id);
      if (existingIndex < 0) return [...current, nextLibrary];
      const nextLibraries = [...current];
      nextLibraries[existingIndex] = nextLibrary;
      return nextLibraries;
    });
    setPublisherMode(isPresetPublisher(savedLibrary.publisher) ? 'preset' : 'custom');
    setSubjectMode(isPresetOption(savedLibrary.subjectId, SUBJECT_OPTIONS) ? 'preset' : 'custom');
    setGradeMode(isPresetOption(savedLibrary.gradeId, GRADE_OPTIONS) ? 'preset' : 'custom');
  }

  async function persistLibraryDraft(library: TextbookLibraryRecord, options?: { successMessage?: string }) {
    const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveLibrary', payload: { library } }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.library) throw new Error(data.error || '保存失败');
    const savedLibrary = data.library as TextbookLibraryRecord;
    syncSavedLibrary(savedLibrary);
    if (options?.successMessage) toast.success(options.successMessage);
    return savedLibrary;
  }

  async function saveLibrary() {
    if (!draft) return;
    setSaving(true);
    try {
      const savedLibrary = await persistLibraryDraft(draft, { successMessage: '已安全保存' });
      await loadImportDrafts(savedLibrary.id, activeImportDraftId);
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); } 
    finally { setSaving(false); }
  }

  async function publishLibraries() {
    if (!isOfficial) return;
    setSaving(true);
    try {
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publishOfficialLibraries' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '发布失败');
      toast.success('已发布'); await loadLibraries();
    } catch (error) { toast.error(error instanceof Error ? error.message : '发布失败'); } 
    finally { setSaving(false); }
  }

  async function deleteLibrary() {
    if (!draft || !window.confirm(`确认删除吗？`)) return;
    try {
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteLibrary', scope, libraryId: draft.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '删除失败');
      toast.success('已删除教材'); setViewMode('hub'); await loadLibraries();
    } catch (error) { toast.error(error instanceof Error ? error.message : '删除失败'); }
  }

  async function uploadAttachment() {
    if (!draft || !selectedChapterId || !uploadFile) return;
    try {
      const savedLibrary = await persistLibraryDraft(draft);
      const formData = new FormData();
      formData.set('action', 'uploadChapterAttachment');
      formData.set('metadata', JSON.stringify({ scope, libraryId: savedLibrary.id, chapterId: selectedChapterId, title: uploadTitle, description: uploadDescription }));
      formData.set('file', uploadFile);
      const response = await fetch('/api/textbook-libraries', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '上传失败');
      toast.success('上传成功'); setUploadFile(null); setUploadTitle(''); setUploadDescription('');
      await loadLibraries(savedLibrary.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : '上传失败'); }
  }

  async function deleteAttachment(id: string) {
    try {
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteAttachment', attachmentId: id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '删除失败');
      toast.success('已删除'); if (draft) await loadLibraries(draft.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : '删除失败'); }
  }

  function updateImportDraftLocal(updater: (current: TextbookPdfImportDraftRecord) => TextbookPdfImportDraftRecord) {
    setImportDrafts((current) => current.map((item) => {
      if (item.id !== activeImportDraftId) return item;
      const next = updater(item);
      return { ...next, unboundPages: computeImportBindingDiagnostics(next).unboundPages };
    }));
  }

  function updateImportUnit(unitId: string, patch: Partial<TextbookPdfImportDraftRecord['units'][number]>) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit)) }));
  }

  function updateImportChapter(unitId: string, chapterId: string, patch: Partial<TextbookPdfImportDraftRecord['units'][number]['chapters'][number]>) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.map((unit) => unit.id === unitId ? { ...unit, chapters: unit.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch } : chapter) } : unit) }));
  }

  function addImportUnit() {
    updateImportDraftLocal((current) => ({ ...current, units: [...current.units, { id: createId('import-unit'), title: `新单元 ${current.units.length + 1}`, order: current.units.length, chapters: [] }] }));
  }

  function removeImportUnit(unitId: string) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.filter((unit) => unit.id !== unitId).map((unit, index) => ({ ...unit, order: index })) }));
  }

  function moveImportUnit(unitId: string, direction: -1 | 1) {
    updateImportDraftLocal((current) => {
      const index = current.units.findIndex((unit) => unit.id === unitId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.units.length) return current;
      const nextUnits = [...current.units];
      const [moved] = nextUnits.splice(index, 1);
      nextUnits.splice(nextIndex, 0, moved);
      return { ...current, units: nextUnits.map((unit, order) => ({ ...unit, order })) };
    });
  }

  function addImportChapter(unitId: string) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.map((unit) => unit.id === unitId ? { ...unit, chapters: [...unit.chapters, { id: createId('import-chapter'), title: `新章节 ${unit.chapters.length + 1}`, order: unit.chapters.length, pageStart: 1, pageEnd: 1, confidence: 0.4 }] } : unit) }));
  }

  function removeImportChapter(unitId: string, chapterId: string) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.map((unit) => unit.id === unitId ? { ...unit, chapters: unit.chapters.filter((chapter) => chapter.id !== chapterId).map((chapter, index) => ({ ...chapter, order: index })) } : unit) }));
  }

  function moveImportChapter(unitId: string, chapterId: string, direction: -1 | 1) {
    updateImportDraftLocal((current) => ({ ...current, units: current.units.map((unit) => {
      if (unit.id !== unitId) return unit;
      const index = unit.chapters.findIndex((chapter) => chapter.id === chapterId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= unit.chapters.length) return unit;
      const nextChapters = [...unit.chapters];
      const [moved] = nextChapters.splice(index, 1);
      nextChapters.splice(nextIndex, 0, moved);
      return { ...unit, chapters: nextChapters.map((chapter, order) => ({ ...chapter, order })) };
    }) }));
  }

  async function uploadImportDraft(file: File, volumeId: string) {
    if (!draft) return;
    setImportSaving(true);
    try {
      const savedLibrary = await persistLibraryDraft(draft);
      const formData = new FormData();
      formData.set('action', 'uploadImportDraft');
      formData.set('metadata', JSON.stringify({ scope, libraryId: savedLibrary.id, volumeId }));
      formData.set('file', file);
      const response = await fetch('/api/textbook-libraries', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.importDraft) throw new Error(data.error || '导入失败');
      toast.success('PDF 已开始解析，完成后会自动打开审核页面');
      setActiveImportDraftId(null);
      setPendingImportDraftId(data.importDraft.id);
      await loadImportDrafts(savedLibrary.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : '导入失败'); } 
    finally { setImportSaving(false); setImportingVolumeId(null); if (importFileInputRef.current) importFileInputRef.current.value = ''; }
  }

  async function saveImportDraftReview() {
    if (!activeImportDraft) return;
    setImportSaving(true);
    try {
      const payload = { ...buildImportDraftReviewPayload(activeImportDraft), unboundPages: computeImportBindingDiagnostics(activeImportDraft).unboundPages };
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveImportDraft', payload: { draft: payload } }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.importDraft) throw new Error(data.error || '保存导入草稿失败');
      setImportDrafts((current) => current.map((item) => (item.id === data.importDraft.id ? data.importDraft : item)));
      toast.success('导入草稿已保存');
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存导入草稿失败'); } 
    finally { setImportSaving(false); }
  }

  async function confirmImportDraft() {
    if (!activeImportDraft || !draft) return;
    if (!window.confirm('确认用当前导入结果覆盖这个册次的目录与章节附件吗？')) return;
    setImportSaving(true);
    try {
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirmImportDraft', draftId: activeImportDraft.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '确认导入失败');
      await loadLibraries(draft.id);
      await loadImportDrafts(draft.id, activeImportDraft.id);
      toast.success('导入结果已绑定到章节附件');
    } catch (error) { toast.error(error instanceof Error ? error.message : '确认导入失败'); } 
    finally { setImportSaving(false); }
  }

  async function removeImportDraft(draftId: string) {
    if (!draft) return;
    try {
      const response = await fetch('/api/textbook-libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteImportDraft', draftId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || '删除导入草稿失败');
      await loadImportDrafts(draft.id, activeImportDraftId === draftId ? null : activeImportDraftId);
      if (activeImportDraftId === draftId) setActiveImportDraftId(null);
      if (pendingImportDraftId === draftId) setPendingImportDraftId(null);
      toast.success('导入草稿已删除');
    } catch (error) { toast.error(error instanceof Error ? error.message : '删除导入草稿失败'); }
  }

  // ==========================================================================
  // 视图 1：教材大厅 (Hub)
  // ==========================================================================
  if (viewMode === 'hub') {
    return (
      <main translate="no" className="notranslate min-h-[100dvh] bg-[#f8f9fa] dark:bg-slate-950 transition-colors">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12 space-y-8">
          
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="mb-2 -ml-3 text-slate-500 rounded-full">
                <ArrowLeft className="mr-2 h-4 w-4" /> 返回主站
              </Button>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
              <p className="text-lg text-slate-500 dark:text-slate-400 font-medium">{description}</p>
            </div>
            <div className="flex items-center gap-3">
              {isOfficial && (
                <Button variant="outline" className="rounded-full bg-white shadow-sm" onClick={publishLibraries} disabled={saving}>
                  <Send className="mr-2 h-4 w-4" /> 发布全站
                </Button>
              )}
              <Button className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md" onClick={() => selectLibrary(createEmptyLibrary(scope))}><Plus className="mr-2 h-4 w-4" /> 新建教材</Button>
            </div>
          </header>

          {!loading && libraries.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800 flex flex-col md:flex-row items-center gap-4 sticky top-4 z-30 backdrop-blur-xl bg-white/80">
              <div className="relative w-full md:max-w-[300px] shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="搜索书名、出版社..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500 shadow-inner h-10" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto w-full pb-1 md:pb-0 scrollbar-hide">
                {subjectList.map(subject => (
                  <button key={subject} onClick={() => setActiveSubject(subject)} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeSubject === subject ? 'bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900' : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    {subject}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><div className="animate-pulse h-8 w-8 bg-indigo-500/50 rounded-full" /></div>
          ) : libraries.length === 0 ? (
            <div className="text-center py-32 bg-white/50 rounded-3xl border border-slate-100 dark:border-slate-800">
              <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-400 text-lg">书架空空如也，新建一本教材吧。</p>
            </div>
          ) : filteredLibraries.length === 0 ? (
            <div className="text-center py-32">
              <BookDashed className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-500 text-lg">没有找到匹配 <strong>&quot;{searchQuery}&quot;</strong> 或该分类的教材。</p>
              <Button variant="link" className="text-indigo-500 mt-2" onClick={() => {setSearchQuery(''); setActiveSubject('全部')}}>清空过滤条件</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-12 animate-in fade-in duration-500">
              {filteredLibraries.map(lib => <BookCover key={lib.id} library={lib} onClick={() => selectLibrary(lib)} />)}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ==========================================================================
  // 视图 2：教材工作室 (Studio)
  // ==========================================================================
  return (
    <main translate="no" className="notranslate h-[100dvh] overflow-hidden bg-white dark:bg-[#0a0a0a] flex flex-col animate-in slide-in-from-bottom-8 duration-500">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-slate-100 dark:border-white/5 px-4 md:px-6 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setViewMode('hub'); setDraft(null); }} className="rounded-full hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">当前编辑</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{draft?.editionLabel || '未命名'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-full" onClick={deleteLibrary}><Trash2 className="h-4 w-4 mr-1" /> 删除本书</Button>
          <Button className="rounded-full bg-slate-900 text-white hover:bg-slate-800 shadow-md" onClick={saveLibrary} disabled={saving}>{saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 保存更改</Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-64 border-r border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col shrink-0 min-h-0">
          <div className="p-4 space-y-1">
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:bg-black/5'}`}><Settings2 className="w-4 h-4" /> 基础属性</button>
            <button onClick={() => setActiveTab('structure')} className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'structure' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:bg-black/5'}`}><Layers className="w-4 h-4" /> 内容与结构</button>
          </div>
        </aside>

        <main className="flex-1 flex min-h-0 overflow-hidden bg-white">
          <input
            ref={importFileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && importingVolumeId) {
                void uploadImportDraft(file, importingVolumeId);
              }
            }}
          />
          {activeTab === 'settings' && draft && (
            <div className="w-full overflow-y-auto p-8 md:p-12">
              <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">书籍基础属性</h2>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 col-span-2"><label className="text-xs font-bold uppercase text-slate-500">书籍名称</label><Input value={draft.editionLabel} onChange={e => updateDraft({ editionLabel: e.target.value })} className="text-lg font-medium py-6" /></div>
                  <div className="space-y-3 col-span-2">
                    <label className="text-xs font-bold uppercase text-slate-500">书籍封面</label>
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:flex-row md:items-start">
                      <div className="relative w-full max-w-[120px] aspect-[2/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                        {draft.cover ? (
                          <img src={draft.cover} alt={draft.editionLabel || '教材封面'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-center text-[11px] font-medium text-slate-400">未上传封面</div>
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                        <Input
                          type="file" accept="image/*" disabled={coverUploading}
                          onChange={(e) => { void updateCover(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
                          className="file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => updateDraft({ cover: undefined })} disabled={!draft.cover}>移除封面</Button>
                        </div>
                        <p className="text-xs text-slate-400">支持 PNG、JPG、WebP。建议使用竖版封面，卡片展示会更清楚。</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500">出版社</label>
                    <Select
                      value={selectedPublisherValue}
                      onValueChange={(value) => {
                        if (value === CUSTOM_PUBLISHER_VALUE) { setPublisherMode('custom'); return; }
                        setPublisherMode('preset'); updateDraft({ publisher: value });
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="请选择出版社" /></SelectTrigger>
                      <SelectContent>
                        {PUBLISHER_OPTIONS.map((publisher) => (<SelectItem key={publisher} value={publisher}>{publisher}</SelectItem>))}
                        <SelectItem value={CUSTOM_PUBLISHER_VALUE}>自定义输入</SelectItem>
                      </SelectContent>
                    </Select>
                    {publisherMode === 'custom' && (<Input value={draft.publisher} onChange={e => updateDraft({ publisher: e.target.value })} placeholder="手动输入出版社" />)}
                  </div>
                  <div className="space-y-2"><label className="text-xs font-bold uppercase text-slate-500">唯一标识 (ID)</label><Input value={draft.editionId} onChange={e => updateDraft({ editionId: e.target.value })} className="font-mono bg-slate-50" /></div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500">学科</label>
                    <Select
                      value={selectedSubjectValue}
                      onValueChange={(value) => {
                        if (value === CUSTOM_PUBLISHER_VALUE) { setSubjectMode('custom'); return; }
                        setSubjectMode('preset');
                        const option = SUBJECT_OPTIONS.find((item) => item.id === value);
                        updateDraft({ subjectId: option?.id ?? value, subjectLabel: option ? resolveLocalizedText(option.label, 'zh-CN') : value });
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="请选择学科" /></SelectTrigger>
                      <SelectContent>
                        {subjectSelectOptions.map((subject) => (<SelectItem key={subject.id} value={subject.id}>{resolveLocalizedText(subject.label, 'zh-CN')}</SelectItem>))}
                        <SelectItem value={CUSTOM_PUBLISHER_VALUE}>自定义输入</SelectItem>
                      </SelectContent>
                    </Select>
                    {subjectMode === 'custom' && (<Input value={draft.subjectLabel ?? draft.subjectId} onChange={e => updateDraft({ subjectId: e.target.value, subjectLabel: e.target.value })} placeholder="手动输入学科名称" />)}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500">年级</label>
                    <Select
                      value={selectedGradeValue}
                      onValueChange={(value) => {
                        if (value === CUSTOM_PUBLISHER_VALUE) { setGradeMode('custom'); return; }
                        setGradeMode('preset');
                        const option = GRADE_OPTIONS.find((item) => item.id === value);
                        updateDraft({ gradeId: option?.id ?? value, gradeLabel: option ? resolveLocalizedText(option.label, 'zh-CN') : value });
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="请选择年级" /></SelectTrigger>
                      <SelectContent>
                        {gradeSelectOptions.map((grade) => (<SelectItem key={grade.id} value={grade.id}>{resolveLocalizedText(grade.label, 'zh-CN')}</SelectItem>))}
                        <SelectItem value={CUSTOM_PUBLISHER_VALUE}>自定义输入</SelectItem>
                      </SelectContent>
                    </Select>
                    {gradeMode === 'custom' && (<Input value={draft.gradeLabel ?? draft.gradeId} onChange={e => updateDraft({ gradeId: e.target.value, gradeLabel: e.target.value })} placeholder="手动输入年级名称" />)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'structure' && draft && (
            activeImportDraft ? (
              <TextbookPdfImportReviewPanel
                importDraft={activeImportDraft} importSaving={importSaving} bindingDiagnostics={importBindingDiagnostics}
                onBackToCatalog={() => setActiveImportDraftId(null)} onSaveDraftReview={saveImportDraftReview} onConfirmDraft={confirmImportDraft}
                onDeleteDraft={() => removeImportDraft(activeImportDraft.id)} onAddUnit={addImportUnit} onUpdateUnit={updateImportUnit}
                onMoveUnit={moveImportUnit} onRemoveUnit={removeImportUnit} onAddChapter={addImportChapter} onUpdateChapter={updateImportChapter}
                onMoveChapter={moveImportChapter} onRemoveChapter={removeImportChapter}
              />
            ) : (
            <>
              <div className="flex-1 overflow-y-auto p-8 md:p-12 transition-all duration-300">
                <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">书籍内容结构</h2>
                      <p className="text-sm text-slate-500 mt-1">管理书籍大纲。选中章节以配置资源。</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={addVolume} className="rounded-full bg-white"><Plus className="w-4 h-4 mr-1"/> 添加册次</Button>
                  </div>
                  
                  <div className="space-y-6">
                    {draft.volumes.map((vol, vIdx) => {
                      const volumeImportDrafts = importDrafts.filter((item) => item.volumeId === vol.id);
                      return (
                      <div key={vol.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/50 shadow-sm relative group overflow-hidden">
                        
                        {/* >>> 优化点：册次头部，包含全局导入按钮 <<< */}
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50/80 p-4 md:p-5 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">{vIdx + 1}</div>
                            <Input value={vol.label} onChange={e => updateVolume(vol.id, { label: e.target.value })} className="text-lg font-bold border-none bg-transparent hover:bg-white focus-visible:ring-1 md:max-w-[200px]" placeholder="册次名称" />
                          </div>
                          <div className="flex items-center gap-2">
                            {volumeImportDrafts.length === 0 ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-white shadow-sm h-8"
                                disabled={importSaving}
                                onClick={() => {
                                  setImportingVolumeId(vol.id);
                                  importFileInputRef.current?.click();
                                }}
                              >
                                <FileUp className="mr-1.5 h-4 w-4" /> 从 PDF 导入
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="h-8 rounded-full bg-amber-100 px-3 text-[11px] font-semibold text-amber-700">
                                已有导入草稿
                              </Badge>
                            )}
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-rose-500 h-8 w-8" onClick={() => removeVolume(vol.id)}><X className="w-4 h-4"/></Button>
                          </div>
                        </div>

                        {/* 册次内部内容区 */}
                        <div className="p-4 md:p-6">
                          {volumeImportDrafts.length > 0 && (
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                              {volumeImportDrafts.map((item) => {
                                const canReview = item.status === 'ready';
                                const statusLabel = getImportDraftStatusLabel(item.status);

                                return (
                                  <div key={item.id} className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                                    <span className="max-w-[220px] truncate text-xs font-medium text-slate-700">{item.filename}</span>
                                    <Badge variant="secondary" className="h-5 rounded-full bg-slate-100 px-2 text-[10px] font-semibold text-slate-600">
                                      {statusLabel}
                                    </Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 rounded-full px-2 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                                      onClick={() => void downloadTextbookFile(getImportDraftDownloadUrl(item.id), item.filename)}
                                    >
                                      <Download className="mr-1 h-3 w-3" /> 下载
                                    </Button>
                                    {item.status !== 'confirmed' ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 rounded-full px-2 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                                        onClick={() => removeImportDraft(item.id)}
                                      >
                                        删除
                                      </Button>
                                    ) : null}
                                    {canReview ? (
                                      <Button
                                        size="sm"
                                        className="h-6 rounded-full bg-amber-500 px-2.5 text-[11px] text-white shadow-sm hover:bg-amber-600"
                                        onClick={() => setActiveImportDraftId(item.id)}
                                      >
                                        审核
                                      </Button>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="pl-1 md:pl-2 border-l-2 border-slate-100 dark:border-slate-800 space-y-4">
                            {vol.units.map((unit, _uIdx) => (
                              <div key={unit.id} className="relative group/unit">
                                <div className="flex items-center gap-2 mb-2">
                                  <Folder className="w-5 h-5 text-emerald-500 shrink-0" />
                                  <Input value={unit.title} onChange={e => updateUnit(vol.id, unit.id, { title: e.target.value })} className="font-semibold border-none bg-transparent hover:bg-slate-50 focus-visible:ring-1 md:max-w-[300px]" placeholder="单元名称" />
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 opacity-0 group-hover/unit:opacity-100 hover:text-rose-500 shrink-0" onClick={() => removeUnit(vol.id, unit.id)}><X className="w-3 h-3"/></Button>
                                </div>

                                <div className="pl-6 space-y-1">
                                  {unit.chapters.map((chap) => {
                                    const isSelected = selectedChapterId === chap.id;
                                    return (
                                      <div 
                                        key={chap.id} 
                                        onClick={() => setSelectedChapterId(isSelected ? null : chap.id)}
                                        className={`group/chap flex items-center gap-3 cursor-pointer p-2 -ml-2 rounded-lg transition-all ${
                                          isSelected ? 'bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:ring-indigo-500/30 dark:text-indigo-100' : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 dark:text-slate-300'
                                        }`}
                                      >
                                        <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`} />
                                        <span className="flex-1 text-sm font-medium truncate select-none">{chap.title || '未命名章节'}</span>
                                        {chap.attachments.length > 0 ? (
                                          <Badge variant="secondary" className="scale-90 origin-right bg-white dark:bg-slate-800 text-slate-500">
                                            {chap.attachments.length} 附件
                                          </Badge>
                                        ) : (
                                          <span className={`text-[11px] font-medium opacity-0 group-hover/chap:opacity-100 transition-opacity ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`}>配置资源</span>
                                        )}
                                        <Button variant="ghost" size="icon" className={`h-6 w-6 shrink-0 transition-opacity ml-1 ${isSelected ? 'opacity-100 text-indigo-500' : 'opacity-0 group-hover/chap:opacity-100 text-slate-400 hover:text-rose-500'}`} onClick={(e) => { e.stopPropagation(); removeChapter(vol.id, unit.id, chap.id); }}>
                                          {isSelected ? <ChevronRight className="w-4 h-4" /> : <X className="w-3 h-3"/>}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  <div className="pt-1.5"><Button variant="ghost" size="sm" onClick={() => addChapter(vol.id, unit.id)} className="text-xs text-slate-400 hover:text-indigo-600 h-7 px-2"><Plus className="w-3 h-3 mr-1"/> 添加章节</Button></div>
                                </div>
                              </div>
                            ))}
                            <div className="pt-2"><Button variant="secondary" size="sm" onClick={() => addUnit(vol.id)} className="text-xs text-slate-600 h-8"><Folder className="w-3 h-3 mr-1"/> 新建单元</Button></div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    {draft.volumes.length === 0 && <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">目前没有册次，点击右上角添加。</div>}
                  </div>
                </div>
              </div>

              <aside className="w-[400px] shrink-0 border-l border-slate-100 dark:border-white/5 bg-slate-50/30 flex flex-col shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)]">
                {selectedChapterId && selectedChapter ? (
                  <div className="flex flex-col h-full animate-in fade-in duration-300">
                    <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur shrink-0">
                      <div className="font-semibold text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-indigo-500"/> 章节属性与资源</div>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedChapterId(null)} className="h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100"><PanelRightClose className="w-4 h-4" /></Button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-8">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">章节名称</label>
                          <Input 
                            value={selectedChapter.chapter.title} 
                            onChange={e => updateChapter(selectedChapter.volumeId, selectedChapter.unitId, selectedChapter.chapter.id, { title: e.target.value })}
                            className="font-semibold bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">内容摘要</label>
                          <Textarea 
                            value={selectedChapter.chapter.summary || ''} 
                            onChange={e => updateChapter(selectedChapter.volumeId, selectedChapter.unitId, selectedChapter.chapter.id, { summary: e.target.value })}
                            placeholder="写一段简短的介绍..."
                            className="resize-none h-24 text-sm bg-white"
                          />
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-200/60 space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FileUp className="w-3.5 h-3.5" /> 附件资源</label>
                          <Badge variant="secondary" className="bg-slate-100">{selectedChapter.chapter.attachments.length}</Badge>
                        </div>

                        <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-white text-center hover:border-indigo-300 transition-colors">
                          <Input type="file" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} className="file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer text-xs mb-3 w-full" />
                          {uploadFile && (
                            <div className="space-y-2 animate-in fade-in">
                              <Input placeholder="附件标题 (选填)" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="text-xs h-8" />
                              <Button size="sm" className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={uploadAttachment}>确认上传</Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {selectedChapter.chapter.attachments.map(att => (
                            <div key={att.id} className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-indigo-100 transition-colors">
                              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0"><FileText className="h-4 w-4" /></div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <h4 className="font-semibold text-xs text-slate-900 truncate">{att.title || att.filename}</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">{att.mimeType}</p>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 -mr-1 -mt-1"
                                onClick={() => void downloadTextbookFile(getAttachmentDownloadUrl(att), att.filename)}
                                title="下载附件"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-300 hover:text-rose-500 hover:bg-rose-50 -mr-1 -mt-1" onClick={() => deleteAttachment(att.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          ))}
                          {selectedChapter.chapter.attachments.length === 0 && !uploadFile && (
                            <p className="text-xs text-slate-400 text-center py-4">无附件</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center animate-in fade-in">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                      <FileUp className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="font-semibold text-slate-700 mb-2">管理章节资源</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      在左侧选中任意一个章节即可编辑资源，也可以在册次标题旁直接<span className="text-indigo-500 font-medium">从 PDF 导入章节结构</span>。
                    </p>
                  </div>
                )}
              </aside>
            </>
            )
          )}
        </main>
      </div>
    </main>
  );
}
