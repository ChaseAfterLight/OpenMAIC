import { describe, expect, it } from 'vitest';
import {
  buildLessonPackVersionRecord,
  ensureStageLessonPack,
  normalizeLessonPackMetadata,
} from '@/lib/utils/lesson-pack';
import type { StageRecord } from '@/lib/utils/database';

describe('lesson-pack utilities', () => {
  it('normalizes lesson pack metadata with safe defaults', () => {
    expect(
      normalizeLessonPackMetadata({
        grade: '  Grade 4  ',
        durationMinutes: 42.7,
        status: 'unknown' as never,
      }),
    ).toEqual({
      grade: 'Grade 4',
      subject: undefined,
      lessonType: undefined,
      durationMinutes: 43,
      textbookEdition: undefined,
      volume: undefined,
      unit: undefined,
      chapter: undefined,
      chapterId: undefined,
      status: 'draft',
      exportStatus: 'not_exported',
      lastExportedAt: undefined,
    });
  });

  it('backfills lesson pack metadata onto older stage records', () => {
    const stage: StageRecord = {
      id: 'stage-1',
      name: 'Fractions',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(ensureStageLessonPack(stage).lessonPack).toEqual({
      grade: undefined,
      subject: undefined,
      lessonType: undefined,
      durationMinutes: undefined,
      textbookEdition: undefined,
      volume: undefined,
      unit: undefined,
      chapter: undefined,
      chapterId: undefined,
      status: 'draft',
      exportStatus: 'not_exported',
      lastExportedAt: undefined,
    });
  });

  it('builds a version record snapshot with normalized stage metadata', () => {
    const record = buildLessonPackVersionRecord({
      versionId: 'version-1',
      stageId: 'stage-1',
      createdAt: 100,
      note: '  before export  ',
      stage: {
        id: 'stage-1',
        name: 'Fractions',
        createdAt: 1,
        updatedAt: 2,
      },
      scenes: [],
      chats: [],
    });

    expect(record).toMatchObject({
      id: 'version-1',
      stageId: 'stage-1',
      note: 'before export',
      source: 'manual',
      createdAt: 100,
      snapshot: {
        stage: {
          lessonPack: {
            status: 'draft',
            exportStatus: 'not_exported',
          },
        },
        scenes: [],
        chats: [],
      },
    });
  });
});
