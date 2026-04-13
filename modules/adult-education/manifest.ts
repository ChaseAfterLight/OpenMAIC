import type { BusinessModule, K12ModulePresets } from '@/lib/module-host/types';
import { adultEducationPromptContextProvider } from './prompt-policy';
import { adultFoundationProfilePreset } from './presets/profile/adult-foundation';
import { adultProfessionalSkillsSubjectPreset } from './presets/subject/professional-skills';
import { adultWorkshopLessonTypePreset } from './presets/lesson-type/workshop';

const adultEducationPresets: K12ModulePresets = {
  grades: [
    {
      id: 'adult-foundation',
      label: { 'zh-CN': '成人入门', 'en-US': 'Adult Foundation' },
    },
    {
      id: 'adult-upskilling',
      label: { 'zh-CN': '进阶提升', 'en-US': 'Upskilling' },
    },
    {
      id: 'adult-certification',
      label: { 'zh-CN': '认证备考', 'en-US': 'Certification Prep' },
    },
  ],
  subjects: [
    {
      id: 'professional-skills',
      label: { 'zh-CN': '职业技能', 'en-US': 'Professional Skills' },
    },
    {
      id: 'digital-tools',
      label: { 'zh-CN': '数字工具', 'en-US': 'Digital Tools' },
    },
    {
      id: 'management',
      label: { 'zh-CN': '管理进修', 'en-US': 'Management' },
    },
  ],
  lessonTypes: [
    {
      id: 'workshop',
      label: { 'zh-CN': '工作坊', 'en-US': 'Workshop' },
    },
    {
      id: 'case-study',
      label: { 'zh-CN': '案例研讨', 'en-US': 'Case Study' },
    },
    {
      id: 'bootcamp',
      label: { 'zh-CN': '集训提升', 'en-US': 'Bootcamp' },
    },
  ],
  durations: [45, 60, 90],
  textbookEditions: [],
  defaults: {
    gradeId: 'adult-foundation',
    subjectId: 'professional-skills',
    lessonTypeId: 'workshop',
    durationMinutes: 60,
  },
};

export const adultEducationModuleManifest: BusinessModule = {
  id: 'adult-education',
  name: 'Adult Education',
  version: '1.0.0',
  enabled: true,
  capabilities: ['generation', 'validation', 'export', 'template', 'ui'],
  routes: {
    home: '/adult-education',
    setup: '/settings',
    generator: '/generation-preview',
    preview: '/classroom',
  },
  metadata: {
    applicationName: 'OpenMAIC Adult Education',
    title: {
      'zh-CN': 'OpenMAIC 成人教育',
      'en-US': 'OpenMAIC Adult Education',
    },
    description: {
      'zh-CN': '面向成人学习、职业培训与继续教育的 AI 课程生成工作台。',
      'en-US':
        'An AI lesson planning and training generation workspace for adult learning and workforce education.',
    },
  },
  promptContext: adultEducationPromptContextProvider,
  home: {
    badge: {
      'zh-CN': '成人教育',
      'en-US': 'Adult Education',
    },
    slogan: {
      'zh-CN': '从课程资料与训练目标出发，快速生成适合成人学习的培训包',
      'en-US': 'Turn training goals and source materials into adult-learning-ready lesson packs',
    },
    requirementPlaceholder: {
      'zh-CN':
        '先选择课程资料或资源章节，再补充讲师需求，例如受众基础、案例方向、练习强度、培训语气或考核方式。',
      'en-US':
        'Link course materials first, then add trainer notes such as learner background, case direction, practice intensity, tone, or assessment style.',
    },
    submitLabel: {
      'zh-CN': '生成培训包',
      'en-US': 'Generate Training Pack',
    },
    footerText: {
      'zh-CN': 'OpenMAIC Adult Education Module Preview',
      'en-US': 'OpenMAIC Adult Education Module Preview',
    },
    quickPrompts: {
      'zh-CN': [
        '多用真实工作案例，少一点概念堆砌',
        '加入 2 个情境练习和 1 个课后复盘任务',
        '讲解节奏更紧凑，突出关键流程和常见误区',
        '请按培训讲师可直接授课的形式来组织内容',
      ],
      'en-US': [
        'Use real workplace cases and avoid overly abstract explanations',
        'Include 2 scenario practices and 1 after-class reflection task',
        'Keep the pacing tight and emphasize workflows and common mistakes',
        'Organize the output so a trainer can deliver it directly',
      ],
    },
  },
  presets: {
    profile: adultFoundationProfilePreset,
    subjectProfile: adultProfessionalSkillsSubjectPreset,
    lessonTypeProfile: adultWorkshopLessonTypePreset,
    ...adultEducationPresets,
  },
};
