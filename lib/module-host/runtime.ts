import { DEFAULT_MODULE_ID } from '@/configs/modules';
import { loadBusinessModule } from './loader';
import type { BusinessModule, ModuleId } from './types';

export function getActiveModuleId(): ModuleId {
  return DEFAULT_MODULE_ID;
}

export function getActiveModule(): BusinessModule {
  return loadBusinessModule(getActiveModuleId());
}

export function getModuleById(moduleId: ModuleId): BusinessModule {
  return loadBusinessModule(moduleId);
}
