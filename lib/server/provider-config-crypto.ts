import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProviderConfigCrypto');
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'v1';

let warnedWeakFallback = false;
let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.PROVIDER_CONFIG_MASTER_KEY?.trim();
  if (raw) {
    const maybeBase64 = Buffer.from(raw, 'base64');
    cachedKey =
      maybeBase64.length === 32 ? maybeBase64 : createHash('sha256').update(raw).digest();
    return cachedKey;
  }

  const fallbackMaterial =
    process.env.SERVER_STORAGE_DATABASE_URL?.trim() ||
    process.env.AUTH_SESSION_COOKIE_NAME?.trim() ||
    `${process.cwd()}:provider-config-fallback`;

  if (!warnedWeakFallback) {
    warnedWeakFallback = true;
    log.warn(
      'PROVIDER_CONFIG_MASTER_KEY 未配置，正在使用派生密钥。建议在生产环境配置独立主密钥以提升安全性。',
    );
  }
  cachedKey = createHash('sha256').update(fallbackMaterial).digest();
  return cachedKey;
}

function toBase64(value: Buffer): string {
  return value.toString('base64');
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

export function encryptProviderSecret(plainText: string): string {
  const value = plainText.trim();
  if (!value) {
    return '';
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${toBase64(iv)}:${toBase64(tag)}:${toBase64(encrypted)}`;
}

export function decryptProviderSecret(payload: string | undefined): string {
  if (!payload) {
    return '';
  }

  const value = payload.trim();
  if (!value) {
    return '';
  }

  const [prefix, ivB64, tagB64, dataB64] = value.split(':');
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('INVALID_PROVIDER_SECRET_PAYLOAD');
  }

  const iv = fromBase64(ivB64);
  const tag = fromBase64(tagB64);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('INVALID_PROVIDER_SECRET_PAYLOAD');
  }

  const decipher = createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(fromBase64(dataB64)), decipher.final()]);
  return decrypted.toString('utf8');
}
