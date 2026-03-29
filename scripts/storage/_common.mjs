import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Pool } from 'pg';

let pool;
let s3Client;

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readRequiredEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function loadStorageConfig() {
  return {
    storageRoot: path.join(process.cwd(), 'data', 'storage'),
    reportRoot: path.join(process.cwd(), 'data', 'storage-migration'),
    databaseUrl: readRequiredEnv('SERVER_STORAGE_DATABASE_URL'),
    objectStorageEndpoint: readEnv('OBJECT_STORAGE_ENDPOINT'),
    objectStorageRegion: readEnv('OBJECT_STORAGE_REGION') ?? 'auto',
    objectStorageBucket: readRequiredEnv('OBJECT_STORAGE_BUCKET'),
    objectStorageAccessKeyId: readEnv('OBJECT_STORAGE_ACCESS_KEY_ID'),
    objectStorageSecretAccessKey: readEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    objectStorageForcePathStyle:
      (readEnv('OBJECT_STORAGE_FORCE_PATH_STYLE') ?? 'true').toLowerCase() !== 'false',
    objectKeyPrefix: readEnv('OBJECT_STORAGE_KEY_PREFIX') ?? 'openmaic',
  };
}

export function getPool(config) {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return pool;
}

export function getS3Client(config) {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.objectStorageRegion,
      endpoint: config.objectStorageEndpoint,
      forcePathStyle: config.objectStorageForcePathStyle,
      credentials:
        config.objectStorageAccessKeyId && config.objectStorageSecretAccessKey
          ? {
              accessKeyId: config.objectStorageAccessKeyId,
              secretAccessKey: config.objectStorageSecretAccessKey,
            }
          : undefined,
    });
  }
  return s3Client;
}

export async function ensureBucket(config) {
  const client = getS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.objectStorageBucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: config.objectStorageBucket }));
  }
}

export async function applySchema(config) {
  const sql = await fs.readFile(path.join(process.cwd(), 'db', 'postgres-object-storage.sql'), 'utf-8');
  await getPool(config).query(sql);
}

export function safeStorageId(id) {
  return Buffer.from(id).toString('base64url');
}

function sanitizeSegment(value) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || 'file';
}

function inferFileExtension(filename, mimeType) {
  const ext = path.extname(filename).trim().toLowerCase();
  if (ext) {
    return ext;
  }

  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    case 'video/mp4':
      return '.mp4';
    default:
      return '';
  }
}

export function buildStageMediaObjectKey(prefix, stageId, mediaId, mimeType) {
  const suffix = sanitizeSegment(mimeType.replace('/', '-')) || 'bin';
  return `${prefix}/stages/${safeStorageId(stageId)}/media/${safeStorageId(mediaId)}/original.${suffix}`;
}

export function buildStageMediaPosterObjectKey(prefix, stageId, mediaId) {
  return `${prefix}/stages/${safeStorageId(stageId)}/media/${safeStorageId(mediaId)}/poster.png`;
}

export function buildImageObjectKey(prefix, imageId, filename, mimeType) {
  const basename = sanitizeSegment(path.basename(filename, path.extname(filename)));
  const extension = inferFileExtension(filename, mimeType);
  return `${prefix}/images/${safeStorageId(imageId)}/${basename}${extension}`;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function putObject(config, key, body, contentType) {
  await getS3Client(config).send(
    new PutObjectCommand({
      Bucket: config.objectStorageBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function headObject(config, key) {
  try {
    await getS3Client(config).send(
      new HeadObjectCommand({
        Bucket: config.objectStorageBucket,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function readBufferIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeReport(config, name, report) {
  await fs.mkdir(config.reportRoot, { recursive: true });
  const target = path.join(config.reportRoot, name);
  await fs.writeFile(target, JSON.stringify(report, null, 2), 'utf-8');
  return target;
}
