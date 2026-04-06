import type {
  ClassroomGenerationCheckpoint,
  ClassroomGenerationProgress,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation';
import {
  findLatestClassroomGenerationJobRecordByClassroomId,
  readClassroomGenerationJobRecord,
  writeClassroomGenerationJobRecord,
} from '@/lib/server/classroom-job-repository';
import type { ClassroomGenerationJob } from '@/lib/server/classroom-job-types';

function jobMessage(input: Pick<GenerateClassroomInput, 'language'> | undefined, key: 'queued' | 'started' | 'completed' | 'failed') {
  const locale = input?.language === 'en-US' ? 'en-US' : 'zh-CN';
  const messages = {
    'zh-CN': {
      queued: '课程包生成任务已排队',
      started: '课程包生成已开始',
      completed: '课程包生成完成',
      failed: '课程包生成失败',
    },
    'en-US': {
      queued: 'Classroom generation job queued',
      started: 'Classroom generation started',
      completed: 'Classroom generation completed',
      failed: 'Classroom generation failed',
    },
  } as const;

  return messages[locale][key];
}

function buildInputSummary(input: GenerateClassroomInput): ClassroomGenerationJob['inputSummary'] {
  return {
    requirementPreview:
      input.requirement.length > 200 ? `${input.requirement.slice(0, 197)}...` : input.requirement,
    language: input.language || 'zh-CN',
    hasPdf: !!input.pdfContent,
    pdfTextLength: input.pdfContent?.text.length || 0,
    pdfImageCount: input.pdfContent?.images.length || 0,
  };
}

/** Simple per-job mutex to serialize read-modify-write on the same job record. */
const jobLocks = new Map<string, Promise<void>>();

async function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const prev = jobLocks.get(jobId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  jobLocks.set(jobId, next);
  try {
    await prev;
    return await fn();
  } finally {
    resolve!();
    if (jobLocks.get(jobId) === next) jobLocks.delete(jobId);
  }
}

/** Max age (ms) before a "running" job without an active runner is considered stale. */
const STALE_JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function markStaleIfNeeded(job: ClassroomGenerationJob): ClassroomGenerationJob | null {
  if (job.status !== 'running') return null;
  const updatedAt = new Date(job.updatedAt).getTime();
  if (Date.now() - updatedAt > STALE_JOB_TIMEOUT_MS) {
    const now = new Date().toISOString();
    return {
      ...job,
      status: 'failed',
      step: 'failed',
      message: 'Job appears stale (no progress update for 30 minutes)',
      error: 'Stale job: process may have restarted during generation',
      completedAt: now,
      updatedAt: now,
    };
  }
  return null;
}

export function isValidClassroomJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
  baseUrl: string,
): Promise<ClassroomGenerationJob> {
  const now = new Date().toISOString();
  const job: ClassroomGenerationJob = {
    id: jobId,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: jobMessage(input, 'queued'),
    createdAt: now,
    updatedAt: now,
    inputSummary: buildInputSummary(input),
    scenesGenerated: 0,
    resume: {
      input,
      baseUrl,
    },
  };

  await writeClassroomGenerationJobRecord(job);
  return job;
}

export async function readClassroomGenerationJob(
  jobId: string,
): Promise<ClassroomGenerationJob | null> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJobRecord(jobId);
    if (!existing) {
      return null;
    }

    const staleJob = markStaleIfNeeded(existing);
    if (!staleJob) {
      return existing;
    }

    await writeClassroomGenerationJobRecord(staleJob);
    return staleJob;
  });
}

export async function findLiveClassroomGenerationJobByClassroomId(
  classroomId: string,
): Promise<ClassroomGenerationJob | null> {
  const existing = await findLatestClassroomGenerationJobRecordByClassroomId(classroomId, [
    'queued',
    'running',
  ]);
  if (!existing) {
    return null;
  }

  const staleJob = markStaleIfNeeded(existing);
  if (!staleJob) {
    return existing;
  }

  await writeClassroomGenerationJobRecord(staleJob);
  return null;
}

export async function updateClassroomGenerationJob(
  jobId: string,
  patch: Partial<ClassroomGenerationJob>,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJobRecord(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await writeClassroomGenerationJobRecord(updated);
    return updated;
  });
}

export async function markClassroomGenerationJobRunning(
  jobId: string,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJobRecord(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      status: 'running',
      startedAt: existing.startedAt || new Date().toISOString(),
      message: jobMessage(existing.resume?.input, 'started'),
      updatedAt: new Date().toISOString(),
    };

    await writeClassroomGenerationJobRecord(updated);
    return updated;
  });
}

export async function updateClassroomGenerationJobProgress(
  jobId: string,
  progress: ClassroomGenerationProgress,
): Promise<ClassroomGenerationJob> {
  const patch: Partial<ClassroomGenerationJob> = {
    status: 'running',
    step: progress.step,
    progress: progress.progress,
    message: progress.message,
    scenesGenerated: progress.scenesGenerated,
    totalScenes: progress.totalScenes,
  };

  if (progress.result) {
    patch.result = progress.result;
  }

  if (progress.checkpoint) {
    patch.checkpoint = progress.checkpoint;
  }

  return updateClassroomGenerationJob(jobId, patch);
}

export async function updateClassroomGenerationJobCheckpoint(
  jobId: string,
  checkpoint: ClassroomGenerationCheckpoint,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, { checkpoint });
}

export async function markClassroomGenerationJobSucceeded(
  jobId: string,
  result: GenerateClassroomResult,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJobRecord(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      status: 'succeeded',
      step: 'completed',
      progress: 100,
      message: jobMessage(existing.resume?.input, 'completed'),
      completedAt: new Date().toISOString(),
      scenesGenerated: result.scenesCount,
      result: {
        classroomId: result.id,
        url: result.url,
        scenesCount: result.scenesCount,
      },
      checkpoint: {
        classroomId: result.id,
      },
      updatedAt: new Date().toISOString(),
    };

    await writeClassroomGenerationJobRecord(updated);
    return updated;
  });
}

export async function markClassroomGenerationJobFailed(
  jobId: string,
  error: string,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJobRecord(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      status: 'failed',
      step: 'failed',
      message: jobMessage(existing.resume?.input, 'failed'),
      completedAt: new Date().toISOString(),
      error,
      updatedAt: new Date().toISOString(),
    };

    await writeClassroomGenerationJobRecord(updated);
    return updated;
  });
}
