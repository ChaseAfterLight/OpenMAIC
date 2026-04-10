import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aspectRatioToDimensions: vi.fn(),
  generateImage: vi.fn(),
  resolveImageApiKey: vi.fn(),
  resolveImageBaseUrl: vi.fn(),
}));

vi.mock('@/lib/media/image-providers', () => ({
  aspectRatioToDimensions: mocks.aspectRatioToDimensions,
  generateImage: mocks.generateImage,
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveImageApiKey: mocks.resolveImageApiKey,
  resolveImageBaseUrl: mocks.resolveImageBaseUrl,
}));

import { POST } from '@/app/api/generate/image/route';

describe('/api/generate/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveImageApiKey.mockResolvedValue('server-image-key');
    mocks.resolveImageBaseUrl.mockResolvedValue('https://server-image.example.com');
    mocks.aspectRatioToDimensions.mockReturnValue({ width: 1024, height: 1024 });
    mocks.generateImage.mockResolvedValue({
      images: [{ mimeType: 'image/png', data: 'base64-image' }],
    });
  });

  it('generates images with server-managed credentials', async () => {
    const request = new Request('http://localhost/api/generate/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-image-provider': 'seedream',
        'x-image-model': 'seedream-v3',
        'x-api-key': 'client-image-key',
        'x-base-url': 'https://client-image.example.com',
      },
      body: JSON.stringify({
        prompt: 'Draw a mountain at sunrise',
        width: 512,
        height: 512,
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.resolveImageApiKey).toHaveBeenCalledWith('seedream', 'client-image-key');
    expect(mocks.resolveImageBaseUrl).toHaveBeenCalledWith(
      'seedream',
      'https://client-image.example.com',
    );
    expect(mocks.generateImage).toHaveBeenCalledWith(
      {
        providerId: 'seedream',
        apiKey: 'server-image-key',
        baseUrl: 'https://server-image.example.com',
        model: 'seedream-v3',
      },
      expect.objectContaining({
        prompt: 'Draw a mountain at sunrise',
      }),
    );
  });
});
