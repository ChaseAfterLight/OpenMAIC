import { createLogger } from '@/lib/logger';
import { DEFAULT_TTS_MODELS } from '@/lib/audio/constants';
import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSProviderId } from '@/lib/audio/types';
import {
  buildSharedTTSAssetId,
  buildSharedTTSDownloadUrl,
} from '@/lib/audio/shared-audio-cache';
import {
  getAudioFileBlob,
  getAudioFileRecordMetadata,
  saveAudioFileRecord,
} from '@/lib/server/storage-repository';

const log = createLogger('SharedAudioCache');

function resolveAudioMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    default:
      return `audio/${format}`;
  }
}

export interface SharedTTSAssetInput {
  stageId?: string;
  text: string;
  providerId: TTSProviderId;
  modelId?: string;
  voice: string;
  speed?: number;
  apiKey: string;
  baseUrl?: string;
  requestedAudioId?: string;
}

export interface SharedTTSAssetResult {
  audioId: string;
  audio: Buffer;
  format: string;
  audioUrl?: string;
  reused: boolean;
}

export async function generateSharedTTSAsset(
  input: SharedTTSAssetInput,
): Promise<SharedTTSAssetResult> {
  const audioId = input.stageId
    ? await buildSharedTTSAssetId({
        stageId: input.stageId,
        text: input.text,
        providerId: input.providerId,
        modelId: input.modelId,
        voice: input.voice,
        speed: input.speed,
      })
    : input.requestedAudioId || 'preview';

  if (input.stageId) {
    const metadata = await getAudioFileRecordMetadata(audioId);
    if (metadata?.stageId === input.stageId && metadata.hasBlob) {
      const blob = await getAudioFileBlob(input.stageId, audioId);
      if (blob) {
        return {
          audioId,
          audio: blob.buffer,
          format: metadata.format,
          audioUrl: buildSharedTTSDownloadUrl(input.stageId, audioId),
          reused: true,
        };
      }
    }
  }

  const config = {
    providerId: input.providerId,
    modelId: input.modelId || DEFAULT_TTS_MODELS[input.providerId] || '',
    voice: input.voice,
    speed: input.speed ?? 1,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
  };

  const { audio, format } = await generateTTS(config, input.text);
  const audioBuffer = Buffer.from(audio);

  if (!input.stageId) {
    return {
      audioId,
      audio: audioBuffer,
      format,
      reused: false,
    };
  }

  let audioUrl: string | undefined;
  try {
    await saveAudioFileRecord({
      id: audioId,
      stageId: input.stageId,
      blob: new Blob([audioBuffer], { type: resolveAudioMimeType(format) }),
      format,
      text: input.text,
      voice: input.voice,
      providerId: input.providerId,
      modelId: input.modelId,
      speed: input.speed,
      createdAt: Date.now(),
    });
    audioUrl = buildSharedTTSDownloadUrl(input.stageId, audioId);
  } catch (error) {
    log.warn(`Failed to persist shared audio asset ${audioId}:`, error);
  }

  return {
    audioId,
    audio: audioBuffer,
    format,
    audioUrl,
    reused: false,
  };
}
