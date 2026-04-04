import { type NextRequest } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import {
  isValidClassroomJobId,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import {
  buildClassroomJobUrls,
  CLASSROOM_JOB_EVENTS_POLL_INTERVAL_MS,
  serializeClassroomJobResponse,
} from '@/lib/server/classroom-job-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomJobEvents API');

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function stringifyEvent(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function getTerminalEventType(status: 'queued' | 'running' | 'succeeded' | 'failed') {
  if (status === 'succeeded') return 'done' as const;
  if (status === 'failed') return 'error' as const;
  return 'progress' as const;
}

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

    const initialJob = await readClassroomGenerationJob(jobId);
    if (!initialJob) {
      return apiError('INVALID_REQUEST', 404, 'Classroom generation job not found');
    }

    const urls = buildClassroomJobUrls(req, jobId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        let pollInFlight = false;
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let lastUpdatedAt = initialJob.updatedAt;

        const closeStream = () => {
          if (closed) return;
          closed = true;
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          try {
            controller.close();
          } catch {
            /* stream already closed */
          }
        };

        const send = (payload: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(stringifyEvent(payload)));
          } catch {
            closeStream();
          }
        };

        const sendHeartbeat = () => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(':heartbeat\n\n'));
          } catch {
            closeStream();
          }
        };

        const publishJob = (job: typeof initialJob, type: 'snapshot' | 'progress' | 'done' | 'error') => {
          send(serializeClassroomJobResponse(job, urls, type));
        };

        const pollJob = async () => {
          if (closed || pollInFlight) return;
          pollInFlight = true;
          try {
            const current = await readClassroomGenerationJob(jobId);
            if (!current) {
              send({
                ...serializeClassroomJobResponse(initialJob, urls, 'error'),
                error: 'Classroom generation job not found',
              });
              closeStream();
              return;
            }

            if (current.updatedAt === lastUpdatedAt) {
              return;
            }

            lastUpdatedAt = current.updatedAt;
            const eventType = getTerminalEventType(current.status);
            publishJob(current, eventType);

            if (current.status === 'succeeded' || current.status === 'failed') {
              closeStream();
            }
          } catch (error) {
            log.error(`Classroom job event stream failed [jobId=${jobId}]:`, error);
            send({
              ...serializeClassroomJobResponse(initialJob, urls, 'error'),
              error: error instanceof Error ? error.message : String(error),
            });
            closeStream();
          } finally {
            pollInFlight = false;
          }
        };

        req.signal.addEventListener('abort', closeStream, { once: true });

        controller.enqueue(encoder.encode('retry: 3000\n\n'));
        if (closed) return;
        publishJob(initialJob, 'snapshot');
        if (closed) return;

        if (initialJob.status === 'succeeded' || initialJob.status === 'failed') {
          publishJob(initialJob, getTerminalEventType(initialJob.status));
          closeStream();
          return;
        }

        heartbeatTimer = setInterval(sendHeartbeat, 15_000);
        pollTimer = setInterval(() => {
          void pollJob();
        }, CLASSROOM_JOB_EVENTS_POLL_INTERVAL_MS);

        // Pull once immediately so the client sees the latest state without waiting
        // for the first interval tick.
        await pollJob();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    log.error(`Classroom job events failed [jobId=${resolvedJobId ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to open classroom generation job stream',
      error instanceof Error ? error.message : String(error),
    );
  }
}
