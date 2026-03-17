'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { WEB_SEARCH_PROVIDERS, BAIDU_SUB_SOURCES } from '@/lib/web-search/constants';
import type { WebSearchProviderId, BaiduSubSources } from '@/lib/web-search/types';
import { Eye, EyeOff } from 'lucide-react';

interface WebSearchSettingsProps {
  selectedProviderId: WebSearchProviderId;
}

export function WebSearchSettings({ selectedProviderId }: WebSearchSettingsProps) {
  const { t, locale } = useI18n();
  const [showApiKey, setShowApiKey] = useState(false);

  const webSearchProvidersConfig = useSettingsStore((state) => state.webSearchProvidersConfig);
  const setWebSearchProviderConfig = useSettingsStore((state) => state.setWebSearchProviderConfig);
  const baiduSubSources = useSettingsStore((state) => state.baiduSubSources);
  const setBaiduSubSources = useSettingsStore((state) => state.setBaiduSubSources);

  const provider = WEB_SEARCH_PROVIDERS[selectedProviderId];
  const isServerConfigured = !!webSearchProvidersConfig[selectedProviderId]?.isServerConfigured;

  // Reset showApiKey when provider changes (derived state pattern)
  const [prevSelectedProviderId, setPrevSelectedProviderId] = useState(selectedProviderId);
  if (selectedProviderId !== prevSelectedProviderId) {
    setPrevSelectedProviderId(selectedProviderId);
    setShowApiKey(false);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Server-configured notice */}
      {isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      {/* No API key needed notice (e.g., Brave Search) */}
      {!provider.requiresApiKey && !isServerConfigured && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">
          {t('settings.webSearchNoApiKeyNeeded')}
        </div>
      )}

      {/* API Key + Base URL Configuration — always show, but with different hints */}
      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">{t('settings.webSearchApiKey')}</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                placeholder={
                  isServerConfigured ? t('settings.optionalOverride') : t('settings.enterApiKey')
                }
                value={webSearchProvidersConfig[selectedProviderId]?.apiKey || ''}
                onChange={(e) =>
                  setWebSearchProviderConfig(selectedProviderId, {
                    apiKey: e.target.value,
                  })
                }
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

          <div className="space-y-2">
            <Label className="text-sm">{t('settings.webSearchBaseUrl')}</Label>
            <Input
              placeholder={provider.defaultBaseUrl || ''}
              value={webSearchProvidersConfig[selectedProviderId]?.baseUrl || ''}
              onChange={(e) =>
                setWebSearchProviderConfig(selectedProviderId, {
                  baseUrl: e.target.value,
                })
              }
              className="text-sm"
            />
          </div>
        </div>

        {/* Request URL Preview */}
        {(() => {
          const effectiveBaseUrl =
            webSearchProvidersConfig[selectedProviderId]?.baseUrl || provider.defaultBaseUrl || '';
          if (!effectiveBaseUrl) return null;
          const fullUrl = effectiveBaseUrl + '/search';
          return (
            <p className="text-xs text-muted-foreground break-all">
              {t('settings.requestUrl')}: {fullUrl}
            </p>
          );
        })()}
      </>

      {/* ── Baidu Sub-Source Toggles ── */}
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
              const enabled = baiduSubSources?.[key] ?? true;
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <span
                    className={`flex-1 text-sm font-medium transition-colors ${
                      !enabled ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {meta.label[locale]}
                  </span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => setBaiduSubSources({ [key]: checked })}
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
