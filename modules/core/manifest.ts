import type { BusinessModule } from '@/lib/module-host/types';

export const coreModuleManifest: BusinessModule = {
  id: 'core',
  name: 'OpenMAIC Core',
  version: '1.0.0',
  enabled: true,
  capabilities: ['generation', 'export', 'ui'],
  routes: {
    home: '/',
    setup: '/settings',
    generator: '/generation-preview',
    preview: '/classroom',
  },
  metadata: {
    applicationName: 'OpenMAIC',
    title: {
      'zh-CN': 'OpenMAIC',
      'en-US': 'OpenMAIC',
    },
    description: {
      'zh-CN': '开源 AI 互动课堂平台，支持多智能体生成课堂、测验和互动内容。',
      'en-US':
        'The open-source AI interactive classroom. Generate immersive, multi-agent learning experiences from any topic or PDF.',
    },
  },
  home: {
    badge: {
      'zh-CN': '通用课堂引擎',
      'en-US': 'General Classroom Engine',
    },
    slogan: {
      'zh-CN': 'Generative Learning in Multi-Agent Interactive Classroom',
      'en-US': 'Generative Learning in Multi-Agent Interactive Classroom',
    },
    requirementPlaceholder: {
      'zh-CN':
        '输入你想学的任何内容，例如：\n「从零学 Python，30 分钟写出第一个程序」\n「用白板给我讲解傅里叶变换」\n「阿瓦隆桌游怎么玩」',
      'en-US':
        'Tell me anything you want to learn, e.g.\n"Teach me Python from scratch in 30 minutes"\n"Explain Fourier Transform on the whiteboard"\n"How to play the board game Avalon"',
    },
    submitLabel: {
      'zh-CN': '进入课堂',
      'en-US': 'Enter Classroom',
    },
    footerText: {
      'zh-CN': 'OpenMAIC Open Source Project',
      'en-US': 'OpenMAIC Open Source Project',
    },
    quickPrompts: {
      'zh-CN': ['讲解牛顿定律', '从零学 Python', '做一节阿瓦隆入门课'],
      'en-US': ['Explain Newtonian mechanics', 'Learn Python from scratch', 'Teach Avalon'],
    },
  },
};
