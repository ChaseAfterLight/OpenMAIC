import type { BusinessModule, K12ModulePresets } from '@/lib/module-host/types';
import { elementaryUpperGradePreset } from './presets/grade/elementary-upper';
import { newLessonTypePreset } from './presets/lesson-type/new-lesson';
import { elementaryMathSubjectPreset } from './presets/subject/math';

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
  defaults: {
    gradeId: 'grade-4',
    subjectId: 'math',
    lessonTypeId: 'new-lesson',
    durationMinutes: 40,
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
      'zh-CN': '把教材、课题和 PDF 变成适合小学课堂的备课包',
      'en-US': 'Turn textbooks, lesson topics, and PDFs into K12-ready lesson packs',
    },
    requirementPlaceholder: {
      'zh-CN':
        '补充教学目标、教材来源或班级情况，例如：\n「围绕小数的生活化例子设计导入」\n「加入 3 道随堂练习和 1 个课堂总结」\n「参考上传教材 PDF，生成可投屏的数学课」',
      'en-US':
        'Add teaching goals, lesson notes, or class context, e.g.\n"Use real-life decimal examples for the warm-up"\n"Include 3 in-class practice questions and a short wrap-up"\n"Use the uploaded textbook PDF to build a projector-ready lesson"',
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
      'zh-CN': ['四年级数学：小数的意义', '三年级语文：《荷花》', '五年级英语：My Day'],
      'en-US': ['Grade 4 math: decimals', 'Grade 3 Chinese: Lotus', 'Grade 5 English: My Day'],
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
