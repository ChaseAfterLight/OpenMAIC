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
import { resolveWebSearchApiKey } from '@/lib/server/provider-config';
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

export async function POST(req: NextRequest) {
  let query: string | undefined;
  try {
    const body = await req.json();
    const {
      query: requestQuery,
      pdfText,
      apiKey: clientApiKey,
      provider = 'tavily',
      baiduSubSources,
    } = body as {
      query?: string;
      pdfText?: string;
      apiKey?: string;
      provider?: WebSearchProviderId;
      baiduSubSources?: { webSearch?: boolean; baike?: boolean; scholar?: boolean };
    };
    query = requestQuery;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    // Brave Search doesn't require an API key
    const needsApiKey = provider !== 'brave';
    const apiKey = needsApiKey ? resolveWebSearchApiKey(provider, clientApiKey) : '';

    if (needsApiKey && !apiKey) {
      const providerNames: Record<string, string> = {
        tavily: 'Tavily',
        baidu: 'Baidu',
      };
      const name = providerNames[provider] || provider;
      return apiError(
        'MISSING_API_KEY',
        400,
        `${name} API key is not configured. Set it in Settings → Web Search or set the corresponding env var.`,
      );
    }

    // Clamp rewrite input at the route boundary; framework body limits still apply to total request size.
    const boundedPdfText = pdfText?.slice(0, SEARCH_QUERY_REWRITE_EXCERPT_LENGTH);

    let aiCall: AICallFn | undefined;
    try {
      const { model: languageModel } = resolveModelFromHeaders(req);
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
