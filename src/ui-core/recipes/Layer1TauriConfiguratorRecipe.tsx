import React, { useEffect, useState, useCallback } from 'react';
import {
  Monitor,
  Palette,
  Moon,
  Sun,
  Terminal,
  FolderOpen,
  Lock,
  Play,
  Save,
  RotateCcw,
} from 'lucide-react';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { Checkbox } from '../primitives/Checkbox';
import { Button } from '../primitives/Button';
import {
  DEFAULT_TAURI_LAUNCH_CONFIG,
  getTauriLaunchState,
  launchGameFromConfigurator,
  matchesDevLaunchParameter,
  openTauriVaultFolder,
  openTauriWorkspaceFolder,
  resetTauriLaunchConfig,
  saveTauriLaunchConfig,
  type TauriLaunchConfig,
  type TauriLaunchStatePayload,
  type TauriThemeMode,
  type TauriWindowMode,
} from '../config/tauriLaunchConfigBridge';
import type { SurfaceMeta } from '../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'layer1-tauri-configurator',
  title: 'Tauri Pre-Launch Configurator',
  subtitle: 'Desktop Window Mode, Style & System Tray Default',
  description:
    'Pre-launch desktop configurator for Window Mode (Fullscreen/Borderless/Windowed), Theme Style, additional launch parameters, default persistence, and tray-only background startup.',
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
  onThemeChange?: (theme: TauriThemeMode) => void;
  onLaunched?: (state: TauriLaunchStatePayload) => void;
}

export const Layer1TauriConfiguratorRecipe: React.FC<Layer1TauriConfiguratorRecipeProps> = ({
  isLight: propIsLight,
  onThemeChange,
  onLaunched,
}) => {
  const [launchState, setLaunchState] = useState<TauriLaunchStatePayload | null>(null);
  const [draftConfig, setDraftConfig] = useState<TauriLaunchConfig>({
    ...DEFAULT_TAURI_LAUNCH_CONFIG,
  });
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const isLight = propIsLight ?? draftConfig.themeMode === 'light';

  const applyDocumentTheme = useCallback(
    (theme: TauriThemeMode) => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.classList.toggle('light', theme === 'light');
        document.documentElement.dataset.theme = theme;
      }
      onThemeChange?.(theme);
    },
    [onThemeChange]
  );

  const refreshFromBackend = useCallback(async () => {
    const state = await getTauriLaunchState();
    setLaunchState(state);
    setDraftConfig(state.config);
    applyDocumentTheme(state.config.themeMode);
  }, [applyDocumentTheme]);

  useEffect(() => {
    refreshFromBackend();
    const onUpdated = () => {
      refreshFromBackend();
    };
    window.addEventListener('rc-tauri-config-updated', onUpdated);
    return () => window.removeEventListener('rc-tauri-config-updated', onUpdated);
  }, [refreshFromBackend]);

  const isMacOs = launchState?.platform === 'macos';
  const windowModeOptions = [
    { value: 'fullscreen', label: 'Fullscreen' },
    { value: 'borderless', label: 'Borderless', disabled: isMacOs },
    { value: 'windowed', label: 'Windowed' },
  ];

  const effectiveWindowMode: TauriWindowMode =
    isMacOs && draftConfig.windowMode === 'borderless'
      ? 'windowed'
      : draftConfig.windowMode;

  const isPrivateVaultUnlocked =
    draftConfig.additionalParamsEnabled &&
    matchesDevLaunchParameter(draftConfig.additionalParams);

  const handleThemeModeChange = (val: string) => {
    const nextTheme: TauriThemeMode = val === 'light' ? 'light' : 'dark';
    setDraftConfig((prev) => ({ ...prev, themeMode: nextTheme }));
    applyDocumentTheme(nextTheme);
  };

  const handleSaveOnly = async () => {
    setIsBusy(true);
    try {
      const updated = await saveTauriLaunchConfig(draftConfig);
      setLaunchState(updated);
      setDraftConfig(updated.config);
      setStatusMessage(
        updated.hasValidDefault
          ? 'Configuration saved — System Tray "Launch" is enabled.'
          : 'Configuration saved — Check "Use this configuration as default" to enable Tray Launch.'
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
      applyDocumentTheme(updated.config.themeMode);
      setStatusMessage('Cleared launch-config.json — System Tray "Launch" is now disabled.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenWorkspace = async () => {
    try {
      const opened = await openTauriWorkspaceFolder();
      setStatusMessage(`Workspace: ${opened}`);
    } catch (err) {
      setStatusMessage(String((err as Error)?.message || err));
    }
  };

  const handleOpenPrivateVault = async () => {
    if (!isPrivateVaultUnlocked) return;
    try {
      const opened = await openTauriVaultFolder(draftConfig.additionalParams);
      setStatusMessage(`Private Vault: ${opened}`);
    } catch (err) {
      setStatusMessage(String((err as Error)?.message || err));
    }
  };

  const defaultFooterText =
    statusMessage ||
    (launchState?.hasValidDefault
      ? 'System Tray Launch is ready. Hover any option for details.'
      : 'Hover any control to view its description.');

  return (
    <div
      data-surface-id="layer1-tauri-configurator"
      style={{ fontSize: 'clamp(13px, 1.8vw, 16px)' }}
      className={`flex flex-col w-full h-full min-h-full select-none transition-colors ${
        isLight ? 'bg-neutral-50 text-neutral-900' : 'bg-neutral-950 text-neutral-100'
      }`}
    >
      <div className="flex-1 min-h-0 w-full overflow-y-auto px-5 py-4 flex flex-col justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <SettingSegmentedRow
            icon={Monitor}
            label="Display Window Mode"
            showDescription={false}
            value={effectiveWindowMode}
            onChange={(val) =>
              setDraftConfig((prev) => ({ ...prev, windowMode: val as TauriWindowMode }))
            }
            options={windowModeOptions}
            hoverDescription={
              isMacOs
                ? 'Select Fullscreen or Windowed mode (Borderless is disabled on macOS).'
                : 'Select Fullscreen, Borderless (top-left offset without titlebar), or Windowed mode.'
            }
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
            bordered
          />

          <SettingSegmentedRow
            icon={Palette}
            label="Style"
            showDescription={false}
            value={draftConfig.themeMode}
            onChange={handleThemeModeChange}
            options={[
              { value: 'dark', label: 'Dark Mode', icon: <Moon className="h-3.5 w-3.5" /> },
              { value: 'light', label: 'Light Mode', icon: <Sun className="h-3.5 w-3.5" /> },
            ]}
            hoverDescription="Switch user interface appearance between Dark Mode and Light Mode."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
            bordered
          />

          <SettingToggleRow
            icon={Terminal}
            title="Additional Launching Parameters"
            showDescription={false}
            checked={draftConfig.additionalParamsEnabled}
            onChange={(enabled) =>
              setDraftConfig((prev) => ({ ...prev, additionalParamsEnabled: enabled }))
            }
            variant="amber"
            bordered
            hoverDescription="Enable custom launch query parameters. Arguments are passed directly on startup without validation."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
            bottomSlot={
              draftConfig.additionalParamsEnabled ? (
                <input
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={draftConfig.additionalParams}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({ ...prev, additionalParams: e.target.value }))
                  }
                  placeholder="Enter custom launch arguments..."
                  className={`w-full rounded-lg border px-3 py-2 text-xs font-mono outline-none transition-colors ${
                    isLight
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500'
                      : 'bg-neutral-900 border-white/12 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500/70'
                  }`}
                />
              ) : undefined
            }
          />

          <div
            className={`flex flex-col rounded-xl border divide-y ${
              isLight
                ? 'bg-white/90 border-neutral-200/90 divide-neutral-200/80'
                : 'bg-white/[0.03] border-white/[0.08] divide-white/[0.06]'
            }`}
          >
            <div
              className="px-3.5 py-3 flex items-center"
              onMouseEnter={() =>
                setHoveredDesc(
                  "Unlocks the System Tray 'Launch' button and enables direct startup when launch-config.json is present."
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <Checkbox
                checked={draftConfig.useAsDefault}
                onChange={(checked) => setDraftConfig((prev) => ({ ...prev, useAsDefault: checked }))}
                variant="amber"
                size="lg"
                isLight={isLight}
                className="w-full [&_span]:!text-[clamp(13px,1.6vw,15px)]"
                label="Use this configuration as default"
              />
            </div>

            <div
              className="px-3.5 py-3 flex items-center"
              onMouseEnter={() =>
                setHoveredDesc(
                  'Always open this Configurator window on application startup instead of auto-launching the game window.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <Checkbox
                checked={draftConfig.launchConfiguratorEveryTime}
                onChange={(checked) =>
                  setDraftConfig((prev) => ({ ...prev, launchConfiguratorEveryTime: checked }))
                }
                variant="sky"
                size="lg"
                isLight={isLight}
                className="w-full [&_span]:!text-[clamp(13px,1.6vw,15px)]"
                label="Launch Configurator every time"
              />
            </div>

            <div
              className="px-3.5 py-3 flex items-center"
              onMouseEnter={() =>
                setHoveredDesc(
                  'Do not pop up any window on process start; launch or configure on-demand from the Crossbar system tray icon.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <Checkbox
                checked={draftConfig.trayOnlyMode}
                onChange={(checked) => setDraftConfig((prev) => ({ ...prev, trayOnlyMode: checked }))}
                variant="emerald"
                size="lg"
                isLight={isLight}
                className="w-full [&_span]:!text-[clamp(13px,1.6vw,15px)]"
                label="Silent Tray-Only Startup"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div
              onMouseEnter={() =>
                setHoveredDesc(
                  `Open public user workspace directory (${launchState?.workspaceDir || 'workspace'}).`
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                isLight={isLight}
                icon={<FolderOpen className="w-4 h-4" />}
                onClick={handleOpenWorkspace}
              >
                Open Workspace Folder
              </Button>
            </div>

            <div
              onMouseEnter={() =>
                setHoveredDesc(
                  isPrivateVaultUnlocked
                    ? `Open isolated private vault directory (${launchState?.vaultDir || '.vault'}).`
                    : 'Private Vault folder is locked.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                isLight={isLight}
                disabled={!isPrivateVaultUnlocked}
                icon={<Lock className="w-4 h-4" />}
                onClick={handleOpenPrivateVault}
              >
                Open Private Vault Folder
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2.5 pt-2">
          <div
            onMouseEnter={() =>
              setHoveredDesc(
                'Delete launch-config.json and disable the System Tray Launch button until a new default is saved.'
              )
            }
            onMouseLeave={() => setHoveredDesc(null)}
          >
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
          </div>

          <div className="flex items-center gap-2">
            <div
              onMouseEnter={() =>
                setHoveredDesc('Save current configuration to workspace/launch-config.json without launching.')
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
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
            </div>

            <div
              onMouseEnter={() =>
                setHoveredDesc('Save configuration and launch Rocket Companion with the selected settings.')
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
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
        </div>
      </div>

      <PanelFooter
        isLight={isLight}
        defaultDescription={defaultFooterText}
        hoveredDescription={hoveredDesc}
        rightLabel={
          launchState?.hasValidDefault ? 'Tray Launch: Ready' : 'Tray Launch: Locked'
        }
      />
    </div>
  );
};
