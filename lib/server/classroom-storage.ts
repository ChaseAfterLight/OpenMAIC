import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { LessonPackMetadata, Scene, Stage } from '@/lib/types/stage';
import { ensureStageLessonPack, normalizeLessonPackMetadata } from '@/lib/utils/lesson-pack';
import {
  deleteScenesByStageId,
  deleteStageRecord,
  getStageRecord,
  listScenesByStageId,
  replaceScenesByStageId,
  saveStageRecord,
} from '@/lib/server/storage-repository';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  ownerUserId?: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function readLegacyClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as PersistedClassroomData;
    return {
      ...parsed,
      stage: ensureStageLessonPack(parsed.stage),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  try {
    const stage = await getStageRecord(id);
    if (stage) {
      const scenes = await listScenesByStageId(id);
      const normalizedStage = ensureStageLessonPack(stage);
      return {
        id,
        ownerUserId: normalizedStage.ownerUserId,
        stage: normalizedStage,
        scenes,
        createdAt: new Date(normalizedStage.createdAt).toISOString(),
      };
    }
  } catch (error) {
    // Fall through to legacy file-backed classroom data.
    return readLegacyClassroom(id);
  }
  return readLegacyClassroom(id);
}

export async function persistClassroom(
  data: {
    id: string;
    ownerUserId?: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const normalizedStage = ensureStageLessonPack({
    ...data.stage,
    id: data.id,
    ownerUserId: data.ownerUserId ?? data.stage.ownerUserId,
  });
  const stageRecord = normalizedStage as Stage & { currentSceneId?: string };
  const classroomData: PersistedClassroomData = {
    id: data.id,
    ownerUserId: normalizedStage.ownerUserId,
    stage: normalizedStage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  await saveStageRecord({
    id: normalizedStage.id,
    ownerUserId: normalizedStage.ownerUserId,
    name: normalizedStage.name,
    description: normalizedStage.description,
    createdAt: normalizedStage.createdAt,
    updatedAt: normalizedStage.updatedAt,
    lessonPack: normalizedStage.lessonPack,
    language: normalizedStage.language,
    style: normalizedStage.style,
    currentSceneId: stageRecord.currentSceneId,
    agentIds: normalizedStage.agentIds,
    whiteboard: normalizedStage.whiteboard,
  } as unknown as Stage);
  await replaceScenesByStageId(
    data.id,
    data.scenes.map((scene, index) => ({
      ...scene,
      stageId: data.id,
      order: scene.order ?? index,
      createdAt: scene.createdAt ?? normalizedStage.createdAt,
      updatedAt: scene.updatedAt ?? normalizedStage.updatedAt,
    })),
  );

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}

export async function createClassroomGenerationPlaceholder(args: {
  id: string;
  jobId: string;
  ownerUserId?: string;
  name: string;
  language?: string;
  lessonPack?: Partial<LessonPackMetadata>;
}): Promise<Stage> {
  const now = Date.now();
  const stage: Stage = ensureStageLessonPack({
    id: args.id,
    ownerUserId: args.ownerUserId,
    name: args.name,
    description: undefined,
    language: args.language,
    style: 'interactive',
    createdAt: now,
    updatedAt: now,
    lessonPack: {
      ...args.lessonPack,
      status: 'in_progress',
      exportStatus: args.lessonPack?.exportStatus ?? 'not_exported',
      generationJobId: args.jobId,
      generationJobStatus: 'queued',
      generationProgress: 0,
      generationMessage: 'Classroom generation job queued',
    },
    agentIds: [],
    whiteboard: undefined,
  });

  await saveStageRecord({
    id: stage.id,
    ownerUserId: stage.ownerUserId,
    name: stage.name,
    description: stage.description,
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    lessonPack: stage.lessonPack,
    language: stage.language,
    style: stage.style,
    currentSceneId: undefined,
    agentIds: stage.agentIds,
    whiteboard: stage.whiteboard,
  } as unknown as Stage);

  return stage;
}

export async function syncClassroomGenerationPlaceholder(args: {
  stageId: string;
  lessonPackPatch?: Partial<LessonPackMetadata>;
  stagePatch?: Partial<Stage>;
}): Promise<Stage | null> {
  const existing = await getStageRecord(args.stageId);
  if (!existing) {
    return null;
  }

  const normalized = ensureStageLessonPack(existing);
  const updatedStage: Stage = ensureStageLessonPack({
    ...normalized,
    ...args.stagePatch,
    lessonPack: normalizeLessonPackMetadata({
      ...normalized.lessonPack,
      ...args.lessonPackPatch,
    }),
    updatedAt: Date.now(),
  });

  await saveStageRecord({
    id: updatedStage.id,
    ownerUserId: updatedStage.ownerUserId,
    name: updatedStage.name,
    description: updatedStage.description,
    createdAt: updatedStage.createdAt,
    updatedAt: updatedStage.updatedAt,
    lessonPack: updatedStage.lessonPack,
    language: updatedStage.language,
    style: updatedStage.style,
    currentSceneId: existing.currentSceneId,
    agentIds: updatedStage.agentIds,
    whiteboard: updatedStage.whiteboard,
  } as unknown as Stage);

  return updatedStage;
}

export async function deleteClassroomGenerationPlaceholder(stageId: string): Promise<void> {
  await deleteScenesByStageId(stageId);
  await deleteStageRecord(stageId);
}
