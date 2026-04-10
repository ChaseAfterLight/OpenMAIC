import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { requireApiRole } from '@/lib/server/auth-guards';
import { createLogger } from '@/lib/logger';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import type { Stage } from '@/lib/types/stage';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import {
  createClassroomGenerationJob,
  findLatestClassroomGenerationJobByClassroomId,
  findLiveClassroomGenerationJobByClassroomId,
} from '@/lib/server/classroom-job-store';
import { buildClassroomJobUrls } from '@/lib/server/classroom-job-response';

const log = createLogger('ClassroomGenerationJob API');

export const maxDuration = 30;

function restoreAgentsFromStage(stage: Stage): AgentInfo[] | undefined {
  if (!stage?.generatedAgentConfigs?.length) {
    return undefined;
  }

  return stage.generatedAgentConfigs.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    persona: agent.persona,
  }));
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  let classroomId = '';
  try {
    const { id } = await context.params;
    classroomId = id;
    if (!isValidClassroomId(classroomId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
    }

    const body = (await req.json().catch(() => ({}))) as Partial<{
      sceneId: string;
      outlineId: string;
      userProfile: string;
      modelString: string;
      providerType: string;
      enableImageGeneration: boolean;
      enableVideoGeneration: boolean;
      enableTTS: boolean;
    }>;

    const classroom = await readClassroom(classroomId);
    if (!classroom) {
      return apiError('INVALID_REQUEST', 404, 'Classroom not found');
    }
    if (!classroom.outlines?.length) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Classroom has no outlines to generate from');
    }

    const liveJob = await findLiveClassroomGenerationJobByClassroomId(classroomId);
    if (liveJob) {
      const urls = buildClassroomJobUrls(req, liveJob.id);
      return apiSuccess(
        {
          jobId: liveJob.id,
          status: liveJob.status,
          step: liveJob.step,
          message: liveJob.message,
          pollUrl: urls.pollUrl,
          eventsUrl: urls.eventsUrl,
          pollIntervalMs: 5000,
        },
        202,
      );
    }

    const latestJob = await findLatestClassroomGenerationJobByClassroomId(classroomId, [
      'succeeded',
      'failed',
      'queued',
      'running',
    ]);
    const sourceInput = latestJob?.resume?.input;

    let targetOrder: number | undefined;
    if (body.sceneId) {
      const scene = classroom.scenes.find((item) => item.id === body.sceneId);
      if (!scene) {
        return apiError('INVALID_REQUEST', 404, 'Scene not found');
      }
      targetOrder = scene.order;
    } else if (body.outlineId) {
      const outline = classroom.outlines.find((item) => item.id === body.outlineId);
      if (!outline) {
        return apiError('INVALID_REQUEST', 404, 'Outline not found');
      }
      targetOrder = outline.order;
    }

    const stageAgents = restoreAgentsFromStage(classroom.stage);
    const baseUrl = buildRequestOrigin(req);
    const requirement =
      sourceInput?.requirement || classroom.stage.description || classroom.stage.name || classroomId;
    const input: GenerateClassroomInput = {
      requirement,
      sceneOutlines: classroom.outlines,
      stageSeed: {
        id: classroom.stage.id,
        name: classroom.stage.name,
        description: classroom.stage.description,
        language: classroom.stage.language,
        style: classroom.stage.style,
        lessonPack: classroom.stage.lessonPack,
      },
      ...(sourceInput?.pdfFileName ? { pdfFileName: sourceInput.pdfFileName } : {}),
      ...(sourceInput?.pdfContent ? { pdfContent: sourceInput.pdfContent } : {}),
      ...(sourceInput?.pdfImages ? { pdfImages: sourceInput.pdfImages } : {}),
      ...(sourceInput?.moduleId ? { moduleId: sourceInput.moduleId } : {}),
      ...(sourceInput?.k12 ? { k12: sourceInput.k12 } : {}),
      ...(classroom.stage.language || sourceInput?.language
        ? { language: classroom.stage.language || sourceInput?.language }
        : {}),
      ...(body.modelString ? { modelString: body.modelString } : {}),
      ...(body.providerType ? { providerType: body.providerType } : {}),
      ...(sourceInput?.agentProfiles || stageAgents
        ? { agentProfiles: sourceInput?.agentProfiles || stageAgents }
        : {}),
      ...(body.userProfile ? { userProfile: body.userProfile } : {}),
      ...(body.enableImageGeneration != null
        ? { enableImageGeneration: body.enableImageGeneration }
        : sourceInput?.enableImageGeneration != null
          ? { enableImageGeneration: sourceInput.enableImageGeneration }
          : {}),
      ...(body.enableVideoGeneration != null
        ? { enableVideoGeneration: body.enableVideoGeneration }
        : sourceInput?.enableVideoGeneration != null
          ? { enableVideoGeneration: sourceInput.enableVideoGeneration }
          : {}),
      ...(body.enableTTS != null
        ? { enableTTS: body.enableTTS }
        : sourceInput?.enableTTS != null
          ? { enableTTS: sourceInput.enableTTS }
          : {}),
      ...(sourceInput?.agentMode ? { agentMode: sourceInput.agentMode } : {}),
      ...(targetOrder != null ? { sceneOrdersFilter: [targetOrder] } : {}),
      ...(body.sceneId && targetOrder != null ? { regenerateSceneOrders: [targetOrder] } : {}),
    };

    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, input, baseUrl);
    const urls = buildClassroomJobUrls(req, jobId);

    after(() => runClassroomGenerationJob(jobId, input, baseUrl, { classroomId }));

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
      `Classroom generation job creation failed [classroomId=${classroomId || 'unknown'}]:`,
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
