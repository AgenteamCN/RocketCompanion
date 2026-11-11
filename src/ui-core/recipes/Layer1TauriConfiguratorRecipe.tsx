import React, { useEffect, useState, useCallback } from 'react';
import {
  Monitor,
  Terminal,
  FolderOpen,
  Lock,
  Play,
  Save,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { Checkbox } from '../primitives/Checkbox';
import { Button } from '../primitives/Button';
import { Badge } from '../primitives/Badge';
import { CrossbarSvg } from '../primitives/packagedSvgIcons';
import {
  DEFAULT_TAURI_LAUNCH_CONFIG,
  getTauriLaunchState,
  launchGameFromConfigurator,
  resetTauriLaunchConfig,
  saveTauriLaunchConfig,
  type TauriLaunchConfig,
  type TauriLaunchStatePayload,
  type TauriWindowMode,
} from '../config/tauriLaunchConfigBridge';
import type { SurfaceMeta } from '../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'layer1-tauri-configurator',
  title: 'Tauri Pre-Launch Configurator',
  subtitle: 'Desktop Window Mode, Launch Flags & System Tray Default',
  description:
    'Pre-launch desktop configurator for Window Mode (Fullscreen/Borderless/Windowed), additional launch parameters (?dev=1&clean=1), default persistence, and tray-only background startup.',
  layer: 'layer1',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 640,
    height: 'auto',
    minHeight: 380,
    maxHeight: 680,
    mode: 'adaptive',
  },
};

export interface Layer1TauriConfiguratorRecipeProps {
  isLight?: boolean;
  onLaunched?: (state: TauriLaunchStatePayload) => void;
}

function toggleQueryParamToken(rawInput: string, key: string, value = '1'): string {
  const trimmed = rawInput.trim();
  const cleanSearch = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(cleanSearch);
  if (params.get(key) === value) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const nextStr = params.toString();
  return nextStr ? `?${nextStr}` : '';
}

function hasQueryParamToken(rawInput: string, key: string, value = '1'): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  const cleanSearch = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(cleanSearch);
  return params.get(key) === value;
}

export const Layer1TauriConfiguratorRecipe: React.FC<Layer1TauriConfiguratorRecipeProps> = ({
  isLight = false,
  onLaunched,
}) => {
  const [launchState, setLaunchState] = useState<TauriLaunchStatePayload | null>(null);
  const [draftConfig, setDraftConfig] = useState<TauriLaunchConfig>({
    ...DEFAULT_TAURI_LAUNCH_CONFIG,
  });
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const refreshFromBackend = useCallback(async () => {
    const state = await getTauriLaunchState();
    setLaunchState(state);
    setDraftConfig(state.config);
  }, []);

  useEffect(() => {
    refreshFromBackend();
    const onUpdated = () => {
      refreshFromBackend();
    };
    window.addEventListener('rc-tauri-config-updated', onUpdated);
    return () => window.removeEventListener('rc-tauri-config-updated', onUpdated);
  }, [refreshFromBackend]);

  const isMacOs = launchState?.platform === 'macos';
  const windowModeOptions = isMacOs
    ? [
        { value: 'fullscreen', label: 'Fullscreen' },
        { value: 'windowed', label: 'Windowed' },
      ]
    : [
        { value: 'fullscreen', label: 'Fullscreen' },
        { value: 'borderless', label: 'Borderless' },
        { value: 'windowed', label: 'Windowed' },
      ];

  const effectiveWindowMode: TauriWindowMode =
    isMacOs && draftConfig.windowMode === 'borderless'
      ? 'windowed'
      : draftConfig.windowMode;

  const handleSaveOnly = async () => {
    setIsBusy(true);
    try {
      const updated = await saveTauriLaunchConfig(draftConfig);
      setLaunchState(updated);
      setDraftConfig(updated.config);
      setStatusBanner(
        updated.hasValidDefault
          ? 'Saved to workspace/launch-config.json — System Tray "Launch" is now enabled.'
          : 'Saved to workspace/launch-config.json — Tray "Launch" remains disabled until "Use as default" is checked.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleLaunchGame = async () => {
    setIsBusy(true);
    try {
      const updated = await launchGameFromConfigurator(draftConfig);
      setLaunchState(updated);
      setDraftConfig(updated.config);
      onLaunched?.(updated);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetDefault = async () => {
    setIsBusy(true);
    try {
      const updated = await resetTauriLaunchConfig();
      setLaunchState(updated);
      setDraftConfig(updated.config);
      setStatusBanner(
        'Cleared launch-config.json — System Tray "Launch" is now grayed out (disabled).'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const devActive = hasQueryParamToken(draftConfig.additionalParams, 'dev', '1');
  const cleanActive = hasQueryParamToken(draftConfig.additionalParams, 'clean', '1');

  return (
    <PanelContainer
      isLight={isLight}
      surfaceId="layer1-tauri-configurator"
      sizing={{ mode: 'auto', width: 640, targetHeight: 560, minHeight: 380, maxHeight: 680 }}
      className="mx-auto"
    >
      <PanelHeader
        title="ROCKET COMPANION // LAUNCH CONFIGURATOR"
        isLight={isLight}
        rightElement={
          <div className="flex items-center gap-2">
            <Badge variant={launchState?.hasValidDefault ? 'emerald' : 'neutral'} isLight={isLight}>
              {launchState?.hasValidDefault ? 'TRAY LAUNCH: READY' : 'TRAY LAUNCH: LOCKED'}
            </Badge>
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10">
              <CrossbarSvg size={18} color="#ffffff" variant="outline" />
            </span>
          </div>
        }
      />

      <PanelContent scrollable className="gap-3">
        <SettingSegmentedRow
          icon={Monitor}
          label="Display Window Mode"
          subtitle={
            isMacOs
              ? 'macOS native fullscreen space or centered desktop window'
              : 'Exclusive fullscreen, top-left offset borderless window, or standard window'
          }
          value={effectiveWindowMode}
          onChange={(val) =>
            setDraftConfig((prev) => ({ ...prev, windowMode: val as TauriWindowMode }))
          }
          options={windowModeOptions}
          hoverDescription={
            isMacOs
              ? 'Select Fullscreen or Windowed mode (Borderless is automatically hidden on macOS).'
              : 'Select Fullscreen, Borderless (auto-offset without titlebar), or Windowed mode.'
          }
          onHover={(desc) => desc && setHoveredDesc(desc)}
          onLeave={() => setHoveredDesc(null)}
          isLight={isLight}
        />

        <div
          onMouseEnter={() =>
            setHoveredDesc(
              'Optional URL query arguments injected on launch (e.g. ?dev=1&clean=1). Unrecognized parameters are safely ignored.'
            )
          }
          onMouseLeave={() => setHoveredDesc(null)}
          className={`flex flex-col gap-2 rounded-xl border px-3.5 py-3 transition-colors ${
            isLight
              ? 'bg-white/90 border-neutral-200/90 text-neutral-900'
              : 'bg-white/[0.03] border-white/[0.08] text-neutral-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold leading-tight">
                  Additional Launching Parameters
                </span>
                <span className="text-[11px] text-neutral-400 leading-snug">
                  Pass developer or startup query flags (e.g.{' '}
                  <code className="font-mono text-amber-300">?dev=1&amp;clean=1</code>) — invalid
                  arguments are safely ignored
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    additionalParams: toggleQueryParamToken(prev.additionalParams, 'dev', '1'),
                  }))
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                  devActive
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold'
                    : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                ?dev=1
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    additionalParams: toggleQueryParamToken(prev.additionalParams, 'clean', '1'),
                  }))
                }
                className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                  cleanActive
                    ? 'bg-sky-500/20 border-sky-500/60 text-sky-300 font-semibold'
                    : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                ?clean=1
              </button>
            </div>
          </div>

          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={draftConfig.additionalParams}
            onChange={(e) =>
              setDraftConfig((prev) => ({ ...prev, additionalParams: e.target.value }))
            }
            placeholder="?dev=1&clean=1"
            className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none transition-colors ${
              isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-900 focus:border-amber-500'
                : 'bg-neutral-950/90 border-white/12 text-amber-200 placeholder:text-neutral-600 focus:border-amber-500/70'
            }`}
          />
        </div>

        <div
          className={`flex flex-col gap-3 rounded-xl border px-3.5 py-3 ${
            isLight
              ? 'bg-white/90 border-neutral-200/90'
              : 'bg-white/[0.03] border-white/[0.08]'
          }`}
        >
          <Checkbox
            checked={draftConfig.useAsDefault}
            onChange={(checked) =>
              setDraftConfig((prev) => ({ ...prev, useAsDefault: checked }))
            }
            variant="amber"
            size="md"
            isLight={isLight}
            label="Use this configuration as default"
            description="Unlocks the System Tray 'Launch' button and enables direct startup when launch-config.json is present."
          />

          <div className="border-t border-white/[0.06] pt-2.5">
            <Checkbox
              checked={draftConfig.launchConfiguratorEveryTime}
              onChange={(checked) =>
                setDraftConfig((prev) => ({
                  ...prev,
                  launchConfiguratorEveryTime: checked,
                }))
              }
              variant="sky"
              size="md"
              isLight={isLight}
              label="Launch Configurator every time"
              description="Always open this Configurator menu on app startup instead of auto-launching the game window."
            />
          </div>

          <div className="border-t border-white/[0.06] pt-2.5">
            <Checkbox
              checked={draftConfig.trayOnlyMode}
              onChange={(checked) =>
                setDraftConfig((prev) => ({ ...prev, trayOnlyMode: checked }))
              }
              variant="emerald"
              size="md"
              isLight={isLight}
              label="Silent Tray-Only Startup (Persistent Dev Mode)"
              description="Do not pop up any window on process start; launch or configure on-demand from the Crossbar tray icon."
            />
          </div>
        </div>

        <div
          className={`flex flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-[11px] font-mono ${
            isLight
              ? 'bg-neutral-100/80 border-neutral-200 text-neutral-600'
              : 'bg-neutral-950/70 border-white/[0.06] text-neutral-400'
          }`}
        >
          <div className="flex items-center gap-2 text-neutral-300">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate" title={launchState?.workspaceDir}>
              Workspace: {launchState?.workspaceDir || '...'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-neutral-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate" title={launchState?.vaultDir}>
              Private Vault (Isolated): {launchState?.vaultDir || '...'}
            </span>
          </div>
          {statusBanner && (
            <div className="mt-1 flex items-center gap-1.5 text-amber-300 font-sans text-xs">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{statusBanner}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5 pt-1">
          <Button
            variant="ghost"
            size="sm"
            isLight={isLight}
            disabled={isBusy || !launchState?.configFileExists}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={handleResetDefault}
          >
            Reset Default
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              isLight={isLight}
              disabled={isBusy}
              icon={<Save className="w-4 h-4" />}
              onClick={handleSaveOnly}
            >
              Save Only
            </Button>
            <Button
              variant="primary"
              size="md"
              isLight={isLight}
              loading={isBusy}
              icon={<Play className="w-4 h-4 fill-current" />}
              onClick={handleLaunchGame}
            >
              Launch Rocket Companion
            </Button>
          </div>
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure window mode, developer flags (?dev=1&clean=1), and default tray launch behavior."
        hoveredDescription={hoveredDesc}
        rightLabel={isMacOs ? 'macOS' : 'Desktop'}
      />
    </PanelContainer>
  );
};
