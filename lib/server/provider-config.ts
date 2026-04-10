import { createLogger } from '@/lib/logger';
import {
  getPublicProviderConfigSnapshot,
  getResolvedProviderConfigSnapshot,
} from '@/lib/server/provider-config-repository';

const log = createLogger('ServerProviderConfig');
const ignoredClientCredentialWarnings = new Set<string>();

function warnIgnoredClientCredential(field: 'apiKey' | 'baseUrl', scope: string): void {
  const key = `${scope}:${field}`;
  if (ignoredClientCredentialWarnings.has(key)) {
    return;
  }
  ignoredClientCredentialWarnings.add(key);
  log.warn(`[${scope}] Ignoring client-supplied ${field}; using server-managed provider config.`);
}

async function resolveEntry(
  kind: 'llm' | 'tts' | 'asr' | 'pdf' | 'image' | 'video' | 'webSearch',
  providerId: string,
) {
  const snapshot = await getResolvedProviderConfigSnapshot();
  return snapshot[kind][providerId];
}

// ---------------------------------------------------------------------------
// Public API — LLM
// ---------------------------------------------------------------------------

export async function getServerProviders(): Promise<
  Record<string, { models?: string[]; baseUrl?: string }>
> {
  const snapshot = await getPublicProviderConfigSnapshot();
  return snapshot.providers;
}

export async function resolveApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `llm:${providerId}`);
  }
  return (await resolveEntry('llm', providerId))?.apiKey ?? '';
}

export async function resolveBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `llm:${providerId}`);
  }
  return (await resolveEntry('llm', providerId))?.baseUrl;
}

export async function resolveProxy(providerId: string): Promise<string | undefined> {
  return (await resolveEntry('llm', providerId))?.proxy;
}

// ---------------------------------------------------------------------------
// Public API — TTS
// ---------------------------------------------------------------------------

export async function getServerTTSProviders(): Promise<Record<string, { baseUrl?: string }>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  return snapshot.tts;
}

export async function resolveTTSApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `tts:${providerId}`);
  }
  return (await resolveEntry('tts', providerId))?.apiKey ?? '';
}

export async function resolveTTSBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `tts:${providerId}`);
  }
  return (await resolveEntry('tts', providerId))?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — ASR
// ---------------------------------------------------------------------------

export async function getServerASRProviders(): Promise<Record<string, { baseUrl?: string }>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  return snapshot.asr;
}

export async function resolveASRApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `asr:${providerId}`);
  }
  return (await resolveEntry('asr', providerId))?.apiKey ?? '';
}

export async function resolveASRBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `asr:${providerId}`);
  }
  return (await resolveEntry('asr', providerId))?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — PDF
// ---------------------------------------------------------------------------

export async function getServerPDFProviders(): Promise<Record<string, { baseUrl?: string }>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  return snapshot.pdf;
}

export async function resolvePDFApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `pdf:${providerId}`);
  }
  return (await resolveEntry('pdf', providerId))?.apiKey ?? '';
}

export async function resolvePDFBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `pdf:${providerId}`);
  }
  return (await resolveEntry('pdf', providerId))?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — Image Generation
// ---------------------------------------------------------------------------

export async function getServerImageProviders(): Promise<Record<string, Record<string, never>>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  const result: Record<string, Record<string, never>> = {};
  for (const providerId of Object.keys(snapshot.image)) {
    result[providerId] = {};
  }
  return result;
}

export async function resolveImageApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `image:${providerId}`);
  }
  return (await resolveEntry('image', providerId))?.apiKey ?? '';
}

export async function resolveImageBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `image:${providerId}`);
  }
  return (await resolveEntry('image', providerId))?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — Video Generation
// ---------------------------------------------------------------------------

export async function getServerVideoProviders(): Promise<Record<string, Record<string, never>>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  const result: Record<string, Record<string, never>> = {};
  for (const providerId of Object.keys(snapshot.video)) {
    result[providerId] = {};
  }
  return result;
}

export async function resolveVideoApiKey(providerId: string, clientKey?: string): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `video:${providerId}`);
  }
  return (await resolveEntry('video', providerId))?.apiKey ?? '';
}

export async function resolveVideoBaseUrl(
  providerId: string,
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `video:${providerId}`);
  }
  return (await resolveEntry('video', providerId))?.baseUrl;
}

// ---------------------------------------------------------------------------
// Public API — Web Search
// ---------------------------------------------------------------------------

export async function getServerWebSearchProviders(): Promise<Record<string, { baseUrl?: string }>> {
  const snapshot = await getPublicProviderConfigSnapshot();
  const result: Record<string, { baseUrl?: string }> = {};
  for (const [providerId, config] of Object.entries(snapshot.webSearch)) {
    result[providerId] = {
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    };
  }
  return result;
}

export async function resolveWebSearchApiKey(
  providerId: string = 'tavily',
  clientKey?: string,
): Promise<string> {
  if (clientKey?.trim()) {
    warnIgnoredClientCredential('apiKey', `web-search:${providerId}`);
  }
  return (await resolveEntry('webSearch', providerId))?.apiKey ?? '';
}

export async function resolveWebSearchBaseUrl(
  providerId: string = 'tavily',
  clientBaseUrl?: string,
): Promise<string | undefined> {
  if (clientBaseUrl?.trim()) {
    warnIgnoredClientCredential('baseUrl', `web-search:${providerId}`);
  }
  return (await resolveEntry('webSearch', providerId))?.baseUrl;
}

export async function resolveWebSearchProviderOptions(
  providerId: string = 'tavily',
): Promise<Record<string, unknown> | undefined> {
  return (await resolveEntry('webSearch', providerId))?.providerOptions;
}
