/**
 * AssetResponseValidator.ts
 * Pure HTTP/Fetch asset path resolution and response validation utility with zero dependency on game or audio layers.
 */

export interface AssetValidationError extends Error {
  assetUrl: string;
  status: number;
  isAssetError: boolean;
  isHtmlFallback: boolean;
}

export interface AssetValidationResult {
  ok: boolean;
  error: AssetValidationError | null;
  reason?: string;
}

export function resolveAssetPath(path: string): string {
  if (!path) return '';
  if (/^(?:https?:|\/\/|blob:|data:)/.test(path)) return path;
  const win =
    typeof window !== 'undefined' ? (window as unknown as { __ASSET_BASE__?: string }) : undefined;
  const base =
    win?.__ASSET_BASE__ ||
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) ||
    '';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return cleanBase ? cleanBase + cleanPath : cleanPath;
}

export function validateAssetResponse(
  res: Response,
  url: string,
  _expectedType = 'binary'
): AssetValidationResult {
  const contentType = res.headers.get('content-type') || '';
  const isHtml = contentType.toLowerCase().includes('text/html');
  const isMissingHeader = Boolean(res.headers.get('x-asset-missing'));

  if (!res.ok || isHtml || isMissingHeader) {
    let reason = `HTTP ${res.status} ${res.statusText || ''}`.trim();
    if (isHtml) {
      reason += ' (Server returned text/html SPA fallback — file does not exist on disk)';
    }
    const error = Object.assign(new Error(`[Asset Missing] Failed to load "${url}": ${reason}`), {
      assetUrl: url,
      status: res.status,
      isAssetError: true,
      isHtmlFallback: isHtml,
    });
    return { ok: false, error, reason };
  }

  return { ok: true, error: null };
}

export function formatMatchTime(seconds: number, ceil = false): string {
  const t = Math.max(0, ceil ? Math.ceil(seconds) : Math.floor(seconds));
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}
