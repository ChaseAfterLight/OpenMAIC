import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import {
  buildRequestOrigin,
  createClassroomGenerationPlaceholder,
  deleteClassroomGenerationPlaceholder,
} from '@/lib/server/classroom-storage';
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
  let placeholderStageId: string | undefined;
  try {
    const rawBody = (await req.json()) as Partial<GenerateClassroomInput>;
    const requirement = rawBody.requirements?.requirement || rawBody.requirement || '';
    const language: 'zh-CN' | 'en-US' =
      rawBody.requirements?.language === 'en-US' || rawBody.language === 'en-US'
        ? 'en-US'
        : 'zh-CN';
    requirementSnippet = requirement.substring(0, 60);
    const body: GenerateClassroomInput = {
      requirement,
      ...(rawBody.requirements
        ? {
            requirements: {
              ...rawBody.requirements,
              requirement,
              language,
            },
          }
        : {}),
      ...(rawBody.pdfContent ? { pdfContent: rawBody.pdfContent } : {}),
      language,
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
      ...(rawBody.lessonPackTitle ? { lessonPackTitle: rawBody.lessonPackTitle } : {}),
      ...(rawBody.lessonPackMetadata ? { lessonPackMetadata: rawBody.lessonPackMetadata } : {}),
      ...(rawBody.modelConfig ? { modelConfig: rawBody.modelConfig } : {}),
      ownerUserId: auth.user.id,
    };

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const stageId = nanoid(10);
    const jobInput: GenerateClassroomInput = {
      ...body,
      stageId,
    };
    const job = await createClassroomGenerationJob(jobId, jobInput);
    await createClassroomGenerationPlaceholder({
      id: stageId,
      jobId,
      ownerUserId: auth.user.id,
      name: body.lessonPackTitle || requirement.substring(0, 50) || 'Untitled Stage',
      language,
      lessonPack: jobInput.lessonPackMetadata,
    });
    placeholderStageId = stageId;
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, baseUrl));

    return apiSuccess(
      {
        jobId,
        stageId,
        status: job.status,
        step: job.step,
        progress: job.progress,
        message: job.message,
        pollUrl,
        previewUrl: `${baseUrl}/generation-preview?jobId=${jobId}`,
        packUrl: `${baseUrl}/packs/${stageId}`,
        pollIntervalMs: 5000,
        artifacts: job.artifacts,
        inputSummary: job.inputSummary,
      },
      202,
    );
  } catch (error) {
    if (placeholderStageId) {
      await deleteClassroomGenerationPlaceholder(placeholderStageId).catch(() => {});
    }
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
