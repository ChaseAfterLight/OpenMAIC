import { describe, expect, it } from 'vitest';
import {
  buildOutlineModuleContext,
  buildSceneModuleContext,
  composePromptContext,
} from '@/lib/module-host/prompt-context';
import { getDefaultEducationStructuredInput } from '@/lib/module-host/education';
import { getDefaultK12StructuredInput, syncK12StructuredInput } from '@/lib/module-host/k12';
import type { K12ModulePresets } from '@/lib/module-host/types';
import { adultEducationModuleManifest } from '@/modules/adult-education/manifest';
import { k12ModuleManifest } from '@/modules/k12/manifest';

const presets = k12ModuleManifest.presets as unknown as K12ModulePresets;
const adultPresets = adultEducationModuleManifest.presets as unknown as K12ModulePresets;

describe('prompt context composer', () => {
  it('composes hard rules, strategy, module, source, and stage context in a stable order', () => {
    const result = composePromptContext({
      moduleId: 'core',
      language: 'zh-CN',
      stage: 'slide',
      hardRules: ['## Hard Rules\n- 保持 JSON 输出'],
      sourceContext: ['## Sources\n- 使用老师上传资料'],
    });

    expect(result.policy.level).toBe('balanced');
    expect(result.content.indexOf('## Hard Rules')).toBeLessThan(
      result.content.indexOf('## 提示词策略'),
    );
    expect(result.content.indexOf('## 提示词策略')).toBeLessThan(
      result.content.indexOf('## 通用模块上下文'),
    );
    expect(result.content.indexOf('## 通用模块上下文')).toBeLessThan(
      result.content.indexOf('## Sources'),
    );
    expect(result.content).toContain('页面内容要适合投屏阅读和口述讲解');
  });

  it('keeps default K12 outline guidance compatible with the previous behavior', () => {
    const input = syncK12StructuredInput(
      {
        ...getDefaultK12StructuredInput(presets),
        textbookEditionId: 'pep-elementary-math',
      },
      presets,
    );

    const context = buildOutlineModuleContext({
      moduleId: 'k12',
      language: 'zh-CN',
      k12: input,
    });

    expect(context).toContain('当前请求来自教师备课场景');
    expect(context).toContain('教师可直接拿去上课或改课');
    expect(context).toContain('优先围绕章节摘要、关键词和教材资料组织课堂内容');
    expect(context).toContain('### 当前结构化备课参数');
    expect(context).toContain('亿以内数的认识');
  });

  it('uses module providers for non-k12 modules without shared special-case branches', () => {
    const context = buildSceneModuleContext({
      moduleId: 'core',
      language: 'en-US',
      type: 'quiz',
      promptPolicy: { level: 'expert' },
    });

    expect(context).toContain('## Prompt Policy');
    expect(context).toContain('## Core Module Context');
    expect(context).toContain('expert-level terminology');
    expect(context).toContain('Keep quiz wording clear');
  });

  it('uses adult education module provider context for adult-education workflows', () => {
    const context = buildOutlineModuleContext({
      moduleId: 'adult-education',
      language: 'zh-CN',
      k12: getDefaultEducationStructuredInput(adultPresets),
      promptPolicy: { level: 'professional' },
    });

    expect(context).toContain('## 成人教育模块上下文');
    expect(context).toContain('成人学习、职业培训或继续教育场景');
    expect(context).toContain('工作坊');
    expect(context).not.toContain('教师备课场景');
  });
});
