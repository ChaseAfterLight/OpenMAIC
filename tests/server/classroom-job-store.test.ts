import { afterEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const originalCwd = process.cwd();
const tempDirs: string[] = [];

async function loadStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openmaic-classroom-job-'));
  tempDirs.push(tempDir);
  process.chdir(tempDir);
  vi.resetModules();
  return import('@/lib/server/classroom-job-store');
}

afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.useRealTimers();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('classroom-job-store', () => {
  it('persists job progress and intermediate artifacts', async () => {
    const store = await loadStore();
    await store.createClassroomGenerationJob('job-1', {
      requirement: '讲解分数加法',
      language: 'zh-CN',
      lessonPackTitle: '分数加法',
    });

    await store.markClassroomGenerationJobRunning('job-1');
    await store.updateClassroomGenerationJobProgress('job-1', {
      step: 'generating_outlines',
      progress: 35,
      message: 'Generated outlines',
      scenesGenerated: 0,
      totalScenes: 4,
    });
    await store.updateClassroomGenerationJobArtifacts('job-1', {
      outlines: [
        {
          id: 'outline-1',
          title: '认识分数加法',
          type: 'slide',
          order: 0,
        },
      ],
    });

    const job = await store.readClassroomGenerationJob('job-1');

    expect(job).not.toBeNull();
    expect(job?.status).toBe('running');
    expect(job?.step).toBe('generating_outlines');
    expect(job?.progress).toBe(35);
    expect(job?.artifacts.requirement?.lessonPackTitle).toBe('分数加法');
    expect(job?.artifacts.outlines).toHaveLength(1);
    expect(job?.input.requirement).toBe('讲解分数加法');
  });

  it('marks stale running jobs as expired when re-read', async () => {
    const store = await loadStore();
    await store.createClassroomGenerationJob('job-2', {
      requirement: '讲解植物细胞',
      language: 'zh-CN',
    });
    await store.markClassroomGenerationJobRunning('job-2');

    const jobPath = path.join(process.cwd(), 'data', 'classroom-jobs', 'job-2.json');
    const raw = JSON.parse(await fs.readFile(jobPath, 'utf-8')) as Record<string, unknown>;
    raw.updatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    await fs.writeFile(jobPath, JSON.stringify(raw, null, 2), 'utf-8');

    const expired = await store.readClassroomGenerationJob('job-2');

    expect(expired?.status).toBe('expired');
    expect(expired?.step).toBe('expired');
    expect(expired?.error).toContain('Retry');
  });

  it('queues failed jobs for retry and blocks completed jobs', async () => {
    const store = await loadStore();
    await store.createClassroomGenerationJob('job-3', {
      requirement: '讲解光合作用',
      language: 'zh-CN',
    });
    await store.markClassroomGenerationJobFailed('job-3', 'LLM timeout');

    const retried = await store.prepareClassroomGenerationJobRetry('job-3');
    expect(retried.status).toBe('queued');
    expect(retried.retryCount).toBe(1);
    expect(retried.error).toBeUndefined();

    await store.markClassroomGenerationJobSucceeded('job-3', {
      id: 'stage-1',
      url: 'http://localhost/classroom/stage-1',
      stage: {
        id: 'stage-1',
        name: '光合作用',
        createdAt: 1,
        updatedAt: 1,
      },
      scenes: [],
      scenesCount: 0,
      createdAt: new Date().toISOString(),
    });

    await expect(store.prepareClassroomGenerationJobRetry('job-3')).rejects.toThrow(
      'cannot be retried',
    );
  });
});
