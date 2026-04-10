import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const authMocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  deleteProviderConfigRecord: vi.fn(),
  getProviderConfigRecord: vi.fn(),
  listProviderConfigRecords: vi.fn(),
  upsertProviderConfigRecord: vi.fn(),
}));

vi.mock('@/lib/server/auth-guards', () => ({
  requireApiRole: authMocks.requireApiRole,
}));

vi.mock('@/lib/server/provider-config-repository', () => repositoryMocks);

import { GET, POST } from '@/app/api/admin/provider-configs/route';

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin' as const,
  createdAt: 1,
  updatedAt: 1,
};

function createRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/provider-configs', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/api/admin/provider-configs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireApiRole.mockResolvedValue({ user: adminUser });
    repositoryMocks.getProviderConfigRecord.mockResolvedValue(null);
  });

  it('requires admin role before listing configs', async () => {
    authMocks.requireApiRole.mockResolvedValue(
      {
        response: NextResponse.json(
          { success: false, error: 'Insufficient role' },
          { status: 403 },
        ),
      },
    );

    const response = await GET(createRequest('GET'));

    expect(response.status).toBe(403);
    expect(authMocks.requireApiRole).toHaveBeenCalledWith(expect.anything(), ['admin']);
    expect(repositoryMocks.listProviderConfigRecords).not.toHaveBeenCalled();
  });

  it('returns admin metadata without exposing encrypted or plain API keys', async () => {
    repositoryMocks.listProviderConfigRecords.mockResolvedValue([
      {
        providerKind: 'llm',
        providerId: 'openai',
        enabled: true,
        apiKeyEncrypted: 'encrypted-secret',
        baseUrl: 'https://proxy.example.com/v1',
        models: ['gpt-4o'],
        providerOptions: {},
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const response = await GET(createRequest('GET'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.configs[0]).toMatchObject({
      providerKind: 'llm',
      providerId: 'openai',
      hasApiKey: true,
      baseUrl: 'https://proxy.example.com/v1',
      models: ['gpt-4o'],
    });
    expect(data.configs[0].apiKey).toBeUndefined();
    expect(data.configs[0].apiKeyEncrypted).toBeUndefined();
  });

  it('allows admin to save web search provider options server-side', async () => {
    repositoryMocks.upsertProviderConfigRecord.mockResolvedValue({
      providerKind: 'web-search',
      providerId: 'baidu',
      enabled: true,
      apiKeyEncrypted: 'encrypted-secret',
      baseUrl: 'https://qianfan.baidubce.com',
      models: [],
      providerOptions: {
        baiduSubSources: {
          webSearch: true,
          baike: false,
          scholar: true,
        },
      },
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      createdAt: 1,
      updatedAt: 2,
    });

    const response = await POST(
      createRequest('POST', {
        providerKind: 'web-search',
        providerId: 'baidu',
        apiKey: 'plain-secret',
        baseUrl: 'https://qianfan.baidubce.com',
        providerOptions: {
          baiduSubSources: {
            webSearch: true,
            baike: false,
            scholar: true,
          },
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(repositoryMocks.upsertProviderConfigRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKind: 'web-search',
        providerId: 'baidu',
        apiKey: 'plain-secret',
        providerOptions: {
          baiduSubSources: {
            webSearch: true,
            baike: false,
            scholar: true,
          },
        },
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      }),
    );
    expect(data.config.hasApiKey).toBe(true);
    expect(data.config.apiKey).toBeUndefined();
    expect(data.config.providerOptions.baiduSubSources.baike).toBe(false);
  });
});
