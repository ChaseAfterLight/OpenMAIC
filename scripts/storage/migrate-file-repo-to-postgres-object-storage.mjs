import { promises as fs } from 'fs';
import path from 'path';
import {
  applySchema,
  buildImageObjectKey,
  buildStageMediaObjectKey,
  buildStageMediaPosterObjectKey,
  ensureBucket,
  getPool,
  loadStorageConfig,
  putObject,
  readBufferIfExists,
  readJsonIfExists,
  sha256,
  writeReport,
} from './_common.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function log(message) {
  console.log(`[storage:migrate] ${message}`);
}

async function listDirectories(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function migrateStage(config, pool, stageRoot, report) {
  const stage = await readJsonIfExists(path.join(stageRoot, 'stage.json'));
  if (!stage) {
    report.skippedStages.push({ stageRoot, reason: 'missing stage.json' });
    return;
  }

  const scenes = (await readJsonIfExists(path.join(stageRoot, 'scenes.json'))) ?? [];
  const chats = (await readJsonIfExists(path.join(stageRoot, 'chat-sessions.json'))) ?? [];
  const playback = await readJsonIfExists(path.join(stageRoot, 'playback.json'));
  const outlines = await readJsonIfExists(path.join(stageRoot, 'outlines.json'));
  const mediaDir = path.join(stageRoot, 'media');
  const mediaEntries = await fs.readdir(mediaDir).catch(() => []);
  const mediaJsonFiles = mediaEntries.filter((name) => name.endsWith('.json'));
  const mediaRows = [];

  for (const filename of mediaJsonFiles) {
    const metadata = await readJsonIfExists(path.join(mediaDir, filename));
    if (!metadata) continue;

    const blobBuffer = await readBufferIfExists(path.join(mediaDir, filename.replace(/\.json$/, '.bin')));
    const posterBuffer = metadata.hasPoster
      ? await readBufferIfExists(path.join(mediaDir, filename.replace(/\.json$/, '.poster.bin')))
      : null;
    const objectKey =
      blobBuffer && metadata.size > 0 && !metadata.errorCode
        ? buildStageMediaObjectKey(config.objectKeyPrefix, metadata.stageId, metadata.id, metadata.mimeType)
        : null;
    const posterObjectKey =
      posterBuffer && metadata.hasPoster
        ? buildStageMediaPosterObjectKey(config.objectKeyPrefix, metadata.stageId, metadata.id)
        : null;

    if (!dryRun && objectKey && blobBuffer) {
      await putObject(config, objectKey, blobBuffer, metadata.mimeType);
    }
    if (!dryRun && posterObjectKey && posterBuffer) {
      await putObject(config, posterObjectKey, posterBuffer, 'image/png');
    }

    mediaRows.push({
      ...metadata,
      objectKey,
      posterObjectKey,
      hasBlob: Boolean(objectKey),
      storageStatus: metadata.errorCode ? 'failed' : objectKey ? 'ready' : 'pending',
      storageError: metadata.error,
      checksum: blobBuffer ? sha256(blobBuffer) : null,
      posterChecksum: posterBuffer ? sha256(posterBuffer) : null,
    });
  }

  if (dryRun) {
    report.stages += 1;
    report.scenes += scenes.length;
    report.chatSessions += chats.length;
    report.mediaFiles += mediaRows.length;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO classrooms (
          stage_id, name, description, language, style, current_scene_id, agent_ids,
          created_at, updated_at, raw_stage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
        ON CONFLICT (stage_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          language = EXCLUDED.language,
          style = EXCLUDED.style,
          current_scene_id = EXCLUDED.current_scene_id,
          agent_ids = EXCLUDED.agent_ids,
          updated_at = EXCLUDED.updated_at,
          raw_stage = EXCLUDED.raw_stage
      `,
      [
        stage.id,
        stage.name,
        stage.description ?? null,
        stage.language ?? null,
        stage.style ?? null,
        stage.currentSceneId ?? null,
        JSON.stringify(stage.agentIds ?? []),
        stage.createdAt,
        stage.updatedAt,
        JSON.stringify(stage),
      ],
    );

    await client.query('DELETE FROM scenes WHERE stage_id = $1', [stage.id]);
    for (const scene of scenes) {
      await client.query(
        `
          INSERT INTO scenes (
            id, stage_id, order_index, scene_type, title, content, actions, whiteboard, created_at, updated_at, raw_scene
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb)
        `,
        [
          scene.id,
          scene.stageId,
          scene.order,
          scene.type,
          scene.title,
          JSON.stringify(scene.content),
          JSON.stringify(scene.actions ?? []),
          JSON.stringify(scene.whiteboard ?? []),
          scene.createdAt,
          scene.updatedAt,
          JSON.stringify(scene),
        ],
      );
    }

    await client.query('DELETE FROM chat_sessions WHERE stage_id = $1', [stage.id]);
    for (const chat of chats) {
      await client.query(
        `
          INSERT INTO chat_sessions (
            id, stage_id, session_type, title, status, messages, config, tool_calls, pending_tool_calls,
            scene_id, last_action_index, created_at, updated_at, raw_session
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14::jsonb)
        `,
        [
          chat.id,
          chat.stageId,
          chat.type,
          chat.title,
          chat.status,
          JSON.stringify(chat.messages),
          JSON.stringify(chat.config),
          JSON.stringify(chat.toolCalls),
          JSON.stringify(chat.pendingToolCalls),
          chat.sceneId ?? null,
          chat.lastActionIndex ?? null,
          chat.createdAt,
          chat.updatedAt,
          JSON.stringify(chat),
        ],
      );
    }

    await client.query('DELETE FROM playback_states WHERE stage_id = $1', [stage.id]);
    if (playback) {
      await client.query(
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
          playback.stageId,
          playback.sceneIndex,
          playback.actionIndex,
          JSON.stringify(playback.consumedDiscussions ?? []),
          playback.sceneId ?? null,
          playback.updatedAt,
          JSON.stringify(playback),
        ],
      );
    }

    await client.query('DELETE FROM stage_outlines WHERE stage_id = $1', [stage.id]);
    if (outlines) {
      await client.query(
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
          outlines.stageId,
          JSON.stringify(outlines.outlines ?? []),
          outlines.createdAt,
          outlines.updatedAt,
          JSON.stringify(outlines),
        ],
      );
    }

    await client.query('DELETE FROM media_files WHERE stage_id = $1', [stage.id]);
    for (const media of mediaRows) {
      await client.query(
        `
          INSERT INTO media_files (
            id, stage_id, media_type, mime_type, size, prompt, params, error, error_code, object_key, poster_object_key,
            has_blob, has_poster, storage_status, storage_error, checksum_sha256, poster_checksum_sha256,
            metadata_json, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20
          )
        `,
        [
          media.id,
          media.stageId,
          media.type,
          media.mimeType,
          media.size,
          media.prompt,
          media.params,
          media.error ?? null,
          media.errorCode ?? null,
          media.objectKey,
          media.posterObjectKey,
          media.hasBlob,
          Boolean(media.posterObjectKey),
          media.storageStatus,
          media.storageError ?? null,
          media.checksum,
          media.posterChecksum,
          JSON.stringify({
            ...media,
            ossKey: media.objectKey,
            posterOssKey: media.posterObjectKey,
          }),
          media.createdAt,
          Date.now(),
        ],
      );
    }

    await client.query('COMMIT');
    report.stages += 1;
    report.scenes += scenes.length;
    report.chatSessions += chats.length;
    report.mediaFiles += mediaRows.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    report.failures.push({
      stageId: stage.id,
      stageRoot,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    client.release();
  }
}

async function migrateImages(config, pool, report) {
  const imagesRoot = path.join(config.storageRoot, 'images');
  const entries = await fs.readdir(imagesRoot).catch(() => []);
  const jsonFiles = entries.filter((name) => name.endsWith('.json'));

  for (const filename of jsonFiles) {
    const metadata = await readJsonIfExists(path.join(imagesRoot, filename));
    if (!metadata) continue;

    const blob = await readBufferIfExists(path.join(imagesRoot, filename.replace(/\.json$/, '.bin')));
    const objectKey = blob
      ? buildImageObjectKey(config.objectKeyPrefix, metadata.id, metadata.filename, metadata.mimeType)
      : null;

    try {
      if (!dryRun && blob && objectKey) {
        await putObject(config, objectKey, blob, metadata.mimeType);
        await pool.query(
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
            metadata.id,
            metadata.filename,
            metadata.mimeType,
            metadata.size,
            objectKey,
            true,
            'ready',
            null,
            sha256(blob),
            JSON.stringify({
              ...metadata,
              hasBlob: true,
              storageStatus: 'ready',
              objectKey,
            }),
            metadata.createdAt,
            Date.now(),
          ],
        );
      }
      report.images += 1;
    } catch (error) {
      report.failures.push({
        imageId: metadata.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function main() {
  const config = loadStorageConfig();
  const pool = getPool(config);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    stages: 0,
    scenes: 0,
    chatSessions: 0,
    mediaFiles: 0,
    images: 0,
    skippedStages: [],
    failures: [],
  };

  await applySchema(config);
  await ensureBucket(config);

  const stageRoots = await listDirectories(path.join(config.storageRoot, 'stages'));
  for (const stageRoot of stageRoots) {
    await migrateStage(config, pool, stageRoot, report);
  }

  await migrateImages(config, pool, report);

  const reportFile = await writeReport(config, 'latest-migration-report.json', report);
  log(`migration finished${dryRun ? ' (dry-run)' : ''}: ${reportFile}`);
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
