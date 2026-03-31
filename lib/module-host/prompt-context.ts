import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import { buildK12StructuredContext } from './k12';
import { getModuleById } from './runtime';
import type {
  K12ModulePresets,
  ModuleId,
  SupportedLocale,
} from './types';

function resolveLocale(language: UserRequirements['language']): SupportedLocale {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function resolveRequirementModuleId(requirements: Pick<UserRequirements, 'moduleId'>): ModuleId {
  return requirements.moduleId ?? 'core';
}

export function buildOutlineModuleContext(
  requirements: Pick<UserRequirements, 'moduleId' | 'language' | 'k12'>,
): string {
  const moduleId = resolveRequirementModuleId(requirements);
  const locale = resolveLocale(requirements.language);

  if (moduleId !== 'k12') return '';

  const k12Presets = getModuleById('k12').presets as K12ModulePresets | undefined;
  const structuredContext = buildK12StructuredContext(requirements.k12, k12Presets, locale);

  if (locale === 'zh-CN') {
    return [
      '## K12 模块上下文',
      '',
      '- 当前请求来自小学教师备课场景，而不是通用自学场景。',
      '- 如果用户没有明确说明，默认按小学 3-6 年级理解。',
      '- 输出目标应偏向“教师可直接拿去上课或改课”的教学包，而不是泛化科普内容。',
      '- 优先生成 slide 和 quiz 场景；只有在交互确实能帮助理解时才使用 interactive；除非用户明确要求，否则不要使用 pbl。',
      '- 语言要适龄、具体、可课堂口述，避免成人化、抽象化、研究型表达。',
      '- 适当加入导入、例题、随堂提问、巩固练习和课堂总结，让结果更像真实的小学课堂。',
      '- 如果已经选了教材章节，应优先围绕章节摘要、关键词和教材资料组织课堂内容，而不是忽略教材来源。',
      '- 如果学科未说明，可优先按小学数学风格组织内容：概念讲解、例题示范、分步练习。',
      structuredContext,
      '',
      '请在不违背用户原始需求的前提下，优先满足以上 K12 业务约束。',
    ].join('\n');
  }

  return [
    '## K12 Module Context',
    '',
    '- This request comes from an elementary teacher workflow, not a general self-learning workflow.',
    '- If the user does not specify otherwise, assume upper elementary grades (roughly grades 3-6).',
    '- Produce a teacher-ready lesson pack rather than a generic explainer.',
    '- Prefer slide and quiz scenes. Use interactive scenes only when interaction clearly improves understanding. Avoid pbl unless the user explicitly asks for project-based learning.',
    '- Keep the language age-appropriate, concrete, and classroom-friendly. Avoid abstract, research-heavy, or adult-oriented phrasing.',
    '- Include helpful classroom structure such as warm-up, worked examples, guided questioning, practice, and wrap-up when suitable.',
    '- When a textbook chapter is selected, prioritize the chapter summary, keywords, and attached source materials rather than treating the request as a generic topic prompt.',
    '- If the subject is not specified, you may default toward elementary math structure: concept explanation, worked example, and guided practice.',
    structuredContext,
    '',
    'Apply these K12 constraints without contradicting the user request.',
  ].join('\n');
}

export function buildSceneModuleContext(
  outline: Pick<SceneOutline, 'moduleId' | 'language' | 'k12' | 'type'>,
): string {
  const baseContext = buildOutlineModuleContext({
    moduleId: outline.moduleId,
    language: outline.language ?? 'zh-CN',
    k12: outline.k12,
  });

  if (!baseContext || outline.moduleId !== 'k12') return '';

  if ((outline.language ?? 'zh-CN') === 'zh-CN') {
    const sceneSpecific =
      outline.type === 'quiz'
        ? '- 题目要简洁清楚，避免陷阱式提问，优先考查课堂刚讲过的核心概念。'
        : outline.type === 'interactive'
          ? '- 交互页面应操作简单、反馈明确，适合小学课堂演示和学生跟随观察。'
          : outline.type === 'pbl'
            ? '- PBL 任务必须脚手架清晰、目标具体，确保小学生能够在教师引导下完成。'
            : '- 页面内容要适合投屏和教师口述，重点突出，避免信息堆叠。';
    return [baseContext, sceneSpecific].join('\n');
  }

  const sceneSpecific =
    outline.type === 'quiz'
      ? '- Keep quiz questions clear and direct. Avoid trick wording and focus on concepts just taught in class.'
      : outline.type === 'interactive'
        ? '- Keep the interactive page simple, guided, and easy for an elementary classroom to follow.'
        : outline.type === 'pbl'
          ? '- Scaffold the PBL workflow carefully so elementary students can complete it with teacher guidance.'
          : '- Make the slide content projector-friendly and easy for a teacher to narrate. Keep emphasis clear and avoid clutter.';
  return [baseContext, sceneSpecific].join('\n');
}
