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
        '在上方先选好教材章节，再在这里补充老师的自定义要求，例如课堂风格、语气、练习数量、互动方式或作业安排。',
      'en-US':
        'Pick the textbook chapter above, then add teacher-specific instructions here, such as tone, style, practice count, interaction pattern, or homework.',
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
      'zh-CN': [
        '课堂风格轻松一点，多用生活例子',
        '加入 3 个分层练习，基础题到提升题都要有',
        '语气亲切自然，适合小学课堂',
        '请突出互动提问和板书提示',
      ],
      'en-US': [
        'Keep the lesson light and friendly with real-life examples',
        'Include 3 differentiated practice items, from basic to advanced',
        'Use a warm, conversational tone for elementary students',
        'Emphasize interaction prompts and board cues',
      ],
    },
  },
  presets: {
    profile: elementaryUpperGradePreset,
    subjectProfile: elementaryMathSubjectPreset,
    lessonTypeProfile: newLessonTypePreset,
    ...k12Presets,
  },
};
