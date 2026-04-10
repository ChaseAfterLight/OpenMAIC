/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { generateSharedTTSAsset } from '@/lib/server/shared-audio-cache';

const log = createLogger('TTS API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let ttsProviderId: string | undefined;
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  try {
    const body = await req.json();
    const { text, ttsModelId, ttsSpeed, ttsApiKey, ttsBaseUrl } = body as {
      text: string;
      audioId: string;
      stageId?: string;
      ttsProviderId: TTSProviderId;
      ttsModelId?: string;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
    };
    ttsProviderId = body.ttsProviderId;
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;
    const stageId = body.stageId;

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    // Reject browser-native TTS — must be handled client-side
    if (ttsProviderId === 'browser-native-tts') {
      return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
    }

    const apiKey = await resolveTTSApiKey(ttsProviderId, ttsApiKey || undefined);
    const baseUrl = await resolveTTSBaseUrl(ttsProviderId, ttsBaseUrl || undefined);

    log.info(
      `Generating TTS: provider=${ttsProviderId}, model=${ttsModelId || 'default'}, voice=${ttsVoice}, audioId=${audioId}, stageId=${stageId || 'none'}, textLen=${text.length}`,
    );

    const result = await generateSharedTTSAsset({
      stageId,
      text,
      providerId: ttsProviderId as TTSProviderId,
      modelId: ttsModelId,
      voice: ttsVoice,
      speed: ttsSpeed,
      apiKey,
      baseUrl,
      requestedAudioId: audioId,
    });

    const base64 = Buffer.from(result.audio).toString('base64');

    return apiSuccess({
      audioId: result.audioId,
      base64,
      format: result.format,
      audioUrl: result.audioUrl,
      reused: result.reused,
    });
  } catch (error) {
    log.error(
      `TTS generation failed [provider=${ttsProviderId ?? 'unknown'}, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
