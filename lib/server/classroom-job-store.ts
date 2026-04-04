import { promises as fs } from 'fs';
import path from 'path';
import type {
  ClassroomGenerationProgress,
  GenerateClassroomInput,
  GenerateClassroomResult,
} from '@/lib/server/classroom-generation';
import {
  CLASSROOM_JOBS_DIR,
  ensureClassroomJobsDir,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type {
  ClassroomGenerationArtifacts,
  ClassroomGenerationJobStatus,
  ClassroomGenerationJobStep,
  ClassroomGenerationResultSummary,
} from '@/lib/types/classroom-job';

export interface ClassroomGenerationJob {
  id: string;
  status: ClassroomGenerationJobStatus;
  step: ClassroomGenerationJobStep;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  input: GenerateClassroomInput;
  inputSummary: {
    requirementPreview: string;
    language: string;
    hasPdf: boolean;
    pdfTextLength: number;
    pdfImageCount: number;
    enableWebSearch: boolean;
    agentMode: 'default' | 'generate';
  };
  scenesGenerated: number;
  totalScenes?: number;
  result?: ClassroomGenerationResultSummary;
  error?: string;
  artifacts: ClassroomGenerationArtifacts;
}

function jobFilePath(jobId: string) {
  return path.join(CLASSROOM_JOBS_DIR, `${jobId}.json`);
}

function buildInputSummary(input: GenerateClassroomInput): ClassroomGenerationJob['inputSummary'] {
  return {
    requirementPreview:
      input.requirement.length > 200 ? `${input.requirement.slice(0, 197)}...` : input.requirement,
    language: input.language || 'zh-CN',
    hasPdf: !!input.pdfContent?.text?.trim(),
    pdfTextLength: input.pdfContent?.text.length || 0,
    pdfImageCount: input.pdfContent?.images.length || 0,
    enableWebSearch: !!input.enableWebSearch,
    agentMode: input.agentMode === 'generate' ? 'generate' : 'default',
  };
}

function buildInitialArtifacts(input: GenerateClassroomInput): ClassroomGenerationArtifacts {
  return {
    requirement: {
      requirementPreview:
        input.requirement.length > 200 ? `${input.requirement.slice(0, 197)}...` : input.requirement,
      language: input.language || 'zh-CN',
      hasPdf: !!input.pdfContent?.text?.trim(),
      lessonPackTitle: input.lessonPackTitle,
      lessonPackMetadata: input.lessonPackMetadata,
    },
  };
}

/** Simple per-job mutex to serialize read-modify-write on the same job file. */
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

/** Max age (ms) before a running job without progress is considered expired. */
const STALE_JOB_TIMEOUT_MS = 30 * 60 * 1000;

function markStaleIfNeeded(job: ClassroomGenerationJob): ClassroomGenerationJob {
  if (job.status !== 'running') return job;
  const updatedAt = new Date(job.updatedAt).getTime();
  if (Date.now() - updatedAt <= STALE_JOB_TIMEOUT_MS) {
    return job;
  }

  const now = new Date().toISOString();
  return {
    ...job,
    status: 'expired',
    step: 'expired',
    message: 'Classroom generation job expired while waiting for progress updates',
    error: 'Job expired after 30 minutes without progress. Retry is required.',
    completedAt: now,
    updatedAt: now,
  };
}

async function readJobFile(jobId: string): Promise<ClassroomGenerationJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as ClassroomGenerationJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function isValidClassroomJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createClassroomGenerationJob(
  jobId: string,
  input: GenerateClassroomInput,
): Promise<ClassroomGenerationJob> {
  const now = new Date().toISOString();
  const job: ClassroomGenerationJob = {
    id: jobId,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: 'Classroom generation job queued',
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    input,
    inputSummary: buildInputSummary(input),
    scenesGenerated: 0,
    artifacts: buildInitialArtifacts(input),
  };

  await ensureClassroomJobsDir();
  await writeJsonFileAtomic(jobFilePath(jobId), job);
  return job;
}

export async function readClassroomGenerationJob(
  jobId: string,
): Promise<ClassroomGenerationJob | null> {
  const job = await readJobFile(jobId);
  return job ? markStaleIfNeeded(job) : null;
}

export async function updateClassroomGenerationJob(
  jobId: string,
  patch: Partial<ClassroomGenerationJob>,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJob(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      ...patch,
      artifacts: {
        ...existing.artifacts,
        ...patch.artifacts,
      },
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}

export async function updateClassroomGenerationJobArtifacts(
  jobId: string,
  patch: Partial<ClassroomGenerationArtifacts>,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJob(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      artifacts: {
        ...existing.artifacts,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}

export async function markClassroomGenerationJobRunning(
  jobId: string,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJob(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    const updated: ClassroomGenerationJob = {
      ...existing,
      status: 'running',
      step: existing.step === 'queued' ? 'initializing' : existing.step,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      message:
        existing.retryCount > 0 ? 'Retrying classroom generation job' : 'Classroom generation started',
      error: undefined,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}

export async function updateClassroomGenerationJobProgress(
  jobId: string,
  progress: ClassroomGenerationProgress,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'running',
    step: progress.step,
    progress: progress.progress,
    message: progress.message,
    scenesGenerated: progress.scenesGenerated,
    totalScenes: progress.totalScenes,
  });
}

export async function markClassroomGenerationJobSucceeded(
  jobId: string,
  result: GenerateClassroomResult,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'succeeded',
    step: 'completed',
    progress: 100,
    message: 'Classroom generation completed',
    completedAt: new Date().toISOString(),
    scenesGenerated: result.scenesCount,
    artifacts: {
      final: {
        classroomId: result.id,
        url: result.url,
        scenesCount: result.scenesCount,
        stageName: result.stage.name,
      },
    },
    result: {
      classroomId: result.id,
      url: result.url,
      scenesCount: result.scenesCount,
      stageName: result.stage.name,
    },
  });
}

export async function markClassroomGenerationJobFailed(
  jobId: string,
  error: string,
): Promise<ClassroomGenerationJob> {
  return updateClassroomGenerationJob(jobId, {
    status: 'failed',
    step: 'failed',
    message: 'Classroom generation failed',
    completedAt: new Date().toISOString(),
    error,
  });
}

export async function prepareClassroomGenerationJobRetry(
  jobId: string,
): Promise<ClassroomGenerationJob> {
  return withJobLock(jobId, async () => {
    const existing = await readClassroomGenerationJob(jobId);
    if (!existing) {
      throw new Error(`Classroom generation job not found: ${jobId}`);
    }

    if (existing.status === 'running' || existing.status === 'queued') {
      throw new Error('Classroom generation job is already in progress');
    }

    if (existing.status === 'succeeded') {
      throw new Error('Completed classroom generation jobs cannot be retried');
    }

    const now = new Date().toISOString();
    const updated: ClassroomGenerationJob = {
      ...existing,
      status: 'queued',
      step: 'queued',
      progress: 0,
      message: 'Classroom generation retry queued',
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
      retryCount: existing.retryCount + 1,
      scenesGenerated: 0,
      totalScenes: undefined,
      updatedAt: now,
    };

    await writeJsonFileAtomic(jobFilePath(jobId), updated);
    return updated;
  });
}
