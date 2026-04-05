import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import { ensureStageLessonPack } from '@/lib/utils/lesson-pack';
import {
  getStageRecord,
  getStageOutlinesRecord,
  listScenesByStageId,
  replaceScenesByStageId,
  saveStageRecord,
  saveStageOutlinesRecord,
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
  outlines?: SceneOutline[];
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
      const [scenes, outlinesRecord] = await Promise.all([
        listScenesByStageId(id),
        getStageOutlinesRecord(id),
      ]);
      const normalizedStage = ensureStageLessonPack(stage);
      return {
        id,
        ownerUserId: normalizedStage.ownerUserId,
        stage: normalizedStage,
        scenes,
        outlines: outlinesRecord?.outlines,
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
    stage: Stage & { currentSceneId?: string };
    scenes: Scene[];
    outlines?: SceneOutline[];
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
    outlines: data.outlines,
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
  if (data.outlines) {
    await saveStageOutlinesRecord({
      stageId: data.id,
      outlines: data.outlines,
      createdAt: normalizedStage.createdAt,
      updatedAt: normalizedStage.updatedAt,
    });
  }

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
