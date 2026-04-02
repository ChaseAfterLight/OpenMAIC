import type { TTSProviderId } from '@/lib/audio/types';

const AUDIO_CACHE_VERSION = 1;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeSpeed(speed?: number): number {
  return Number.isFinite(speed ?? NaN) ? Number(speed) : 1;
}

export interface SharedTTSAssetKeyInput {
  stageId: string;
  text: string;
  providerId: TTSProviderId;
  modelId?: string;
  voice: string;
  speed?: number;
}

export async function buildSharedTTSAssetId(input: SharedTTSAssetKeyInput): Promise<string> {
  const payload = JSON.stringify({
    v: AUDIO_CACHE_VERSION,
    stageId: input.stageId,
    text: input.text,
    providerId: input.providerId,
    modelId: input.modelId || '',
    voice: input.voice,
    speed: normalizeSpeed(input.speed),
  });
  return `tts_${await sha256Hex(payload)}`;
}

export function buildSharedTTSDownloadUrl(stageId: string, audioId: string): string {
  return `/api/storage?action=downloadAudio&stageId=${encodeURIComponent(stageId)}&id=${encodeURIComponent(audioId)}`;
}
