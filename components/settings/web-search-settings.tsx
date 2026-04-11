'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { WEB_SEARCH_PROVIDERS, BAIDU_SUB_SOURCES } from '@/lib/web-search/constants';
import type { WebSearchProviderId, BaiduSubSources } from '@/lib/web-search/types';
import type { AdminProviderConfig, AdminProviderConfigPatch } from './admin-provider-config';

interface WebSearchSettingsProps {
  selectedProviderId: WebSearchProviderId;
  isAdmin?: boolean;
  adminConfig?: AdminProviderConfig;
  onAdminConfigSave?: (patch: AdminProviderConfigPatch) => void | Promise<void>;
}

export function WebSearchSettings({
  selectedProviderId,
  isAdmin = false,
  adminConfig,
  onAdminConfigSave,
}: WebSearchSettingsProps) {
  const { t, locale } = useI18n();
  const [showApiKey, setShowApiKey] = useState(false);
  const [adminApiKey, setAdminApiKey] = useState('');
  const [adminBaseUrl, setAdminBaseUrl] = useState('');
  const [adminBaiduSubSources, setAdminBaiduSubSources] = useState<BaiduSubSources>({
    webSearch: true,
    baike: true,
    scholar: true,
  });

  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);
  const baiduSubSources = useSettingsStore((state) => state.baiduSubSources);
  const setBaiduSubSources = useSettingsStore((state) => state.setBaiduSubSources);

  const provider = WEB_SEARCH_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!webSearchProvidersConfig[selectedProviderId]?.isServerConfigured;
  const showApiKeyInput = isAdmin && (provider.requiresApiKey || isServerConfigured);
  const labelLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';

  const [prevSelectedProviderId, setPrevSelectedProviderId] = useState(selectedProviderId);
  if (selectedProviderId !== prevSelectedProviderId) {
    setPrevSelectedProviderId(selectedProviderId);
    setShowApiKey(false);
  }

  useEffect(() => {
    const options = adminConfig?.providerOptions ?? {};
    const configuredSources = options.baiduSubSources;
    const nextSources =
      configuredSources && typeof configuredSources === 'object' && !Array.isArray(configuredSources)
        ? ({ ...baiduSubSources, ...(configuredSources as Partial<BaiduSubSources>) } as BaiduSubSources)
        : baiduSubSources;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset admin drafts when switching provider records.
    setAdminApiKey('');
    setAdminBaseUrl(adminConfig?.baseUrl || '');
    setAdminBaiduSubSources(nextSources);
  }, [adminConfig?.baseUrl, adminConfig?.providerOptions, baiduSubSources, selectedProviderId]);

  const saveAdminConfig = (sources = adminBaiduSubSources) => {
    if (!isAdmin || !onAdminConfigSave) return;

    const providerOptions =
      selectedProviderId === 'baidu'
        ? {
            ...(adminConfig?.providerOptions ?? {}),
            baiduSubSources: sources,
          }
        : adminConfig?.providerOptions ?? {};
    const patch: AdminProviderConfigPatch = {
      baseUrl: adminBaseUrl.trim() || null,
      providerOptions,
    };
    if (adminApiKey.trim()) {
      patch.apiKey = adminApiKey.trim();
    }
    void onAdminConfigSave(patch);
    setAdminApiKey('');
  };

  const publicProviderOptions = webSearchProvidersConfig[selectedProviderId]?.providerOptions ?? {};
  const publicBaiduSources = publicProviderOptions.baiduSubSources;
  const effectiveBaiduSubSources =
    isAdmin
      ? adminBaiduSubSources
      : publicBaiduSources && typeof publicBaiduSources === 'object' && !Array.isArray(publicBaiduSources)
        ? ({ ...baiduSubSources, ...(publicBaiduSources as Partial<BaiduSubSources>) } as BaiduSubSources)
        : baiduSubSources;

  const effectiveBaseUrl =
    (isAdmin ? adminBaseUrl : webSearchProvidersConfig[selectedProviderId]?.baseUrl) ||
    webSearchProvidersConfig[selectedProviderId]?.serverBaseUrl ||
    provider.defaultBaseUrl ||
    '';

  return (
    <div className="space-y-6 max-w-3xl">
      {(isServerConfigured || isAdmin) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
          {isAdmin
            ? t('settings.serverConfiguredAdminNoticeWebSearch', {
                status: adminConfig?.hasApiKey
                  ? t('settings.adminApiKeyStored')
                  : t('settings.adminApiKeyMissing'),
              })
            : t('settings.serverConfiguredNotice')}
        </div>
      )}

      {!provider.requiresApiKey && !isServerConfigured && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          {t('settings.webSearchNoApiKeyNeeded')}
        </div>
      )}

      {isAdmin && (
      <div className={`grid gap-4 ${showApiKeyInput ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showApiKeyInput && (
          <div className="space-y-2">
            <Label className="text-sm">{t('settings.webSearchApiKey')}</Label>
            <div className="relative">
              <Input
                name={`web-search-api-key-${selectedProviderId}`}
                type={showApiKey ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={
                  adminConfig?.hasApiKey
                    ? t('settings.keepExistingApiKey')
                    : t('settings.enterApiKey')
                }
                value={adminApiKey}
                onChange={(e) => setAdminApiKey(e.target.value)}
                onBlur={() => saveAdminConfig()}
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.webSearchApiKeyHint')}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm">{t('settings.webSearchBaseUrl')}</Label>
          <Input
            name={`web-search-base-url-${selectedProviderId}`}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={provider.defaultBaseUrl || 'https://api.tavily.com'}
            value={adminBaseUrl}
            onChange={(e) => setAdminBaseUrl(e.target.value)}
            onBlur={() => saveAdminConfig()}
            className="text-sm"
          />
        </div>
      </div>
      )}

      {effectiveBaseUrl && (
        <p className="text-xs text-muted-foreground break-all">
          {t('settings.requestUrl')}: {effectiveBaseUrl}/search
        </p>
      )}

      {selectedProviderId === 'baidu' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {locale === 'zh-CN' ? '搜索源' : 'Search Sources'}
          </Label>
          <div className="space-y-2">
            {(
              Object.entries(BAIDU_SUB_SOURCES) as [
                keyof BaiduSubSources,
                (typeof BAIDU_SUB_SOURCES)[keyof typeof BAIDU_SUB_SOURCES],
              ][]
            ).map(([key, meta]) => {
              const enabled = effectiveBaiduSubSources?.[key] ?? true;
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <span
                    className={`flex-1 text-sm font-medium transition-colors ${
                      !enabled ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {meta.label[labelLocale]}
                  </span>
                  <Switch
                    checked={enabled}
                    disabled={!isAdmin}
                    onCheckedChange={(checked) => {
                      const nextSources = { ...effectiveBaiduSubSources, [key]: checked };
                      if (isAdmin) {
                        setAdminBaiduSubSources(nextSources);
                        saveAdminConfig(nextSources);
                      } else {
                        setBaiduSubSources({ [key]: checked });
                      }
                    }}
                    className="scale-[0.85] origin-right"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {locale === 'zh-CN'
              ? '选择百度搜索时使用的数据源，至少启用一个'
              : 'Choose which Baidu data sources to query. Enable at least one.'}
          </p>
        </div>
      )}
    </div>
  );
}
