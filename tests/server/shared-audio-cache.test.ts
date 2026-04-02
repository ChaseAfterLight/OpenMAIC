import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAudioFileRecordMetadata: vi.fn(),
  getAudioFileBlob: vi.fn(),
  saveAudioFileRecord: vi.fn(),
  generateTTS: vi.fn(),
}));

vi.mock('@/lib/server/storage-repository', () => ({
  getAudioFileRecordMetadata: mocks.getAudioFileRecordMetadata,
  getAudioFileBlob: mocks.getAudioFileBlob,
  saveAudioFileRecord: mocks.saveAudioFileRecord,
}));

vi.mock('@/lib/audio/tts-providers', () => ({
  generateTTS: mocks.generateTTS,
}));

import { generateSharedTTSAsset } from '@/lib/server/shared-audio-cache';

describe('generateSharedTTSAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an existing shared audio asset instead of calling TTS again', async () => {
    const cachedBuffer = Buffer.from('cached-audio');
    mocks.getAudioFileRecordMetadata.mockResolvedValue({
      id: 'tts_cached',
      stageId: 'stage-1',
      duration: undefined,
      format: 'mp3',
      text: 'Cached text',
      voice: 'alloy',
      providerId: 'openai-tts',
      modelId: 'tts-1',
      speed: 1,
      createdAt: Date.now(),
      ossKey: 'openmaic/stages/stage/audio/tts_cached/original.audio-mpeg',
      hasBlob: true,
      storageStatus: 'ready',
      downloadUrl: '/api/storage?action=downloadAudio&stageId=stage-1&id=tts_cached',
    });
    mocks.getAudioFileBlob.mockResolvedValue({
      buffer: cachedBuffer,
      mimeType: 'audio/mpeg',
    });

    const result = await generateSharedTTSAsset({
      stageId: 'stage-1',
      text: 'Cached text',
      providerId: 'openai-tts',
      modelId: 'tts-1',
      voice: 'alloy',
      speed: 1,
      apiKey: 'test-key',
      baseUrl: 'https://example.com',
    });

    expect(result.reused).toBe(true);
    expect(result.audio).toEqual(cachedBuffer);
    expect(result.audioUrl).toContain('downloadAudio');
    expect(mocks.generateTTS).not.toHaveBeenCalled();
    expect(mocks.saveAudioFileRecord).not.toHaveBeenCalled();
  });
});
