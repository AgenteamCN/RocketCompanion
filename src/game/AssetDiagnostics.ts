/**
 * AssetDiagnostics.ts
 * Provides:
 * 1. Pre-flight health checks for all required assets (3D models, collision meshes, audio, textures, bot models).
 * 2. Response validation to catch Vite SPA HTML fallbacks before they corrupt decoders or typed arrays.
 * 3. Rich, actionable diagnostic reporting so developers and users immediately know what is missing and how to fix it.
 */

import {
  BALL_HIT_AUDIO_FILES,
  SIDEWALL_HIT_AUDIO_FILES,
  CAR_DEMO_AUDIO_FILES,
  SFX_CAR_COLLISION_FILE,
  SUPERSONIC_STATE_FILE,
  BOOST_COLLECT_FILE,
} from '../ui-core/config/audioConstants.ts';
import { getAllVehicleDescriptors } from '../ui-core/config/vehicleTunerConfig.ts';
import { EXPERIMENTAL_MODEL_URLS } from '../ai/experimental/SafeTensorsLoader.ts';
import { GROUND_REACHABILITY_LUT_URL } from '../entities/reachability/groundReachabilityLut.ts';
import {
  DRIFTWOODS_GLB_URL,
  DRIFTWOODS_Q1_GROUND_TEXTURE_URL,
} from '../entities/stadium/driftwoods/DriftwoodsStadiumLoader.ts';
import { BOOST_PAD_ASSET_URLS } from '../entities/arena/BoostPadTemplateLoader.ts';
import { validateAssetResponse, resolveAssetPath } from '../utils/AssetResponseValidator.ts';

export interface AssetInventoryItem {
  path: string;
  desc: string;
  category: string;
  critical: boolean;
}

export interface MissingAssetEntry extends AssetInventoryItem {
  reason: string;
}

export interface AssetAuditResult {
  missingCritical: MissingAssetEntry[];
  missingNonCritical: MissingAssetEntry[];
  totalChecked: number;
}

export const ASSET_INVENTORY: AssetInventoryItem[] = [
  // 1. RocketSim Physics Arena Collision Meshes
  {
    path: '/arenamesh/manifest.json',
    desc: 'RocketSim collision manifest',
    category: 'Physics',
    critical: true,
  },
  {
    path: '/arenamesh/mesh_0.cmf',
    desc: 'RocketSim stadium collision mesh chunk 0',
    category: 'Physics',
    critical: true,
  },

  // 2. 3D Models & Geometry (derived from stadium & vehicle descriptor registry)
  {
    path: DRIFTWOODS_GLB_URL,
    desc: 'Driftwoods arena 3D model',
    category: '3D Models',
    critical: true,
  },
  {
    path: DRIFTWOODS_Q1_GROUND_TEXTURE_URL,
    desc: 'Driftwoods Q1 7-layer ground mask texture',
    category: 'Visual Effects',
    critical: false,
  },
  ...getAllVehicleDescriptors()
    .filter((desc: { modelUrl: string }) => Boolean(desc.modelUrl))
    .map((desc: { modelUrl: string; name: string }, idx: number) => ({
      path: desc.modelUrl,
      desc: `${desc.name} vehicle 3D model`,
      category: '3D Models',
      critical: idx === 0,
    })),

  // 3. Visual Effects Textures (Gold Rush Boost)
  {
    path: '/assets/boost/rush-mono/plume.webp',
    desc: 'Gold Rush boost plume particle texture',
    category: 'Visual Effects',
    critical: false,
  },
  {
    path: '/assets/boost/rush-mono/turbulence.webp',
    desc: 'Gold Rush boost turbulence particle texture',
    category: 'Visual Effects',
    critical: false,
  },
  {
    path: '/assets/boost/rush-mono/sparks.webp',
    desc: 'Gold Rush boost sparks particle texture',
    category: 'Visual Effects',
    critical: false,
  },

  // 4. Vehicle & Boost Audio
  {
    path: BALL_HIT_AUDIO_FILES[0],
    desc: 'Ball hit impact sound',
    category: 'Audio',
    critical: false,
  },
  {
    path: SIDEWALL_HIT_AUDIO_FILES[0],
    desc: 'Sidewall net impact sound',
    category: 'Audio',
    critical: false,
  },
  {
    path: CAR_DEMO_AUDIO_FILES[0],
    desc: 'Vehicle demolition explosion sound',
    category: 'Audio',
    critical: false,
  },
  {
    path: SFX_CAR_COLLISION_FILE,
    desc: 'Vehicle collision sound',
    category: 'Audio',
    critical: false,
  },
  { path: SUPERSONIC_STATE_FILE, desc: 'Supersonic audio', category: 'Audio', critical: false },
  {
    path: BOOST_COLLECT_FILE,
    desc: 'Boost pad collection sound',
    category: 'Audio',
    critical: false,
  },

  // 5. Bot AI SafeTensors Policies & Reachability Lookup Tables
  {
    path: EXPERIMENTAL_MODEL_URLS.ko_v1,
    desc: 'Kickoff v1 policy SafeTensors',
    category: 'Bot AI',
    critical: false,
  },
  {
    path: EXPERIMENTAL_MODEL_URLS.ko_v2,
    desc: 'Kickoff v2 policy SafeTensors',
    category: 'Bot AI',
    critical: false,
  },
  {
    path: EXPERIMENTAL_MODEL_URLS.necto,
    desc: 'Necto policy SafeTensors',
    category: 'Bot AI',
    critical: false,
  },
  {
    path: EXPERIMENTAL_MODEL_URLS.nexto,
    desc: 'Nexto policy SafeTensors',
    category: 'Bot AI',
    critical: false,
  },
  {
    path: GROUND_REACHABILITY_LUT_URL,
    desc: 'Ground Reachability 3D Isochrone LUT binary',
    category: 'Physics',
    critical: false,
  },

  // 6. Authentic GLB Boost Pad Assets
  {
    path: BOOST_PAD_ASSET_URLS.largeBase,
    desc: 'Boost pad (large) base GLB model',
    category: '3D Models',
    critical: false,
  },
  {
    path: BOOST_PAD_ASSET_URLS.smallBase,
    desc: 'Boost pad (small) base GLB model',
    category: '3D Models',
    critical: false,
  },
];

export interface AuditRequiredAssetsOptions {
  criticalOnly?: boolean;
}

function buildAuditProbeUrl(resolvedPath: string): string {
  const separator = resolvedPath.includes('?') ? '&' : '?';
  return `${resolvedPath}${separator}__rc_audit=1`;
}

/**
 * Pre-flight probe of key assets to detect missing files before the engine crashes.
 * During blocking bootstrap (criticalOnly = true by default), only critical Free Play
 * prerequisites are probed so non-critical audio/bot/texture checks never delay ignition.
 */
export async function auditRequiredAssets(
  options: AuditRequiredAssetsOptions = {}
): Promise<AssetAuditResult> {
  const { criticalOnly = true } = options;
  const itemsToCheck = criticalOnly
    ? ASSET_INVENTORY.filter((item) => item.critical)
    : ASSET_INVENTORY;

  const missingCritical: MissingAssetEntry[] = [];
  const missingNonCritical: MissingAssetEntry[] = [];

  await Promise.all(
    itemsToCheck.map(async (item) => {
      const resolvedPath = resolveAssetPath(item.path);
      const probeUrl = buildAuditProbeUrl(resolvedPath);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;
      try {
        const res = await fetch(probeUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: { Range: 'bytes=0-15' },
          ...(controller ? { signal: controller.signal } : {}),
        });
        const check = validateAssetResponse(res, resolvedPath);
        const contentLength = Number(res.headers.get('content-length') || 0);
        try {
          if (res.status === 206 || (contentLength > 0 && contentLength <= 256)) {
            await res.arrayBuffer();
          } else {
            await res.body?.cancel?.();
          }
        } catch (_drainErr) {
          // Ignore stream cleanup errors after header inspection
        }
        if (!check.ok) {
          const entry: MissingAssetEntry = {
            ...item,
            reason: check.reason || 'Validation failed',
          };
          if (item.critical) {
            missingCritical.push(entry);
          } else {
            missingNonCritical.push(entry);
          }
        }
      } catch (err: any) {
        const entry: MissingAssetEntry = {
          ...item,
          reason: err?.message || 'Network / Fetch error',
        };
        if (item.critical) {
          missingCritical.push(entry);
        } else {
          missingNonCritical.push(entry);
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    })
  );

  return {
    missingCritical,
    missingNonCritical,
    totalChecked: itemsToCheck.length,
  };
}

/**
 * Generates an actionable, styled HTML error message for missing assets.
 */
export function formatMissingAssetsHtml(missingList: readonly MissingAssetEntry[]): string {
  const grouped: Record<string, MissingAssetEntry[]> = {};
  for (const item of missingList) {
    const cat = item.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  let html = `
  <div style="text-align:left;line-height:1.6;font-size:13px;max-width:620px;background:rgba(10,20,36,0.95);padding:18px;border-radius:10px;border:1px solid #3b82f6;box-shadow:0 12px 32px rgba(0,0,0,0.8);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:700;color:#ef4444;">[WARNING]</span>
      <h3 style="color:#ef4444;font-weight:700;margin:0;font-size:16px;">Missing Required Assets</h3>
    </div>
    <p style="margin:0 0 10px 0;color:#e2e8f0;font-size:13px;">
      The local development environment is missing critical files under <code>public/</code>:
    </p>
  `;

  for (const [cat, items] of Object.entries(grouped)) {
    html += `
      <div style="margin-bottom:10px;">
        <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#1e293b;color:#38bdf8;margin-bottom:4px;">${cat}</span>
        <ul style="margin:4px 0 6px 20px;padding:0;color:#cbd5e1;font-size:12px;">
    `;
    for (const it of items) {
      html += `<li style="margin-bottom:3px;"><strong style="color:#f8fafc;">${it.desc}</strong>: <code style="color:#93c5fd;">${it.path}</code></li>`;
    }
    html += `</ul></div>`;
  }

  html += `
    <div style="margin-top:14px;padding:10px 12px;background:rgba(15,23,42,0.8);border-left:4px solid #0284c7;border-radius:4px;">
      <p style="margin:0 0 6px 0;color:#f1f5f9;font-weight:600;font-size:12px;">Resolution:</p>
      <p style="margin:0;color:#94a3b8;font-size:12px;">Verify that the missing static assets exist under <code>public/</code> and refresh the browser page.</p>
    </div>
  </div>
  `;

  return html;
}
