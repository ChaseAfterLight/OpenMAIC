import type { PromptContextProvider } from '@/lib/module-host/types';

function getCoreStrategyLines(locale: 'zh-CN' | 'en-US', level: string): string[] {
  if (locale === 'zh-CN') {
    if (level === 'light') {
      return [
        '- 当前请求来自通用课堂生成场景。',
        '- 优先围绕用户原始需求和提供资料组织内容，不要套用特定学段或业务假设。',
      ];
    }

    if (level === 'professional') {
      return [
        '- 当前请求来自通用课堂生成场景。',
        '- 优先围绕用户原始需求、上传资料和检索结果组织内容，不要自行附会为某一固定业务模块。',
        '- 使用更清晰的结构和更准确的概念边界，让结果更适合正式讲解或系统学习。',
      ];
    }

    if (level === 'expert') {
      return [
        '- 当前请求来自通用课堂生成场景。',
        '- 优先围绕用户原始需求、上传资料和检索结果组织内容，不要自行附会为某一固定业务模块。',
        '- 需要使用更严谨的术语、结构和逻辑层次，确保结果适合深度讲解与复盘。',
        '- 当用户描述较粗略时，也要补足最小必要假设，但不能偏离原始需求。',
      ];
    }

    return [
      '- 当前请求来自通用课堂生成场景。',
      '- 优先围绕用户原始需求、上传资料和检索结果组织内容，不要套用特定学段或行业假设。',
      '- 在信息不足时做最小必要假设，保持表达清晰、可教、可学。',
    ];
  }

  if (level === 'light') {
    return [
      '- This request comes from the general classroom workflow.',
      '- Stay close to the user request and provided materials instead of assuming a specific domain.',
    ];
  }

  if (level === 'professional') {
    return [
      '- This request comes from the general classroom workflow.',
      '- Stay close to the user request, uploaded materials, and search results instead of assuming a specific business domain.',
      '- Use clearer structure and more precise terminology so the result is suitable for formal teaching or guided study.',
    ];
  }

  if (level === 'expert') {
    return [
      '- This request comes from the general classroom workflow.',
      '- Stay close to the user request, uploaded materials, and search results instead of assuming a specific business domain.',
      '- Use more rigorous terminology, structure, and conceptual boundaries so the result supports deep explanation and review.',
      '- When the request is broad, fill only the minimum necessary assumptions without drifting away from the original intent.',
    ];
  }

  return [
    '- This request comes from the general classroom workflow.',
    '- Stay close to the user request, uploaded materials, and search results instead of assuming a specific domain or audience.',
    '- Make only the minimum necessary assumptions when information is missing, and keep the result teachable and easy to follow.',
  ];
}

export const corePromptContextProvider: PromptContextProvider = {
  defaultPolicy: { level: 'balanced' },
  buildModuleContext({ locale, policy }) {
    const lines = getCoreStrategyLines(locale, policy.level);
    if (lines.length === 0) return '';

    return [
      locale === 'zh-CN' ? '## 通用模块上下文' : '## Core Module Context',
      '',
      ...lines,
    ].join('\n');
  },
  buildStageContext({ locale, stage }) {
    const zhMap = {
      outline: '- 输出应保持结构化、可执行，并让后续场景生成有足够清晰的教学意图。',
      slide: '- 页面内容要适合投屏阅读和口述讲解，避免信息堆叠。',
      quiz: '- 题目应聚焦刚讲过的核心概念，措辞清楚，难度一致。',
      interactive: '- 交互内容应让用户通过操作理解机制，反馈明确、状态可见。',
      pbl: '- PBL 任务需要目标、角色和产出清晰，避免过于开放导致无法执行。',
    } as const;
    const enMap = {
      outline:
        '- Keep the outline structured and actionable so later scene generation has clear teaching intent.',
      slide:
        '- Make slide content projector-friendly and easy to narrate. Avoid cramming too much information onto a single page.',
      quiz:
        '- Keep quiz wording clear, consistent in difficulty, and focused on the core concepts that were just taught.',
      interactive:
        '- Make interactive content explain the mechanism through user actions, with clear feedback and visible state changes.',
      pbl:
        '- Keep PBL goals, roles, and outputs explicit so the activity stays executable rather than overly open-ended.',
    } as const;

    return locale === 'zh-CN' ? zhMap[stage] : enMap[stage];
  },
};
