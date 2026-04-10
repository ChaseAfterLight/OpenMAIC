import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSharedTTSAsset: vi.fn(),
  resolveTTSApiKey: vi.fn(),
  resolveTTSBaseUrl: vi.fn(),
}));

vi.mock('@/lib/server/shared-audio-cache', () => ({
  generateSharedTTSAsset: mocks.generateSharedTTSAsset,
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveTTSApiKey: mocks.resolveTTSApiKey,
  resolveTTSBaseUrl: mocks.resolveTTSBaseUrl,
}));

import { POST } from '@/app/api/generate/tts/route';

describe('/api/generate/tts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTTSApiKey.mockResolvedValue('server-tts-key');
    mocks.resolveTTSBaseUrl.mockResolvedValue('https://server-tts.example.com');
    mocks.generateSharedTTSAsset.mockResolvedValue({
      audioId: 'preview',
      audio: Buffer.from('audio-bytes'),
      format: 'mp3',
      audioUrl: '/api/audio/preview.mp3',
      reused: false,
    });
  });

  it('keeps browser-native TTS on the client side', async () => {
    const request = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello from browser TTS',
        audioId: 'preview',
        ttsProviderId: 'browser-native-tts',
        ttsVoice: 'default',
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; errorCode?: string };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  it('uses server-managed TTS credentials for generation', async () => {
    const request = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello from server managed TTS',
        audioId: 'preview',
        ttsProviderId: 'openai-tts',
        ttsVoice: 'alloy',
        ttsModelId: 'gpt-4o-mini-tts',
        ttsApiKey: 'client-tts-key',
        ttsBaseUrl: 'https://client-tts.example.com',
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; base64: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.base64).toBe(Buffer.from('audio-bytes').toString('base64'));
    expect(mocks.resolveTTSApiKey).toHaveBeenCalledWith('openai-tts', 'client-tts-key');
    expect(mocks.resolveTTSBaseUrl).toHaveBeenCalledWith(
      'openai-tts',
      'https://client-tts.example.com',
    );
    expect(mocks.generateSharedTTSAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai-tts',
        apiKey: 'server-tts-key',
        baseUrl: 'https://server-tts.example.com',
      }),
    );
  });
});
