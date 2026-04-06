import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import type { PdfImage } from '@/lib/types/generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildClassroomJobUrls } from '@/lib/server/classroom-job-response';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { requireApiRole } from '@/lib/server/auth-guards';
import { createLogger } from '@/lib/logger';

const log = createLogger('GenerateClassroom API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  let requirementSnippet: string | undefined;
  try {
    const rawBody = (await req.json()) as Partial<GenerateClassroomInput>;
    requirementSnippet = rawBody.requirement?.substring(0, 60);
    const body: GenerateClassroomInput = {
      ...(rawBody.moduleId ? { moduleId: rawBody.moduleId } : {}),
      ...(rawBody.k12 ? { k12: rawBody.k12 } : {}),
      requirement: rawBody.requirement || '',
      ...(rawBody.pdfContent ? { pdfContent: rawBody.pdfContent } : {}),
      ...(rawBody.pdfImages ? { pdfImages: rawBody.pdfImages as PdfImage[] } : {}),
      ...(rawBody.language ? { language: rawBody.language } : {}),
      ...(rawBody.modelString ? { modelString: rawBody.modelString } : {}),
      ...(rawBody.apiKey ? { apiKey: rawBody.apiKey } : {}),
      ...(rawBody.baseUrl ? { baseUrl: rawBody.baseUrl } : {}),
      ...(rawBody.providerType ? { providerType: rawBody.providerType } : {}),
      ...(rawBody.requiresApiKey != null ? { requiresApiKey: rawBody.requiresApiKey } : {}),
      ...(rawBody.enableWebSearch != null ? { enableWebSearch: rawBody.enableWebSearch } : {}),
      ...(rawBody.webSearchProviderId ? { webSearchProviderId: rawBody.webSearchProviderId } : {}),
      ...(rawBody.webSearchApiKey ? { webSearchApiKey: rawBody.webSearchApiKey } : {}),
      ...(rawBody.baiduSubSources ? { baiduSubSources: rawBody.baiduSubSources } : {}),
      ...(rawBody.enableImageGeneration != null
        ? { enableImageGeneration: rawBody.enableImageGeneration }
        : {}),
      ...(rawBody.enableVideoGeneration != null
        ? { enableVideoGeneration: rawBody.enableVideoGeneration }
        : {}),
      ...(rawBody.enableTTS != null ? { enableTTS: rawBody.enableTTS } : {}),
      ...(rawBody.agentMode ? { agentMode: rawBody.agentMode } : {}),
    };
    const { requirement } = body;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body, baseUrl);
    const urls = buildClassroomJobUrls(req, jobId);

    after(() => runClassroomGenerationJob(jobId, body, baseUrl));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl: urls.pollUrl,
        eventsUrl: urls.eventsUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(
      `Classroom generation job creation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
