import { DEFAULT_MODULE_ID } from '@/configs/modules';
import { MODULE_REGISTRY } from './registry';
import type { BusinessModule, ModuleId } from './types';

export function loadBusinessModule(moduleId: ModuleId = DEFAULT_MODULE_ID): BusinessModule {
  return MODULE_REGISTRY[moduleId] ?? MODULE_REGISTRY[DEFAULT_MODULE_ID];
}
