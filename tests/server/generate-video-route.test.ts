import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateVideo: vi.fn(),
  normalizeVideoOptions: vi.fn(),
  resolveVideoApiKey: vi.fn(),
  resolveVideoBaseUrl: vi.fn(),
}));

vi.mock('@/lib/media/video-providers', () => ({
  generateVideo: mocks.generateVideo,
  normalizeVideoOptions: mocks.normalizeVideoOptions,
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveVideoApiKey: mocks.resolveVideoApiKey,
  resolveVideoBaseUrl: mocks.resolveVideoBaseUrl,
}));

import { POST } from '@/app/api/generate/video/route';

describe('/api/generate/video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveVideoApiKey.mockResolvedValue('server-video-key');
    mocks.resolveVideoBaseUrl.mockResolvedValue('https://server-video.example.com');
    mocks.normalizeVideoOptions.mockImplementation((_provider, options) => options);
    mocks.generateVideo.mockResolvedValue({
      url: 'https://cdn.example.com/video.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
  });

  it('generates video with server-managed credentials', async () => {
    const request = new Request('http://localhost/api/generate/video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-video-provider': 'seedance',
        'x-video-model': 'seedance-v1',
        'x-api-key': 'client-video-key',
        'x-base-url': 'https://client-video.example.com',
      },
      body: JSON.stringify({
        prompt: 'A calm ocean at sunset',
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.resolveVideoApiKey).toHaveBeenCalledWith('seedance', 'client-video-key');
    expect(mocks.resolveVideoBaseUrl).toHaveBeenCalledWith(
      'seedance',
      'https://client-video.example.com',
    );
    expect(mocks.generateVideo).toHaveBeenCalledWith(
      {
        providerId: 'seedance',
        apiKey: 'server-video-key',
        baseUrl: 'https://server-video.example.com',
        model: 'seedance-v1',
      },
      expect.objectContaining({
        prompt: 'A calm ocean at sunset',
      }),
    );
  });
});
