import { type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import {
  findLiveClassroomGenerationJobByClassroomId,
} from '@/lib/server/classroom-job-store';
import {
  buildClassroomJobUrls,
  serializeClassroomJobResponse,
} from '@/lib/server/classroom-job-response';

const log = createLogger('ClassroomJobByClassroom API');

export const dynamic = 'force-dynamic';

function isValidClassroomId(classroomId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(classroomId);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ classroomId: string }> },
) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  let resolvedClassroomId: string | undefined;
  try {
    const { classroomId } = await context.params;
    resolvedClassroomId = classroomId;

    if (!isValidClassroomId(classroomId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
    }

    const job = await findLiveClassroomGenerationJobByClassroomId(classroomId);
    if (!job) {
      return apiSuccess({ job: null });
    }

    const urls = buildClassroomJobUrls(req, job.id);
    return apiSuccess({ job: serializeClassroomJobResponse(job, urls) });
  } catch (error) {
    log.error(
      `Classroom live job lookup failed [classroomId=${resolvedClassroomId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve classroom live job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
