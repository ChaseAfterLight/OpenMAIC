import { beforeEach, describe, expect, it, vi } from 'vitest';

  const mocks = vi.hoisted(() => ({
    resolveModel: vi.fn(),
    readClassroom: vi.fn(),
    persistClassroom: vi.fn(),
    applyOutlineFallbacks: vi.fn(),
    generateSceneOutlinesFromRequirements: vi.fn(),
    generateSceneContent: vi.fn(),
    generateSceneActions: vi.fn(),
    createSceneWithActions: vi.fn(),
    getDefaultAgents: vi.fn(),
  }));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroom: mocks.readClassroom,
  persistClassroom: mocks.persistClassroom,
}));

vi.mock('@/lib/generation/outline-generator', () => ({
  applyOutlineFallbacks: mocks.applyOutlineFallbacks,
  generateSceneOutlinesFromRequirements: mocks.generateSceneOutlinesFromRequirements,
}));

vi.mock('@/lib/generation/scene-generator', () => ({
  generateSceneContent: mocks.generateSceneContent,
  generateSceneActions: mocks.generateSceneActions,
  createSceneWithActions: mocks.createSceneWithActions,
}));

vi.mock('@/lib/orchestration/registry/store', () => ({
  getDefaultAgents: mocks.getDefaultAgents,
}));

import { generateClassroom } from '@/lib/server/classroom-generation';

describe('generateClassroom fallback resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resolveModel.mockImplementation(async (...args: unknown[]) => {
      const [{ modelString, providerType }] = args as [
        { modelString?: string; providerType?: string } | undefined,
      ];

      if (modelString === 'custom-test:gemini-3-flash-preview' && providerType === 'google') {
        return {
          model: 'primary-model',
          modelInfo: {
            id: 'gemini-3-flash-preview',
            name: 'Gemini 3 Flash Preview',
            capabilities: {},
          },
          modelString,
          providerId: 'custom-test',
          apiKey: 'server-key',
        };
      }

      throw new Error('fallback should not be resolved eagerly');
    });

    mocks.readClassroom.mockResolvedValue(null);
    mocks.persistClassroom.mockImplementation(async (classroom: { id: string }) => ({
      id: classroom.id,
      url: `http://localhost/classroom/${classroom.id}`,
      createdAt: '2026-04-11T00:00:00.000Z',
    }));
    mocks.applyOutlineFallbacks.mockImplementation((outline: unknown) => outline);
    mocks.generateSceneOutlinesFromRequirements.mockResolvedValue({
      success: true,
      data: [
        {
          order: 1,
          title: 'Warm Up Quiz',
          type: 'quiz',
        },
      ],
    });
    mocks.generateSceneContent.mockResolvedValue({
      questions: [
        {
          id: 'q1',
          question: 'What is 2 + 2?',
          options: ['3', '4'],
          correctAnswer: '4',
          explanation: '2 + 2 = 4',
        },
      ],
    });
    mocks.generateSceneActions.mockResolvedValue([
      {
        id: 'action-1',
        type: 'speech',
        title: 'Explain',
        text: 'Let us solve it together.',
      },
    ]);
    mocks.createSceneWithActions.mockImplementation(
      (
        outline: { title: string; order: number },
        content: { questions: unknown[] },
        actions: unknown[],
        api: {
          scene: {
            create: (params: {
              type: 'quiz';
              title: string;
              order: number;
              content: { type: 'quiz'; questions: unknown[] };
              actions: unknown[];
            }) => { success: boolean; data?: string | null };
          };
        },
      ) =>
        api.scene.create({
          type: 'quiz',
          title: outline.title,
          order: outline.order,
          content: {
            type: 'quiz',
            questions: content.questions,
          },
          actions,
        }).data ?? null,
    );
    mocks.getDefaultAgents.mockReturnValue([
      { id: 'teacher-1', name: 'Teacher', role: 'teacher', persona: 'Helpful teacher' },
      { id: 'student-1', name: 'Student', role: 'student', persona: 'Curious student' },
    ]);
  });

  it('does not resolve the default fallback model before it is needed', async () => {
    const result = await generateClassroom(
      {
        requirement: 'Create a simple math classroom',
        modelString: 'custom-test:gemini-3-flash-preview',
        providerType: 'google',
      },
      {
        baseUrl: 'http://localhost',
      },
    );

    expect(result.id).toBeTruthy();
    expect(result.scenesCount).toBe(1);
    expect(mocks.resolveModel).toHaveBeenCalledTimes(1);
    expect(mocks.resolveModel).toHaveBeenCalledWith({
      modelString: 'custom-test:gemini-3-flash-preview',
      providerType: 'google',
    });
  });
});
