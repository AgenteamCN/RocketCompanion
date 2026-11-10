import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { dialogue } from '../compounds/dialogue/dialogueStore';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { useAppStore } from '../stores/appStore';
import {
  useCameraSettingsStyleStore,
  DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG,
  type CameraSettingsStyleConfig,
} from '../stores/cameraSettingsStyleStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import {
  CAMERA_SLIDER_SPECS,
  DEFAULT_CAMERA_SETTINGS,
  normalizeCameraSettings,
  toCameraConfig,
  type CameraConfig,
  type CameraProfileSettings,
  type CameraSettingsInput,
} from './camera/cameraConfigSpecs';
import { CameraSliderRow } from './camera/CameraSliderRow';
import { CameraBooleanSection } from './camera/CameraBooleanSection';
import { CameraResetSection } from './camera/CameraResetSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3CameraRecipe',
  title: 'Camera Settings',
  subtitle: 'Spine-Aligned FOV, Distance, Height, Pitch, Stiffness, Swivel & Camera Shake',
  icon: 'Camera',
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
      variantId: 'default',
      label: 'Competitive Default (FOV 110°)',
      storeOverrides: {
        appStore: {
          developerMode: false,
        },
      },
    },
    {
      variantId: 'developer',
      label: 'Developer Tier',
      storeOverrides: {
        appStore: {
          developerMode: true,
        },
      },
    },
  ],
};

export type Layer3CameraRecipeProps = StandardSurfaceProps;

/**
 * [Recipe] Layer 3 Camera Settings (User & Developer Tier)
 * Store-First Spine-Aligned Camera Settings driven directly by `useAppStore` and
 * `useCameraSettingsStyleStore` (with `<StoreSnapshotScope>` support for isolated multi-state shootouts).
 */
export const Layer3CameraRecipe: React.FC<Layer3CameraRecipeProps> = React.memo(
  ({ isLight = false, onBack: propOnBack }) => {
    const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
    const developerMode = useScopedStore('appStore', useAppStore, (s) => s.developerMode);
    const storeCamera = useScopedStore('appStore', useAppStore, (s) => s.camera);
    const storeUpdateCamera = useScopedStore('appStore', useAppStore, (s) => s.updateCamera);
    const storeResetCamera = useScopedStore('appStore', useAppStore, (s) => s.resetCamera);
    const setLivePreviewCollapsed = useScopedStore(
      'appStore',
      useAppStore,
      (s) => s.setLivePreviewCollapsed
    );

    const onBack = propOnBack ?? storeGoBack;
    const onCollapsePreview = () => setLivePreviewCollapsed(true);

    const settings: CameraProfileSettings = normalizeCameraSettings(
      {
        presetId: 'default',
        ...DEFAULT_CAMERA_SETTINGS,
      },
      storeCamera
    );

    const [confirmReset, setConfirmReset] = useState(false);
    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    const storeStyleConfig = useScopedStore(
      'cameraSettingsStyleStore',
      useCameraSettingsStyleStore
    );
    const cfg: CameraSettingsStyleConfig = {
      ...DEFAULT_CAMERA_SETTINGS_STYLE_CONFIG,
      ...storeStyleConfig,
    };

    const calibratedSizing = resolveCalibratedSurfaceSizing(
      SURFACE_META.id,
      SURFACE_META.defaultSizing
    );
    const panelSizingFromStore = useMenuLayoutStore((s) => s.panels?.['layer3-camera']);
    const sizing = panelSizingFromStore ?? {
      mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
      width: calibratedSizing.width,
      targetHeight:
        typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 520,
      minHeight: calibratedSizing.minHeight ?? 220,
      maxHeight: calibratedSizing.maxHeight ?? 1080,
    };

    // Measure the longest readout width across all 7 slider rows so all 3-column rows stay 100% locked
    const listContainerRef = useRef<HTMLDivElement>(null);
    const [measuredMaxReadoutW, setMeasuredMaxReadoutW] = useState<number>(
      cfg.readoutMinWidthPx
    );

    useLayoutEffect(() => {
      const el = listContainerRef.current;
      if (!el) return;
      const nodes = el.querySelectorAll<HTMLElement>('[data-camera-readout-measure="true"]');
      let maxIntrinsic = 0;
      nodes.forEach((node) => {
        const w = Math.ceil(node.scrollWidth);
        if (w > maxIntrinsic) maxIntrinsic = w;
      });
      const extraPad =
        cfg.readoutContainerMode === 'plain-text' ? 4 : cfg.readoutPaddingXPx * 2 + 4;
      const resolvedW = Math.max(cfg.readoutMinWidthPx, maxIntrinsic + extraPad);
      if (resolvedW !== measuredMaxReadoutW) {
        setMeasuredMaxReadoutW(resolvedW);
      }
    }, [
      settings,
      cfg.readoutMinWidthPx,
      cfg.readoutFontSizePx,
      cfg.readoutPaddingXPx,
      cfg.readoutContainerMode,
      measuredMaxReadoutW,
    ]);

    useEffect(() => {
      if (!confirmReset) return;
      const timer = window.setTimeout(() => setConfirmReset(false), 2600);
      return () => window.clearTimeout(timer);
    }, [confirmReset]);

    const updateField = <K extends keyof CameraProfileSettings>(
      key: K,
      value: CameraProfileSettings[K]
    ) => {
      const rawPatch: CameraSettingsInput = { [key]: value };
      if (key === 'fovDeg' || key === 'fov') {
        rawPatch.fov = Number(value);
        rawPatch.fovDeg = Number(value);
      } else if (key === 'distanceUu' || key === 'distance') {
        rawPatch.distance = Number(value);
        rawPatch.distanceUu = Number(value);
      } else if (key === 'heightUu' || key === 'height') {
        rawPatch.height = Number(value);
        rawPatch.heightUu = Number(value);
      }
      const next = normalizeCameraSettings(settings, rawPatch);
      const configKey: keyof CameraConfig =
        key === 'fovDeg'
          ? 'fov'
          : key === 'distanceUu'
          ? 'distance'
          : key === 'heightUu'
          ? 'height'
          : (key as keyof CameraConfig);
      const configPatch: Partial<CameraConfig> = {
        [configKey]: next[configKey],
      };
      storeUpdateCamera(configPatch);
    };

    const executeResetDefaults = () => {
      const next: CameraProfileSettings = {
        presetId: 'default',
        ...DEFAULT_CAMERA_SETTINGS,
      };
      const nextCfg = toCameraConfig(next);
      storeUpdateCamera(nextCfg);
      storeResetCamera();
      setConfirmReset(false);
    };

    const handleResetButtonClick = () => {
      if (cfg.resetConfirmMode === 'dialogue') {
        dialogue.show({
          id: 'camera-settings-reset-confirm',
          title: cfg.resetDialogueTitle || 'RESET CAMERA DEFAULTS',
          tone: 'error',
          icon: 'octagon-alert',
          isLight,
          content: (
            <div className="flex flex-col gap-2 text-xs leading-relaxed">
              <p
                className={
                  isLight ? 'text-neutral-700 font-medium' : 'text-neutral-200 font-medium'
                }
              >
                Are you sure you want to restore all Camera Settings to their factory competitive
                defaults?
              </p>
              <div
                className={`p-2.5 rounded-lg border font-mono text-[11px] grid grid-cols-2 gap-x-4 gap-y-1 ${
                  isLight
                    ? 'bg-rose-50/70 border-rose-200/80 text-rose-900'
                    : 'bg-rose-950/35 border-rose-800/60 text-rose-200'
                }`}
              >
                <span>FOV: 110°</span>
                <span>Distance: 270 UU</span>
                <span>Height: 90 UU</span>
                <span>Pitch Angle: -4°</span>
                <span>Stiffness: 0.45</span>
                <span>Swivel Speed: 4.7</span>
                <span>Transition: 1.2</span>
                <span>Shake / Invert: Off</span>
              </div>
            </div>
          ),
          buttons: [
            {
              label: 'Reset Camera Defaults',
              variant: 'danger',
              onClick: () => {
                executeResetDefaults();
              },
            },
            {
              label: 'Cancel',
              variant: 'outline',
            },
          ],
        });
        return;
      }

      if (!confirmReset) {
        setConfirmReset(true);
        return;
      }
      executeResetDefaults();
    };

    const readoutColWidthPx = Math.max(cfg.readoutMinWidthPx, measuredMaxReadoutW);
    const stepperExtraWidthPx = cfg.sliderShowStepper ? 64 : 0;
    const controlColWidthPx = cfg.sliderTrackWidthPx + stepperExtraWidthPx;
    const totalSpineWidthPx =
      cfg.labelColumnWidthPx +
      cfg.labelToControlGapPx +
      controlColWidthPx +
      cfg.controlToReadoutGapPx +
      readoutColWidthPx +
      cfg.rowPaddingXPx * 2;

    const rowHoverClasses = cfg.showRowHoverBg
      ? isLight
        ? 'hover:bg-neutral-200/65'
        : 'hover:bg-white/[0.055]'
      : '';

    return (
      <PanelContainer
        isLight={isLight}
        sizing={sizing}
        data-developer-mode={developerMode ? 'true' : 'false'}
        className="w-full select-none transition-opacity duration-200"
      >
        <PanelHeader
          isLight={isLight}
          title="CAMERA SETTINGS"
          onBack={onBack}
          onRightAction={onCollapsePreview}
          rightActionLabel="Live Preview"
          onRightActionHoverChange={(hovered) =>
            setHoveredDesc(
              hovered
                ? 'Press TAB or click to dock panel to the side and inspect live 3D camera geometry.'
                : null
            )
          }
        />

        <PanelContent scrollable={true}>
          <div
            ref={listContainerRef}
            data-layout="camera-settings-list"
            data-camera-preset={cfg.preset}
            className={`flex flex-col w-full ${
              cfg.centerFormBlock ? 'items-center' : 'items-start'
            }`}
            style={{
              transform:
                cfg.formOffsetXPx !== 0 ? `translateX(${cfg.formOffsetXPx}px)` : undefined,
            }}
          >
            {/* 1–7. Spine-Aligned Camera Geometry Sliders */}
            <div
              className="flex flex-col max-w-full"
              style={{ gap: `${cfg.rowGapPx}px` }}
            >
              {CAMERA_SLIDER_SPECS.map((spec) => (
                <CameraSliderRow
                  key={spec.key}
                  spec={spec}
                  rawValue={settings[spec.key]}
                  cfg={cfg}
                  isLight={isLight}
                  controlColWidthPx={controlColWidthPx}
                  readoutColWidthPx={readoutColWidthPx}
                  rowHoverClasses={rowHoverClasses}
                  onUpdate={updateField}
                  onHoverDesc={setHoveredDesc}
                />
              ))}

              {/* 8–9. Checkbox Controls (Invert Swivel & Camera Shake) */}
              <CameraBooleanSection
                settings={settings}
                cfg={cfg}
                isLight={isLight}
                controlColWidthPx={controlColWidthPx}
                readoutColWidthPx={readoutColWidthPx}
                rowHoverClasses={rowHoverClasses}
                onUpdate={updateField}
                onHoverDesc={setHoveredDesc}
              />
            </div>

            {/* 10. Big Reset Camera Defaults Action Button (with Red Double-Check Dialogue) */}
            <CameraResetSection
              cfg={cfg}
              isLight={isLight}
              confirmReset={confirmReset}
              totalSpineWidthPx={totalSpineWidthPx}
              onResetClick={handleResetButtonClick}
              onHoverDesc={setHoveredDesc}
            />
          </div>
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Adjust field of view, distance, height, pitch angle, stiffness, swivel speed, transition speed, and camera shake."
          hoveredDescription={hoveredDesc}
          rightLabel="Live Preview"
          rightShortcut="TAB"
          onRightClick={onCollapsePreview}
        />
      </PanelContainer>
    );
  }
);

Layer3CameraRecipe.displayName = 'Layer3CameraRecipe';
export default Layer3CameraRecipe;
