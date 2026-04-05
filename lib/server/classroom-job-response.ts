import { type NextRequest } from 'next/server';
import type { ClassroomGenerationJob } from '@/lib/server/classroom-job-types';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';

export const CLASSROOM_JOB_POLL_INTERVAL_MS = 5000;
export const CLASSROOM_JOB_EVENTS_POLL_INTERVAL_MS = 1000;

export type ClassroomJobStreamEventType = 'snapshot' | 'progress' | 'done' | 'error';

export interface ClassroomJobResponse {
  type?: ClassroomJobStreamEventType;
  jobId: string;
  status: ClassroomGenerationJob['status'];
  step: ClassroomGenerationJob['step'];
  progress: number;
  message: string;
  pollUrl: string;
  eventsUrl: string;
  pollIntervalMs: number;
  scenesGenerated: number;
  totalScenes?: number;
  result?: ClassroomGenerationJob['result'];
  error?: string;
  done: boolean;
}

export function buildClassroomJobUrls(req: NextRequest, jobId: string) {
  const baseUrl = buildRequestOrigin(req);
  return {
    pollUrl: `${baseUrl}/api/generate-classroom/${jobId}`,
    eventsUrl: `${baseUrl}/api/generate-classroom/${jobId}/events`,
  };
}

export function serializeClassroomJobResponse(
  job: ClassroomGenerationJob,
  urls: { pollUrl: string; eventsUrl: string },
  type?: ClassroomJobStreamEventType,
): ClassroomJobResponse {
  return {
    ...(type ? { type } : {}),
    jobId: job.id,
    status: job.status,
    step: job.step,
    progress: job.progress,
    message: job.message,
    pollUrl: urls.pollUrl,
    eventsUrl: urls.eventsUrl,
    pollIntervalMs: CLASSROOM_JOB_POLL_INTERVAL_MS,
    scenesGenerated: job.scenesGenerated,
    totalScenes: job.totalScenes,
    result: job.result,
    error: job.error,
    done: job.status === 'succeeded' || job.status === 'failed',
  };
}
