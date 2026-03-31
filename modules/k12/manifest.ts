import type { BusinessModule, K12ModulePresets } from '@/lib/module-host/types';
import { elementaryUpperGradePreset } from './presets/grade/elementary-upper';
import { newLessonTypePreset } from './presets/lesson-type/new-lesson';
import { elementaryMathSubjectPreset } from './presets/subject/math';
import { pepElementaryMathEdition } from './presets/textbook/pep-elementary-math';

const k12Presets: K12ModulePresets = {
  grades: [
    {
      id: 'grade-3',
      label: { 'zh-CN': '三年级', 'en-US': 'Grade 3' },
    },
    {
      id: 'grade-4',
      label: { 'zh-CN': '四年级', 'en-US': 'Grade 4' },
    },
    {
      id: 'grade-5',
      label: { 'zh-CN': '五年级', 'en-US': 'Grade 5' },
    },
    {
      id: 'grade-6',
      label: { 'zh-CN': '六年级', 'en-US': 'Grade 6' },
    },
  ],
  subjects: [
    {
      id: 'math',
      label: { 'zh-CN': '数学', 'en-US': 'Math' },
    },
    {
      id: 'chinese',
      label: { 'zh-CN': '语文', 'en-US': 'Chinese' },
    },
    {
      id: 'english',
      label: { 'zh-CN': '英语', 'en-US': 'English' },
    },
  ],
  lessonTypes: [
    {
      id: 'new-lesson',
      label: { 'zh-CN': '新课导入', 'en-US': 'New Lesson' },
    },
    {
      id: 'guided-practice',
      label: { 'zh-CN': '练习巩固', 'en-US': 'Guided Practice' },
    },
    {
      id: 'unit-review',
      label: { 'zh-CN': '单元复习', 'en-US': 'Unit Review' },
    },
  ],
  durations: [30, 40, 45],
  textbookEditions: [pepElementaryMathEdition],
  defaults: {
    gradeId: 'grade-4',
    subjectId: 'math',
    lessonTypeId: 'new-lesson',
    durationMinutes: 40,
    textbookEditionId: 'pep-elementary-math',
    volumeId: 'pep-math-grade-4-upper',
    unitId: 'g4u-unit-1',
    chapterId: 'g4u-u1-c1',
  },
};

export const k12ModuleManifest: BusinessModule = {
  id: 'k12',
  name: 'K12 Classroom',
  version: '1.0.0',
  enabled: true,
  capabilities: ['generation', 'validation', 'export', 'template', 'ui'],
  routes: {
    home: '/',
    setup: '/settings',
    generator: '/generation-preview',
    preview: '/classroom',
  },
  metadata: {
    applicationName: 'OpenMAIC K12',
    title: {
      'zh-CN': 'OpenMAIC K12',
      'en-US': 'OpenMAIC K12',
    },
    description: {
      'zh-CN': '面向小学教师的 AI 备课与课堂生成工具，快速产出教案、课件和练习。',
      'en-US':
        'An AI lesson planning and classroom generation workspace for elementary teachers.',
    },
  },
  home: {
    badge: {
      'zh-CN': 'K12 业务模块',
      'en-US': 'K12 Business Module',
    },
    slogan: {
      'zh-CN': '从教材章节出发，快速生成适合小学课堂的备课包',
      'en-US': 'Start from textbook chapters and turn them into K12-ready lesson packs',
    },
    requirementPlaceholder: {
      'zh-CN':
        '优先选择教材章节，再补充教学目标、班级情况或自定义资料，例如：\n「围绕大数的认识设计生活化导入」\n「加入 3 道随堂练习和 1 个课堂总结」\n「参考我额外上传的 PDF，生成可投屏的数学课」',
      'en-US':
        'Choose a textbook chapter first, then add teaching goals, class context, or extra materials, e.g.\n"Use real-life examples for the warm-up"\n"Include 3 in-class practice questions and a short wrap-up"\n"Use my uploaded PDF as supplementary material"',
    },
    submitLabel: {
      'zh-CN': '生成备课包',
      'en-US': 'Generate Lesson Pack',
    },
    footerText: {
      'zh-CN': 'OpenMAIC K12 Module Preview',
      'en-US': 'OpenMAIC K12 Module Preview',
    },
    quickPrompts: {
      'zh-CN': ['四年级数学：大数的认识', '三年级数学：秒的认识', '五年级数学：小数乘整数'],
      'en-US': ['Grade 4 math: large numbers', 'Grade 3 math: understanding seconds', 'Grade 5 math: decimal times integer'],
    },
  },
  presets: {
    profile: elementaryUpperGradePreset,
    subjectProfile: elementaryMathSubjectPreset,
    lessonTypeProfile: newLessonTypePreset,
    ...k12Presets,
  },
  promptPacks: {
    outline: 'k12-outline',
    lesson: 'k12-lesson',
    validation: 'k12-validation',
  },
};
