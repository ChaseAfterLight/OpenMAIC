import type { NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { requireApiRole } from '@/lib/server/auth-guards';
import {
  deleteProviderConfigRecord,
  getProviderConfigRecord,
  listProviderConfigRecords,
  type ProviderKind,
  upsertProviderConfigRecord,
} from '@/lib/server/provider-config-repository';

const PROVIDER_KIND_SET = new Set<ProviderKind>([
  'llm',
  'tts',
  'asr',
  'pdf',
  'image',
  'video',
  'web-search',
]);

function parseProviderKind(value: unknown): ProviderKind | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as ProviderKind;
  return PROVIDER_KIND_SET.has(normalized) ? normalized : null;
}

function normalizeProviderId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : [];
}

function normalizeProviderOptions(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function toAdminView(record: Awaited<ReturnType<typeof listProviderConfigRecords>>[number]) {
  return {
    providerKind: record.providerKind,
    providerId: record.providerId,
    enabled: record.enabled,
    hasApiKey: Boolean(record.apiKeyEncrypted),
    baseUrl: record.baseUrl,
    models: record.models ?? [],
    proxy: record.proxy,
    providerOptions: record.providerOptions ?? {},
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const records = await listProviderConfigRecords();
    return apiSuccess({
      configs: records.map(toAdminView),
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list provider configs',
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
    const body = (await req.json()) as Record<string, unknown>;
    const providerKind = parseProviderKind(body.providerKind);
    const providerId = normalizeProviderId(body.providerId);
    if (!providerKind || !providerId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: providerKind, providerId',
      );
    }

    const existing = await getProviderConfigRecord(providerKind, providerId);
    const apiKey = normalizeOptionalString(body.apiKey);
    const clearApiKey = body.clearApiKey === true;
    const next = await upsertProviderConfigRecord({
      providerKind,
      providerId,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : existing?.enabled ?? true,
      apiKey: clearApiKey ? null : apiKey,
      baseUrl:
        Object.prototype.hasOwnProperty.call(body, 'baseUrl')
          ? body.baseUrl == null
            ? null
            : normalizeOptionalString(body.baseUrl)
          : existing?.baseUrl,
      models:
        Object.prototype.hasOwnProperty.call(body, 'models')
          ? body.models == null
            ? null
            : normalizeOptionalStringArray(body.models)
          : existing?.models,
      proxy:
        Object.prototype.hasOwnProperty.call(body, 'proxy')
          ? body.proxy == null
            ? null
            : normalizeOptionalString(body.proxy)
          : existing?.proxy,
      providerOptions:
        Object.prototype.hasOwnProperty.call(body, 'providerOptions')
          ? body.providerOptions == null
            ? null
            : normalizeProviderOptions(body.providerOptions)
          : existing?.providerOptions,
      createdBy: existing?.createdBy ?? auth.user.id,
      updatedBy: auth.user.id,
    });

    return apiSuccess({
      config: toAdminView(next),
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to upsert provider config',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const providerKind = parseProviderKind(body.providerKind);
    const providerId = normalizeProviderId(body.providerId);
    if (!providerKind || !providerId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: providerKind, providerId',
      );
    }

    const existing = await getProviderConfigRecord(providerKind, providerId);
    if (!existing) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Provider config not found');
    }

    const hasApiKeyField = Object.prototype.hasOwnProperty.call(body, 'apiKey');
    const apiKey = hasApiKeyField ? normalizeOptionalString(body.apiKey) : undefined;
    const clearApiKey = body.clearApiKey === true;

    const next = await upsertProviderConfigRecord({
      providerKind,
      providerId,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
      apiKey: clearApiKey ? null : apiKey,
      baseUrl:
        Object.prototype.hasOwnProperty.call(body, 'baseUrl')
          ? body.baseUrl == null
            ? null
            : normalizeOptionalString(body.baseUrl)
          : existing.baseUrl,
      models:
        Object.prototype.hasOwnProperty.call(body, 'models')
          ? body.models == null
            ? null
            : normalizeOptionalStringArray(body.models)
          : existing.models,
      proxy:
        Object.prototype.hasOwnProperty.call(body, 'proxy')
          ? body.proxy == null
            ? null
            : normalizeOptionalString(body.proxy)
          : existing.proxy,
      providerOptions:
        Object.prototype.hasOwnProperty.call(body, 'providerOptions')
          ? body.providerOptions == null
            ? null
            : normalizeProviderOptions(body.providerOptions)
          : existing.providerOptions,
      createdBy: existing.createdBy,
      updatedBy: auth.user.id,
    });

    return apiSuccess({
      config: toAdminView(next),
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to patch provider config',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiRole(req, ['admin']);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const providerKind = parseProviderKind(body.providerKind);
    const providerId = normalizeProviderId(body.providerId);
    if (!providerKind || !providerId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: providerKind, providerId',
      );
    }

    await deleteProviderConfigRecord(providerKind, providerId);
    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete provider config',
      error instanceof Error ? error.message : String(error),
    );
  }
}
