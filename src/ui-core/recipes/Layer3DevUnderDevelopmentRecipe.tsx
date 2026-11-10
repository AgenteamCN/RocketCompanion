import React, { useState } from 'react';
import {
  AlertTriangle,
  Eye,
  FlagTriangleRight,
  Info,
  Play,
  RotateCcw,
  Triangle,
} from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { ToggleSwitch } from '../primitives/ToggleSwitch';
import { SettingActionRow } from '../compounds/SettingActionRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  PerCarBoostConfigSection,
  DEFAULT_CAR_BOOST_CFG,
  type PerCarBoostConfig,
} from './dev/PerCarBoostConfigSection';

export type Layer3DevUnderDevelopmentRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-under-development',
  title: 'UNDER DEVELOPMENT',
  subtitle: 'Unstable Staging Area (Three-Wheeler, Throwback & Per-Car Boost)',
  description:
    'Unstable / Under Development workspace for Three-Wheeler mode, Throwback Stadium, and Per-Car Boost.',
  icon: 'alert-triangle',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-under-development'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-under-development'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-under-development'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-under-development'].maxHeight,
  },
};

/**
 * [Recipe] Layer 3 Developer — 4. Under Development (Unstable / WIP Workspace)
 * Store-First single-line rows and unified Per-Car Boost controls sharing SettingActionRowStore tokens.
 */
export const Layer3DevUnderDevelopmentRecipe: React.FC<
  Layer3DevUnderDevelopmentRecipeProps
> = ({ isLight = false, onBack: propOnBack }) => {
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const underDev = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.underDevelopment
  );
  const updateUnderDev = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateUnderDevelopment
  );

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const onBack = propOnBack ?? goBack;

  const threeWheelsEnabled = Boolean(underDev?.threeWheelsEnabled);
  const stadiumPreset: 'standard' | 'throwback' =
    underDev?.stadiumPreset || 'standard';
  const showCollisionOverlay = Boolean(
    underDev?.showThrowbackCollisionOverlay
  );
  const selectedCarIdx = underDev?.selectedBoostCarIndex ?? 0;
  const perCarBoostConfigs =
    (underDev?.perCarBoostConfigs as
      | Record<number, PerCarBoostConfig>
      | undefined) || {};

  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-under-development'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-under-development']
  );

  const {
    rowGap,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
  } = useSettingActionRowStore();

  const currentCarBoostCfg =
    perCarBoostConfigs[selectedCarIdx] || DEFAULT_CAR_BOOST_CFG;

  const handleUpdateCarBoostCfg = (
    patch: Partial<PerCarBoostConfig>,
    applyAll = false
  ) => {
    const next = { ...perCarBoostConfigs };
    if (applyAll) {
      for (let i = 0; i < 8; i++) {
        next[i] = { ...(next[i] || DEFAULT_CAR_BOOST_CFG), ...patch };
      }
    } else {
      next[selectedCarIdx] = { ...currentCarBoostCfg, ...patch };
    }
    updateUnderDev({ perCarBoostConfigs: next });
  };

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader title="UNDER DEVELOPMENT" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="under-development-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {/* 1. Unstable / In-Development Warning Banner */}
          <div
            className={`flex items-start gap-3 w-full p-3.5 mb-1.5 rounded-xl border select-none ${
              isLight
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-950'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
            onMouseEnter={() =>
              setHoveredDesc(
                'Purely in-development staging area: Features here are intentionally uncalibrated and unstable until core main-branch workflows are finalized.'
              )
            }
            onMouseLeave={() => setHoveredDesc(null)}
          >
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col text-left leading-snug min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Unstable Staging Area · Purely In Development
                </span>
              </div>
              <span
                className={`text-[11px] mt-1 ${
                  isLight ? 'text-neutral-700' : 'text-neutral-300'
                }`}
              >
                This workspace holds raw asset and WASM bridge integrations (Three-Wheeler Tricycle mode and Throwback Stadium) for quick inspection only.
              </span>
            </div>
          </div>

          {/* 2. Three-Wheeler Mode */}
          <SettingActionRow
            icon={Triangle}
            iconName="triangle"
            iconColor="text-purple-400"
            title="Three-Wheeler Mode"
            bordered={false}
            showDescription={false}
            hoverDescription="Three-Wheeler Mode (Tricycle / Psyclops): Collapses the two front wheels into a single center-mounted steerable wheel (Y=0) in Bullet btVehicleRL with modified steering and handbrake curves."
            onAction={() =>
              updateUnderDev({ threeWheelsEnabled: !threeWheelsEnabled })
            }
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
            rightSlot={
              <div className="flex items-center gap-2.5">
                <ToggleSwitch
                  checked={threeWheelsEnabled}
                  onCheckedChange={(enabled) =>
                    updateUnderDev({ threeWheelsEnabled: enabled })
                  }
                  isLight={isLight}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateUnderDev({ threeWheelsEnabled: true });
                    closeMenu();
                  }}
                  style={{
                    fontSize: `${buttonFontSize}px`,
                    paddingLeft: `${buttonPaddingX}px`,
                    paddingRight: `${buttonPaddingX}px`,
                    paddingTop: `${buttonPaddingY}px`,
                    paddingBottom: `${buttonPaddingY}px`,
                    borderRadius: `${Math.max(0, buttonRadius)}px`,
                  }}
                  className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 leading-tight active:scale-95 whitespace-nowrap ${
                    isLight
                      ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
                      : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
                  }`}
                >
                  <Play
                    style={{
                      width: `${Math.max(11, buttonFontSize)}px`,
                      height: `${Math.max(11, buttonFontSize)}px`,
                    }}
                    className="fill-current shrink-0"
                  />
                  <span>Enable & Drive</span>
                </button>
              </div>
            }
          />

          {/* 3a. Throwback Stadium */}
          <SettingActionRow
            icon={FlagTriangleRight}
            iconName="flag-triangle-right"
            iconColor="text-rose-400"
            title="Throwback Stadium"
            bordered={false}
            showDescription={false}
            hoverDescription="Throwback Stadium: Loads 36 .cmf collision meshes, ThrowbackHockey_Field.glb visual arena, 3D GoalVolume box (Y: 4922..5460) with open back-pass space, and Throwback boost pad layout."
            onAction={() => updateUnderDev({ stadiumPreset: 'throwback' })}
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
            rightSlot={
              <div className="flex items-center gap-2">
                {stadiumPreset === 'throwback' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateUnderDev({ stadiumPreset: 'standard' });
                    }}
                    style={{
                      fontSize: `${buttonFontSize}px`,
                      paddingLeft: `${buttonPaddingX}px`,
                      paddingRight: `${buttonPaddingX}px`,
                      paddingTop: `${buttonPaddingY}px`,
                      paddingBottom: `${buttonPaddingY}px`,
                      borderRadius: `${Math.max(0, buttonRadius)}px`,
                    }}
                    className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1 leading-tight active:scale-95 whitespace-nowrap ${
                      isLight
                        ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                    }`}
                  >
                    <RotateCcw
                      style={{
                        width: `${Math.max(11, buttonFontSize)}px`,
                        height: `${Math.max(11, buttonFontSize)}px`,
                      }}
                      className="shrink-0"
                    />
                    <span>Restore Standard</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateUnderDev({ stadiumPreset: 'throwback' });
                    closeMenu();
                  }}
                  style={{
                    fontSize: `${buttonFontSize}px`,
                    paddingLeft: `${buttonPaddingX}px`,
                    paddingRight: `${buttonPaddingX}px`,
                    paddingTop: `${buttonPaddingY}px`,
                    paddingBottom: `${buttonPaddingY}px`,
                    borderRadius: `${Math.max(0, buttonRadius)}px`,
                  }}
                  className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 leading-tight active:scale-95 whitespace-nowrap ${
                    isLight
                      ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
                      : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
                  }`}
                >
                  <Play
                    style={{
                      width: `${Math.max(11, buttonFontSize)}px`,
                      height: `${Math.max(11, buttonFontSize)}px`,
                    }}
                    className="fill-current shrink-0"
                  />
                  <span>Load & Inspect</span>
                </button>
              </div>
            }
          />

          {/* 3b. Show Wireframe Overlay */}
          <SettingToggleRow
            icon={Eye}
            iconName="eye"
            iconColor="text-sky-400"
            title="Show Wireframe Overlay"
            checked={showCollisionOverlay}
            onChange={(visible) =>
              updateUnderDev({ showThrowbackCollisionOverlay: visible })
            }
            bordered={false}
            showDescription={false}
            hoverDescription="Renders ThrowbackStadium_Collision.glb 3D collision mesh wireframe overlay in the arena."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 4. Per-Car Boost Adjustment */}
          <PerCarBoostConfigSection
            selectedCarIdx={selectedCarIdx}
            onSelectedCarIdxChange={(idx) =>
              updateUnderDev({
                selectedBoostCarIndex: Math.max(0, Math.min(7, Number(idx) || 0)),
              })
            }
            currentCarBoostCfg={currentCarBoostCfg}
            onUpdateCarBoostCfg={handleUpdateCarBoostCfg}
            onHover={setHoveredDesc}
            isLight={isLight}
          />
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Unstable / Under Development workspace for Three-Wheeler mode, Throwback Stadium, and Per-Car Boost."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
