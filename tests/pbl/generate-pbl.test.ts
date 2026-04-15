import { describe, expect, it } from 'vitest';
import { resolvePBLModuleContext } from '@/lib/pbl/generate-pbl';
import { getDefaultK12StructuredInput, syncK12StructuredInput } from '@/lib/module-host/k12';
import type { K12ModulePresets } from '@/lib/module-host/types';
import { k12ModuleManifest } from '@/modules/k12/manifest';

const presets = k12ModuleManifest.presets as unknown as K12ModulePresets;

describe('resolvePBLModuleContext', () => {
  it('builds prompt policy context for core PBL generation when no explicit moduleContext is provided', () => {
    const context = resolvePBLModuleContext({
      moduleId: 'core',
      language: 'en-US',
      promptPolicy: { level: 'professional' },
    });

    expect(context).toContain('## Prompt Policy');
    expect(context).toContain('formal teaching, training, or guided explanation');
    expect(context).toContain('## Core Module Context');
    expect(context).toContain('Keep PBL goals, roles, and outputs explicit');
  });

  it('keeps K12-compatible context generation for PBL when module metadata is provided', () => {
    const k12 = syncK12StructuredInput(
      {
        ...getDefaultK12StructuredInput(presets),
        textbookEditionId: 'pep-elementary-math',
      },
      presets,
    );

    const context = resolvePBLModuleContext({
      moduleId: 'k12',
      language: 'zh-CN',
      promptPolicy: { level: 'expert' },
      k12,
    });

    expect(context).toContain('## 提示词策略');
    expect(context).toContain('当前请求来自教师备课场景');
    expect(context).toContain('优先围绕章节摘要、关键词和教材资料组织课堂内容');
    expect(context).toContain('PBL 任务必须脚手架清晰、目标具体');
  });

  it('prefers explicit moduleContext to preserve compatibility for direct callers', () => {
    const context = resolvePBLModuleContext({
      language: 'zh-CN',
      moduleContext: 'custom context',
    });

    expect(context).toBe('custom context');
  });
});
