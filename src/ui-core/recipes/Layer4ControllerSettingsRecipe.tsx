import React, { useState, useEffect, useCallback } from 'react';
import { Gamepad2 } from 'lucide-react';
import {
  loadInputBindings,
  saveInputBindings,
  getSelectedController,
  setSelectedController,
  getConnectedGamepads,
} from '../config/inputBindings';
import { resetAxisBindings } from '../config/inputBindingValidators';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { Badge } from '../primitives/Badge';
import { DropdownMenu } from '../compounds/DropdownMenu';
import { SettingActionRow } from '../compounds/SettingActionRow';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import {
  ControllerDeadzoneAndVibrationSection,
  type ControllerAxesConfig,
} from './layer-sections/ControllerDeadzoneAndVibrationSection';

export type { ControllerAxesConfig } from './layer-sections/ControllerDeadzoneAndVibrationSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer4ControllerSettingsRecipe',
  title: 'Controller Settings',
  subtitle: 'Analog stick axes, deadzones, trigger threshold, and Turning & Dodging visualizer',
  icon: 'gamepad-2',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: 640,
    height: 960,
    minHeight: 260,
    maxHeight: 1120,
  },
};

export type AirRollConflictMode = 'override' | 'cancel';
export type AnalogCurveShape = 'linear' | 'precision-s' | 'aggressive';

export const DEFAULT_CONTROLLER_AXES_CONFIG: ControllerAxesConfig = {
  steer: { axis: 0, invert: false },
  pitch: { axis: 1, invert: false },
  deadzone: 0.12,
  dodgeDeadzone: 0.70,
  triggerThreshold: 0.15,
};

export interface Layer4ControllerSettingsStateOverride {
  config?: Partial<ControllerAxesConfig>;
  defaultConfig?: Partial<ControllerAxesConfig>;
  onChange?: (next: ControllerAxesConfig, patch: Partial<ControllerAxesConfig>) => void;
  inputDevice?: string;
  defaultInputDevice?: string;
  onInputDeviceChange?: (deviceId: string) => void;
  onReset?: (defaults: ControllerAxesConfig) => void;
}

export interface Layer4ControllerSettingsRecipeProps extends StandardSurfaceProps {
  developerMode?: boolean;
  stateOverride?: Layer4ControllerSettingsStateOverride;
  className?: string;
}

export const Layer4ControllerSettingsRecipe: React.FC<Layer4ControllerSettingsRecipeProps> =
  React.memo(({ isLight = false, developerMode = false, onBack, stateOverride, className = '' }) => {
    const goBack = useAppStore((s) => s.goBack);
    const bridge = useAppStore((s) => s.bridge);
    const { rowGap } = useSettingActionRowStore();
    const scopeOverride =
      useStoreSnapshotOverride<Layer4ControllerSettingsStateOverride>('controllerSettings');
    const ov = { ...scopeOverride, ...stateOverride };

    const storeSizing = useMenuLayoutStore((s) => s.panels?.['layer4-controller-settings']);
    const calibratedSizing = resolveCalibratedSurfaceSizing(
      SURFACE_META.id,
      SURFACE_META.defaultSizing
    );
    const sizing = storeSizing ?? {
      mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
      width: calibratedSizing.width,
      targetHeight:
        typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 960,
      minHeight: calibratedSizing.minHeight ?? 260,
      maxHeight: calibratedSizing.maxHeight ?? 1120,
    };

    const [bindings, setBindings] = useState(() => loadInputBindings());
    const [dodgeDeadzoneLocal, setDodgeDeadzoneLocal] = useState<number>(
      ov.defaultConfig?.dodgeDeadzone ?? DEFAULT_CONTROLLER_AXES_CONFIG.dodgeDeadzone ?? 0.7
    );
    const [connectedPads, setConnectedPads] = useState<Array<{ index: number; id: string }>>([]);

    const [internalInputDevice, setInternalInputDevice] = useState<string>(() => {
      const sel = getSelectedController();
      return ov.defaultInputDevice ?? (sel.index !== null ? `pad-${sel.index}` : 'none');
    });
    const inputDevice = ov.inputDevice ?? internalInputDevice;

    const persistInputDevice = useCallback(
      (deviceId: string) => {
        if (ov.onInputDeviceChange) {
          ov.onInputDeviceChange(deviceId);
          return;
        }
        if (!deviceId || deviceId === 'none') {
          setSelectedController(null);
          return;
        }
        if (deviceId.startsWith('pad-')) {
          const idx = parseInt(deviceId.replace('pad-', ''), 10);
          const pad = Number.isFinite(idx) ? getConnectedGamepads()[idx] : null;
          setSelectedController({ id: pad?.id ?? deviceId, index: Number.isFinite(idx) ? idx : 0 });
        } else {
          setSelectedController({ id: deviceId, index: 0 });
        }
      },
      [ov]
    );

    const setInputDevice = (nextDevice: string | ((prev: string) => string)) => {
      const resolvedNext =
        typeof nextDevice === 'function' ? nextDevice(inputDevice) : nextDevice;
      if (ov.inputDevice === undefined) {
        setInternalInputDevice(resolvedNext);
      }
      persistInputDevice(resolvedNext);
    };

    const resolvedConfig: ControllerAxesConfig = {
      steer: {
        axis: ov.config?.steer?.axis ?? bindings.axes?.steer?.axis ?? DEFAULT_CONTROLLER_AXES_CONFIG.steer.axis,
        invert: ov.config?.steer?.invert ?? bindings.axes?.steer?.invert ?? DEFAULT_CONTROLLER_AXES_CONFIG.steer.invert,
      },
      pitch: {
        axis: ov.config?.pitch?.axis ?? bindings.axes?.pitch?.axis ?? DEFAULT_CONTROLLER_AXES_CONFIG.pitch.axis,
        invert: ov.config?.pitch?.invert ?? bindings.axes?.pitch?.invert ?? DEFAULT_CONTROLLER_AXES_CONFIG.pitch.invert,
      },
      deadzone: ov.config?.deadzone ?? bindings.axes?.deadzone ?? DEFAULT_CONTROLLER_AXES_CONFIG.deadzone,
      dodgeDeadzone: ov.config?.dodgeDeadzone ?? dodgeDeadzoneLocal,
      triggerThreshold: ov.config?.triggerThreshold ?? bindings.axes?.triggerThreshold ?? DEFAULT_CONTROLLER_AXES_CONFIG.triggerThreshold,
    };

    const updateConfig = (patch: Partial<ControllerAxesConfig>) => {
      const next: ControllerAxesConfig = {
        ...resolvedConfig,
        ...patch,
        steer: patch.steer ? { ...resolvedConfig.steer, ...patch.steer } : resolvedConfig.steer,
        pitch: patch.pitch ? { ...resolvedConfig.pitch, ...patch.pitch } : resolvedConfig.pitch,
      };
      if (typeof next.dodgeDeadzone === 'number') {
        setDodgeDeadzoneLocal(next.dodgeDeadzone);
      }
      if (ov.onChange) {
        ov.onChange(next, patch);
        return;
      }
      const nextBindings = {
        ...bindings,
        axes: {
          ...bindings.axes,
          steer: { ...next.steer },
          pitch: { ...next.pitch },
          deadzone: next.deadzone,
          triggerThreshold: next.triggerThreshold,
        },
      };
      setBindings(nextBindings);
      saveInputBindings(nextBindings);
      bridge.onBindingsChange?.(nextBindings);
    };

    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    const handleResetAxesToDefault = () => {
      const defaults: ControllerAxesConfig = {
        steer: { ...DEFAULT_CONTROLLER_AXES_CONFIG.steer },
        pitch: { ...DEFAULT_CONTROLLER_AXES_CONFIG.pitch },
        deadzone: DEFAULT_CONTROLLER_AXES_CONFIG.deadzone,
        dodgeDeadzone: DEFAULT_CONTROLLER_AXES_CONFIG.dodgeDeadzone,
        triggerThreshold: DEFAULT_CONTROLLER_AXES_CONFIG.triggerThreshold,
      };
      setDodgeDeadzoneLocal(defaults.dodgeDeadzone ?? 0.70);
      if (ov.onReset) {
        ov.onReset(defaults);
        return;
      }
      const nextBindings = { ...bindings };
      resetAxisBindings(nextBindings);
      setBindings(nextBindings);
      saveInputBindings(nextBindings);
      bridge.onBindingsChange?.(nextBindings);
    };

    useEffect(() => {
      const syncGamepads = () => {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
          return;
        }
        const rawPads = navigator.getGamepads();
        const detected: Array<{ index: number; id: string }> = [];
        for (let i = 0; i < rawPads.length; i++) {
          const gp = rawPads[i];
          if (gp && gp.connected) {
            detected.push({ index: gp.index, id: gp.id || `Gamepad #${gp.index + 1}` });
          }
        }
        setConnectedPads(detected);
        if (detected.length > 0 && inputDevice === 'none') {
          setInputDevice(`pad-${detected[0].index}`);
        }
      };

      syncGamepads();
      window.addEventListener('gamepadconnected', syncGamepads);
      window.addEventListener('gamepaddisconnected', syncGamepads);
      return () => {
        window.removeEventListener('gamepadconnected', syncGamepads);
        window.removeEventListener('gamepaddisconnected', syncGamepads);
      };
    }, [inputDevice]);

    const isGamepadActive = inputDevice !== 'none' || connectedPads.length > 0;
    const gamepadBadgeLabel = isGamepadActive
      ? connectedPads.length > 1
        ? `${connectedPads.length} Gamepads Detected`
        : '1 Gamepad Detected'
      : 'No Gamepad Detected';

    const deviceOptions = [
      {
        value: 'none',
        label: connectedPads.length > 0 ? 'None' : 'None Found',
      },
      ...connectedPads.map((p) => ({
        value: `pad-${p.index}`,
        label: p.id,
      })),
      { value: 'dualsense', label: 'DualSense Wireless Controller' },
      { value: 'xbox', label: 'Xbox Wireless Controller' },
    ];

    const selectedGamepadIndex = inputDevice.startsWith('pad-')
      ? parseInt(inputDevice.replace('pad-', ''), 10)
      : null;

    return (
      <PanelContainer
        isLight={isLight}
        sizing={sizing}
        className={`w-full select-none ${className}`}
      >
        <PanelHeader
          isLight={isLight}
          title="CONTROLLER SETTINGS"
          onBack={onBack ?? goBack}
        />

        <PanelContent scrollable={true}>
          <div
            data-layout="controller-settings-list"
            className="flex flex-col w-full"
            style={{ gap: `${rowGap}px` }}
          >
            <SettingActionRow
              icon={Gamepad2}
              iconColor="text-emerald-500"
              title="Controller Input Device"
              bordered={false}
              showDescription={false}
              badge={
                <Badge
                  variant={isGamepadActive ? 'emerald' : 'warning'}
                  size="sm"
                  dot
                  isLight={isLight}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputDevice((prev) => (prev === 'none' ? 'dualsense' : 'none'));
                  }}
                  title="Click to toggle simulated gamepad detection state"
                  className="cursor-pointer"
                >
                  {gamepadBadgeLabel}
                </Badge>
              }
              hoverDescription="Select active controller input device or inspect gamepad detection status."
              onHover={(desc) => desc && setHoveredDesc(desc)}
              onLeave={() => setHoveredDesc(null)}
              isLight={isLight}
              rightSlot={
                <DropdownMenu
                  value={inputDevice}
                  options={deviceOptions}
                  onChange={(val) => setInputDevice(String(val))}
                  align="right"
                  menuWidthClass="w-64"
                  isLight={isLight}
                  className="min-w-[168px]"
                />
              }
            />

            <ControllerDeadzoneAndVibrationSection
              resolvedConfig={resolvedConfig}
              updateConfig={updateConfig}
              selectedGamepadIndex={selectedGamepadIndex}
              developerMode={developerMode}
              isLight={isLight}
              onHoverDesc={setHoveredDesc}
              onResetAxesToDefault={handleResetAxesToDefault}
            />
          </div>
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Configure controller input device, analog stick axes, deadzones, trigger threshold, and interactive Turning & Dodging visualizer."
          hoveredDescription={hoveredDesc}
        />
      </PanelContainer>
    );
  });

Layer4ControllerSettingsRecipe.displayName = 'Layer4ControllerSettingsRecipe';
export default Layer4ControllerSettingsRecipe;
