import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import { getModuleById } from './runtime';
import type {
  ModuleId,
  PromptContextProvider,
  PromptPolicy,
  PromptPolicyLevel,
  PromptPolicyStage,
  SupportedLocale,
} from './types';

export interface PromptContextComposeArgs {
  moduleId?: ModuleId;
  language: UserRequirements['language'];
  stage: PromptPolicyStage;
  policy?: PromptPolicy;
  k12?: UserRequirements['k12'];
  hardRules?: string | string[];
  sourceContext?: string | string[];
}

export interface PromptContextComposeResult {
  policy: PromptPolicy;
  hardRules: string[];
  strategyContext: string;
  moduleContext: string;
  sourceContext: string[];
  stageContext: string;
  content: string;
}

const DEFAULT_PROMPT_POLICY: PromptPolicy = {
  level: 'balanced',
};

function resolveLocale(language: UserRequirements['language']): SupportedLocale {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function resolveRequirementModuleId(requirements: Pick<UserRequirements, 'moduleId'>): ModuleId {
  return requirements.moduleId ?? 'core';
}

function normalizePromptPolicy(
  policy: PromptPolicy | undefined,
  provider: PromptContextProvider | undefined,
): PromptPolicy {
  return {
    level: policy?.level ?? provider?.defaultPolicy?.level ?? DEFAULT_PROMPT_POLICY.level,
  };
}

function normalizeContextLines(value?: string | string[]): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => entry.trim()).filter(Boolean);
}

function buildStrategyContext(
  locale: SupportedLocale,
  level: PromptPolicyLevel,
  stage: PromptPolicyStage,
): string {
  const zhBase = {
    light: [
      '- 以清楚、自然、低负担的方式表达内容，不过度增加术语和限制。',
      '- 优先尊重用户原始需求，只补足最必要的结构约束。',
    ],
    balanced: [
      '- 在尊重用户原始需求的前提下，保持结构清楚、术语适中、结果可直接使用。',
      '- 当信息不足时，补足最小必要的假设与组织结构，但不要擅自扩大范围。',
    ],
    professional: [
      '- 使用更专业的术语、结构和表达方式，让结果更适合正式教学、培训或系统讲解。',
      '- 对概念边界、步骤顺序和内容完整性保持更高要求，但不要牺牲可读性。',
    ],
    expert: [
      '- 使用专家级表达和结构化约束，强调概念准确性、逻辑层次和结果完整性。',
      '- 当用户需求较粗略时，也要补足必要的专业脚手架，并确保结论可复核、可执行。',
    ],
  } as const;
  const enBase = {
    light: [
      '- Keep the content clear, natural, and lightweight without adding unnecessary jargon or constraints.',
      '- Stay close to the original request and add only the minimum structure needed.',
    ],
    balanced: [
      '- Keep the result structured, moderately professional, and ready to use while respecting the original request.',
      '- When information is missing, add only the minimum assumptions and organization needed to keep the output coherent.',
    ],
    professional: [
      '- Use more professional terminology, structure, and phrasing so the result works for formal teaching, training, or guided explanation.',
      '- Hold a higher bar for conceptual boundaries, sequencing, and completeness without sacrificing readability.',
    ],
    expert: [
      '- Use expert-level terminology and structure, with stronger emphasis on conceptual accuracy, logical layering, and completeness.',
      '- When the request is rough, add the minimum necessary expert scaffolding so the result stays reviewable and executable.',
    ],
  } as const;

  const stageLine =
    locale === 'zh-CN'
      ? stage === 'outline'
        ? '- 当前阶段目标是生成可继续扩展的大纲，而不是直接输出最终课件。'
        : '- 当前阶段目标是把大纲落实为可直接使用的具体场景内容或动作。'
      : stage === 'outline'
        ? '- The current stage is outline generation, so focus on a reusable structure rather than final slide-level detail.'
        : '- The current stage is scene realization, so turn the outline into concrete, ready-to-use content or actions.';

  const lines = locale === 'zh-CN' ? zhBase[level] : enBase[level];
  return [
    locale === 'zh-CN' ? '## 提示词策略' : '## Prompt Policy',
    '',
    ...lines,
    stageLine,
  ].join('\n');
}

export function composePromptContext(args: PromptContextComposeArgs): PromptContextComposeResult {
  const moduleId = resolveRequirementModuleId(args);
  const locale = resolveLocale(args.language);
  const module = getModuleById(moduleId);
  const provider = module.promptContext;
  const policy = normalizePromptPolicy(args.policy, provider);
  const hardRules = normalizeContextLines(args.hardRules);
  const sourceContext = normalizeContextLines(args.sourceContext);
  const strategyContext = buildStrategyContext(locale, policy.level, args.stage);
  const moduleContext =
    provider?.buildModuleContext?.({
      moduleId,
      locale,
      stage: args.stage,
      policy,
      k12: args.k12,
      presets: module.presets,
    }) ?? '';
  const stageContext =
    provider?.buildStageContext?.({
      moduleId,
      locale,
      stage: args.stage,
      policy,
      k12: args.k12,
      presets: module.presets,
    }) ?? '';
  const content = [
    ...hardRules,
    strategyContext,
    moduleContext,
    ...sourceContext,
    stageContext,
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    policy,
    hardRules,
    strategyContext,
    moduleContext,
    sourceContext,
    stageContext,
    content,
  };
}

export function buildOutlineModuleContext(
  requirements: Pick<UserRequirements, 'moduleId' | 'language' | 'k12' | 'promptPolicy'>,
): string {
  return composePromptContext({
    moduleId: requirements.moduleId,
    language: requirements.language,
    stage: 'outline',
    policy: requirements.promptPolicy,
    k12: requirements.k12,
  }).content;
}

export function buildSceneModuleContext(
  outline: Pick<SceneOutline, 'moduleId' | 'language' | 'k12' | 'type' | 'promptPolicy'>,
): string {
  return composePromptContext({
    moduleId: outline.moduleId,
    language: outline.language ?? 'zh-CN',
    stage: outline.type,
    policy: outline.promptPolicy,
    k12: outline.k12,
  }).content;
}
