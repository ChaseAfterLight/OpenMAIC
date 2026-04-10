import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: mocks.resolveModel,
}));

import { POST } from '@/app/api/verify-model/route';

describe('/api/verify-model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModel.mockResolvedValue({
      model: 'server-model',
      modelInfo: { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      modelString: 'openai:gpt-4o-mini',
      providerId: 'openai',
      apiKey: 'server-key',
    });
    mocks.generateText.mockResolvedValue({ text: 'OK' });
  });

  it('verifies model connectivity via server-resolved model config', async () => {
    const request = new Request('http://localhost/api/verify-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai:gpt-4o-mini',
        apiKey: 'client-key-should-not-win',
        baseUrl: 'https://client.example.com',
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; message: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Connection successful');
    expect(mocks.resolveModel).toHaveBeenCalledWith({
      modelString: 'openai:gpt-4o-mini',
      providerType: undefined,
    });
    expect(mocks.generateText).toHaveBeenCalledWith({
      model: 'server-model',
      prompt: 'Say "OK" if you can hear me.',
    });
  });
});
