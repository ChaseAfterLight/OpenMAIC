import { beforeEach, describe, expect, it, vi } from 'vitest';

const nextServerMocks = vi.hoisted(() => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    const result = callback();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => {});
    }
  }),
}));

const authMocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(),
}));

const jobStoreMocks = vi.hoisted(() => ({
  createClassroomGenerationJob: vi.fn(),
  prepareClassroomGenerationJobRetry: vi.fn(),
  readClassroomGenerationJob: vi.fn(),
  isValidClassroomJobId: vi.fn(() => true),
}));

const runnerMocks = vi.hoisted(() => ({
  runClassroomGenerationJob: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  buildRequestOrigin: vi.fn(() => 'http://localhost:3000'),
  createClassroomGenerationPlaceholder: vi.fn(),
  deleteClassroomGenerationPlaceholder: vi.fn(),
  syncClassroomGenerationPlaceholder: vi.fn(),
}));

const nanoidMocks = vi.hoisted(() => ({
  nanoid: vi.fn(() => 'job-123'),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: nextServerMocks.after,
  };
});

vi.mock('nanoid', () => ({
  nanoid: nanoidMocks.nanoid,
}));

vi.mock('@/lib/server/auth-guards', () => ({
  requireApiRole: authMocks.requireApiRole,
}));

vi.mock('@/lib/server/classroom-job-store', () => jobStoreMocks);
vi.mock('@/lib/server/classroom-job-runner', () => runnerMocks);
vi.mock('@/lib/server/classroom-storage', () => storageMocks);

import { POST as createJob } from '@/app/api/generate-classroom/route';
import { GET as getJob, POST as retryJob } from '@/app/api/generate-classroom/[jobId]/route';

const teacherAuth = {
  user: {
    id: 'teacher-1',
    email: 'teacher@example.com',
    role: 'teacher' as const,
    createdAt: 1,
    updatedAt: 1,
  },
};

describe('/api/generate-classroom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireApiRole.mockResolvedValue(teacherAuth);
  });

  it('creates a classroom background job and schedules the runner', async () => {
    jobStoreMocks.createClassroomGenerationJob.mockResolvedValue({
      id: 'job-123',
      status: 'queued',
      step: 'queued',
      progress: 0,
      message: 'Classroom generation job queued',
      artifacts: {
        requirement: {
          requirementPreview: '讲解分数加法',
          language: 'zh-CN',
          hasPdf: false,
        },
      },
    });
    storageMocks.createClassroomGenerationPlaceholder.mockResolvedValue({
      id: 'stage-123',
    });

    const response = await createJob(
      new Request('http://localhost:3000/api/generate-classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements: {
            requirement: '讲解分数加法',
            language: 'zh-CN',
          },
          lessonPackTitle: '分数加法',
        }),
      }) as never,
    );
    const body = (await response.json()) as {
      success: boolean;
      jobId: string;
      previewUrl: string;
      stageId: string;
    };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.jobId).toBe('job-123');
    expect(body.stageId).toBe('job-123');
    expect(body.previewUrl).toBe('http://localhost:3000/generation-preview?jobId=job-123');
    expect(jobStoreMocks.createClassroomGenerationJob).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        requirement: '讲解分数加法',
        lessonPackTitle: '分数加法',
        ownerUserId: 'teacher-1',
        stageId: 'job-123',
      }),
    );
    expect(storageMocks.createClassroomGenerationPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-123',
        jobId: 'job-123',
        ownerUserId: 'teacher-1',
      }),
    );
    expect(runnerMocks.runClassroomGenerationJob).toHaveBeenCalledWith(
      'job-123',
      'http://localhost:3000',
    );
    expect(nextServerMocks.after).toHaveBeenCalledTimes(1);
  });

  it('returns current job status with artifacts for polling', async () => {
    jobStoreMocks.readClassroomGenerationJob.mockResolvedValue({
      id: 'job-123',
      status: 'running',
      step: 'generating_scenes',
      progress: 62,
      message: 'Generating scenes',
      scenesGenerated: 3,
      totalScenes: 5,
      artifacts: {
        outlines: [
          {
            id: 'outline-1',
            title: '导入',
            type: 'slide',
            order: 0,
          },
        ],
      },
      input: {
        stageId: 'stage-123',
      },
      retryCount: 0,
    });

    const response = await getJob(
      new Request('http://localhost:3000/api/generate-classroom/job-123') as never,
      { params: Promise.resolve({ jobId: 'job-123' }) },
    );
    const body = (await response.json()) as {
      success: boolean;
      jobId: string;
      status: string;
      artifacts: { outlines: Array<{ title: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.jobId).toBe('job-123');
    expect(body.status).toBe('running');
    expect(body.artifacts.outlines[0]?.title).toBe('导入');
  });

  it('queues a failed job for retry and schedules the runner again', async () => {
    jobStoreMocks.prepareClassroomGenerationJobRetry.mockResolvedValue({
      id: 'job-123',
      status: 'queued',
      step: 'queued',
      progress: 0,
      message: 'Classroom generation retry queued',
      artifacts: {},
      input: {
        stageId: 'stage-123',
      },
    });

    const response = await retryJob(
      new Request('http://localhost:3000/api/generate-classroom/job-123', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ jobId: 'job-123' }) },
    );
    const body = (await response.json()) as { success: boolean; status: string };

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.status).toBe('queued');
    expect(storageMocks.syncClassroomGenerationPlaceholder).toHaveBeenCalledWith({
      stageId: 'stage-123',
      lessonPackPatch: {
        status: 'in_progress',
        generationJobId: 'job-123',
        generationJobStatus: 'queued',
        generationProgress: 0,
        generationMessage: 'Classroom generation retry queued',
      },
    });
    expect(runnerMocks.runClassroomGenerationJob).toHaveBeenCalledWith(
      'job-123',
      'http://localhost:3000',
    );
  });

  it('returns a conflict when retrying a completed job', async () => {
    jobStoreMocks.prepareClassroomGenerationJobRetry.mockRejectedValue(
      new Error('Completed classroom generation jobs cannot be retried'),
    );

    const response = await retryJob(
      new Request('http://localhost:3000/api/generate-classroom/job-123', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ jobId: 'job-123' }) },
    );
    const body = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toContain('cannot be retried');
  });
});
