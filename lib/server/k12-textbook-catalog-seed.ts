import type { K12ModulePresets, K12TextbookEdition } from '@/lib/module-host/types';
import { k12ModuleManifest } from '@/modules/k12/manifest';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getSeedK12TextbookEditions(): K12TextbookEdition[] {
  const presets = k12ModuleManifest.presets as unknown as K12ModulePresets;
  return cloneJson(presets.textbookEditions ?? []);
}
