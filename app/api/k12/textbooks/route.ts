import { type NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { getPublishedK12TextbookCatalog } from '@/lib/server/k12-textbook-catalog-repository';
import { requireApiRole } from '@/lib/server/auth-guards';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin', 'teacher']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const published = await getPublishedK12TextbookCatalog();
    return apiSuccess({
      editions: published?.editions ?? [],
      publishedAt: published?.publishedAt ?? null,
      publishedBy: published?.publishedBy ?? null,
      version: published?.version ?? null,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load published textbook catalog',
      error instanceof Error ? error.message : String(error),
    );
  }
}
