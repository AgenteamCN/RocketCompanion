import React, { useState } from 'react';
import {
  Sun,
  Radio,
  CloudSun,
  CircleDot,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { UnderlineTabs, type TabItem } from '../../primitives/UnderlineTabs';
import { TunerPrecisionContext } from '../../primitives/PrecisionDigitPicker';
import {
  DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG,
  getExperimentalWallFxConfig,
  setExperimentalWallFxRuntimeConfig,
} from '../../config/atmosphereFxConfig';
import {
  DEFAULT_SHADOW_CONFIG,
  getShadowConfig,
  updateShadowRuntimeConfig,
} from '../../config/atmosphereFxConfig';
import {
  DEFAULT_SKYBOX_CONFIG,
  getSkyboxConfig,
  updateSkyboxConfig,
} from '../../config/skyboxConfig';
import { DEFAULT_BALL_VISUAL_CONFIG, getBallVisualConfig, updateBallVisualConfig, subscribeBallVisualConfig } from '../../config/ballVisualConfig';
import { type BallVisualConfig } from '../../stores/ballVisualStore';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { WallPulseTab } from './atmosphere-fx/WallPulseTab';
import { ShadowsLightTab } from './atmosphere-fx/ShadowsLightTab';
import { SkyboxTab } from './atmosphere-fx/SkyboxTab';
import { BallTab } from './atmosphere-fx/BallTab';

export type AtmosphereFxTab = 'wall-pulse' | 'shadows-light' | 'skybox' | 'ball';

const ATMOSPHERE_FX_TAB_IDS: readonly AtmosphereFxTab[] = [
  'wall-pulse',
  'shadows-light',
  'skybox',
  'ball',
];

function isAtmosphereFxTab(value: string | undefined): value is AtmosphereFxTab {
  return Boolean(value && (ATMOSPHERE_FX_TAB_IDS as readonly string[]).includes(value));
}

export const SURFACE_META: SurfaceMeta = {
  id: 'atmosphere-fx-tuner',
  title: 'Atmosphere & FX Tuner',
  subtitle: 'Wall & Pulse · Shadows & Light · Skybox · Ball',
  description:
    'Wall & Pulse (Cubic-Bezier Fade-Out Curve), Single-Sun Sharp Shadows, Full-Sphere Skybox & 70% Ball.',
  icon: 'Sun',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  defaultSizing: {
    width: 480,
    height: 580,
    minHeight: 200,
    mode: 'fixed',
  },
  variants: [
    { variantId: 'wall-pulse', label: '1. Wall & Pulse' },
    { variantId: 'shadows-light', label: '2. Shadows & Light' },
    { variantId: 'skybox', label: '3. Skybox' },
    { variantId: 'ball', label: '4. Ball' },
  ],
};

export interface AtmosphereFxTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: AtmosphereFxTab | string;
}

let cachedAtmosphereActiveTab: AtmosphereFxTab = 'wall-pulse';

/**
 * Atmosphere & FX Tuner Floating Window
 * Declarative shell hosting UnderlineTabs for Arena-level atmosphere & shader effects:
 * 1. Wall & Pulse (with Cubic-Bezier fade-out curve)
 * 2. Shadows & Light (with 3D Light Ray Gizmo, Sun/Key/Hemi tuners)
 * 3. Skybox (5 Panorama Presets + Optional Sun Corona, Cloud Overlay & OOB Normal)
 * 4. Ball (Ball Opacity, DepthWrite, Wireframe & Ground Ring)
 */
export const AtmosphereFxTunerFloatingWindow: React.FC<AtmosphereFxTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setActiveTabState] = useState<AtmosphereFxTab>(() =>
    isAtmosphereFxTab(controlledTab) ? controlledTab : cachedAtmosphereActiveTab
  );
  const activeTab: AtmosphereFxTab = isAtmosphereFxTab(controlledTab)
    ? controlledTab
    : internalTab;
  const setActiveTab = (tab: AtmosphereFxTab) => {
    cachedAtmosphereActiveTab = tab;
    setActiveTabState(tab);
    onTabChange?.(tab);
  };
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);
  const bridge = useAppStore((s) => s.bridge);
  const precisionStep = useAppStore((s) => s.precisionStep);
  const setPrecisionStep = useAppStore((s) => s.setPrecisionStep);

  const [wallConfig, setWallConfig] = useState(() => getExperimentalWallFxConfig());

  const applyWallPatch = (patch: Partial<typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG>) => {
    const updated = setExperimentalWallFxRuntimeConfig({
      circleApplyToWalls: true,
      circleApplyToHexes: false,
      teamApplyToHexes: true,
      teamApplyToWalls: false,
      ...patch,
    });
    setWallConfig({ ...updated });
    bridge.onExperimentalWallConfigChange?.(updated);
  };

  const [shadowConfig, setShadowConfig] = useState(() => getShadowConfig());

  const applyShadowPatch = (patch: Partial<typeof DEFAULT_SHADOW_CONFIG>) => {
    const updated = updateShadowRuntimeConfig(patch);
    setShadowConfig({ ...updated });
    bridge.onShadowConfigChange?.(updated);
  };

  const [skyboxConfig, setSkyboxConfig] = useState(() => getSkyboxConfig());

  const applySkyboxPatch = (patch: Partial<typeof DEFAULT_SKYBOX_CONFIG>) => {
    const next = updateSkyboxConfig(patch);
    setSkyboxConfig({ ...next });
    bridge.onSkyboxConfigChange?.(next);
  };

  const [ballConfig, setBallConfig] = useState(() => getBallVisualConfig());

  React.useEffect(() => {
    return subscribeBallVisualConfig((next: BallVisualConfig) => {
      setBallConfig({ ...next });
    });
  }, []);

  const applyBallPatch = (patch: Partial<typeof DEFAULT_BALL_VISUAL_CONFIG>) => {
    const next = updateBallVisualConfig(patch);
    setBallConfig({ ...next });
    bridge.onBallVisualConfigChange?.(next);
  };

  const buildExportSnapshot = () => ({
    version: 'atmosphere-fx-tuner-v2',
    exportedAt: new Date().toISOString(),
    wallFx: wallConfig,
    shadows: shadowConfig,
    skybox: skyboxConfig,
    ball: ballConfig,
  });

  const handleCopyJson = async () => {
    const json = JSON.stringify(buildExportSnapshot(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedSnapshot(true);
      setTimeout(() => setCopiedSnapshot(false), 1800);
    } catch (err) {
      console.warn('[ExperimentalFeaturesFloatingWindow] navigator.clipboard.writeText failed; falling back to textarea execCommand("copy"):', err);
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedSnapshot(true);
      setTimeout(() => setCopiedSnapshot(false), 1800);
    }
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(buildExportSnapshot(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rlclean-atmosphere-fx-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const tabs: TabItem[] = [
    { id: 'wall-pulse', label: '1. Wall & Pulse', icon: <Radio className="h-3.5 w-3.5" /> },
    { id: 'shadows-light', label: '2. Shadows & Light', icon: <Sun className="h-3.5 w-3.5" /> },
    { id: 'skybox', label: '3. Skybox', icon: <CloudSun className="h-3.5 w-3.5" /> },
    { id: 'ball', label: '4. Ball', icon: <CircleDot className="h-3.5 w-3.5" /> },
  ];

  return (
    <TunerPrecisionContext.Provider value={{ step: precisionStep, setStep: setPrecisionStep }}>
      <div className="flex flex-col gap-2.5 select-none text-xs">
        {/* Parameter Snapshot Export Toolbar */}
        <div className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
          <div className="flex flex-col">
            <span className="font-bold text-[11px]">Atmosphere &amp; FX Snapshot Export</span>
            <span className={`text-[10px] ${mutedText}`}>
              Export Wall/Pulse, Shadows/Light, Skybox &amp; Ball parameters as JSON
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyJson}
              className="text-[10px] px-2 py-1 rounded-lg border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer font-medium"
            >
              {copiedSnapshot ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedSnapshot ? 'Copied!' : 'Copy JSON'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="text-[10px] px-2 py-1 rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 flex items-center gap-1 cursor-pointer font-medium"
            >
              <Download className="h-3 w-3" />
              <span>Export .json</span>
            </button>
          </div>
        </div>

        <UnderlineTabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as AtmosphereFxTab)}
          isLight={isLight}
          size="sm"
          fullWidth={true}
        />

        {activeTab === 'wall-pulse' && (
          <WallPulseTab
            wallConfig={wallConfig}
            applyWallPatch={applyWallPatch}
            isLight={isLight}
            cardBg={cardBg}
            mutedText={mutedText}
          />
        )}

        {activeTab === 'shadows-light' && (
          <ShadowsLightTab
            shadowConfig={shadowConfig}
            applyShadowPatch={applyShadowPatch}
            isLight={isLight}
            cardBg={cardBg}
          />
        )}

        {activeTab === 'skybox' && (
          <SkyboxTab
            skyboxConfig={skyboxConfig}
            applySkyboxPatch={applySkyboxPatch}
            isLight={isLight}
            cardBg={cardBg}
            mutedText={mutedText}
          />
        )}

        {activeTab === 'ball' && (
          <BallTab
            ballConfig={ballConfig}
            applyBallPatch={applyBallPatch}
            isLight={isLight}
            cardBg={cardBg}
            mutedText={mutedText}
          />
        )}
      </div>
    </TunerPrecisionContext.Provider>
  );
};
