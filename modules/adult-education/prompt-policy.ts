import { buildEducationStructuredContext } from '@/lib/module-host/education';
import type {
  K12ModulePresets,
  PromptContextProvider,
  SupportedLocale,
} from '@/lib/module-host/types';

function buildBalancedAdultLines(locale: SupportedLocale): string[] {
  if (locale === 'zh-CN') {
    return [
      '- 当前请求来自成人学习、职业培训或继续教育场景，而不是小学课堂场景。',
      '- 输出应偏向可直接用于培训、进修或自主提升的课程包，而不是低龄课堂讲稿。',
      '- 优先围绕真实工作任务、案例、流程、规范和迁移应用来组织内容。',
      '- 语言可以更专业、更紧凑，但仍需清楚、可教、可执行。',
      '- 优先使用 slide、quiz 和 interactive 场景来支撑讲解、演示和练习；仅在确有必要时使用 pbl。',
      '- 如果已经链接资源章节或课程资料，应优先围绕这些资料组织内容，而不是忽略资源来源。',
      '- 当用户没有写明学员基础时，默认按具备基础阅读理解能力的成人学习者处理。',
    ];
  }

  return [
    '- This request comes from an adult learning, workforce training, or continuing education workflow, not an elementary classroom workflow.',
    '- Produce a training-ready lesson pack rather than a child-oriented classroom script.',
    '- Organize the lesson around real tasks, cases, workflows, standards, and transfer into practice.',
    '- The language may be more professional and compact, but it must remain teachable and executable.',
    '- Prefer slide, quiz, and interactive scenes for explanation, demonstration, and practice. Use pbl only when it is clearly needed.',
    '- When linked resources are available, prioritize them instead of treating the request as a generic topic prompt.',
    '- If learner background is not specified, assume adult learners with baseline reading comprehension and practical motivation.',
  ];
}

function buildAdultLines(locale: SupportedLocale, level: string): string[] {
  const balanced = buildBalancedAdultLines(locale);

  if (level === 'light') {
    return balanced.slice(0, 5);
  }

  if (level === 'professional') {
    return [
      ...balanced,
      locale === 'zh-CN'
        ? '- 对任务拆解、案例组织、练习反馈和知识迁移保持更强的结构感，使结果更适合正式培训。'
        : '- Use stronger structure for task breakdown, case framing, practice feedback, and transfer into work so the result is ready for formal training.',
    ];
  }

  if (level === 'expert') {
    return [
      ...balanced,
      locale === 'zh-CN'
        ? '- 需要以更高标准保证术语准确、流程完整、案例可信，并兼顾培训节奏与学员可执行性。'
        : '- Hold the output to a higher standard of terminology accuracy, workflow completeness, case realism, and learner executability.',
      locale === 'zh-CN'
        ? '- 当需求较粗略时，也要补足必要的案例、练习和复盘脚手架，但不能偏离用户原始目标。'
        : '- When the request is broad, add the minimum necessary case, practice, and review scaffolding without drifting from the original goal.',
    ];
  }

  return balanced;
}

export const adultEducationPromptContextProvider: PromptContextProvider = {
  defaultPolicy: { level: 'balanced' },
  buildModuleContext({ locale, policy, k12, presets }) {
    const structuredContext = buildEducationStructuredContext(
      k12,
      presets as K12ModulePresets | undefined,
      locale,
    );

    return [
      locale === 'zh-CN' ? '## 成人教育模块上下文' : '## Adult Education Module Context',
      '',
      ...buildAdultLines(locale, policy.level),
      structuredContext,
      '',
      locale === 'zh-CN'
        ? '请在不违背用户原始需求的前提下，优先满足以上成人教育业务约束。'
        : 'Apply these adult education constraints without contradicting the user request.',
    ]
      .filter(Boolean)
      .join('\n');
  },
  buildStageContext({ locale, stage }) {
    if (locale === 'zh-CN') {
      const stageLines = {
        outline: '- 大纲必须直接服务于培训实施或成人学习路径，确保每个场景对应明确的教学动作。',
        quiz: '- 题目必须聚焦刚学习的关键概念、流程或判断标准，避免幼态化措辞。',
        interactive: '- 交互内容应帮助学员理解机制、流程或决策反馈，适合演示和实操前训练。',
        pbl: '- 仅在项目式学习确实有助于训练成果时使用，并且必须明确目标、产出和评估标准。',
        slide: '- 页面内容要适合培训投屏与讲师口述，重点突出，便于案例讲解和流程拆解。',
      } as const;
      return stageLines[stage];
    }

    const stageLines = {
      outline:
        '- The outline should directly support training delivery or adult learning progression, with each scene mapped to a clear teaching move.',
      quiz:
        '- Keep quiz questions focused on the concepts, workflows, or decision criteria just taught, without child-oriented phrasing.',
      interactive:
        '- Interactive content should clarify mechanisms, workflows, or decision feedback and fit guided demonstration or pre-practice training.',
      pbl:
        '- Use pbl only when project-based work clearly helps the learning goal, and keep outcomes, deliverables, and evaluation criteria explicit.',
      slide:
        '- Make slide content projector-friendly for training delivery, with clear emphasis for case walkthroughs and workflow breakdowns.',
    } as const;
    return stageLines[stage];
  },
};
