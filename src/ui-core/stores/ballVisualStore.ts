/**
 * Ball Visual Opacity & Indicator Ring Store (`useBallVisualStore`)
 *
 * Bridges `ballVisualConfig` with Zustand reactive state and cross-client
 * `syncBridge` persistence for both RCUITuner and RocketCompanion hosts.
 */
import { create } from 'zustand';
import {
  type BallVisualApplier,
  type BallVisualConfig,
  type BallVisualListener,
  DEFAULT_BALL_VISUAL_CONFIG,
  getBallVisualConfig,
  sanitizeBallVisualConfig,
  setTemporaryBallOpacityOverride,
  subscribeBallVisualConfig,
  updateBallVisualConfig,
} from '../config/ballVisualConfig';
import { syncBridge } from './syncBridge';

export type { BallVisualApplier, BallVisualConfig, BallVisualListener };

const BALL_VISUAL_SYNC_KEY = 'store:ballVisual:v1';

export interface BallVisualStoreState {
  config: BallVisualConfig;
  updateConfig: (
    patch?: Partial<BallVisualConfig>,
    ballRoot?: unknown,
    indicatorRings?: unknown[]
  ) => BallVisualConfig;
  setTemporaryOpacityOverride: (
    opacityOrNull?: number | null,
    ballRoot?: unknown,
    indicatorRings?: unknown[]
  ) => BallVisualConfig;
  resetConfig: () => BallVisualConfig;
}

const initialBallConfig = sanitizeBallVisualConfig(
  syncBridge.get<BallVisualConfig>(BALL_VISUAL_SYNC_KEY, getBallVisualConfig())
);
if (initialBallConfig.opacity !== getBallVisualConfig().opacity) {
  updateBallVisualConfig(initialBallConfig);
}

export const useBallVisualStore = create<BallVisualStoreState>(() => ({
  config: getBallVisualConfig(),
  updateConfig: (patch = {}, ballRoot = null, indicatorRings = []) =>
    updateBallVisualConfig(patch, ballRoot, indicatorRings),
  setTemporaryOpacityOverride: (
    opacityOrNull = null,
    ballRoot = null,
    indicatorRings = []
  ) => setTemporaryBallOpacityOverride(opacityOrNull, ballRoot, indicatorRings),
  resetConfig: () => updateBallVisualConfig({ ...DEFAULT_BALL_VISUAL_CONFIG }),
}));

subscribeBallVisualConfig((snapshot) => {
  useBallVisualStore.setState({ config: snapshot });
  if (!syncBridge.isApplyingRemote()) {
    syncBridge.set(BALL_VISUAL_SYNC_KEY, snapshot);
  }
});

syncBridge.registerDefault(BALL_VISUAL_SYNC_KEY, { ...DEFAULT_BALL_VISUAL_CONFIG });

syncBridge.onReset((scopePrefix) => {
  if (scopePrefix && !BALL_VISUAL_SYNC_KEY.startsWith(scopePrefix)) return;
  updateBallVisualConfig({ ...DEFAULT_BALL_VISUAL_CONFIG });
});

syncBridge.subscribeKey<BallVisualConfig>(BALL_VISUAL_SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  updateBallVisualConfig(sanitizeBallVisualConfig(remote));
});
