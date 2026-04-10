'use client';

export type AdminProviderKind = 'llm' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'web-search';

export interface AdminProviderConfig {
  providerKind: AdminProviderKind;
  providerId: string;
  enabled: boolean;
  hasApiKey: boolean;
  baseUrl?: string;
  models: string[];
  proxy?: string;
  providerOptions: Record<string, unknown>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export type AdminProviderConfigPatch = Partial<{
  enabled: boolean;
  apiKey: string;
  clearApiKey: boolean;
  baseUrl: string | null;
  models: string[] | null;
  proxy: string | null;
  providerOptions: Record<string, unknown> | null;
}>;

export type AdminProviderConfigMap = Record<string, AdminProviderConfig>;

export function adminProviderConfigKey(kind: AdminProviderKind, providerId: string): string {
  return `${kind}:${providerId}`;
}

export async function fetchAdminProviderConfigs(): Promise<AdminProviderConfig[]> {
  const response = await fetch('/api/admin/provider-configs');
  const data = (await response.json()) as {
    success?: boolean;
    configs?: AdminProviderConfig[];
    error?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Failed to fetch provider configs');
  }

  return data.configs ?? [];
}

export async function saveAdminProviderConfig(
  kind: AdminProviderKind,
  providerId: string,
  patch: AdminProviderConfigPatch,
): Promise<AdminProviderConfig> {
  const response = await fetch('/api/admin/provider-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerKind: kind,
      providerId,
      ...patch,
    }),
  });
  const data = (await response.json()) as {
    success?: boolean;
    config?: AdminProviderConfig;
    error?: string;
  };

  if (!response.ok || data.success === false || !data.config) {
    throw new Error(data.error || 'Failed to save provider config');
  }

  return data.config;
}
