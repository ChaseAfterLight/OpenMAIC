import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStageRecord: vi.fn(),
  getStageOutlinesRecord: vi.fn(),
  listScenesByStageId: vi.fn(),
  replaceScenesByStageId: vi.fn(),
  saveStageRecord: vi.fn(),
}));

vi.mock('@/lib/server/storage-repository', () => ({
  getStageRecord: mocks.getStageRecord,
  getStageOutlinesRecord: mocks.getStageOutlinesRecord,
  listScenesByStageId: mocks.listScenesByStageId,
  replaceScenesByStageId: mocks.replaceScenesByStageId,
  saveStageRecord: mocks.saveStageRecord,
}));

import { persistClassroom, readClassroom } from '@/lib/server/classroom-storage';

describe('classroom storage migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStageOutlinesRecord.mockResolvedValue(null);
  });

  it('persists classroom JSON through the server storage repository', async () => {
    const stage = {
      id: 'stage-1',
      ownerUserId: 'user-1',
      name: 'My Stage',
      description: 'Demo',
      createdAt: 1710000000000,
      updatedAt: 1710000005000,
      lessonPack: { status: 'draft' as const },
      language: 'en-US' as const,
      style: 'interactive',
      currentSceneId: 'scene-1',
      agentIds: ['agent-1'],
    };
    const scenes = [
      {
        id: 'scene-1',
        stageId: 'stage-1',
        type: 'slide' as const,
        title: 'Intro',
        order: 0,
        content: {
          type: 'slide' as const,
          canvas: {
            id: 'canvas-1',
            viewportSize: { width: 1000, height: 562 },
            viewportRatio: '16:9',
            theme: { id: 'theme-1' },
            elements: [],
          },
        },
        createdAt: 1710000000000,
        updatedAt: 1710000005000,
      } as never,
    ] as never[];

    const persisted = await persistClassroom(
      {
        id: 'stage-1',
        ownerUserId: 'user-1',
        stage,
        scenes,
      },
      'https://example.com',
    );

    expect(mocks.saveStageRecord).toHaveBeenCalledOnce();
    expect(mocks.replaceScenesByStageId).toHaveBeenCalledWith(
      'stage-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'scene-1',
          stageId: 'stage-1',
          order: 0,
        }),
      ]),
    );
    expect(persisted.url).toBe('https://example.com/classroom/stage-1');
    expect(persisted.stage.id).toBe('stage-1');
    expect(persisted.ownerUserId).toBe('user-1');
  });

  it('reads classrooms from the server storage repository', async () => {
    mocks.getStageRecord.mockResolvedValue({
      id: 'stage-2',
      ownerUserId: 'user-2',
      name: 'Stored Stage',
      description: 'From repo',
      createdAt: 1710000010000,
      updatedAt: 1710000015000,
      lessonPack: { status: 'draft' },
      language: 'zh-CN',
      style: 'interactive',
      currentSceneId: 'scene-2',
      agentIds: ['agent-2'],
    });
    mocks.listScenesByStageId.mockResolvedValue([
      {
        id: 'scene-2',
        stageId: 'stage-2',
        type: 'slide',
        title: 'Stored scene',
        order: 0,
        content: {
          type: 'slide',
          canvas: {
            id: 'canvas-2',
            viewportSize: { width: 1000, height: 562 },
            viewportRatio: '16:9',
            theme: { id: 'theme-2' },
            elements: [],
          },
        },
        createdAt: 1710000010000,
        updatedAt: 1710000015000,
      } as never,
    ]);

    const classroom = await readClassroom('stage-2');

    expect(classroom).not.toBeNull();
    expect(classroom?.id).toBe('stage-2');
    expect(classroom?.ownerUserId).toBe('user-2');
    expect(classroom?.stage.name).toBe('Stored Stage');
    expect(classroom?.scenes).toHaveLength(1);
    expect(classroom?.createdAt).toBe(new Date(1710000010000).toISOString());
  });
});
