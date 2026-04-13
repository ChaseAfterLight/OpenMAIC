import type { ModuleId } from '@/lib/module-host/types';

export const AVAILABLE_MODULE_IDS = [
  'core',
  'k12',
  'adult-education',
] as const satisfies readonly ModuleId[];

function isModuleId(value: string): value is ModuleId {
  return (AVAILABLE_MODULE_IDS as readonly string[]).includes(value);
}

function resolveConfiguredModuleId(): ModuleId {
  const raw =
    process.env.NEXT_PUBLIC_APP_MODULE ||
    process.env.APP_MODULE ||
    process.env.NEXT_PUBLIC_DEFAULT_MODULE ||
    process.env.DEFAULT_MODULE ||
    'core';

  return isModuleId(raw) ? raw : 'core';
}

export const DEFAULT_MODULE_ID = resolveConfiguredModuleId();
