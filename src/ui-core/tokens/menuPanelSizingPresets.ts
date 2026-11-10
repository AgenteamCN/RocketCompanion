import { getSurfaceCalibrationOverride } from '../manifest/surfaceCalibration';

export type PanelSizingMode = 'auto' | 'fixed';

export type CanonicalMenuPanelId =
  | 'layer1-main'
  | 'layer2-play'
  | 'layer2-garage'
  | 'layer2-settings'
  | 'layer2-previews'
  | 'layer2-manage-room'
  | 'layer3-training-config'
  | 'layer3-acoustics-equalizer'
  | 'layer3-ball-trajectory'
  | 'layer3-host-match'
  | 'layer3-host-training'
  | 'layer3-custom-play'
  | 'layer3-join-room'
  | 'layer3-exhibition'
  | 'layer3-self-training'
  | 'layer3-kickoff-training'
  | 'layer3-camera'
  | 'layer3-keybindings'
  | 'layer3-exp-multi-bots'
  | 'layer3-exp-botpack'
  | 'layer3-dev-sandboxes'
  | 'layer3-dev-active-tuners'
  | 'layer3-dev-calibrated-presets'
  | 'layer3-dev-quick-actions'
  | 'layer3-dev-self-test'
  | 'layer3-dev-under-development'
  | 'layer3-dev-tem-pack-converter'
  | 'layer3-dev-remote-profile'
  | 'layer4-static-training-pack'
  | 'layer4-advanced-audio'
  | 'layer4-controller-settings'
  | 'layer4-event-trigger-rules'
  | 'layer4-dev-signaling-lab';

export type MenuPanelId = CanonicalMenuPanelId;

export interface PanelSizingConfig {
  mode: PanelSizingMode;
  width: number;
  targetHeight: number;
  minHeight: number;
  maxHeight: number;
  component?: string;
  sourcePath?: string;
}

export const CANONICAL_PANEL_SIZING: Record<CanonicalMenuPanelId, PanelSizingConfig> = {
  'layer1-main': {
    mode: 'auto',
    width: 420,
    targetHeight: 377,
    minHeight: 180,
    maxHeight: 960,
  },
  'layer2-play': {
    mode: 'auto',
    width: 640,
    targetHeight: 298,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer2-garage': {
    mode: 'auto',
    width: 640,
    targetHeight: 417,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer2-settings': {
    mode: 'auto',
    width: 680,
    targetHeight: 457,
    minHeight: 220,
    maxHeight: 1120,
  },
  'layer2-previews': {
    mode: 'auto',
    width: 600,
    targetHeight: 440,
    minHeight: 220,
    maxHeight: 960,
  },
  'layer2-manage-room': {
    mode: 'auto',
    width: 720,
    targetHeight: 500,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer3-training-config': {
    mode: 'auto',
    width: 480,
    targetHeight: 460,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-acoustics-equalizer': {
    mode: 'auto',
    width: 480,
    targetHeight: 540,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer3-ball-trajectory': {
    mode: 'auto',
    width: 560,
    targetHeight: 520,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer3-host-match': {
    mode: 'auto',
    width: 520,
    targetHeight: 560,
    minHeight: 220,
    maxHeight: 1120,
  },
  'layer3-host-training': {
    mode: 'auto',
    width: 500,
    targetHeight: 420,
    minHeight: 200,
    maxHeight: 1080,
  },
  'layer3-custom-play': {
    mode: 'auto',
    width: 500,
    targetHeight: 400,
    minHeight: 220,
    maxHeight: 960,
  },
  'layer3-join-room': {
    mode: 'auto',
    width: 480,
    targetHeight: 360,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-exhibition': {
    mode: 'auto',
    width: 480,
    targetHeight: 420,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-self-training': {
    mode: 'auto',
    width: 500,
    targetHeight: 460,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-kickoff-training': {
    mode: 'auto',
    width: 520,
    targetHeight: 520,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer3-camera': {
    mode: 'auto',
    width: 560,
    targetHeight: 520,
    minHeight: 220,
    maxHeight: 1080,
  },
  'layer3-keybindings': {
    mode: 'auto',
    width: 560,
    targetHeight: 560,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer3-exp-multi-bots': {
    mode: 'auto',
    width: 580,
    targetHeight: 580,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer3-exp-botpack': {
    mode: 'auto',
    width: 580,
    targetHeight: 580,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer3-dev-sandboxes': {
    mode: 'auto',
    width: 560,
    targetHeight: 460,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-dev-active-tuners': {
    mode: 'auto',
    width: 600,
    targetHeight: 580,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer3-dev-calibrated-presets': {
    mode: 'auto',
    width: 560,
    targetHeight: 420,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-dev-quick-actions': {
    mode: 'auto',
    width: 560,
    targetHeight: 460,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-dev-self-test': {
    mode: 'auto',
    width: 560,
    targetHeight: 420,
    minHeight: 200,
    maxHeight: 960,
  },
  'layer3-dev-under-development': {
    mode: 'auto',
    width: 600,
    targetHeight: 580,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer3-dev-tem-pack-converter': {
    mode: 'fixed',
    width: 920,
    targetHeight: 740,
    minHeight: 320,
    maxHeight: 1120,
  },
  'layer3-dev-remote-profile': {
    mode: 'auto',
    width: 620,
    targetHeight: 540,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer4-static-training-pack': {
    mode: 'fixed',
    width: 920,
    targetHeight: 740,
    minHeight: 320,
    maxHeight: 1120,
  },
  'layer4-advanced-audio': {
    mode: 'auto',
    width: 560,
    targetHeight: 560,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer4-controller-settings': {
    mode: 'auto',
    width: 640,
    targetHeight: 960,
    minHeight: 260,
    maxHeight: 1120,
  },
  'layer4-event-trigger-rules': {
    mode: 'auto',
    width: 580,
    targetHeight: 560,
    minHeight: 240,
    maxHeight: 1120,
  },
  'layer4-dev-signaling-lab': {
    mode: 'auto',
    width: 760,
    targetHeight: 680,
    minHeight: 260,
    maxHeight: 1120,
  },
};

export const DEFAULT_PANEL_SIZING: Record<MenuPanelId, PanelSizingConfig> = {
  ...CANONICAL_PANEL_SIZING,
};

export const resolveMenuPanelSizing = (
  panels: Partial<Record<MenuPanelId, PanelSizingConfig>> | undefined,
  id: MenuPanelId | string
): PanelSizingConfig => {
  const panelId = id as CanonicalMenuPanelId;
  const base =
    panels?.[panelId] ??
    CANONICAL_PANEL_SIZING[panelId] ??
    CANONICAL_PANEL_SIZING['layer2-settings'];
  const override =
    getSurfaceCalibrationOverride(id) ??
    getSurfaceCalibrationOverride(`recipe:${id}`);
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...(override.width !== undefined ? { width: override.width } : {}),
    ...(typeof override.height === 'number' ? { targetHeight: override.height } : {}),
    ...(override.minHeight !== undefined ? { minHeight: override.minHeight } : {}),
    ...(override.maxHeight !== undefined ? { maxHeight: override.maxHeight } : {}),
    ...(override.mode !== undefined
      ? { mode: override.mode === 'adaptive' ? 'auto' : 'fixed' }
      : {}),
  };
};
