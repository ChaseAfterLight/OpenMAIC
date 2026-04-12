import { buildK12StructuredContext } from '@/lib/module-host/k12';
import type {
  K12ModulePresets,
  PromptContextProvider,
  SupportedLocale,
} from '@/lib/module-host/types';

function buildBalancedK12Lines(locale: SupportedLocale): string[] {
  if (locale === 'zh-CN') {
    return [
      '- 当前请求来自小学教师备课场景，而不是通用自学场景。',
      '- 如果用户没有明确说明，默认按小学 3-6 年级理解。',
      '- 输出目标应偏向“教师可直接拿去上课或改课”的教学包，而不是泛化科普内容。',
      '- 优先生成 slide 和 quiz 场景；只有在交互确实能帮助理解时才使用 interactive；除非用户明确要求，否则不要使用 pbl。',
      '- 语言要适龄、具体、可课堂口述，避免成人化、抽象化、研究型表达。',
      '- 适当加入导入、例题、随堂提问、巩固练习和课堂总结，让结果更像真实的小学课堂。',
      '- 如果已经选了教材章节，应优先围绕章节摘要、关键词和教材资料组织课堂内容，而不是忽略教材来源。',
      '- 如果学科未说明，请优先依据老师补充要求与上传资料组织内容，不要自行假定为某一学科。',
    ];
  }

  return [
    '- This request comes from an elementary teacher workflow, not a general self-learning workflow.',
    '- If the user does not specify otherwise, assume upper elementary grades (roughly grades 3-6).',
    '- Produce a teacher-ready lesson pack rather than a generic explainer.',
    '- Prefer slide and quiz scenes. Use interactive scenes only when interaction clearly improves understanding. Avoid pbl unless the user explicitly asks for project-based learning.',
    '- Keep the language age-appropriate, concrete, and classroom-friendly. Avoid abstract, research-heavy, or adult-oriented phrasing.',
    '- Include helpful classroom structure such as warm-up, worked examples, guided questioning, practice, and wrap-up when suitable.',
    '- When a textbook chapter is selected, prioritize the chapter summary, keywords, and attached source materials rather than treating the request as a generic topic prompt.',
    '- If the subject is not specified, prioritize the teacher notes and uploaded materials instead of assuming a specific subject.',
  ];
}

function buildK12Lines(locale: SupportedLocale, level: string): string[] {
  const balanced = buildBalancedK12Lines(locale);

  if (level === 'light') {
    return balanced.slice(0, 5);
  }

  if (level === 'professional') {
    return [
      ...balanced,
      locale === 'zh-CN'
        ? '- 对课堂节奏、概念边界和练习层次保持更强的结构感，让结果更适合正式备课。'
        : '- Use stronger structure for pacing, concept boundaries, and practice progression so the result is ready for formal lesson planning.',
    ];
  }

  if (level === 'expert') {
    return [
      ...balanced,
      locale === 'zh-CN'
        ? '- 需要以更高标准保证知识表述准确、教学步骤完整、活动安排可执行，并兼顾课堂管理与理解递进。'
        : '- Hold the output to a higher standard of conceptual accuracy, teaching completeness, and classroom executability, including pacing and management considerations.',
      locale === 'zh-CN'
        ? '- 如果老师需求较粗略，也要补足必要的教学脚手架，但不能偏离教师原始意图。'
        : '- When the teacher request is broad, add the minimum necessary teaching scaffolding without drifting from the original intent.',
    ];
  }

  return balanced;
}

export const k12PromptContextProvider: PromptContextProvider = {
  defaultPolicy: { level: 'balanced' },
  buildModuleContext({ locale, policy, k12, presets }) {
    const structuredContext = buildK12StructuredContext(
      k12,
      presets as K12ModulePresets | undefined,
      locale,
    );

    return [
      locale === 'zh-CN' ? '## K12 模块上下文' : '## K12 Module Context',
      '',
      ...buildK12Lines(locale, policy.level),
      structuredContext,
      '',
      locale === 'zh-CN'
        ? '请在不违背用户原始需求的前提下，优先满足以上 K12 业务约束。'
        : 'Apply these K12 constraints without contradicting the user request.',
    ]
      .filter(Boolean)
      .join('\n');
  },
  buildStageContext({ locale, stage }) {
    if (locale === 'zh-CN') {
      const stageLines = {
        outline: '- 大纲需要直接服务于老师备课，确保每个场景都能落到真实课堂环节。',
        quiz: '- 题目要简洁清楚，避免陷阱式提问，优先考查课堂刚讲过的核心概念。',
        interactive: '- 交互页面应操作简单、反馈明确，适合小学课堂演示和学生跟随观察。',
        pbl: '- PBL 任务必须脚手架清晰、目标具体，确保小学生能够在教师引导下完成。',
        slide: '- 页面内容要适合投屏和教师口述，重点突出，避免信息堆叠。',
      } as const;
      return stageLines[stage];
    }

    const stageLines = {
      outline:
        '- The outline should directly support teacher planning so each scene maps cleanly to a real classroom moment.',
      quiz:
        '- Keep quiz questions clear and direct. Avoid trick wording and focus on concepts just taught in class.',
      interactive:
        '- Keep the interactive page simple, guided, and easy for an elementary classroom to follow.',
      pbl:
        '- Scaffold the PBL workflow carefully so elementary students can complete it with teacher guidance.',
      slide:
        '- Make the slide content projector-friendly and easy for a teacher to narrate. Keep emphasis clear and avoid clutter.',
    } as const;
    return stageLines[stage];
  },
};
