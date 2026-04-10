import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock fs — only intercept server-providers.yml; delegate everything else to real fs.
// This prevents YAML config from leaking host-machine state into tests while keeping
// the mock scoped to what provider-config actually reads.
let yamlOverride: string | null = null;
const providerConfigTestState = vi.hoisted(() => ({ storageRoot: '' }));

vi.mock('@/lib/server/storage-backend-config', () => ({
  getServerStorageConfig: () => ({
    backend: 'file',
    storageRoot: providerConfigTestState.storageRoot,
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const isYaml = (p: unknown) => typeof p === 'string' && p.endsWith('server-providers.yml');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
      readFileSync: (p: string, ...args: unknown[]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
    },
    existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
    readFileSync: (p: string, ...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
  };
});

describe('provider-config', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    yamlOverride = null;
    providerConfigTestState.storageRoot = await mkdtemp(
      path.join(os.tmpdir(), 'openmaic-provider-config-'),
    );
  });

  afterEach(async () => {
    if (providerConfigTestState.storageRoot) {
      await rm(providerConfigTestState.storageRoot, { force: true, recursive: true });
    }
    providerConfigTestState.storageRoot = '';
  });

  describe('resolveApiKey', () => {
    it('ignores client key when server key is not configured', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('openai', 'sk-client')).toBe('');
    });

    it('returns server key from env when no client key', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-server');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('openai')).toBe('sk-server');
    });

    it('returns empty string when neither client nor server key exists', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('openai')).toBe('');
    });

    it('keeps server key even when client key is provided', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-server');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('openai', 'sk-client')).toBe('sk-server');
    });

    it('resolves non-OpenAI providers via their env prefix', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('anthropic')).toBe('sk-anthropic');
    });

    it('returns empty string for unknown provider with no env var', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveApiKey('nonexistent-provider')).toBe('');
    });
  });

  describe('resolveBaseUrl', () => {
    it('ignores client URL when provided', async () => {
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(await resolveBaseUrl('openai', 'https://custom.api.com')).toBeUndefined();
    });

    it('returns server URL from env when no client URL', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.example.com/v1');
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(await resolveBaseUrl('openai')).toBe('https://proxy.example.com/v1');
    });

    it('returns undefined when neither client nor server URL exists', async () => {
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(await resolveBaseUrl('openai')).toBeUndefined();
    });
  });

  describe('resolveProxy', () => {
    it('returns undefined when no proxy configured', async () => {
      const { resolveProxy } = await import('@/lib/server/provider-config');
      expect(await resolveProxy('openai')).toBeUndefined();
    });

    it('returns proxy URL from YAML config', async () => {
      yamlOverride = `
providers:
  openai:
    apiKey: sk-yaml
    proxy: http://proxy.internal:8080
`;
      const { resolveProxy } = await import('@/lib/server/provider-config');
      expect(await resolveProxy('openai')).toBe('http://proxy.internal:8080');
    });
  });

  describe('getServerProviders', () => {
    it('returns empty object when no providers configured', async () => {
      const { getServerProviders } = await import('@/lib/server/provider-config');
      expect(await getServerProviders()).toEqual({});
    });

    it('returns provider metadata without API keys', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-secret');
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.com/v1');
      vi.stubEnv('OPENAI_MODELS', 'gpt-4o,gpt-4o-mini');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerProviders();

      expect(providers.openai).toBeDefined();
      expect(providers.openai.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
      expect(providers.openai.baseUrl).toBe('https://proxy.com/v1');
      // API key must NOT be exposed
      expect((providers.openai as Record<string, unknown>).apiKey).toBeUndefined();
    });

    it('lists multiple providers', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerProviders();

      expect(Object.keys(providers)).toContain('openai');
      expect(Object.keys(providers)).toContain('anthropic');
    });

    it('omits providers without API key', async () => {
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.com/v1');
      // No OPENAI_API_KEY set
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerProviders();

      expect(providers.openai).toBeUndefined();
    });
  });

  describe('env var model parsing', () => {
    it('splits comma-separated models and trims whitespace', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
      vi.stubEnv('OPENAI_MODELS', ' gpt-4o , gpt-4o-mini , ');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerProviders();

      expect(providers.openai.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });
  });

  describe('resolveWebSearchApiKey', () => {
    it('ignores client key input and uses server-managed config', async () => {
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveWebSearchApiKey('tavily', 'client-key')).toBe('');
    });

    it('falls back to TAVILY_API_KEY env var', async () => {
      vi.stubEnv('TAVILY_API_KEY', 'tvly-bare-env');
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(await resolveWebSearchApiKey()).toBe('tvly-bare-env');
    });
  });

  describe('other provider families', () => {
    it('resolves TTS provider credentials from server config', async () => {
      vi.stubEnv('TTS_OPENAI_API_KEY', 'sk-tts');
      vi.stubEnv('TTS_OPENAI_BASE_URL', 'https://tts.example.com/v1');
      const { getServerTTSProviders, resolveTTSApiKey, resolveTTSBaseUrl } = await import(
        '@/lib/server/provider-config'
      );

      const providers = await getServerTTSProviders();
      expect(providers['openai-tts']).toEqual({
        baseUrl: 'https://tts.example.com/v1',
      });
      expect(await resolveTTSApiKey('openai-tts', 'client-tts')).toBe('sk-tts');
      expect(await resolveTTSBaseUrl('openai-tts', 'https://client-tts.example.com')).toBe(
        'https://tts.example.com/v1',
      );
    });

    it('resolves ASR provider credentials from server config', async () => {
      vi.stubEnv('ASR_OPENAI_API_KEY', 'sk-asr');
      vi.stubEnv('ASR_OPENAI_BASE_URL', 'https://asr.example.com/v1');
      const { getServerASRProviders, resolveASRApiKey, resolveASRBaseUrl } = await import(
        '@/lib/server/provider-config'
      );

      const providers = await getServerASRProviders();
      expect(providers['openai-whisper']).toEqual({
        baseUrl: 'https://asr.example.com/v1',
      });
      expect(await resolveASRApiKey('openai-whisper', 'client-asr')).toBe('sk-asr');
      expect(await resolveASRBaseUrl('openai-whisper', 'https://client-asr.example.com')).toBe(
        'https://asr.example.com/v1',
      );
    });

    it('resolves image generation credentials from server config', async () => {
      vi.stubEnv('IMAGE_SEEDREAM_API_KEY', 'sk-image');
      vi.stubEnv('IMAGE_SEEDREAM_BASE_URL', 'https://image.example.com/v1');
      const { getServerImageProviders, resolveImageApiKey, resolveImageBaseUrl } = await import(
        '@/lib/server/provider-config'
      );

      const providers = await getServerImageProviders();
      expect(providers.seedream).toEqual({});
      expect(await resolveImageApiKey('seedream', 'client-image')).toBe('sk-image');
      expect(await resolveImageBaseUrl('seedream', 'https://client-image.example.com')).toBe(
        'https://image.example.com/v1',
      );
    });

    it('resolves video generation credentials from server config', async () => {
      vi.stubEnv('VIDEO_SEEDANCE_API_KEY', 'sk-video');
      vi.stubEnv('VIDEO_SEEDANCE_BASE_URL', 'https://video.example.com/v1');
      const { getServerVideoProviders, resolveVideoApiKey, resolveVideoBaseUrl } = await import(
        '@/lib/server/provider-config'
      );

      const providers = await getServerVideoProviders();
      expect(providers.seedance).toEqual({});
      expect(await resolveVideoApiKey('seedance', 'client-video')).toBe('sk-video');
      expect(await resolveVideoBaseUrl('seedance', 'https://client-video.example.com')).toBe(
        'https://video.example.com/v1',
      );
    });

    it('resolves web-search provider options from server config', async () => {
      yamlOverride = `
web-search:
  baidu:
    apiKey: sk-baidu
    baseUrl: https://qianfan.baidubce.com
    providerOptions:
      baiduSubSources:
        webSearch: true
        baike: false
        scholar: true
`;
      const { resolveWebSearchApiKey, resolveWebSearchProviderOptions } = await import(
        '@/lib/server/provider-config'
      );

      expect(await resolveWebSearchApiKey('baidu', 'client-baidu')).toBe('sk-baidu');
      expect(await resolveWebSearchProviderOptions('baidu')).toEqual({
        baiduSubSources: {
          webSearch: true,
          baike: false,
          scholar: true,
        },
      });
    });
  });

  describe('baseUrl-only providers (e.g. mineru)', () => {
    it('includes PDF provider from YAML when only baseUrl is configured (no apiKey)', async () => {
      yamlOverride = `
pdf:
  mineru:
    baseUrl: http://localhost:8888
`;
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerPDFProviders();

      expect(providers.mineru).toBeDefined();
      expect(providers.mineru.baseUrl).toBe('http://localhost:8888');
    });

    it('includes provider from env when only BASE_URL is set (no API_KEY)', async () => {
      vi.stubEnv('PDF_MINERU_BASE_URL', 'http://localhost:8888');
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerPDFProviders();

      expect(providers.mineru).toBeDefined();
      expect(providers.mineru.baseUrl).toBe('http://localhost:8888');
    });

    it('excludes PDF provider when only apiKey is configured (no baseUrl)', async () => {
      yamlOverride = `
pdf:
  mineru:
    apiKey: sk-fake
`;
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = await getServerPDFProviders();

      expect(providers.mineru).toBeUndefined();
    });
  });
});
