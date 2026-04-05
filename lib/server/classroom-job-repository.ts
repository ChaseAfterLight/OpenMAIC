import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import {
  CLASSROOM_JOBS_DIR,
  ensureClassroomJobsDir,
  writeJsonFileAtomic,
} from '@/lib/server/classroom-storage';
import type { PostgresObjectStorageConfig } from '@/lib/server/storage-backend-config';
import { getServerStorageConfig } from '@/lib/server/storage-backend-config';
import { fromJsonColumn, getStoragePgPool, toJsonb } from '@/lib/server/storage-postgres';
import type { ClassroomGenerationJob } from '@/lib/server/classroom-job-types';

const log = createLogger('ClassroomJobRepository');

let readyPromise: Promise<void> | null = null;

function jobFilePath(jobId: string) {
  return path.join(CLASSROOM_JOBS_DIR, `${jobId}.json`);
}

function toEpochMillis(value?: string): number | null {
  if (!value) {
    return null;
  }
  const epoch = new Date(value).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

async function ensurePostgresSchema(config: PostgresObjectStorageConfig): Promise<void> {
  const pool = getStoragePgPool(config.databaseUrl);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classroom_generation_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      step TEXT NOT NULL,
      progress INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      started_at BIGINT,
      completed_at BIGINT,
      input_summary JSONB NOT NULL,
      scenes_generated INTEGER NOT NULL DEFAULT 0,
      total_scenes INTEGER,
      result_json JSONB,
      error TEXT,
      raw_job JSONB NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_classroom_generation_jobs_status_updated
    ON classroom_generation_jobs (status, updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_classroom_generation_jobs_completed_at
    ON classroom_generation_jobs (completed_at DESC);
  `);
}

export async function ensureClassroomJobStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const config = getServerStorageConfig();
      if (config.backend === 'file') {
        await ensureClassroomJobsDir();
        log.info('课堂生成 Job 存储已就绪: file');
        return;
      }

      await ensurePostgresSchema(config);
      log.info('课堂生成 Job 存储已就绪: postgres-object-storage');
    })();
  }

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    throw error;
  }
}

async function readFileJobRecord(jobId: string): Promise<ClassroomGenerationJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as ClassroomGenerationJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeFileJobRecord(job: ClassroomGenerationJob): Promise<void> {
  await writeJsonFileAtomic(jobFilePath(job.id), job);
}

async function listFileJobRecords(): Promise<ClassroomGenerationJob[]> {
  await ensureClassroomJobsDir();

  const entries = await fs.readdir(CLASSROOM_JOBS_DIR, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const content = await fs.readFile(path.join(CLASSROOM_JOBS_DIR, entry.name), 'utf-8');
        return JSON.parse(content) as ClassroomGenerationJob;
      }),
  );

  return jobs;
}

export async function readClassroomGenerationJobRecord(
  jobId: string,
): Promise<ClassroomGenerationJob | null> {
  await ensureClassroomJobStorageReady();

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    return readFileJobRecord(jobId);
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT raw_job
      FROM classroom_generation_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId],
  );
  if (result.rowCount === 0) {
    return null;
  }

  return fromJsonColumn<ClassroomGenerationJob>(result.rows[0].raw_job);
}

export async function writeClassroomGenerationJobRecord(
  job: ClassroomGenerationJob,
): Promise<void> {
  await ensureClassroomJobStorageReady();

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    await writeFileJobRecord(job);
    return;
  }

  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO classroom_generation_jobs (
        id,
        status,
        step,
        progress,
        message,
        created_at,
        updated_at,
        started_at,
        completed_at,
        input_summary,
        scenes_generated,
        total_scenes,
        result_json,
        error,
        raw_job
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12,
        $13::jsonb,
        $14,
        $15::jsonb
      )
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          step = EXCLUDED.step,
          progress = EXCLUDED.progress,
          message = EXCLUDED.message,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          input_summary = EXCLUDED.input_summary,
          scenes_generated = EXCLUDED.scenes_generated,
          total_scenes = EXCLUDED.total_scenes,
          result_json = EXCLUDED.result_json,
          error = EXCLUDED.error,
          raw_job = EXCLUDED.raw_job
    `,
    [
      job.id,
      job.status,
      job.step,
      job.progress,
      job.message,
      toEpochMillis(job.createdAt) ?? Date.now(),
      toEpochMillis(job.updatedAt) ?? Date.now(),
      toEpochMillis(job.startedAt),
      toEpochMillis(job.completedAt),
      toJsonb(job.inputSummary),
      job.scenesGenerated,
      job.totalScenes ?? null,
      toJsonb(job.result ?? null),
      job.error ?? null,
      toJsonb(job),
    ],
  );
}

export async function listClassroomGenerationJobRecordsByStatuses(
  statuses: ClassroomGenerationJob['status'][],
): Promise<ClassroomGenerationJob[]> {
  await ensureClassroomJobStorageReady();

  if (statuses.length === 0) {
    return [];
  }

  const config = getServerStorageConfig();
  if (config.backend === 'file') {
    const jobs = await listFileJobRecords();
    const statusSet = new Set(statuses);
    return jobs.filter((job) => statusSet.has(job.status));
  }

  const result = await getStoragePgPool(config.databaseUrl).query(
    `
      SELECT raw_job
      FROM classroom_generation_jobs
      WHERE status = ANY($1::text[])
      ORDER BY updated_at DESC
    `,
    [statuses],
  );

  return result.rows.map((row) => fromJsonColumn<ClassroomGenerationJob>(row.raw_job));
}
