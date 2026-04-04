import { after, type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidClassroomJobId,
  prepareClassroomGenerationJobRetry,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import {
  buildRequestOrigin,
  syncClassroomGenerationPlaceholder,
} from '@/lib/server/classroom-storage';
import { requireApiRole } from '@/lib/server/auth-guards';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomJob API');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  let resolvedJobId: string | undefined;
  try {
    const { jobId } = await context.params;
    resolvedJobId = jobId;

    if (!isValidClassroomJobId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom generation job id');
    }

    const job = await readClassroomGenerationJob(jobId);
    if (!job) {
      return apiError('INVALID_REQUEST', 404, 'Classroom generation job not found');
    }

    const pollUrl = `${buildRequestOrigin(req)}/api/generate-classroom/${jobId}`;

    return apiSuccess({
      jobId: job.id,
      stageId: job.input.stageId,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      pollUrl,
      pollIntervalMs: 5000,
      scenesGenerated: job.scenesGenerated,
      totalScenes: job.totalScenes,
      result: job.result,
      error: job.error,
      artifacts: job.artifacts,
      inputSummary: job.inputSummary,
      retryCount: job.retryCount,
      done: job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired',
    });
  } catch (error) {
    log.error(`Classroom job retrieval failed [jobId=${resolvedJobId ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve classroom generation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  let resolvedJobId: string | undefined;
  try {
    const { jobId } = await context.params;
    resolvedJobId = jobId;

    if (!isValidClassroomJobId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom generation job id');
    }

    const retryJob = await prepareClassroomGenerationJobRetry(jobId);
    if (retryJob.input.stageId) {
      await syncClassroomGenerationPlaceholder({
        stageId: retryJob.input.stageId,
        lessonPackPatch: {
          status: 'in_progress',
          generationJobId: retryJob.id,
          generationJobStatus: 'queued',
          generationProgress: 0,
          generationMessage: retryJob.message,
        },
      });
    }
    const baseUrl = buildRequestOrigin(req);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, baseUrl));

    return apiSuccess(
      {
        jobId: retryJob.id,
        stageId: retryJob.input.stageId,
        status: retryJob.status,
        step: retryJob.step,
        progress: retryJob.progress,
        message: retryJob.message,
        pollUrl,
        pollIntervalMs: 5000,
        artifacts: retryJob.artifacts,
        inputSummary: retryJob.inputSummary,
      },
      202,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isStateConflict =
      message.includes('already in progress') || message.includes('cannot be retried');

    log.error(`Classroom job retry failed [jobId=${resolvedJobId ?? 'unknown'}]:`, error);
    return apiError(
      'INVALID_REQUEST',
      isStateConflict ? 409 : 500,
      isStateConflict ? message : 'Failed to retry classroom generation job',
      isStateConflict ? undefined : message,
    );
  }
}
