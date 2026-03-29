import path from 'path';
import { promises as fs } from 'fs';
import {
  getPool,
  headObject,
  loadStorageConfig,
  readJsonIfExists,
  writeReport,
} from './_common.mjs';

function log(message) {
  console.log(`[storage:verify] ${message}`);
}

async function countFiles(root, suffix) {
  try {
    const entries = await fs.readdir(root);
    return entries.filter((name) => name.endsWith(suffix)).length;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

async function main() {
  const config = loadStorageConfig();
  const pool = getPool(config);
  const report = {
    generatedAt: new Date().toISOString(),
    checks: [],
    failures: [],
  };

  const fileStageRoots = await fs.readdir(path.join(config.storageRoot, 'stages')).catch(() => []);
  const expectedStages = fileStageRoots.length;
  const expectedImages = await countFiles(path.join(config.storageRoot, 'images'), '.json');

  const dbCounts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM classrooms) AS classrooms,
      (SELECT COUNT(*)::int FROM scenes) AS scenes,
      (SELECT COUNT(*)::int FROM chat_sessions) AS chat_sessions,
      (SELECT COUNT(*)::int FROM media_files) AS media_files,
      (SELECT COUNT(*)::int FROM image_files) AS image_files
  `);
  const counts = dbCounts.rows[0];

  report.checks.push({
    name: 'classrooms-count',
    expected: expectedStages,
    actual: Number(counts.classrooms),
    ok: expectedStages === Number(counts.classrooms),
  });

  report.checks.push({
    name: 'images-count',
    expected: expectedImages,
    actual: Number(counts.image_files),
    ok: expectedImages === Number(counts.image_files),
  });

  const mediaRows = await pool.query('SELECT id, object_key, poster_object_key, has_blob, has_poster FROM media_files');
  for (const row of mediaRows.rows) {
    if (row.has_blob && row.object_key) {
      const exists = await headObject(config, row.object_key);
      report.checks.push({
        name: `media-object:${row.id}`,
        expected: true,
        actual: exists,
        ok: exists,
      });
    }
    if (row.has_poster && row.poster_object_key) {
      const exists = await headObject(config, row.poster_object_key);
      report.checks.push({
        name: `media-poster:${row.id}`,
        expected: true,
        actual: exists,
        ok: exists,
      });
    }
  }

  const imageRows = await pool.query('SELECT id, object_key, has_blob FROM image_files');
  for (const row of imageRows.rows) {
    if (row.has_blob && row.object_key) {
      const exists = await headObject(config, row.object_key);
      report.checks.push({
        name: `image-object:${row.id}`,
        expected: true,
        actual: exists,
        ok: exists,
      });
    }
  }

  const migrationReport = await readJsonIfExists(
    path.join(config.reportRoot, 'latest-migration-report.json'),
  );
  if (migrationReport?.failures?.length) {
    report.failures.push(...migrationReport.failures);
  }

  for (const check of report.checks) {
    if (!check.ok) {
      report.failures.push(check);
    }
  }

  const reportFile = await writeReport(config, 'latest-verification-report.json', report);
  log(`verification finished: ${reportFile}`);
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
