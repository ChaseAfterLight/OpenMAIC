import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { createLogger } from '@/lib/logger';
import type { PostgresObjectStorageConfig } from '@/lib/server/storage-backend-config';
import {
  buildImageObjectKey,
  buildStageMediaObjectKey,
  buildStageMediaPosterObjectKey,
} from '@/lib/server/storage-key-utils';
import {
  deleteObjectsFromStorage,
  ensureObjectStorageBucket,
  getObjectFromStorage,
  putObjectToStorage,
} from '@/lib/server/storage-object-store';
import {
  fromJsonColumn,
  getNullableText,
  getStoragePgPool,
  toJsonb,
  withStorageTransaction,
  type JsonRow,
} from '@/lib/server/storage-postgres';
import type {
  ServerImageMetadata,
  ServerMediaMetadata,
  ServerStorageRepository,
} from '@/lib/server/storage-repository-types';
import type {
  ChatSessionRecord,
  ImageFileRecord,
  LessonPackVersionRecord,
  MediaFileRecord,
  PlaybackStateRecord,
  SceneRecord,
  StageOutlinesRecord,
  StageRecord,
} from '@/lib/utils/database';

const log = createLogger('PostgresObjectStorageRepo');

const schemaPath = path.join(process.cwd(), 'db', 'postgres-object-storage.sql');

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function toStageRowParams(record: StageRecord) {
  return [
    record.id,
    record.name,
    record.description ?? null,
    record.language ?? null,
    record.style ?? null,
    record.currentSceneId ?? null,
    toJsonb(record.agentIds ?? []),
    record.lessonPack?.grade ?? null,
    record.lessonPack?.subject ?? null,
    record.lessonPack?.lessonType ?? null,
    record.lessonPack?.durationMinutes ?? null,
    record.lessonPack?.status ?? 'draft',
    record.lessonPack?.exportStatus ?? 'not_exported',
    record.lessonPack?.lastExportedAt ?? null,
    record.createdAt,
    record.updatedAt,
    toJsonb(record),
  ];
}

function toMediaMetadata(
  record: MediaFileRecord,
  options: {
    hasBlob: boolean;
    hasPoster: boolean;
    storageStatus: ServerMediaMetadata['storageStatus'];
    storageError?: string;
    objectKey?: string;
    posterObjectKey?: string;
  },
): ServerMediaMetadata {
  return {
    id: record.id,
    stageId: record.stageId,
    type: record.type,
    mimeType: record.mimeType,
    size: record.size,
    prompt: record.prompt,
    params: record.params,
    error: record.error,
    errorCode: record.errorCode,
    ossKey: options.objectKey,
    posterOssKey: options.posterObjectKey,
    createdAt: record.createdAt,
    hasBlob: options.hasBlob,
    hasPoster: options.hasPoster,
    storageStatus: options.storageStatus,
    storageError: options.storageError,
  };
}

function toImageMetadata(
  record: Omit<ImageFileRecord, 'blob'>,
  options: {
    hasBlob: boolean;
    storageStatus: ServerImageMetadata['storageStatus'];
    storageError?: string;
    objectKey?: string;
  },
): ServerImageMetadata {
  return {
    id: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    hasBlob: options.hasBlob,
    storageStatus: options.storageStatus,
    storageError: options.storageError,
    objectKey: options.objectKey,
  };
}

async function ensureClassroomRowExists(
  config: PostgresObjectStorageConfig,
  stageId: string,
  createdAt: number,
  updatedAt: number,
): Promise<void> {
  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO classrooms (
        stage_id, name, description, language, style, current_scene_id, agent_ids,
        lesson_pack_grade, lesson_pack_subject, lesson_pack_type, lesson_pack_duration_minutes,
        lesson_pack_status, export_status, last_exported_at, created_at, updated_at, raw_stage
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
      )
      ON CONFLICT (stage_id) DO NOTHING
    `,
    [
      stageId,
      'Untitled Stage',
      null,
      null,
      null,
      null,
      toJsonb([]),
      null,
      null,
      null,
      null,
      'draft',
      'not_exported',
      null,
      createdAt,
      updatedAt,
      toJsonb({
        id: stageId,
        name: 'Untitled Stage',
        description: null,
        language: null,
        style: null,
        lessonPack: {
          status: 'draft',
          exportStatus: 'not_exported',
        },
        createdAt,
        updatedAt,
        agentIds: [],
      }),
    ],
  );
}

function mapMediaRow(row: JsonRow): ServerMediaMetadata {
  return {
    id: String(row.id),
    stageId: String(row.stage_id),
    type: String(row.media_type) as MediaFileRecord['type'],
    mimeType: String(row.mime_type),
    size: Number(row.size),
    prompt: String(row.prompt),
    params: String(row.params),
    error: getNullableText(row.error),
    errorCode: getNullableText(row.error_code),
    ossKey: getNullableText(row.object_key),
    posterOssKey: getNullableText(row.poster_object_key),
    createdAt: Number(row.created_at),
    hasBlob: Boolean(row.has_blob),
    hasPoster: Boolean(row.has_poster),
    storageStatus: String(row.storage_status) as ServerMediaMetadata['storageStatus'],
    storageError: getNullableText(row.storage_error),
  };
}

function mapImageRow(row: JsonRow): ServerImageMetadata {
  return {
    id: String(row.id),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    createdAt: Number(row.created_at),
    hasBlob: Boolean(row.has_blob),
    storageStatus: String(row.storage_status) as ServerImageMetadata['storageStatus'],
    storageError: getNullableText(row.storage_error),
    objectKey: getNullableText(row.object_key),
  };
}

async function applySchemaIfNeeded(config: PostgresObjectStorageConfig): Promise<void> {
  if (!config.autoInitialize) {
    return;
  }

  const sql = await fs.readFile(schemaPath, 'utf-8');
  await getStoragePgPool(config.databaseUrl).query(sql);
  await ensureObjectStorageBucket(config);
}

async function replaceScenesInTransaction(
  client: PoolClient,
  stageId: string,
  records: SceneRecord[],
): Promise<void> {
  await client.query('DELETE FROM scenes WHERE stage_id = $1', [stageId]);
  for (const record of records) {
    await client.query(
      `
        INSERT INTO scenes (
          id, stage_id, order_index, scene_type, title, content, actions, whiteboard, created_at, updated_at, raw_scene
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb)
      `,
      [
        record.id,
        record.stageId,
        record.order,
        record.type,
        record.title,
        toJsonb(record.content),
        toJsonb(record.actions ?? []),
        toJsonb(record.whiteboard ?? []),
        record.createdAt,
        record.updatedAt,
        toJsonb(record),
      ],
    );
  }
}

async function replaceChatSessionsInTransaction(
  client: PoolClient,
  stageId: string,
  records: ChatSessionRecord[],
): Promise<void> {
  await client.query('DELETE FROM chat_sessions WHERE stage_id = $1', [stageId]);
  for (const record of records) {
    await client.query(
      `
        INSERT INTO chat_sessions (
          id, stage_id, session_type, title, status, messages, config, tool_calls, pending_tool_calls,
          scene_id, last_action_index, created_at, updated_at, raw_session
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14::jsonb)
      `,
      [
        record.id,
        record.stageId,
        record.type,
        record.title,
        record.status,
        toJsonb(record.messages),
        toJsonb(record.config),
        toJsonb(record.toolCalls),
        toJsonb(record.pendingToolCalls),
        record.sceneId ?? null,
        record.lastActionIndex ?? null,
        record.createdAt,
        record.updatedAt,
        toJsonb(record),
      ],
    );
  }
}

async function upsertMediaRow(
  config: PostgresObjectStorageConfig,
  record: MediaFileRecord,
  metadata: ServerMediaMetadata,
  checksums?: { blob?: string; poster?: string },
): Promise<void> {
  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO media_files (
        id, stage_id, media_type, mime_type, size, prompt, params, error, error_code, object_key, poster_object_key,
        has_blob, has_poster, storage_status, storage_error, checksum_sha256, poster_checksum_sha256,
        metadata_json, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20
      )
      ON CONFLICT (id) DO UPDATE SET
        stage_id = EXCLUDED.stage_id,
        media_type = EXCLUDED.media_type,
        mime_type = EXCLUDED.mime_type,
        size = EXCLUDED.size,
        prompt = EXCLUDED.prompt,
        params = EXCLUDED.params,
        error = EXCLUDED.error,
        error_code = EXCLUDED.error_code,
        object_key = EXCLUDED.object_key,
        poster_object_key = EXCLUDED.poster_object_key,
        has_blob = EXCLUDED.has_blob,
        has_poster = EXCLUDED.has_poster,
        storage_status = EXCLUDED.storage_status,
        storage_error = EXCLUDED.storage_error,
        checksum_sha256 = EXCLUDED.checksum_sha256,
        poster_checksum_sha256 = EXCLUDED.poster_checksum_sha256,
        metadata_json = EXCLUDED.metadata_json,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      record.id,
      record.stageId,
      record.type,
      record.mimeType,
      record.size,
      record.prompt,
      record.params,
      record.error ?? null,
      record.errorCode ?? null,
      metadata.ossKey ?? null,
      metadata.posterOssKey ?? null,
      metadata.hasBlob,
      metadata.hasPoster,
      metadata.storageStatus,
      metadata.storageError ?? null,
      checksums?.blob ?? null,
      checksums?.poster ?? null,
      toJsonb(metadata),
      record.createdAt,
      Date.now(),
    ],
  );
}

async function upsertImageRow(
  config: PostgresObjectStorageConfig,
  record: Omit<ImageFileRecord, 'blob'>,
  metadata: ServerImageMetadata,
  checksum?: string,
): Promise<void> {
  await getStoragePgPool(config.databaseUrl).query(
    `
      INSERT INTO image_files (
        id, filename, mime_type, size, object_key, has_blob, storage_status, storage_error,
        checksum_sha256, metadata_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        filename = EXCLUDED.filename,
        mime_type = EXCLUDED.mime_type,
        size = EXCLUDED.size,
        object_key = EXCLUDED.object_key,
        has_blob = EXCLUDED.has_blob,
        storage_status = EXCLUDED.storage_status,
        storage_error = EXCLUDED.storage_error,
        checksum_sha256 = EXCLUDED.checksum_sha256,
        metadata_json = EXCLUDED.metadata_json,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      record.id,
      record.filename,
      record.mimeType,
      record.size,
      metadata.objectKey ?? null,
      metadata.hasBlob,
      metadata.storageStatus,
      metadata.storageError ?? null,
      checksum ?? null,
      toJsonb(metadata),
      record.createdAt,
      Date.now(),
    ],
  );
}

export function createPostgresObjectStorageRepository(
  config: PostgresObjectStorageConfig,
): ServerStorageRepository {
  let initPromise: Promise<void> | null = null;

  async function ensureReady(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        await applySchemaIfNeeded(config);
        log.info(
          `服务端存储后端已启用: PostgreSQL + Object Storage (bucket=${config.objectStorageBucket}, prefix=${config.objectKeyPrefix})`,
        );
      })();
    }
    await initPromise;
  }

  async function deleteMediaObjectKeys(keys: string[]): Promise<void> {
    try {
      await deleteObjectsFromStorage(config, keys);
    } catch (error) {
      log.warn('对象存储媒体删除失败，已保留数据库删除结果', error);
    }
  }

  async function deleteImageObjectKeys(keys: string[]): Promise<void> {
    try {
      await deleteObjectsFromStorage(config, keys);
    } catch (error) {
      log.warn('对象存储图片删除失败，已保留数据库删除结果', error);
    }
  }

  const repository: ServerStorageRepository = {
    async ensureReady(): Promise<void> {
      await ensureReady();
    },

    async saveStageRecord(record: StageRecord): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        `
          INSERT INTO classrooms (
            stage_id, name, description, language, style, current_scene_id, agent_ids,
            lesson_pack_grade, lesson_pack_subject, lesson_pack_type, lesson_pack_duration_minutes,
            lesson_pack_status, export_status, last_exported_at, created_at, updated_at, raw_stage
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
          )
          ON CONFLICT (stage_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            language = EXCLUDED.language,
            style = EXCLUDED.style,
            current_scene_id = EXCLUDED.current_scene_id,
            agent_ids = EXCLUDED.agent_ids,
            lesson_pack_grade = EXCLUDED.lesson_pack_grade,
            lesson_pack_subject = EXCLUDED.lesson_pack_subject,
            lesson_pack_type = EXCLUDED.lesson_pack_type,
            lesson_pack_duration_minutes = EXCLUDED.lesson_pack_duration_minutes,
            lesson_pack_status = EXCLUDED.lesson_pack_status,
            export_status = EXCLUDED.export_status,
            last_exported_at = EXCLUDED.last_exported_at,
            updated_at = EXCLUDED.updated_at,
            raw_stage = EXCLUDED.raw_stage,
            version = classrooms.version + 1,
            sync_status = 'synced',
            sync_error = NULL
        `,
        toStageRowParams(record),
      );
    },

    async getStageRecord(stageId: string): Promise<StageRecord | null> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_stage FROM classrooms WHERE stage_id = $1',
        [stageId],
      );
      if (result.rowCount === 0) {
        return null;
      }
      return fromJsonColumn<StageRecord>(result.rows[0].raw_stage);
    },

    async deleteStageRecord(stageId: string): Promise<void> {
      await ensureReady();
      const objectKeys = await withStorageTransaction(config.databaseUrl, async (client) => {
        const mediaRows = await client.query(
          'DELETE FROM media_files WHERE stage_id = $1 RETURNING object_key, poster_object_key',
          [stageId],
        );
        await client.query('DELETE FROM chat_sessions WHERE stage_id = $1', [stageId]);
        await client.query('DELETE FROM scenes WHERE stage_id = $1', [stageId]);
        await client.query('DELETE FROM playback_states WHERE stage_id = $1', [stageId]);
        await client.query('DELETE FROM stage_outlines WHERE stage_id = $1', [stageId]);
        await client.query('DELETE FROM classrooms WHERE stage_id = $1', [stageId]);
        return mediaRows.rows
          .flatMap((row) => [row.object_key, row.poster_object_key])
          .filter(Boolean) as string[];
      });
      await deleteMediaObjectKeys(objectKeys);
    },

    async listStageRecordsByUpdatedAtDesc(): Promise<StageRecord[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_stage FROM classrooms ORDER BY updated_at DESC',
      );
      return result.rows.map((row) => fromJsonColumn<StageRecord>(row.raw_stage));
    },

    async replaceScenesByStageId(stageId: string, records: SceneRecord[]): Promise<void> {
      await ensureReady();
      await withStorageTransaction(config.databaseUrl, async (client) => {
        await replaceScenesInTransaction(client, stageId, records);
      });
    },

    async listScenesByStageId(stageId: string): Promise<SceneRecord[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_scene FROM scenes WHERE stage_id = $1 ORDER BY order_index ASC',
        [stageId],
      );
      return result.rows.map((row) => fromJsonColumn<SceneRecord>(row.raw_scene));
    },

    async countScenesByStageId(stageId: string): Promise<number> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT COUNT(*)::int AS count FROM scenes WHERE stage_id = $1',
        [stageId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async deleteScenesByStageId(stageId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query('DELETE FROM scenes WHERE stage_id = $1', [
        stageId,
      ]);
    },

    async replaceChatSessionsByStageId(
      stageId: string,
      records: ChatSessionRecord[],
    ): Promise<void> {
      await ensureReady();
      await withStorageTransaction(config.databaseUrl, async (client) => {
        await replaceChatSessionsInTransaction(client, stageId, records);
      });
    },

    async listChatSessionsByStageId(stageId: string): Promise<ChatSessionRecord[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_session FROM chat_sessions WHERE stage_id = $1 ORDER BY created_at ASC',
        [stageId],
      );
      return result.rows.map((row) => fromJsonColumn<ChatSessionRecord>(row.raw_session));
    },

    async deleteChatSessionsByStageId(stageId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM chat_sessions WHERE stage_id = $1',
        [stageId],
      );
    },

    async savePlaybackStateRecord(
      record: PlaybackStateRecord & { sceneId?: string },
    ): Promise<void> {
      await ensureReady();
      await ensureClassroomRowExists(config, record.stageId, record.updatedAt, record.updatedAt);
      await getStoragePgPool(config.databaseUrl).query(
        `
          INSERT INTO playback_states (
            stage_id, scene_index, action_index, consumed_discussions, scene_id, updated_at, raw_playback
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)
          ON CONFLICT (stage_id) DO UPDATE SET
            scene_index = EXCLUDED.scene_index,
            action_index = EXCLUDED.action_index,
            consumed_discussions = EXCLUDED.consumed_discussions,
            scene_id = EXCLUDED.scene_id,
            updated_at = EXCLUDED.updated_at,
            raw_playback = EXCLUDED.raw_playback
        `,
        [
          record.stageId,
          record.sceneIndex,
          record.actionIndex,
          toJsonb(record.consumedDiscussions),
          record.sceneId ?? null,
          record.updatedAt,
          toJsonb(record),
        ],
      );
    },

    async getPlaybackStateRecord(
      stageId: string,
    ): Promise<(PlaybackStateRecord & { sceneId?: string }) | null> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_playback FROM playback_states WHERE stage_id = $1',
        [stageId],
      );
      if (result.rowCount === 0) {
        return null;
      }
      return fromJsonColumn<PlaybackStateRecord & { sceneId?: string }>(
        result.rows[0].raw_playback,
      );
    },

    async deletePlaybackStateRecord(stageId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM playback_states WHERE stage_id = $1',
        [stageId],
      );
    },

    async saveStageOutlinesRecord(record: StageOutlinesRecord): Promise<void> {
      await ensureReady();
      await ensureClassroomRowExists(config, record.stageId, record.createdAt, record.updatedAt);
      await getStoragePgPool(config.databaseUrl).query(
        `
          INSERT INTO stage_outlines (stage_id, outlines, created_at, updated_at, raw_outlines)
          VALUES ($1, $2::jsonb, $3, $4, $5::jsonb)
          ON CONFLICT (stage_id) DO UPDATE SET
            outlines = EXCLUDED.outlines,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            raw_outlines = EXCLUDED.raw_outlines
        `,
        [
          record.stageId,
          toJsonb(record.outlines),
          record.createdAt,
          record.updatedAt,
          toJsonb(record),
        ],
      );
    },

    async getStageOutlinesRecord(stageId: string): Promise<StageOutlinesRecord | null> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_outlines FROM stage_outlines WHERE stage_id = $1',
        [stageId],
      );
      if (result.rowCount === 0) {
        return null;
      }
      return fromJsonColumn<StageOutlinesRecord>(result.rows[0].raw_outlines);
    },

    async deleteStageOutlinesRecord(stageId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM stage_outlines WHERE stage_id = $1',
        [stageId],
      );
    },

    async saveLessonPackVersionRecord(record: LessonPackVersionRecord): Promise<void> {
      await ensureReady();
      await ensureClassroomRowExists(config, record.stageId, record.createdAt, record.createdAt);
      await getStoragePgPool(config.databaseUrl).query(
        `
          INSERT INTO lesson_pack_versions (
            version_id, stage_id, note, source, snapshot, created_at, raw_version
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
          ON CONFLICT (version_id) DO UPDATE SET
            stage_id = EXCLUDED.stage_id,
            note = EXCLUDED.note,
            source = EXCLUDED.source,
            snapshot = EXCLUDED.snapshot,
            created_at = EXCLUDED.created_at,
            raw_version = EXCLUDED.raw_version
        `,
        [
          record.id,
          record.stageId,
          record.note ?? null,
          record.source,
          toJsonb(record.snapshot),
          record.createdAt,
          toJsonb(record),
        ],
      );
    },

    async getLessonPackVersionRecord(
      stageId: string,
      versionId: string,
    ): Promise<LessonPackVersionRecord | null> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_version FROM lesson_pack_versions WHERE stage_id = $1 AND version_id = $2',
        [stageId, versionId],
      );
      if (result.rowCount === 0) {
        return null;
      }
      return fromJsonColumn<LessonPackVersionRecord>(result.rows[0].raw_version);
    },

    async listLessonPackVersionRecordsByStageId(
      stageId: string,
    ): Promise<LessonPackVersionRecord[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT raw_version FROM lesson_pack_versions WHERE stage_id = $1 ORDER BY created_at DESC',
        [stageId],
      );
      return result.rows.map((row) => fromJsonColumn<LessonPackVersionRecord>(row.raw_version));
    },

    async deleteLessonPackVersionRecord(stageId: string, versionId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM lesson_pack_versions WHERE stage_id = $1 AND version_id = $2',
        [stageId, versionId],
      );
    },

    async deleteLessonPackVersionsByStageId(stageId: string): Promise<void> {
      await ensureReady();
      await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM lesson_pack_versions WHERE stage_id = $1',
        [stageId],
      );
    },

    async saveMediaFileRecord(record: MediaFileRecord): Promise<void> {
      await ensureReady();

      const objectKey = buildStageMediaObjectKey(
        config.objectKeyPrefix,
        record.stageId,
        record.id,
        record.mimeType,
      );
      const posterObjectKey = record.poster
        ? buildStageMediaPosterObjectKey(config.objectKeyPrefix, record.stageId, record.id)
        : undefined;
      const hasBlob = record.blob.size > 0 && !record.errorCode;
      const hasPoster = Boolean(record.poster && record.poster.size > 0);

      if (!hasBlob) {
        const failedMetadata = toMediaMetadata(record, {
          hasBlob: false,
          hasPoster: false,
          storageStatus: record.errorCode ? 'failed' : 'pending',
          storageError: record.error,
        });
        await upsertMediaRow(config, record, failedMetadata);
        return;
      }

      const blobBuffer = Buffer.from(await record.blob.arrayBuffer());
      const posterBuffer = hasPoster ? Buffer.from(await record.poster!.arrayBuffer()) : undefined;

      try {
        await putObjectToStorage(config, objectKey, blobBuffer, record.mimeType);
        if (posterBuffer && posterObjectKey) {
          await putObjectToStorage(
            config,
            posterObjectKey,
            posterBuffer,
            record.poster?.type || 'image/png',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`对象存储上传失败，媒体 ${record.id} 已标记失败`, error);
        const failedMetadata = toMediaMetadata(record, {
          hasBlob: false,
          hasPoster: false,
          storageStatus: 'failed',
          storageError: message,
        });
        await upsertMediaRow(config, record, failedMetadata);
        throw error;
      }

      const readyMetadata = toMediaMetadata(record, {
        hasBlob: true,
        hasPoster,
        storageStatus: 'ready',
        objectKey,
        posterObjectKey: hasPoster ? posterObjectKey : undefined,
      });

      try {
        await upsertMediaRow(config, record, readyMetadata, {
          blob: hashBuffer(blobBuffer),
          poster: posterBuffer ? hashBuffer(posterBuffer) : undefined,
        });
      } catch (error) {
        await deleteMediaObjectKeys([objectKey, posterObjectKey ?? '']);
        log.warn(`数据库写入失败，媒体 ${record.id} 的对象已回滚删除`, error);
        throw error;
      }
    },

    async listMediaFilesByStageId(stageId: string): Promise<ServerMediaMetadata[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT * FROM media_files WHERE stage_id = $1 ORDER BY created_at DESC',
        [stageId],
      );
      return result.rows.map(mapMediaRow);
    },

    async getMediaFileBlob(stageId: string, mediaId: string) {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT mime_type, object_key, has_blob FROM media_files WHERE stage_id = $1 AND id = $2',
        [stageId, mediaId],
      );
      if (result.rowCount === 0 || !result.rows[0].has_blob || !result.rows[0].object_key) {
        return null;
      }
      const buffer = await getObjectFromStorage(config, String(result.rows[0].object_key));
      return {
        buffer,
        mimeType: String(result.rows[0].mime_type),
      };
    },

    async getMediaPosterBlob(stageId: string, mediaId: string) {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT poster_object_key, has_poster FROM media_files WHERE stage_id = $1 AND id = $2',
        [stageId, mediaId],
      );
      if (
        result.rowCount === 0 ||
        !result.rows[0].has_poster ||
        !result.rows[0].poster_object_key
      ) {
        return null;
      }
      const buffer = await getObjectFromStorage(config, String(result.rows[0].poster_object_key));
      return {
        buffer,
        mimeType: 'image/png',
      };
    },

    async deleteMediaFilesByStageId(stageId: string): Promise<void> {
      await ensureReady();
      const rows = await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM media_files WHERE stage_id = $1 RETURNING object_key, poster_object_key',
        [stageId],
      );
      await deleteMediaObjectKeys(
        rows.rows
          .flatMap((row) => [row.object_key, row.poster_object_key])
          .filter(Boolean) as string[],
      );
    },

    async saveImageFileRecord(record: ImageFileRecord): Promise<void> {
      await ensureReady();
      const objectKey = buildImageObjectKey(
        config.objectKeyPrefix,
        record.id,
        record.filename,
        record.mimeType,
      );
      const blobBuffer = Buffer.from(await record.blob.arrayBuffer());

      try {
        await putObjectToStorage(config, objectKey, blobBuffer, record.mimeType);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`对象存储上传失败，图片 ${record.id} 已标记失败`, error);
        await upsertImageRow(
          config,
          {
            id: record.id,
            filename: record.filename,
            mimeType: record.mimeType,
            size: record.size,
            createdAt: record.createdAt,
          },
          toImageMetadata(
            {
              id: record.id,
              filename: record.filename,
              mimeType: record.mimeType,
              size: record.size,
              createdAt: record.createdAt,
            },
            {
              hasBlob: false,
              storageStatus: 'failed',
              storageError: message,
            },
          ),
        );
        throw error;
      }

      const baseRecord = {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
      };

      try {
        await upsertImageRow(
          config,
          baseRecord,
          toImageMetadata(baseRecord, {
            hasBlob: true,
            storageStatus: 'ready',
            objectKey,
          }),
          hashBuffer(blobBuffer),
        );
      } catch (error) {
        await deleteImageObjectKeys([objectKey]);
        log.warn(`数据库写入失败，图片 ${record.id} 的对象已回滚删除`, error);
        throw error;
      }
    },

    async getImageFileRecordMetadata(id: string): Promise<ServerImageMetadata | null> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT * FROM image_files WHERE id = $1',
        [id],
      );
      if (result.rowCount === 0) {
        return null;
      }
      return mapImageRow(result.rows[0]);
    },

    async getImageFileBlob(id: string) {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT mime_type, object_key, has_blob FROM image_files WHERE id = $1',
        [id],
      );
      if (result.rowCount === 0 || !result.rows[0].has_blob || !result.rows[0].object_key) {
        return null;
      }
      const buffer = await getObjectFromStorage(config, String(result.rows[0].object_key));
      return {
        buffer,
        mimeType: String(result.rows[0].mime_type),
      };
    },

    async listImageFileRecordMetadata(): Promise<ServerImageMetadata[]> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'SELECT * FROM image_files ORDER BY created_at DESC',
      );
      return result.rows.map(mapImageRow);
    },

    async deleteImageFileRecord(id: string): Promise<void> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM image_files WHERE id = $1 RETURNING object_key',
        [id],
      );
      const keys = result.rows
        .map((row) => getNullableText(row.object_key))
        .filter(Boolean) as string[];
      await deleteImageObjectKeys(keys);
    },

    async deleteImageFileRecordsBefore(createdAt: number): Promise<void> {
      await ensureReady();
      const result = await getStoragePgPool(config.databaseUrl).query(
        'DELETE FROM image_files WHERE created_at < $1 RETURNING object_key',
        [createdAt],
      );
      const keys = result.rows
        .map((row) => getNullableText(row.object_key))
        .filter(Boolean) as string[];
      await deleteImageObjectKeys(keys);
    },
  };

  return repository;
}
