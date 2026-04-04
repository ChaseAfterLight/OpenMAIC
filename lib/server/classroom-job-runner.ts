import { createLogger } from '@/lib/logger';
import { generateClassroom } from '@/lib/server/classroom-generation';
import {
  markClassroomGenerationJobFailed,
  markClassroomGenerationJobRunning,
  markClassroomGenerationJobSucceeded,
  readClassroomGenerationJob,
  updateClassroomGenerationJobArtifacts,
  updateClassroomGenerationJobProgress,
} from '@/lib/server/classroom-job-store';
import { syncClassroomGenerationPlaceholder } from '@/lib/server/classroom-storage';

const log = createLogger('ClassroomJob');
const runningJobs = new Map<string, Promise<void>>();

async function syncPlaceholderFromJob(job: Awaited<ReturnType<typeof readClassroomGenerationJob>>) {
  const stageId = job?.input.stageId;
  if (!job || !stageId) {
    return;
  }

  await syncClassroomGenerationPlaceholder({
    stageId,
    lessonPackPatch: {
      status: job.status === 'succeeded' ? 'ready' : 'in_progress',
      generationJobId: job.status === 'succeeded' ? undefined : job.id,
      generationJobStatus:
        job.status === 'succeeded' ? undefined : job.status === 'queued' ? 'queued' : job.status,
      generationProgress: job.status === 'succeeded' ? undefined : job.progress,
      generationMessage: job.status === 'succeeded' ? undefined : job.message,
    },
  });
}

export function runClassroomGenerationJob(jobId: string, baseUrl: string): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) {
    return existing;
  }

  const jobPromise = (async () => {
    try {
      const job = await readClassroomGenerationJob(jobId);
      if (!job) {
        throw new Error(`Classroom generation job not found: ${jobId}`);
      }

      if (job.status === 'succeeded') {
        return;
      }

      const runningJob = await markClassroomGenerationJobRunning(jobId);
      await syncPlaceholderFromJob(runningJob);

      const result = await generateClassroom(job.input, {
        baseUrl,
        onProgress: async (progress) => {
          const updatedJob = await updateClassroomGenerationJobProgress(jobId, progress);
          await syncPlaceholderFromJob(updatedJob);
        },
        onArtifacts: async (artifacts) => {
          await updateClassroomGenerationJobArtifacts(jobId, artifacts);
        },
      });

      const completedJob = await markClassroomGenerationJobSucceeded(jobId, result);
      await syncPlaceholderFromJob(completedJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Classroom generation job ${jobId} failed:`, error);
      try {
        const failedJob = await markClassroomGenerationJobFailed(jobId, message);
        await syncPlaceholderFromJob(failedJob);
      } catch (markFailedError) {
        log.error(`Failed to persist failed status for job ${jobId}:`, markFailedError);
      }
    } finally {
      runningJobs.delete(jobId);
    }
  })();

  runningJobs.set(jobId, jobPromise);
  return jobPromise;
}
