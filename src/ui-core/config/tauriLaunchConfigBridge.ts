/**
 * tauriLaunchConfigBridge.ts
 * Zero-dependency TypeScript bridge for the Tauri pre-launch Configurator,
 * window mode switching, and startup sanitization.
 */

export type TauriWindowMode = 'windowed' | 'borderless' | 'fullscreen';
export type TauriThemeMode = 'dark' | 'light';
export type TauriPlatformTag = 'macos' | 'windows' | 'linux' | 'web';

export interface TauriLaunchConfig {
  windowMode: TauriWindowMode;
  themeMode: TauriThemeMode;
  additionalParamsEnabled: boolean;
  additionalParams: string;
  useAsDefault: boolean;
  launchConfiguratorEveryTime: boolean;
  trayOnlyMode: boolean;
}

export interface TauriLaunchStatePayload {
  config: TauriLaunchConfig;
  configFileExists: boolean;
  hasValidDefault: boolean;
  platform: TauriPlatformTag;
  workspaceDir: string;
  vaultDir: string;
  configFilePath: string;
}

interface TauriGlobalCore {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

interface WindowWithTauri extends Window {
  __TAURI__?: {
    core?: TauriGlobalCore;
  };
  __TAURI_INTERNALS__?: {
    invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
}

const WEB_FALLBACK_CONFIG_KEY = '__rc_web_preview_tauri_launch_config';
const PRIVATE_VAULT_STORAGE_KEYS = new Set<string>([
  'rc_dev_remote_profile_key_v1',
  'rc_dev_remote_profile_bundle_v1',
]);

export const DEV_PARAM_REGEX = /dev=1/;

export function matchesDevLaunchParameter(raw: string): boolean {
  return DEV_PARAM_REGEX.test(raw);
}

export const DEFAULT_TAURI_LAUNCH_CONFIG: TauriLaunchConfig = {
  windowMode: 'windowed',
  themeMode: 'dark',
  additionalParamsEnabled: false,
  additionalParams: '',
  useAsDefault: false,
  launchConfiguratorEveryTime: false,
  trayOnlyMode: false,
};

function getTauriInvoke(): (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null {
  if (typeof window === 'undefined') return null;
  const win = window as WindowWithTauri;
  if (typeof win.__TAURI__?.core?.invoke === 'function') {
    return win.__TAURI__.core.invoke.bind(win.__TAURI__.core);
  }
  if (typeof win.__TAURI_INTERNALS__?.invoke === 'function') {
    return win.__TAURI_INTERNALS__.invoke.bind(win.__TAURI_INTERNALS__);
  }
  return null;
}

export function isTauriRuntime(): boolean {
  return getTauriInvoke() !== null;
}

export function detectClientPlatformTag(): TauriPlatformTag {
  if (typeof navigator === 'undefined') return 'web';
  const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

export function isConfiguratorRoute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('configurator') === '1' || params.get('configurator') === 'true';
  } catch {
    return false;
  }
}

export function isCleanStartupRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const cleanVal =
      params.get('clean') ?? params.get('cleanStartup') ?? params.get('clean_startup');
    return cleanVal === '1' || cleanVal === 'true';
  } catch {
    return false;
  }
}

/**
 * Executes synchronously before engine/UI stores initialize when clean startup is
 * present in the URL query string. Clears all user settings and session state while
 * preserving isolated `.rctbnspib` vault keys unless `?cleanVault=1` is passed.
 */
export function applyCleanStartupFromQueryIfNeeded(): boolean {
  if (!isCleanStartupRequested()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const cleanVault = params.get('cleanVault') === '1' || params.get('cleanVault') === 'true';

    if (typeof localStorage !== 'undefined') {
      if (cleanVault) {
        localStorage.clear();
      } else {
        const preserved = new Map<string, string>();
        for (const key of PRIVATE_VAULT_STORAGE_KEYS) {
          const val = localStorage.getItem(key);
          if (val !== null) preserved.set(key, val);
        }
        localStorage.clear();
        for (const [key, val] of preserved.entries()) {
          localStorage.setItem(key, val);
        }
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    console.info('[CleanStartup] Cleared user storage via launch parameter.');
    return true;
  } catch (err) {
    console.warn('[CleanStartup] Storage wipe warning:', err);
    return false;
  }
}

function loadWebFallbackState(): TauriLaunchStatePayload {
  const platform = detectClientPlatformTag();
  let config: TauriLaunchConfig = { ...DEFAULT_TAURI_LAUNCH_CONFIG };
  let configFileExists = false;
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(WEB_FALLBACK_CONFIG_KEY)
        : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TauriLaunchConfig>;
      config = {
        ...DEFAULT_TAURI_LAUNCH_CONFIG,
        ...parsed,
      };
      configFileExists = true;
    }
  } catch {
    // ignore fallback read errors
  }

  if (platform === 'macos' && config.windowMode === 'borderless') {
    config.windowMode = 'windowed';
  }

  return {
    config,
    configFileExists,
    hasValidDefault: configFileExists && Boolean(config.useAsDefault),
    platform,
    workspaceDir:
      platform === 'macos'
        ? '~/Library/Application Support/com.antigravity.rocketcompanion/workspace'
        : '%APPDATA%\\com.antigravity.rocketcompanion\\workspace',
    vaultDir:
      platform === 'macos'
        ? '~/Library/Application Support/com.antigravity.rocketcompanion/.vault'
        : '%LOCALAPPDATA%\\com.antigravity.rocketcompanion\\.vault',
    configFilePath:
      platform === 'macos'
        ? '~/Library/Application Support/com.antigravity.rocketcompanion/workspace/launch-config.json'
        : '%APPDATA%\\com.antigravity.rocketcompanion\\workspace\\launch-config.json',
  };
}

export async function getTauriLaunchState(): Promise<TauriLaunchStatePayload> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke<TauriLaunchStatePayload>('tauri_get_launch_state');
    } catch (err) {
      console.warn('[tauriLaunchConfigBridge] invoke tauri_get_launch_state failed:', err);
    }
  }
  return loadWebFallbackState();
}

export async function saveTauriLaunchConfig(
  config: TauriLaunchConfig
): Promise<TauriLaunchStatePayload> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<TauriLaunchStatePayload>('tauri_save_launch_config', { config });
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_FALLBACK_CONFIG_KEY, JSON.stringify(config));
    }
  } catch {
    // ignore
  }
  return loadWebFallbackState();
}

export async function launchGameFromConfigurator(
  config: TauriLaunchConfig
): Promise<TauriLaunchStatePayload> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<TauriLaunchStatePayload>('tauri_launch_game', { config });
  }
  const state = await saveTauriLaunchConfig(config);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('rc_theme', config.themeMode);
      document.documentElement.classList.toggle('dark', config.themeMode === 'dark');
      document.documentElement.classList.toggle('light', config.themeMode === 'light');
      document.documentElement.dataset.theme = config.themeMode;
    } catch {
      // ignore
    }
    const raw = config.additionalParamsEnabled ? config.additionalParams.trim() : '';
    const normalized = !raw ? '' : raw.startsWith('?') ? raw : `?${raw.replace(/^&+/, '')}`;
    window.location.href = `/${normalized}`;
  }
  return state;
}

export async function resetTauriLaunchConfig(): Promise<TauriLaunchStatePayload> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<TauriLaunchStatePayload>('tauri_reset_launch_config');
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEB_FALLBACK_CONFIG_KEY);
    }
  } catch {
    // ignore
  }
  return loadWebFallbackState();
}

export async function openTauriConfigurator(): Promise<void> {
  const invoke = getTauriInvoke();
  if (invoke) {
    await invoke('tauri_open_configurator');
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.search = '?configurator=1';
  }
}

export async function setTauriDisplayWindowMode(
  windowMode: TauriWindowMode
): Promise<TauriWindowMode> {
  const invoke = getTauriInvoke();
  if (invoke) {
    const applied = await invoke<string>('tauri_set_display_window_mode', { windowMode });
    return (applied as TauriWindowMode) || windowMode;
  }
  return windowMode;
}

export async function openTauriWorkspaceFolder(): Promise<string> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<string>('tauri_open_workspace_folder');
  }
  return loadWebFallbackState().workspaceDir;
}

export async function openTauriVaultFolder(additionalParams: string): Promise<string> {
  if (!matchesDevLaunchParameter(additionalParams)) {
    throw new Error('Private Vault folder requires active developer parameters.');
  }
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<string>('tauri_open_vault_folder', { additionalParams });
  }
  return loadWebFallbackState().vaultDir;
}
