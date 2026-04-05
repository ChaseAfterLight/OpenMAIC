import { createLogger } from '@/lib/logger';
import {
  listClassroomGenerationJobRecordsByStatuses,
  writeClassroomGenerationJobRecord,
} from '@/lib/server/classroom-job-repository';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import type { ClassroomGenerationJob } from '@/lib/server/classroom-job-types';

const log = createLogger('ClassroomJobStartup');

let startupMaintenancePromise: Promise<void> | null = null;

function buildUnrecoverableJob(job: ClassroomGenerationJob): ClassroomGenerationJob {
  const now = new Date().toISOString();

  return {
    ...job,
    status: 'failed',
    step: 'failed',
    message: 'Job could not be resumed after server restart',
    error: 'Recovery payload missing for interrupted job',
    completedAt: now,
    updatedAt: now,
  };
}

async function runStartupMaintenance(): Promise<void> {
  const unfinishedJobs = await listClassroomGenerationJobRecordsByStatuses(['queued', 'running']);
  if (unfinishedJobs.length === 0) {
    log.info('未发现需要启动恢复的课堂生成 Job');
    return;
  }

  let resumedCount = 0;
  let unrecoverableCount = 0;

  for (const job of unfinishedJobs) {
    if (!job.resume?.input || !job.resume.baseUrl) {
      await writeClassroomGenerationJobRecord(buildUnrecoverableJob(job));
      unrecoverableCount += 1;
      continue;
    }

    void runClassroomGenerationJob(job.id, job.resume.input, job.resume.baseUrl, job.checkpoint);
    resumedCount += 1;
  }

  log.info(
    `启动恢复已完成: resumed=${resumedCount}, unrecoverable=${unrecoverableCount}, total=${unfinishedJobs.length}`,
  );
}

export async function ensureClassroomJobStartupMaintenance(): Promise<void> {
  if (!startupMaintenancePromise) {
    startupMaintenancePromise = (async () => {
      try {
        await runStartupMaintenance();
      } catch (error) {
        startupMaintenancePromise = null;
        throw error;
      }
    })();
  }

  await startupMaintenancePromise;
}
