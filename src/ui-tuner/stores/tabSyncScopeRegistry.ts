/**
 * tabSyncScopeRegistry.ts
 * Maps each ShowcaseTab route ID to the exact crossClientSync mirror key prefixes
 * owned by that page. Prevents top-bar Export and PageJumpDirectory Export from
 * dumping unrelated pages' state or global layout stores.
 */

export const TAB_SYNC_KEY_PREFIXES: Record<string, readonly string[]> = {
  overview: ['page:overview:'],
  foundations: ['store:accent', 'app:isLight', 'page:foundations:'],
  badges: ['page:badges:'],
  tabs: ['page:tabs:', 'store:underlineTabs:', 'store:settingActionRow:'],
  stacks: ['page:stacks:'],
  cards: ['page:cards:'],
  'play-cards': ['store:playCardStyle:', 'page:play-cards:'],
  panels: ['page:panels:', 'store:menuLayout:'],
  'composable-nesting': ['page:composable-nesting:'],
  dialogue: ['page:dialogue:'],
  'quick-notification': [
    'page:quick-notification:',
    'page:quick-notification-btn-builder:',
    'store:quickNotification',
  ],
  animation: ['page:animation:'],
  navigation: ['page:navigation:'],
  'hud-elements': [
    'page:hud-elements:',
    'hud-spatial-sandbox:',
    'hud-5a-5-boost-config:',
    'hud-5a-2-demo-inspector:',
    'hud-5a-2-skip-inspector:',
    'store:boostGauge:',
  ],
  'temporal-overlay': ['page:temporal-overlay:'],
  'charts-curves': ['page:charts-curves:'],
  'viewport-safe-area': ['page:viewport-safe-area:', 'store:viewport'],
  'loading-preview': ['page:loading-screen:', 'page:loading-preview:'],
  'center-upper-info': ['5e:', '5e-v2:'],
  takeover: ['5g-v2:', '5g-v3:', '5g-v4:', '5g-v5:'],
  'name-tag-tuner': [
    'store:nameTagConfig:',
    'store:nameTagRuntime:',
    'store:ballVisual:',
    '5h:',
  ],
  recipes: [
    'store:mainMenuStyle:',
    'store:cameraSettingsStyle:',
    'store:menuLayout:',
    'store:playCardStyle:',
    'page:recipes:',
  ],
  'live-preview': ['page:live-preview:'],
  'edge-inspector': ['page:edge-inspector:'],
  'floating-windows': ['page:floating-windows-v2:', 'store:floating:sandbox-6d-'],
  'layer-preview': [
    'page:menu-layer-v2:',
    'store:menuLayout:',
    'store:mainMenuStyle:',
    'store:playCardStyle:',
    'store:cameraSettingsStyle:',
    'store:floating:menu-layer-',
  ],
  'notification-integration': [
    'page:notification-integration:',
    'store:quickNotification',
  ],
};

export function isKeyInActiveTabScope(
  key: string,
  activeTab: string,
  explicitPrefix?: string
): boolean {
  if (key === 'app:activeTab' || key === 'sync:activeTarget') return false;
  if (explicitPrefix) {
    if (explicitPrefix === '*') return true;
    return key.startsWith(explicitPrefix);
  }
  const allowedPrefixes = TAB_SYNC_KEY_PREFIXES[activeTab];
  if (!allowedPrefixes) {
    return key.startsWith(`page:${activeTab}:`);
  }
  return allowedPrefixes.some((prefix) => key.startsWith(prefix));
}
