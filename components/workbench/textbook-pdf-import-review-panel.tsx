'use client';

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
  FileText,
  Folder,
  ArrowLeft,
  GripVertical
} from 'lucide-react';

import type { TextbookPdfImportDraftRecord } from '@/lib/server/textbook-library-types';

type ImportUnitDraft = TextbookPdfImportDraftRecord['units'][number];
type ImportChapterDraft = ImportUnitDraft['chapters'][number];

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
  importDraft,
  importSaving,
  bindingDiagnostics,
  onBackToCatalog,
  onSaveDraftReview,
  onConfirmDraft,
  onDeleteDraft,
  onAddUnit,
  onUpdateUnit,
  onMoveUnit,
  onRemoveUnit,
  onAddChapter,
  onUpdateChapter,
  onMoveChapter,
  onRemoveChapter,
}: TextbookPdfImportReviewPanelProps) {
  const hasUnboundPages = bindingDiagnostics.unboundPages.length > 0;
  const hasOverlappingPages = bindingDiagnostics.overlappingPages.length > 0;
  const hasBlockingDiagnosticsError = hasOverlappingPages || Boolean(importDraft.parseError);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-slate-950">
      
      {/* 顶部全局动作栏 (Sticky Header) */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100" onClick={onBackToCatalog}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">{importDraft.filename}</h1>
              <Badge variant="secondary" className="bg-slate-100 text-[10px] uppercase tracking-wider">{importDraft.status}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              共 {importDraft.pageCount || '-'} 页 • 请核对左侧提取的目录与右侧 PDF 是否匹配
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-full" onClick={onDeleteDraft}>
            <Trash2 className="mr-1.5 h-4 w-4" /> 放弃解析
          </Button>
          <Button variant="outline" className="rounded-full shadow-sm" onClick={onSaveDraftReview} disabled={importSaving}>
            {importSaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} 保存草稿
          </Button>
          <Button className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md" onClick={onConfirmDraft} disabled={importSaving || importDraft.status !== 'ready' || hasBlockingDiagnosticsError}>
            <Send className="mr-2 h-4 w-4" /> 完成并绑定
          </Button>
        </div>
      </header>

      {/* 核心工作区：左右严格分屏 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        
        {/* 左侧：结构校对面板 */}
        <aside className="flex w-full min-h-0 flex-col border-r border-slate-200 bg-slate-50/50 md:w-[500px] lg:w-[600px] shrink-0">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            
            {/* 诊断信息警告面板 */}
            {(hasUnboundPages || hasOverlappingPages || importDraft.parseError) && (
              <div className={`rounded-xl p-4 shadow-sm animate-in fade-in ${hasBlockingDiagnosticsError || importDraft.parseError ? 'border border-amber-200 bg-amber-50' : 'border border-sky-200 bg-sky-50'}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${hasBlockingDiagnosticsError || importDraft.parseError ? 'text-amber-600' : 'text-sky-600'}`} />
                  <div className="space-y-3 w-full">
                    <h3 className={`text-sm font-bold ${hasBlockingDiagnosticsError ? 'text-amber-900' : 'text-sky-900'}`}>
                      {hasBlockingDiagnosticsError ? '需要修复绑定冲突' : '有些页面未参与绑定，可先确认是否需要补充'}
                    </h3>
                    {importDraft.parseError && <p className="text-xs text-amber-700">{importDraft.parseError}</p>}
                    {!hasBlockingDiagnosticsError && !importDraft.parseError && (
                      <p className="text-xs text-sky-700">
                        这些页通常可能是封面、扉页、目录、插图页或留白页，不一定需要绑定到章节。
                      </p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {hasUnboundPages && (
                        <div className={`rounded-lg p-2 ${hasBlockingDiagnosticsError ? 'bg-white/60 border border-amber-100' : 'bg-white/70 border border-sky-100'} `}>
                          <span className={`font-semibold block mb-1 ${hasBlockingDiagnosticsError ? 'text-amber-800' : 'text-sky-800'}`}>未覆盖页（可忽略）</span>
                          <span className={hasBlockingDiagnosticsError ? 'text-amber-700' : 'text-sky-700'}>
                            {bindingDiagnostics.unboundPages.join(', ')}
                          </span>
                        </div>
                      )}
                      {hasOverlappingPages && (
                        <div className="rounded-lg bg-white/60 p-2 border border-amber-100">
                          <span className="font-semibold text-amber-800 block mb-1">重叠冲突页</span>
                          <span className="text-amber-700 break-words">{bindingDiagnostics.overlappingPages.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 目录结构树 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">提取的目录结构</h3>
                <Button variant="secondary" size="sm" className="h-8 rounded-full text-xs" onClick={onAddUnit}>
                  <Plus className="mr-1 h-3 w-3" /> 添加单元
                </Button>
              </div>

              <div className="space-y-4">
                {importDraft.units.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400 bg-white">
                    解析结果为空，请手动点击上方按钮添加目录。
                  </div>
                ) : (
                  importDraft.units.map((unit) => (
                    <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                      
                      {/* 单元头部 */}
                      <div className="flex items-center gap-2 bg-slate-50/80 p-3 border-b border-slate-100 group">
                        <GripVertical className="h-4 w-4 text-slate-300 cursor-grab active:cursor-grabbing" />
                        <Folder className="h-4 w-4 text-emerald-500 shrink-0" />
                        <Input
                          value={unit.title}
                          onChange={(e) => onUpdateUnit(unit.id, { title: e.target.value })}
                          className="h-8 border-none bg-transparent font-bold text-slate-800 focus-visible:ring-0 px-1 shadow-none"
                          placeholder="单元名称"
                        />
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => onMoveUnit(unit.id, -1)} title="上移">↑</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => onMoveUnit(unit.id, 1)} title="下移">↓</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => onRemoveUnit(unit.id)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>

                      {/* 章节列表 */}
                      <div className="p-2 space-y-1 bg-white">
                        {unit.chapters.map((chapter) => {
                          const confidencePercent = Math.round(
                            Math.max(0, Math.min(1, Number(chapter.confidence) || 0)) * 100,
                          );

                          return (
                            <div key={chapter.id} className="group flex flex-col gap-2 rounded-xl p-2 hover:bg-slate-50 transition-colors">
                              
                              {/* 第一行：标题与操作 */}
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-6" />
                                <Input
                                  value={chapter.title}
                                  onChange={(e) => onUpdateChapter(unit.id, chapter.id, { title: e.target.value })}
                                  className="h-7 border-none bg-transparent font-medium text-sm text-slate-700 focus-visible:ring-1 px-1.5 shadow-none"
                                  placeholder="章节名称"
                                />
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => onMoveChapter(unit.id, chapter.id, -1)}>↑</Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => onMoveChapter(unit.id, chapter.id, 1)}>↓</Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-rose-500" onClick={() => onRemoveChapter(unit.id, chapter.id)}><X className="h-3.5 w-3.5" /></Button>
                                </div>
                              </div>

                              {/* 第二行：页码与置信度 */}
                              <div className="flex items-center gap-3 pl-12 pr-2">
                                <div className="flex items-center gap-1.5 bg-slate-100/80 rounded-md p-1 shrink-0 border border-slate-200">
                                  <span className="text-[10px] text-slate-400 font-semibold px-1">P.</span>
                                  <Input
                                    type="number" min={1} value={chapter.pageStart}
                                    onChange={(e) => onUpdateChapter(unit.id, chapter.id, { pageStart: Number(e.target.value) || 1 })}
                                    className="h-6 w-12 text-center text-xs p-0 border-none bg-white shadow-sm focus-visible:ring-1"
                                  />
                                  <span className="text-[10px] text-slate-400">-</span>
                                  <Input
                                    type="number" min={1} value={chapter.pageEnd}
                                    onChange={(e) => onUpdateChapter(unit.id, chapter.id, { pageEnd: Number(e.target.value) || 1 })}
                                    className="h-6 w-12 text-center text-xs p-0 border-none bg-white shadow-sm focus-visible:ring-1"
                                  />
                                </div>
                                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                                  <div className="min-w-0 shrink-0">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-500">置信度</div>
                                    <div className="text-sm font-bold text-indigo-700">{confidencePercent}%</div>
                                  </div>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-indigo-100">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-300"
                                      style={{ width: `${confidencePercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                              
                            </div>
                          );
                        })}
                        
                        {/* 底部添加章节入口 */}
                        <div className="pl-12 py-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-400 hover:text-indigo-600" onClick={() => onAddChapter(unit.id)}>
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

        {/* 右侧：沉浸式 PDF 预览区 */}
        <main className="relative min-h-0 flex-1 bg-slate-900">
          {/* 这里可以加一个美观的加载占位符或工具栏 */}
          <iframe
            title="PDF 预览"
            src={`/api/textbook-libraries?action=downloadImportDraftSource&id=${encodeURIComponent(importDraft.id)}`}
            className="h-full w-full border-none shadow-inner bg-[#525659]" // Chrome 原生 PDF 浏览器的底色
          />
        </main>
      </div>
    </div>
  );
}
