import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSearchQuery: vi.fn(),
  callLLM: vi.fn(),
  formatSearchResultsAsContext: vi.fn(),
  resolveModelFromHeaders: vi.fn(),
  resolveWebSearchApiKey: vi.fn(),
  resolveWebSearchProviderOptions: vi.fn(),
  searchWithBaidu: vi.fn(),
  searchWithBrave: vi.fn(),
  searchWithTavily: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({
  callLLM: mocks.callLLM,
}));

vi.mock('@/lib/web-search/tavily', () => ({
  formatSearchResultsAsContext: mocks.formatSearchResultsAsContext,
  searchWithTavily: mocks.searchWithTavily,
}));

vi.mock('@/lib/web-search/brave', () => ({
  searchWithBrave: mocks.searchWithBrave,
}));

vi.mock('@/lib/web-search/baidu', () => ({
  searchWithBaidu: mocks.searchWithBaidu,
}));

vi.mock('@/lib/server/provider-config', () => ({
  resolveWebSearchApiKey: mocks.resolveWebSearchApiKey,
  resolveWebSearchProviderOptions: mocks.resolveWebSearchProviderOptions,
}));

vi.mock('@/lib/server/search-query-builder', () => ({
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH: 6000,
  buildSearchQuery: mocks.buildSearchQuery,
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromHeaders: mocks.resolveModelFromHeaders,
}));

import { POST } from '@/app/api/web-search/route';

describe('/api/web-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWebSearchApiKey.mockResolvedValue('server-web-key');
    mocks.resolveWebSearchProviderOptions.mockResolvedValue({
      baiduSubSources: {
        webSearch: true,
        baike: false,
        scholar: true,
      },
    });
    mocks.resolveModelFromHeaders.mockResolvedValue({
      model: 'server-model',
      modelInfo: { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      modelString: 'openai:gpt-4o-mini',
      providerId: 'openai',
      apiKey: 'server-llm-key',
    });
    mocks.buildSearchQuery.mockResolvedValue({
      query: 'rewritten query',
      hasPdfContext: false,
      rawRequirementLength: 10,
      rewriteAttempted: true,
      finalQueryLength: 14,
    });
    mocks.searchWithBaidu.mockResolvedValue({
      answer: 'answer',
      query: 'rewritten query',
      sources: [],
      responseTime: 12,
    });
    mocks.formatSearchResultsAsContext.mockReturnValue('context');
  });

  it('uses server-managed web-search credentials and options for baidu provider', async () => {
    const request = new Request('http://localhost/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '今日AI新闻',
        provider: 'baidu',
        apiKey: 'client-web-key',
        providerOptions: {
          baiduSubSources: { webSearch: false, baike: false, scholar: false },
        },
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; context: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.context).toBe('context');
    expect(mocks.resolveWebSearchApiKey).toHaveBeenCalledWith('baidu');
    expect(mocks.resolveWebSearchProviderOptions).toHaveBeenCalledWith('baidu');
    expect(mocks.searchWithBaidu).toHaveBeenCalledWith({
      query: 'rewritten query',
      apiKey: 'server-web-key',
      subSources: {
        webSearch: true,
        baike: false,
        scholar: true,
      },
    });
  });
});
