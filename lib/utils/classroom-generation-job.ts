import { ACTIVE_JOB_STORAGE_KEY } from '@/lib/constants/classroom-generation';

interface CreateClassroomGenerationJobSuccess {
  success: true;
  jobId: string;
  stageId: string;
  previewUrl: string;
  packUrl: string;
}

export async function createClassroomGenerationJob(
  payload: Record<string, unknown>,
  fallbackErrorMessage: string,
): Promise<CreateClassroomGenerationJobSuccess> {
  const response = await fetch('/api/generate-classroom', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    jobId?: string;
    stageId?: string;
    previewUrl?: string;
    packUrl?: string;
    error?: string;
  };

  if (!response.ok || !body.success || !body.jobId || !body.stageId || !body.previewUrl || !body.packUrl) {
    throw new Error(body.error || fallbackErrorMessage);
  }

  try {
    localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, body.jobId);
  } catch {
    // ignore localStorage failures
  }

  return {
    success: true,
    jobId: body.jobId,
    stageId: body.stageId,
    previewUrl: body.previewUrl,
    packUrl: body.packUrl,
  };
}
