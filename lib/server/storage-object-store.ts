import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PostgresObjectStorageConfig } from '@/lib/server/storage-backend-config';

const clientCache = new Map<string, S3Client>();

function buildClientCacheKey(config: PostgresObjectStorageConfig): string {
  return [
    config.objectStorageEndpoint ?? '',
    config.objectStorageRegion,
    config.objectStorageBucket,
    config.objectStorageAccessKeyId ?? '',
    config.objectStorageForcePathStyle ? '1' : '0',
  ].join('|');
}

function getS3Client(config: PostgresObjectStorageConfig): S3Client {
  const cacheKey = buildClientCacheKey(config);
  const existing = clientCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new S3Client({
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
  clientCache.set(cacheKey, client);
  return client;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (
    typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray ===
    'function'
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function ensureObjectStorageBucket(
  config: PostgresObjectStorageConfig,
): Promise<void> {
  const client = getS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.objectStorageBucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: config.objectStorageBucket }));
  }
}

export async function putObjectToStorage(
  config: PostgresObjectStorageConfig,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const client = getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.objectStorageBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectFromStorage(
  config: PostgresObjectStorageConfig,
  key: string,
): Promise<Buffer> {
  const client = getS3Client(config);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.objectStorageBucket,
      Key: key,
    }),
  );
  return bodyToBuffer(response.Body);
}

export async function deleteObjectsFromStorage(
  config: PostgresObjectStorageConfig,
  keys: string[],
): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return;
  }

  const client = getS3Client(config);
  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.objectStorageBucket,
      Delete: {
        Objects: uniqueKeys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
}
