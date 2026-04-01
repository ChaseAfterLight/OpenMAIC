import { type NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  getK12TextbookCatalogState,
  publishK12TextbookCatalog,
  saveK12TextbookCatalogDraft,
} from '@/lib/server/k12-textbook-catalog-repository';
import { requireApiRole } from '@/lib/server/auth-guards';
import type { K12TextbookEdition } from '@/lib/module-host/types';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const state = await getK12TextbookCatalogState();
    return apiSuccess({
      draft: state.draft,
      published: state.published,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load textbook catalog',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as { editions?: K12TextbookEdition[] };
    if (!Array.isArray(body.editions)) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: editions',
      );
    }

    const draft = await saveK12TextbookCatalogDraft({
      editions: body.editions,
      updatedBy: auth.user.id,
    });
    const state = await getK12TextbookCatalogState();
    return apiSuccess({
      draft,
      published: state.published,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save textbook catalog draft',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== 'publish') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported action');
    }

    const published = await publishK12TextbookCatalog({
      publishedBy: auth.user.id,
    });
    const state = await getK12TextbookCatalogState();
    return apiSuccess({
      draft: state.draft,
      published,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to publish textbook catalog',
      error instanceof Error ? error.message : String(error),
    );
  }
}
