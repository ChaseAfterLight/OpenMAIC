'use client';

import type { ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface WorkbenchSidebarShellProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  desktopSidebar: ReactNode;
  mobileSidebar: ReactNode;
  header: ReactNode;
  controls: ReactNode;
  content: ReactNode;
  mobileTitle: string;
  mobileDescription: string;
  createLabel: string;
  onCreate: () => void;
}

export function WorkbenchSidebarShell({
  collapsed,
  onToggleCollapsed,
  desktopSidebar,
  mobileSidebar,
  header,
  controls,
  content,
  mobileTitle,
  mobileDescription,
  createLabel,
  onCreate,
}: WorkbenchSidebarShellProps) {
  return (
    <main className="mx-auto flex w-full max-w-[1880px] flex-col gap-6 px-4 py-6 sm:px-6 xl:px-10 2xl:px-12">
      {header}

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-10 rounded-xl border-slate-200 bg-white/80 px-3 dark:border-slate-800 dark:bg-slate-950/80">
              <Menu className="mr-2 size-4" />
              {mobileTitle}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] max-w-[380px] gap-0 border-slate-200 bg-slate-50 p-0 dark:border-slate-800 dark:bg-slate-950">
            <SheetHeader className="border-b border-slate-200/70 px-5 py-4 dark:border-slate-800/70">
              <SheetTitle>{mobileTitle}</SheetTitle>
              <SheetDescription>{mobileDescription}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{mobileSidebar}</div>
          </SheetContent>
        </Sheet>

        <Button onClick={onCreate} className="h-10 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-700">
          <Plus className="mr-2 size-4" />
          {createLabel}
        </Button>
      </div>

      <div className="grid min-h-0 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <aside
          className={cn(
            'sticky top-24 hidden h-[calc(100dvh-8rem)] overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur-xl transition-all duration-200 dark:border-slate-800/70 dark:bg-slate-950/85 lg:flex lg:flex-col',
            collapsed ? 'w-[88px]' : 'w-[300px]',
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
            <span className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-slate-400', collapsed && 'sr-only')}>
              Workbench
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{desktopSidebar}</div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {controls}
          {content}
        </div>
      </div>
    </main>
  );
}
