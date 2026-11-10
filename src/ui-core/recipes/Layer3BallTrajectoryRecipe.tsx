import React, { useState } from 'react';
import { Sliders } from 'lucide-react';
import {
  DEFAULT_TRAJECTORY_CONFIG,
  type TrajectoryConfig,
} from '../config/trainingDefaults';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { SettingSliderRow } from '../compounds/SettingSliderRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { BounceSolidSvg } from '../primitives/packagedSvgIcons';
import { useAppStore } from '../stores/appStore';
import { BALL_TRAJECTORY_TUNER_PRESET } from '../stores/devFloatingPresets';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { FloatingWindowCard } from './settings/components/FloatingWindowCard';
import { BallTrajectoryProbeAndColorSection } from './layer-sections/BallTrajectoryProbeAndColorSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3BallTrajectoryRecipe',
  title: 'Ball Trajectory Predictor',
  subtitle: '3D Predictive Flight Horizon, Dash Geometry, Line Color & WASM Incremental Mode',
  icon: 'Activity',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 560,
    height: 520,
    minHeight: 220,
    maxHeight: 1080,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'user-tier',
      label: 'User Tier (Locked Thickness)',
      storeOverrides: {
        appStore: {
          developerMode: false,
        },
      },
    },
    {
      variantId: 'developer-tier',
      label: 'Developer Tier (Full Tuner Access)',
      storeOverrides: {
        appStore: {
          developerMode: true,
        },
      },
    },
  ],
};

export type Layer3BallTrajectoryRecipeProps = StandardSurfaceProps;

/**
 * [Recipe] Layer 3 Ball Trajectory Predictor
 */
export const Layer3BallTrajectoryRecipe: React.FC<
  Layer3BallTrajectoryRecipeProps
> = ({ isLight = false, onBack: propOnBack }) => {
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const developerMode = useScopedStore('appStore', useAppStore, (s) => s.developerMode);
  const storeTrajectory = useScopedStore('appStore', useAppStore, (s) => s.trajectory);
  const storeUpdateTrajectory = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateTrajectory
  );
  const setLivePreviewCollapsed = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.setLivePreviewCollapsed
  );

  const onBack = propOnBack ?? goBack;
  const onCollapsePreview = () => setLivePreviewCollapsed(true);

  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const panelSizingFromStore = useMenuLayoutStore(
    (s) => s.panels?.['layer3-ball-trajectory']
  );
  const sizing = panelSizingFromStore ?? {
    mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
    width: calibratedSizing.width,
    targetHeight:
      typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 520,
    minHeight: calibratedSizing.minHeight ?? 220,
    maxHeight: calibratedSizing.maxHeight ?? 1080,
  };
  const { rowGap } = useScopedStore('settingRowStore', useSettingActionRowStore);

  const resolved: TrajectoryConfig = {
    ...DEFAULT_TRAJECTORY_CONFIG,
    ...storeTrajectory,
  };

  const updateConfig = (patch: Partial<TrajectoryConfig>) => {
    storeUpdateTrajectory(patch);
  };

  const enablePredictor = resolved.enabled;
  const patternMode: 'dynamic' | 'static' = resolved.dynamicMode ? 'dynamic' : 'static';
  const trajectoryDuration =
    resolved.duration ?? Number(((resolved.predictionTicks || 600) / 120).toFixed(1));
  const lineThickness = resolved.thickness ?? 20;
  const isNormalizedOpacity = (resolved.opacity ?? 0.5) <= 1.0;
  const lineOpacityPct = isNormalizedOpacity
    ? Math.round((resolved.opacity ?? 0.5) * 100)
    : Math.round(resolved.opacity ?? 50);

  const canEditThickness = Boolean(developerMode || resolved.allowUserThicknessEdit);

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader
        title="BALL TRAJECTORY PREDICTOR"
        onBack={onBack}
        isLight={isLight}
        onRightAction={onCollapsePreview}
        rightActionLabel="Live Preview"
        onRightActionHoverChange={(hovered) =>
          setHoveredDesc(
            hovered
              ? 'Press TAB or click to collapse panel to side dock and inspect 3D arena (Live Preview).'
              : null
          )
        }
      />

      <PanelContent scrollable>
        <div
          data-layout="trajectory-settings-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {developerMode && (
            <FloatingWindowCard
              preset={BALL_TRAJECTORY_TUNER_PRESET}
              icon={Sliders}
              iconColor="text-amber-400"
              badge="WASM Incr · 3D Tube · JSON"
              badgeClass="bg-amber-500/15 border-amber-500/30 text-amber-400"
              bordered={false}
              showDescription={false}
              description="Open Ball Trajectory Prediction Line Tuner for WASM incremental tail thresholds, 3D tube shading, spatial depth cues & JSON export"
              hoverTooltip="Ball Trajectory Prediction Line Tuner: Live telemetry, WASM incremental triggers, 3D tube shading, bounce markers, user locks & JSON export."
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
              isLight={isLight}
            />
          )}

          <SettingToggleRow
            icon={BounceSolidSvg}
            iconName="bounce-solid"
            iconColor="text-amber-500"
            title="Enable Predictor"
            checked={enablePredictor}
            onChange={(enabled) => updateConfig({ enabled })}
            bordered={false}
            showDescription={false}
            hoverDescription="Master switch for 3D predictive ball flight path rendering."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            title="Trajectory Pattern Mode"
            value={patternMode}
            onChange={(v) => updateConfig({ dynamicMode: v === 'dynamic' })}
            layout="stacked"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'dynamic', label: 'Dynamic (Pushes Line)' },
              { value: 'static', label: 'Static (Follows Line)' },
            ]}
            hoverDescription="Switch between velocity-scaled dynamic dashes (pushes line) or world-anchored static dash geometry (follows line)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            title="Dash End Cap Style"
            value={resolved.dashCapStyle === 'chamfer' ? 'chamfer' : 'round'}
            onChange={(v) =>
              updateConfig({ dashCapStyle: v === 'chamfer' ? 'chamfer' : 'round' })
            }
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'round', label: 'Rounded Cap' },
              { value: 'chamfer', label: 'Chamfered Cap' },
            ]}
            hoverDescription="Select 3D dash end-cap geometry: Rounded Capsule Cap (hemisphere dome) or Chamfered Bevel Cap (45-degree cut)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingSliderRow
            label="Trajectory Horizon"
            title="Trajectory Horizon"
            value={trajectoryDuration}
            min={0.5}
            max={5.0}
            step={0.1}
            unit="s"
            developerMode={developerMode}
            layout="inline"
            bordered={false}
            showDescription={false}
            onChange={(seconds) =>
              updateConfig({
                duration: seconds,
                predictionTicks: Math.round(seconds * 120),
              })
            }
            hoverDescription="Forward prediction duration in seconds (0.5s to 5.0s / 60 to 600 ticks)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {canEditThickness && (
            <SettingSliderRow
              label="Line Thickness"
              title="Line Thickness"
              value={lineThickness}
              min={1}
              max={75}
              step={1}
              unit="%"
              developerMode={developerMode}
              layout="inline"
              bordered={false}
              showDescription={false}
              onChange={(thickness) => updateConfig({ thickness })}
              hoverDescription="3D trajectory tube/ribbon thickness as percentage of ball diameter (1% to 75%). Developer-locked by default."
              onHover={(desc) => desc && setHoveredDesc(desc)}
              onLeave={() => setHoveredDesc(null)}
              isLight={isLight}
            />
          )}

          <SettingSliderRow
            label="Line Opacity"
            title="Line Opacity"
            value={lineOpacityPct}
            min={5}
            max={100}
            step={5}
            unit="%"
            developerMode={developerMode}
            layout="inline"
            bordered={false}
            showDescription={false}
            onChange={(opacityPct) =>
              updateConfig({
                opacity: isNormalizedOpacity ? opacityPct / 100 : opacityPct,
              })
            }
            hoverDescription="Overall alpha opacity of the predictive trajectory line (5% to 100%)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <BallTrajectoryProbeAndColorSection
            resolved={resolved}
            updateConfig={updateConfig}
            developerMode={false !== Boolean(developerMode)}
            isLight={isLight}
            onHoverDesc={setHoveredDesc}
          />
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure predictive ball flight horizon, dash geometry, line color tone, and WASM incremental mode."
        hoveredDescription={hoveredDesc}
        rightLabel="Live Preview"
        rightShortcut="TAB"
        onRightClick={onCollapsePreview}
      />
    </PanelContainer>
  );
};

export default Layer3BallTrajectoryRecipe;
