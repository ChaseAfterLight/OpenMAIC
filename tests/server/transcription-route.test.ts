import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveASRApiKey: vi.fn(),
  resolveASRBaseUrl: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveASRApiKey: mocks.resolveASRApiKey,
  resolveASRBaseUrl: mocks.resolveASRBaseUrl,
}));

vi.mock('@/lib/audio/asr-providers', () => ({
  transcribeAudio: mocks.transcribeAudio,
}));

import { POST } from '@/app/api/transcription/route';

describe('/api/transcription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveASRApiKey.mockResolvedValue('server-asr-key');
    mocks.resolveASRBaseUrl.mockResolvedValue('https://server-asr.example.com');
    mocks.transcribeAudio.mockResolvedValue({ text: 'transcribed-text' });
  });

  it('uses server-managed ASR credentials even when client sends overrides', async () => {
    const form = new FormData();
    form.append('audio', new File([new Uint8Array([1, 2, 3])], 'recording.webm'));
    form.append('providerId', 'openai-whisper');
    form.append('modelId', 'whisper-1');
    form.append('language', 'zh-CN');
    form.append('apiKey', 'client-asr-key');
    form.append('baseUrl', 'https://client-asr.example.com');

    const request = new Request('http://localhost/api/transcription', {
      method: 'POST',
      body: form,
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; text: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.text).toBe('transcribed-text');
    expect(mocks.resolveASRApiKey).toHaveBeenCalledWith('openai-whisper', 'client-asr-key');
    expect(mocks.resolveASRBaseUrl).toHaveBeenCalledWith(
      'openai-whisper',
      'https://client-asr.example.com',
    );
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai-whisper',
        modelId: 'whisper-1',
        apiKey: 'server-asr-key',
        baseUrl: 'https://server-asr.example.com',
      }),
      expect.any(Buffer),
    );
  });
});
