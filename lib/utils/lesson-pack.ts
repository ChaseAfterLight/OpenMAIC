import type {
  LessonPackMetadata,
  LessonPackStatus,
  LessonPackVersionSource,
  Stage,
} from '@/lib/types/stage';
import type {
  ChatSessionRecord,
  LessonPackVersionRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

const VALID_LESSON_PACK_STATUSES = new Set<LessonPackStatus>([
  'draft',
  'in_progress',
  'ready',
  'archived',
]);

export const DEFAULT_LESSON_PACK_STATUS: LessonPackStatus = 'draft';

export function normalizeLessonPackMetadata(
  metadata?: Partial<LessonPackMetadata>,
): LessonPackMetadata {
  const durationMinutes =
    typeof metadata?.durationMinutes === 'number' && Number.isFinite(metadata.durationMinutes)
      ? Math.max(1, Math.round(metadata.durationMinutes))
      : undefined;
  const status = VALID_LESSON_PACK_STATUSES.has(metadata?.status as LessonPackStatus)
    ? (metadata!.status as LessonPackStatus)
    : DEFAULT_LESSON_PACK_STATUS;

  return {
    grade: metadata?.grade?.trim() || undefined,
    subject: metadata?.subject?.trim() || undefined,
    lessonType: metadata?.lessonType?.trim() || undefined,
    durationMinutes,
    textbookEdition: metadata?.textbookEdition?.trim() || undefined,
    volume: metadata?.volume?.trim() || undefined,
    unit: metadata?.unit?.trim() || undefined,
    chapter: metadata?.chapter?.trim() || undefined,
    chapterId: metadata?.chapterId?.trim() || undefined,
    status,
    exportStatus: metadata?.exportStatus === 'exported' ? 'exported' : 'not_exported',
    lastExportedAt:
      typeof metadata?.lastExportedAt === 'number' && Number.isFinite(metadata.lastExportedAt)
        ? metadata.lastExportedAt
        : undefined,
  };
}

export function ensureStageLessonPack<T extends Stage | StageRecord>(stage: T): T {
  return {
    ...stage,
    lessonPack: normalizeLessonPackMetadata(stage.lessonPack),
  } as T & { lessonPack: LessonPackMetadata };
}

export interface BuildLessonPackVersionRecordInput {
  versionId: string;
  stageId: string;
  createdAt: number;
  note?: string;
  source?: LessonPackVersionSource;
  stage: StageRecord;
  scenes: SceneRecord[];
  chats?: ChatSessionRecord[];
  playback?: (PlaybackStateRecord & { sceneId?: string }) | undefined;
  outlines?: StageOutlinesRecord | undefined;
}

export function buildLessonPackVersionRecord(
  input: BuildLessonPackVersionRecordInput,
): LessonPackVersionRecord {
  return {
    id: input.versionId,
    stageId: input.stageId,
    note: input.note?.trim() || undefined,
    source: input.source ?? 'manual',
    createdAt: input.createdAt,
    snapshot: {
      stage: ensureStageLessonPack(structuredClone(input.stage)),
      scenes: structuredClone(input.scenes ?? []),
      chats: structuredClone(input.chats ?? []),
      playback: input.playback ? structuredClone(input.playback) : undefined,
      outlines: input.outlines ? structuredClone(input.outlines) : undefined,
    },
  };
}
