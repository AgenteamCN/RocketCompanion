export interface UrlParamMap {
  tab?: string;
  tier?: 'user' | 'developer';
  route?: string;
  subtab?: string;
  ctx?: string;
  fw?: string;
  fwTab?: string;
  fwMode?: 'inspector' | 'stack' | 'matrix';
  recipe?: string;
}

export function readUrlParams(): UrlParamMap {
  if (typeof window === 'undefined') return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const out: UrlParamMap = {};
    const tab = sp.get('tab');
    const tier = sp.get('tier');
    const route = sp.get('route');
    const subtab = sp.get('subtab');
    const ctx = sp.get('ctx');
    const fw = sp.get('fw');
    const fwTab = sp.get('fwTab');
    const fwMode = sp.get('fwMode');
    const recipe = sp.get('recipe');

    if (tab) out.tab = tab;
    if (tier === 'user' || tier === 'developer') out.tier = tier;
    if (route) out.route = route;
    if (subtab) out.subtab = subtab;
    if (ctx) out.ctx = ctx;
    if (fw) out.fw = fw;
    if (fwTab) out.fwTab = fwTab;
    if (fwMode === 'inspector' || fwMode === 'stack' || fwMode === 'matrix') out.fwMode = fwMode;
    if (recipe) out.recipe = recipe;
    return out;
  } catch {
    return {};
  }
}

export type UrlParamPatch = {
  [K in keyof UrlParamMap]?: UrlParamMap[K] | null;
};

export interface UpdateUrlOptions {
  /** When true, pushes a new entry onto window.history instead of replacing the current one */
  push?: boolean;
  /** Optional location hash (#anchor-id) to set or clear (pass null/'' to clear) */
  hash?: string | null;
}

export function updateUrlParams(patch: UrlParamPatch, options?: UpdateUrlOptions): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    (Object.keys(patch) as (keyof UrlParamMap)[]).forEach((key) => {
      const val = patch[key];
      if (val === undefined || val === null || val === '') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(val));
      }
    });
    if (options && 'hash' in options) {
      if (!options.hash) {
        url.hash = '';
      } else {
        url.hash = options.hash.startsWith('#') ? options.hash : `#${options.hash}`;
      }
    }
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const currHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextHref !== currHref) {
      if (options?.push) {
        window.history.pushState(window.history.state, '', nextHref);
      } else {
        window.history.replaceState(window.history.state, '', nextHref);
      }
    }
  } catch {
    // Ignore history API errors in constrained environments
  }
}
