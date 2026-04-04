'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
  AlertTriangle,
  Folder,
  ArrowLeft,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';

import type { TextbookPdfImportDraftRecord } from '@/lib/server/textbook-library-types';

type ImportUnitDraft = TextbookPdfImportDraftRecord['units'][number];
type ImportChapterDraft = ImportUnitDraft['chapters'][number];
type SelectedImportChapterPath = {
  draftId: string;
  unitId: string;
  chapterId: string;
} | null;

function getProposalSourceLabel(source: TextbookPdfImportDraftRecord['proposalSource']) {
  switch (source) {
    case 'ai': return 'AI 提议';
    case 'rules': return '规则提议';
    case 'merged': return 'AI + 规则';
    case 'fallback': return '规则回退';
    default: return '待生成';
  }
}

function getImportDraftStatusLabel(status: TextbookPdfImportDraftRecord['status']) {
  switch (status) {
    case 'uploaded':
    case 'parsing': return '解析中';
    case 'ready': return '可审核';
    case 'confirmed': return '已确认';
    case 'failed': return '解析失败';
    default: return status;
  }
}

interface ImportBindingDiagnostics {
  unboundPages: number[];
  overlappingPages: number[];
}

interface TextbookPdfImportReviewPanelProps {
  importDraft: TextbookPdfImportDraftRecord;
  importSaving: boolean;
  bindingDiagnostics: ImportBindingDiagnostics;
  onBackToCatalog: () => void;
  onSaveDraftReview: () => void;
  onConfirmDraft: () => void;
  onDeleteDraft: () => void;
  onAddUnit: () => void;
  onUpdateUnit: (unitId: string, patch: Partial<ImportUnitDraft>) => void;
  onMoveUnit: (unitId: string, direction: -1 | 1) => void;
  onRemoveUnit: (unitId: string) => void;
  onAddChapter: (unitId: string) => void;
  onUpdateChapter: (unitId: string, chapterId: string, patch: Partial<ImportChapterDraft>) => void;
  onMoveChapter: (unitId: string, chapterId: string, direction: -1 | 1) => void;
  onRemoveChapter: (unitId: string, chapterId: string) => void;
}

export function TextbookPdfImportReviewPanel({
  importDraft, importSaving, bindingDiagnostics,
  onBackToCatalog, onSaveDraftReview, onConfirmDraft, onDeleteDraft,
  onAddUnit, onUpdateUnit, onMoveUnit, onRemoveUnit,
  onAddChapter, onUpdateChapter, onMoveChapter, onRemoveChapter,
}: TextbookPdfImportReviewPanelProps) {
  
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [selectedChapterPath, setSelectedChapterPath] = useState<SelectedImportChapterPath>(null);

  const hasUnboundPages = bindingDiagnostics.unboundPages.length > 0;
  const hasOverlappingPages = bindingDiagnostics.overlappingPages.length > 0;
  const hasBlockingDiagnosticsError = hasOverlappingPages || Boolean(importDraft.parseError);
  const overallConfidencePercent = Math.round(Math.max(0, Math.min(1, Number(importDraft.proposalConfidence) || 0)) * 100);
  
  const anchorPreview = importDraft.pageAnchors.slice(0, 4).map((anchor) => `${anchor.printedPage}->${anchor.rawPage}`).join(' · ');
  const conflictNotes = importDraft.conflictNotes.slice(0, 4);
  const selectedChapter = selectedChapterPath?.draftId === importDraft.id
    ? importDraft.units.reduce<{ unitId: string; chapter: ImportChapterDraft } | null>((found, unit) => {
        if (found || unit.id !== selectedChapterPath.unitId) return found;

        const chapter = unit.chapters.find((item) => item.id === selectedChapterPath.chapterId);
        return chapter ? { unitId: unit.id, chapter } : null;
      }, null)
    : null;
  const pdfPreviewUrl = selectedChapter?.chapter.pageStart
    ? `/api/textbook-libraries?action=downloadImportDraftSource&id=${encodeURIComponent(importDraft.id)}#page=${selectedChapter.chapter.pageStart}`
    : `/api/textbook-libraries?action=downloadImportDraftSource&id=${encodeURIComponent(importDraft.id)}`;

  // 辅助函数：根据置信度返回指示灯颜色
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-emerald-500';
    if (confidence >= 0.5) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-slate-950">
      
      {/* --- 顶部全局动作栏 --- */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100" onClick={onBackToCatalog}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">{importDraft.filename}</h1>
              <Badge variant="secondary" className="bg-slate-100 text-[10px] uppercase tracking-wider">{getImportDraftStatusLabel(importDraft.status)}</Badge>
              <Badge variant="outline" className="text-[10px] tracking-wide text-indigo-600 border-indigo-200 bg-indigo-50/50">{getProposalSourceLabel(importDraft.proposalSource)}</Badge>
            </div>
            <p className="text-xs text-slate-500">共 {importDraft.pageCount || '-'} 页 • 请核对左侧提取的目录与右侧 PDF 是否匹配</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {importDraft.status !== 'confirmed' && (
            <Button variant="ghost" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-full" onClick={onDeleteDraft}>
              <Trash2 className="mr-1.5 h-4 w-4" /> 放弃解析
            </Button>
          )}
          <Button variant="outline" className="rounded-full shadow-sm" onClick={onSaveDraftReview} disabled={importSaving}>
            {importSaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 保存草稿
          </Button>
          <Button className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md" onClick={onConfirmDraft} disabled={importSaving || importDraft.status !== 'ready' || hasBlockingDiagnosticsError}>
            <Send className="mr-2 h-4 w-4" /> 完成并绑定
          </Button>
        </div>
      </header>

      {/* --- 核心工作区：左右严格分屏 --- */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        
        {/* == 左侧：结构校对面板 == */}
        <aside className="flex w-full min-h-0 flex-col border-r border-slate-200 bg-slate-50/30 md:w-[450px] lg:w-[550px] shrink-0">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

            {/* 1. 可折叠的技术详情面板 */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <button 
                onClick={() => setShowTechDetails(!showTechDetails)} 
                className="w-full flex items-center justify-between p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
              >
                <span className="flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" /> 技术解析详情 (置信度 {overallConfidencePercent}%)</span>
                {showTechDetails ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              {showTechDetails && (
                <div className="p-4 grid gap-4 md:grid-cols-2 text-xs border-t border-slate-100 bg-white">
                  <div>
                    <span className="block text-slate-400 mb-1">目录候选页</span>
                    <span className="font-medium text-slate-800">{importDraft.tocCandidatePages.length > 0 ? importDraft.tocCandidatePages.join(', ') : '未识别'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 mb-1">页码锚点 (书内-&gt;PDF)</span>
                    <span className="font-medium text-slate-800">{anchorPreview || '未识别'}</span>
                  </div>
                  {importDraft.aiModel && (
                    <div className="col-span-2">
                      <span className="block text-slate-400 mb-1">AI 模型</span>
                      <span className="font-medium text-slate-800">{importDraft.aiModel}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* 2. 诊断信息警告面板 (精简版) */}
            {(hasUnboundPages || hasOverlappingPages || importDraft.parseError || importDraft.lowConfidencePages.length > 0 || conflictNotes.length > 0) && (
              <div className={`rounded-xl p-4 shadow-sm animate-in fade-in border ${hasBlockingDiagnosticsError || importDraft.parseError ? 'border-amber-200 bg-amber-50' : 'border-sky-200 bg-sky-50'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${hasBlockingDiagnosticsError || importDraft.parseError ? 'text-amber-600' : 'text-sky-600'}`} />
                  <div className="space-y-2 w-full">
                    <h3 className={`text-sm font-bold ${hasBlockingDiagnosticsError ? 'text-amber-900' : 'text-sky-900'}`}>
                      {hasBlockingDiagnosticsError ? '需要修复绑定冲突' : '需人工复核项'}
                    </h3>
                    {importDraft.parseError && <p className="text-xs text-amber-700">{importDraft.parseError}</p>}
                    
                    <div className="flex flex-wrap gap-2 text-xs">
                      {hasUnboundPages && (
                        <Badge variant="secondary" className={`${hasBlockingDiagnosticsError ? 'bg-amber-100/50 text-amber-800 border-amber-200' : 'bg-sky-100/50 text-sky-800 border-sky-200'}`}>
                          未覆盖页: {bindingDiagnostics.unboundPages.length} 页
                        </Badge>
                      )}
                      {hasOverlappingPages && (
                        <Badge variant="secondary" className="bg-amber-100/50 text-amber-800 border-amber-200">
                          冲突重叠: {bindingDiagnostics.overlappingPages.join(', ')}
                        </Badge>
                      )}
                      {importDraft.lowConfidencePages.length > 0 && (
                        <Badge variant="secondary" className={`${hasBlockingDiagnosticsError ? 'bg-amber-100/50 text-amber-800 border-amber-200' : 'bg-sky-100/50 text-sky-800 border-sky-200'}`}>
                          低置信度: {importDraft.lowConfidencePages.length} 页
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. 目录结构树 (极简内联版) */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-sm font-bold text-slate-900">结构与页码核对</h3>
                <Button variant="outline" size="sm" className="h-7 rounded-full text-xs shadow-sm bg-white" onClick={onAddUnit}>
                  <Plus className="mr-1 h-3 w-3" /> 添加单元
                </Button>
              </div>

              <div className="space-y-6 pb-20">
                {importDraft.units.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400 bg-white">解析结果为空，请手动点击上方按钮添加目录。</div>
                ) : (
                  importDraft.units.map((unit) => (
                    <div key={unit.id} className="relative group/unit">
                      
                      {/* 单元头部 (吸顶效果) */}
                      <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50/90 backdrop-blur py-2 pr-2 -ml-2 pl-2 border-y border-transparent transition-colors group-hover/unit:border-slate-200 group-hover/unit:bg-white">
                        <GripVertical className="h-4 w-4 text-slate-300 cursor-grab active:cursor-grabbing opacity-0 group-hover/unit:opacity-100 transition-opacity shrink-0" />
                        <Folder className="h-4 w-4 text-emerald-500 shrink-0" />
                        <Input
                          value={unit.title} onChange={(e) => onUpdateUnit(unit.id, { title: e.target.value })}
                          className="h-7 border-none bg-transparent font-bold text-slate-800 focus-visible:ring-1 focus-visible:ring-indigo-500 px-1 shadow-none w-full"
                          placeholder="单元名称"
                        />
                        <div className="flex items-center opacity-0 group-hover/unit:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-700" onClick={() => onMoveUnit(unit.id, -1)} title="上移">↑</Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-700" onClick={() => onMoveUnit(unit.id, 1)} title="下移">↓</Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-rose-500" onClick={() => onRemoveUnit(unit.id)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>

                      {/* 章节列表 (紧凑列表) */}
                      <div className="pl-6 md:pl-8 space-y-0.5 mt-1 border-l-2 border-slate-100 ml-3">
                        {unit.chapters.map((chapter) => {
                          const confidenceNum = Number(chapter.confidence) || 0;
                          const isSelected = selectedChapterPath?.unitId === unit.id && selectedChapterPath?.chapterId === chapter.id;
                          return (
                            <div
                              key={chapter.id}
                              onClick={() => setSelectedChapterPath({ draftId: importDraft.id, unitId: unit.id, chapterId: chapter.id })}
                              className={`group/chap relative flex cursor-pointer flex-col gap-1.5 py-2 pl-3 pr-14 rounded-lg border transition-all ${
                                isSelected
                                  ? 'border-indigo-200 bg-indigo-50/60 shadow-sm'
                                  : 'border-transparent hover:border-slate-200 hover:bg-white hover:shadow-sm'
                              }`}
                            >
                              
                              {/* 标题单独一行，避免被页码框挤压截断 */}
                              <div className="flex items-center gap-2 w-full min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getConfidenceColor(confidenceNum)}`} title={`置信度 ${Math.round(confidenceNum * 100)}%`} />
                                
                                <Input
                                  value={chapter.title} onChange={(e) => onUpdateChapter(unit.id, chapter.id, { title: e.target.value })}
                                  className="h-6 border-none bg-transparent font-medium text-sm text-slate-700 focus-visible:ring-1 px-1 shadow-none min-w-0 flex-1"
                                  placeholder="章节名称"
                                />
                              </div>

                              {/* 页码与状态单独一行 */}
                              <div className="flex items-center justify-between gap-2 pl-3.5">
                                <div className="flex items-center gap-1.5 bg-slate-100/50 rounded p-0.5 shrink-0 border border-slate-200/60">
                                  <span className="text-[10px] text-slate-400 font-semibold px-1 select-none">P.</span>
                                  <Input type="number" min={1} value={chapter.pageStart} onChange={(e) => onUpdateChapter(unit.id, chapter.id, { pageStart: Number(e.target.value) || 1 })} className="h-5 w-10 text-center text-xs p-0 border-none bg-white shadow-sm focus-visible:ring-1" />
                                  <span className="text-[10px] text-slate-400 select-none">-</span>
                                  <Input type="number" min={1} value={chapter.pageEnd} onChange={(e) => onUpdateChapter(unit.id, chapter.id, { pageEnd: Number(e.target.value) || 1 })} className="h-5 w-10 text-center text-xs p-0 border-none bg-white shadow-sm focus-visible:ring-1" />
                                </div>

                                {chapter.needsReview && (
                                  <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-200 bg-amber-50 shrink-0 px-1 py-0 h-4">
                                    待复核
                                  </Badge>
                                )}
                              </div>

                              {/* 悬浮操作 */}
                              <div className="absolute right-1 top-1 flex items-center opacity-0 transition-opacity group-hover/chap:opacity-100">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => onMoveChapter(unit.id, chapter.id, -1)}>↑</Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => onMoveChapter(unit.id, chapter.id, 1)}>↓</Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-rose-500" onClick={() => onRemoveChapter(unit.id, chapter.id)}><X className="h-3.5 w-3.5" /></Button>
                              </div>

                            </div>
                          );
                        })}
                        
                        <div className="pt-1 pb-2">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md" onClick={() => onAddChapter(unit.id)}>
                            <Plus className="mr-1 h-3 w-3" /> 添加子章节
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* == 右侧：沉浸式 PDF 预览区 == */}
        <main className="relative min-h-0 flex-1 bg-slate-900 hidden md:block">
          <iframe
            title="PDF 预览"
            src={pdfPreviewUrl}
            className="h-full w-full border-none shadow-inner bg-[#525659]"
          />
        </main>
      </div>
    </div>
  );
}
