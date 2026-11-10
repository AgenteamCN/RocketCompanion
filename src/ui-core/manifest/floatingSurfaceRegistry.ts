/// <reference types="vite/client" />
import type React from 'react';
import { resolveCalibratedSurfaceSizing } from './surfaceCalibration';
import type {
  DiscoveredSurfaceEntry,
  StandardSurfaceProps,
  SurfaceMenuGroup,
  SurfaceMeta,
} from './surfaceMetaTypes';

export interface GlobSurfaceModule {
  SURFACE_META?: SurfaceMeta;
  default?: React.ComponentType<StandardSurfaceProps>;
  [exportName: string]: unknown;
}

const floatingWindowModules: Record<string, GlobSurfaceModule> =
  import.meta.glob<GlobSurfaceModule>(
    '../panels/{user,dev}/*FloatingWindow.tsx',
    { eager: true }
  );

export function resolveModuleComponent(
  mod: GlobSurfaceModule
): React.ComponentType<StandardSurfaceProps> | null {
  if (typeof mod.default === 'function' || (mod.default && typeof mod.default === 'object')) {
    return mod.default as React.ComponentType<StandardSurfaceProps>;
  }
  for (const [key, value] of Object.entries(mod)) {
    if (key === 'SURFACE_META') continue;
    if (
      (key.endsWith('FloatingWindow') || key.endsWith('Recipe')) &&
      (typeof value === 'function' || (value && typeof value === 'object'))
    ) {
      return value as React.ComponentType<StandardSurfaceProps>;
    }
  }
  return null;
}

export function collectDiscoveredEntries(
  modulesRecord: Record<string, GlobSurfaceModule>
): DiscoveredSurfaceEntry[] {
  const entries: DiscoveredSurfaceEntry[] = [];
  for (const [modulePath, mod] of Object.entries(modulesRecord)) {
    if (!mod || !mod.SURFACE_META) continue;
    const Component = resolveModuleComponent(mod);
    if (!Component) continue;
    const meta = mod.SURFACE_META;
    entries.push({
      meta,
      resolvedSizing: resolveCalibratedSurfaceSizing(meta.id, meta.defaultSizing),
      Component,
      modulePath,
    });
  }
  return entries.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}

const DISCOVERED_FLOATING_SURFACES: DiscoveredSurfaceEntry[] =
  collectDiscoveredEntries(floatingWindowModules);

/**
 * Returns all floating window surfaces that declare co-located `export const SURFACE_META`.
 */
export function getDiscoveredFloatingSurfaces(): DiscoveredSurfaceEntry[] {
  return DISCOVERED_FLOATING_SURFACES;
}

/**
 * Filters discovered floating window surfaces by `menuGroup`
 * (e.g. `'active-tuners'`, `'calibrated-presets'`, `'sandboxes'`).
 */
export function getDiscoveredFloatingSurfacesByMenuGroup(
  menuGroup: SurfaceMenuGroup
): DiscoveredSurfaceEntry[] {
  return DISCOVERED_FLOATING_SURFACES.filter(
    (entry) => entry.meta.menuGroup === menuGroup
  );
}
