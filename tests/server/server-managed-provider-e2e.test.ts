import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  storageRoot: '',
}));

const mocks = vi.hoisted(() => ({
  aspectRatioToDimensions: vi.fn(),
  generateImage: vi.fn(),
  requireApiRole: vi.fn(),
}));

vi.mock('@/lib/server/storage-backend-config', () => ({
  getServerStorageConfig: () => ({
    backend: 'file',
    storageRoot: state.storageRoot,
  }),
}));

vi.mock('@/lib/server/auth-guards', () => ({
  requireApiRole: mocks.requireApiRole,
}));

vi.mock('@/lib/media/image-providers', () => ({
  aspectRatioToDimensions: mocks.aspectRatioToDimensions,
  generateImage: mocks.generateImage,
}));

describe('server-managed provider e2e', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    state.storageRoot = await mkdtemp(path.join(os.tmpdir(), 'openmaic-provider-e2e-'));
    mocks.requireApiRole.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    mocks.aspectRatioToDimensions.mockReturnValue({ width: 1024, height: 1024 });
    mocks.generateImage.mockResolvedValue({
      images: [{ mimeType: 'image/png', data: 'fake-base64' }],
    });
  });

  afterEach(async () => {
    if (state.storageRoot) {
      await rm(state.storageRoot, { recursive: true, force: true });
    }
    state.storageRoot = '';
  });

  it('allows admin configuration and regular route usage while ignoring client credential override', async () => {
    const adminRoute = await import('@/app/api/admin/provider-configs/route');
    const publicRoute = await import('@/app/api/server-providers/route');
    const imageRoute = await import('@/app/api/generate/image/route');

    const adminSaveRequest = new Request('http://localhost/api/admin/provider-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerKind: 'image',
        providerId: 'seedream',
        enabled: true,
        apiKey: 'server-image-key',
        baseUrl: 'https://server-image.example.com',
      }),
    });

    const adminResponse = await adminRoute.POST(adminSaveRequest as never);
    expect(adminResponse.status).toBe(200);

    const publicResponse = await publicRoute.GET();
    const publicBody = (await publicResponse.json()) as {
      success: boolean;
      image: Record<string, { baseUrl?: string; apiKey?: string }>;
    };
    expect(publicResponse.status).toBe(200);
    expect(publicBody.success).toBe(true);
    expect(publicBody.image.seedream.baseUrl).toBe('https://server-image.example.com');
    expect(publicBody.image.seedream.apiKey).toBeUndefined();

    const imageRequest = new Request('http://localhost/api/generate/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-image-provider': 'seedream',
        'x-api-key': 'client-image-key-should-be-ignored',
        'x-base-url': 'https://client-image.example.com',
      },
      body: JSON.stringify({
        prompt: 'Generate a classroom thumbnail',
      }),
    });

    const imageResponse = await imageRoute.POST(imageRequest as never);
    const imageBody = (await imageResponse.json()) as { success: boolean };

    expect(imageResponse.status).toBe(200);
    expect(imageBody.success).toBe(true);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'seedream',
        apiKey: 'server-image-key',
        baseUrl: 'https://server-image.example.com',
      }),
      expect.objectContaining({
        prompt: 'Generate a classroom thumbnail',
      }),
    );
  });
});
