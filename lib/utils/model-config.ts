import { useSettingsStore } from '@/lib/store/settings';
import { PROVIDERS } from '@/lib/ai/providers';
import type { ProviderId } from '@/lib/ai/providers';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig } = useSettingsStore.getState();
  const serverConfiguredProviderEntry = Object.entries(providersConfig).find(
    ([, config]) => !!config.isServerConfigured,
  );
  const activeProviderId =
    providersConfig[providerId]?.isServerConfigured || !serverConfiguredProviderEntry
      ? providerId
      : (serverConfiguredProviderEntry[0] as ProviderId);
  const providerConfig = providersConfig[activeProviderId];
  const providerInfo = PROVIDERS[activeProviderId as ProviderId];
  const activeModelId =
    providerConfig?.models?.some((model) => model.id === modelId)
      ? modelId
      : providerConfig?.models?.[0]?.id || modelId;
  const modelString = `${activeProviderId}:${activeModelId}`;

  return {
    providerId: activeProviderId,
    modelId: activeModelId,
    modelString,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type || providerInfo?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
  };
}
