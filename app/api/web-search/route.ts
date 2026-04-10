/**
 * Web Search API
 *
 * POST /api/web-search
 * Simple JSON request/response supporting multiple search providers.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { searchWithTavily } from '@/lib/web-search/tavily';
import { searchWithBrave } from '@/lib/web-search/brave';
import { searchWithBaidu } from '@/lib/web-search/baidu';
import { formatSearchResultsAsContext } from '@/lib/web-search/tavily';
import { resolveWebSearchApiKey, resolveWebSearchProviderOptions } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildSearchQuery,
  SEARCH_QUERY_REWRITE_EXCERPT_LENGTH,
} from '@/lib/server/search-query-builder';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import type { WebSearchResult } from '@/lib/types/web-search';

const log = createLogger('WebSearch');

function normalizeBaiduSubSources(
  providerOptions?: Record<string, unknown>,
): { webSearch?: boolean; baike?: boolean; scholar?: boolean } | undefined {
  if (!providerOptions || typeof providerOptions !== 'object') {
    return undefined;
  }
  const direct = providerOptions as {
    webSearch?: boolean;
    baike?: boolean;
    scholar?: boolean;
    baiduSubSources?: unknown;
  };
  const nested =
    typeof direct.baiduSubSources === 'object' &&
    direct.baiduSubSources &&
    !Array.isArray(direct.baiduSubSources)
      ? (direct.baiduSubSources as {
          webSearch?: boolean;
          baike?: boolean;
          scholar?: boolean;
        })
      : undefined;
  return {
    ...(typeof (nested?.webSearch ?? direct.webSearch) === 'boolean'
      ? { webSearch: nested?.webSearch ?? direct.webSearch }
      : {}),
    ...(typeof (nested?.baike ?? direct.baike) === 'boolean'
      ? { baike: nested?.baike ?? direct.baike }
      : {}),
    ...(typeof (nested?.scholar ?? direct.scholar) === 'boolean'
      ? { scholar: nested?.scholar ?? direct.scholar }
      : {}),
  };
}

export async function POST(req: NextRequest) {
  let query: string | undefined;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
      provider = 'tavily',
    } = body as {
      query?: string;
      pdfText?: string;
      provider?: WebSearchProviderId;
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    // Brave Search doesn't require an API key
    const needsApiKey = provider !== 'brave';
    const apiKey = needsApiKey ? await resolveWebSearchApiKey(provider) : '';
    const providerOptions = await resolveWebSearchProviderOptions(provider);
    const baiduSubSources =
      provider === 'baidu' ? normalizeBaiduSubSources(providerOptions) : undefined;

    if (needsApiKey && !apiKey) {
      const providerNames: Record<string, string> = {
        tavily: 'Tavily',
        baidu: 'Baidu',
      };
      const name = providerNames[provider] || provider;
      return apiError(
        'MISSING_API_KEY',
        400,
        `${name} API key is not configured on server. Ask an administrator to configure this provider.`,
      );
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    let aiCall: AICallFn | undefined;
    try {
      const { model: languageModel } = await resolveModelFromHeaders(req);
      aiCall = async (systemPrompt, userPrompt) => {
        const result = await callLLM(
          {
            model: languageModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxOutputTokens: 256,
          },
          'web-search-query-rewrite',
        );
        return result.text;
      };
    } catch (error) {
      log.warn('Search query rewrite model unavailable, falling back to raw requirement:', error);
    }

    const searchQuery = await buildSearchQuery(query, boundedPdfText, aiCall);

    log.info('Running web search API request', {
      provider,
      hasPdfContext: searchQuery.hasPdfContext,
      rawRequirementLength: searchQuery.rawRequirementLength,
      rewriteAttempted: searchQuery.rewriteAttempted,
      finalQueryLength: searchQuery.finalQueryLength,
    });

    let result: WebSearchResult;
    switch (provider) {
      case 'brave':
        result = await searchWithBrave({ query: searchQuery.query });
        break;
      case 'baidu':
        result = await searchWithBaidu({
          query: searchQuery.query,
          apiKey,
          subSources: baiduSubSources,
        });
        break;
      case 'tavily':
      default:
        result = await searchWithTavily({ query: searchQuery.query, apiKey });
        break;
    }

    const context = formatSearchResultsAsContext(result);

    return apiSuccess({
      answer: result.answer,
      sources: result.sources,
      context,
      query: result.query,
      responseTime: result.responseTime,
    });
  } catch (err) {
    log.error(`Web search failed [query="${query?.substring(0, 60) ?? 'unknown'}"]:`, err);
    const message = err instanceof Error ? err.message : 'Web search failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
