import { describe, expect, it } from 'vitest';
import { buildSharedTTSAssetId } from '@/lib/audio/shared-audio-cache';

describe('shared-audio-cache', () => {
  it('builds a stable asset id for the same classroom TTS input', async () => {
    const base = {
      stageId: 'stage-123',
      text: 'Hello world',
      providerId: 'openai-tts' as const,
      modelId: 'tts-1',
      voice: 'alloy',
      speed: 1,
    };

    const first = await buildSharedTTSAssetId(base);
    const second = await buildSharedTTSAssetId(base);
    const differentStage = await buildSharedTTSAssetId({ ...base, stageId: 'stage-456' });

    expect(first).toBe(second);
    expect(first).not.toBe(differentStage);
  });
});
