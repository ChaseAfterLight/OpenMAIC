import type { BusinessModule, ModuleId } from './types';
import { coreModuleManifest } from '@/modules/core/manifest';
import { k12ModuleManifest } from '@/modules/k12/manifest';
import { adultEducationModuleManifest } from '@/modules/adult-education/manifest';

export const MODULE_REGISTRY: Record<ModuleId, BusinessModule> = {
  core: coreModuleManifest,
  k12: k12ModuleManifest,
  'adult-education': adultEducationModuleManifest,
};
