/// <reference types="vite/client" />
import React from 'react';
import { getDiscoveredFloatingSurfaces } from '../manifest/floatingSurfaceRegistry';
import { type StandardSurfaceProps, type SurfaceMeta } from '../manifest/surfaceRegistry';




export type FloatingWindowHeaderTab = string;

export interface RenderFloatingWindowPanelOptions {
  isLight?: boolean;
  activeTab?: FloatingWindowHeaderTab;
  onTabChange?: (tab: string) => void;
}

export interface FloatingWindowDescriptor {
  id: string;
  category: 'user' | 'developer';
  hasHeaderTabs?: boolean;
  render: (options: RenderFloatingWindowPanelOptions) => React.ReactNode;
}

interface GlobFloatingWindowModule {
  SURFACE_META?: SurfaceMeta;
  default?: React.ComponentType<StandardSurfaceProps>;
  [exportName: string]: unknown;
}

const rawFloatingWindowModules: Record<string, GlobFloatingWindowModule> =
  import.meta.glob<GlobFloatingWindowModule>('./{user,dev}/*FloatingWindow.tsx', {
    eager: true,
  });

const MULTI_TAB_WINDOW_IDS = new Set<string>([
  'vehicle-model-offset-tuner',
  'vehicle-global-fx-tuner',
  'atmosphere-fx-tuner',
  'subsystem-isolation-lab',
  'boost-pad-tuner',
  'driftwoods-tuner',
]);

function deriveFloatingWindowIdFromPath(modulePath: string): string {
  const filename = modulePath.split('/').pop() ?? '';
  const stem = filename.replace(/FloatingWindow\.tsx$/, '');
  return stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function resolveFloatingWindowComponent(
  mod: GlobFloatingWindowModule
): React.ComponentType<StandardSurfaceProps> | null {
  if (
    typeof mod.default === 'function' ||
    (mod.default && typeof mod.default === 'object')
  ) {
    return mod.default as React.ComponentType<StandardSurfaceProps>;
  }
  for (const [exportName, value] of Object.entries(mod)) {
    if (exportName === 'SURFACE_META') continue;
    if (
      exportName.endsWith('FloatingWindow') &&
      (typeof value === 'function' || (value && typeof value === 'object'))
    ) {
      return value as React.ComponentType<StandardSurfaceProps>;
    }
  }
  return null;
}

function buildFloatingWindowDescriptors(): Record<string, FloatingWindowDescriptor> {
  const descriptors: Record<string, FloatingWindowDescriptor> = {};

  // 1. Register all surfaces declaring co-located `export const SURFACE_META`
  for (const entry of getDiscoveredFloatingSurfaces()) {
    const DiscoveredComponent = entry.Component;
    const hasVariants = Boolean(entry.meta.variants && entry.meta.variants.length > 0);
    descriptors[entry.meta.id] = {
      id: entry.meta.id,
      category: entry.meta.layer === 'floating-user' ? 'user' : 'developer',
      hasHeaderTabs: hasVariants || MULTI_TAB_WINDOW_IDS.has(entry.meta.id),
      render: ({ isLight = false, activeTab, onTabChange }) => (
        <DiscoveredComponent
          isLight={isLight}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      ),
    };
  }

  // 2. Auto-discover any remaining `./{user,dev}/*FloatingWindow.tsx` modules via import.meta.glob
  for (const [modulePath, mod] of Object.entries(rawFloatingWindowModules)) {
    if (!mod) continue;
    const Component = resolveFloatingWindowComponent(mod);
    if (!Component) continue;
    const id = mod.SURFACE_META?.id ?? deriveFloatingWindowIdFromPath(modulePath);
    if (!id || descriptors[id]) continue;
    const isUser =
      mod.SURFACE_META?.layer === 'floating-user' || modulePath.includes('/user/');
    const hasVariants = Boolean(
      mod.SURFACE_META?.variants && mod.SURFACE_META.variants.length > 0
    );
    descriptors[id] = {
      id,
      category: isUser ? 'user' : 'developer',
      hasHeaderTabs: hasVariants || MULTI_TAB_WINDOW_IDS.has(id),
      render: ({ isLight = false, activeTab, onTabChange }) => (
        <Component
          isLight={isLight}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      ),
    };
  }

  return descriptors;
}

/**
 * Declarative, zero-conflict descriptor map for all Floating Windows.
 * Populated automatically via `import.meta.glob('./{user,dev}/*FloatingWindow.tsx', { eager: true })`
 * and co-located `SURFACE_META` declarations so parallel feature branches never collide here.
 */
export const FLOATING_WINDOW_DESCRIPTORS: Record<string, FloatingWindowDescriptor> =
  buildFloatingWindowDescriptors();

/**
 * [L6 Floating Window Registry]
 * Maps any of the `RocketCompanion` Floating Window preset IDs (User + Developer)
 * to its normalized, low-coupling L6 Floating Window Panel via zero-conflict auto-discovery.
 */
export function renderFloatingWindowPanel(
  id: string,
  options: RenderFloatingWindowPanelOptions = {}
): React.ReactNode {
  const descriptor = FLOATING_WINDOW_DESCRIPTORS[id];
  return descriptor ? descriptor.render(options) : null;
}
