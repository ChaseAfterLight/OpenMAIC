'use client';

import { useState } from 'react';
import { Book, Search, CheckCircle2, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// 模拟数据结构
export interface Textbook {
  id: string;
  name: string;
  cover?: string;
  edition: string;
}

interface Chapter {
  id: string;
  title: string;
  children?: Chapter[];
}

interface TextbookLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (textbook: Textbook, chapterPath: string[], chapterTitle: string) => void;
}

export function TextbookLibraryModal({ open, onOpenChange, onSelect }: TextbookLibraryModalProps) {
  // 选中的教材
  const [activeBook, setActiveBook] = useState<Textbook | null>(null);
  // 选中的章节 ID 路径
  const [activeChapterPath, setActiveChapterPath] = useState<string[]>([]);
  const [activeChapterLabelPath, setActiveChapterLabelPath] = useState<string[]>([]);

  // 模拟一些占位数据
  const mockBooks: Textbook[] = [
    {
      id: 'b1',
      name: '四年级上册 数学',
      edition: '人教版',
    },
    {
      id: 'b2',
      name: '三年级上册 数学',
      edition: '人教版',
    },
    {
      id: 'b3',
      name: '五年级上册 数学',
      edition: '人教版',
    },
  ];

  const mockChapters: Chapter[] = [
    {
      id: 'c1',
      title: '第一章 有理数',
      children: [
        { id: 'c1-1', title: '1.1 正数和负数' },
        { id: 'c1-2', title: '1.2 有理数' },
      ],
    },
    {
      id: 'c2',
      title: '第二章 整式的加减',
      children: [
        { id: 'c2-1', title: '2.1 整式' },
        { id: 'c2-2', title: '2.2 整式的加减' },
      ],
    },
  ];

  const handleConfirm = () => {
    if (activeBook && activeChapterPath.length > 0) {
      onSelect(activeBook, activeChapterPath, activeChapterLabelPath.join(' · '));
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 使用超大弹窗，高度几乎占满屏幕 */}
      <DialogContent className="max-w-[1000px] h-[85vh] p-0 flex flex-col overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 shadow-2xl">
        {/* 顶部导航条 */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-row items-center justify-between sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="size-5 text-indigo-500" />
            教材资源中心
          </DialogTitle>

          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="搜索教材名称或版本..."
                className="h-9 pl-9 rounded-full bg-slate-100 border-transparent dark:bg-slate-800 focus-visible:bg-white"
              />
            </div>
            <Button
              onClick={handleConfirm}
              disabled={!activeBook || activeChapterPath.length === 0}
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 h-9 px-6"
            >
              确认选择
            </Button>
          </div>
        </DialogHeader>

        {/* 主体内容区：左右分栏 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：教材平铺列表 (类似模板中心) */}
          <div className="flex-[2] overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">全部教材</h3>
              {/* 可以在这里加一些年级/学科的筛选项 */}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {mockBooks.map((book) => {
                const isSelected = activeBook?.id === book.id;
                return (
                  <div
                    key={book.id}
                    onClick={() => {
                      setActiveBook(book);
                      setActiveChapterPath([]);
                      setActiveChapterLabelPath([]);
                    }}
                    className={cn(
                      'group relative flex flex-col gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer bg-white dark:bg-slate-900',
                      isSelected
                        ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                        : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm',
                    )}
                  >
                    {/* 模拟教材封面 */}
                    <div className="aspect-[3/4] w-full bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center overflow-hidden relative">
                      {book.cover ? (
                        <img
                          src={book.cover}
                          alt={book.name}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <Book className="size-10 text-slate-300 dark:text-slate-600" />
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm">
                          <CheckCircle2 className="size-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 px-1">
                      <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100 line-clamp-1">
                        {book.name}
                      </h4>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 rounded-md bg-slate-100 dark:bg-slate-800"
                        >
                          {book.edition}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右侧：章节树 (只有选中教材后才展示内容) */}
          <div className="flex-[1] min-w-[320px] border-l border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-col">
            {activeBook ? (
              <>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">选择章节</h3>
                  <p className="text-xs text-slate-500 mt-1">当前教材：{activeBook.name}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {/* 递归渲染章节树 */}
                  <div className="space-y-1">
                    {mockChapters.map((chapter) => (
                      <div key={chapter.id} className="space-y-1">
                        <div className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                          {chapter.title}
                        </div>
                        {chapter.children?.map((child) => {
                          const isSelected = activeChapterPath.includes(child.id);
                          return (
                            <button
                              key={child.id}
                              onClick={() => {
                                setActiveChapterPath([chapter.id, child.id]);
                                setActiveChapterLabelPath([chapter.title, child.title]);
                              }}
                              className={cn(
                                'w-full text-left flex items-center justify-between px-3 py-2 ml-2 text-sm rounded-lg transition-colors',
                                isSelected
                                  ? 'bg-indigo-50 text-indigo-600 font-medium dark:bg-indigo-500/15 dark:text-indigo-400'
                                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
                              )}
                            >
                              {child.title}
                              {isSelected && <CheckCircle2 className="size-4" />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <BookOpen className="size-12 opacity-20 mb-4" />
                <p className="text-sm">请先在左侧选择一本教材</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
