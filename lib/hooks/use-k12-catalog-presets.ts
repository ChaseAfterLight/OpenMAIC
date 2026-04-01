'use client';

import { useEffect, useState } from 'react';
import { buildK12PresetsWithCatalog } from '@/lib/module-host/k12';
import type { K12ModulePresets } from '@/lib/module-host/types';

export function useK12CatalogPresets(basePresets?: K12ModulePresets) {
  const [presets, setPresets] = useState<K12ModulePresets | undefined>(() =>
    basePresets ? buildK12PresetsWithCatalog(basePresets, []) : undefined,
  );
  const [isLoading, setIsLoading] = useState(Boolean(basePresets));

  useEffect(() => {
    let cancelled = false;

    if (!basePresets) {
      setPresets(undefined);
      setIsLoading(false);
      return;
    }

    setPresets(buildK12PresetsWithCatalog(basePresets, []));
    setIsLoading(true);

    const loadCatalog = async () => {
      try {
        const res = await fetch('/api/k12/textbooks', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as {
          editions?: K12ModulePresets['textbookEditions'];
        };
        if (cancelled) return;
        setPresets(buildK12PresetsWithCatalog(basePresets, data.editions ?? []));
      } catch {
        if (cancelled) return;
        setPresets(buildK12PresetsWithCatalog(basePresets, []));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [basePresets]);

  return { presets, isLoading };
}
