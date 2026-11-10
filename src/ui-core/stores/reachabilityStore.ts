import { useSyncExternalStore } from 'react';
import { createExternalStore } from './createExternalStore';

export type GroundReachabilityMode = 'lut' | 'analytical';
export type AerialReachabilityMode = 'funnel' | 'bubbles';
export type InterceptCrossOrientation = 'world' | 'trajectory';

export interface ReachabilityConfig {
  /** Master developer toggle (default: false) */
  enabled: boolean;
  /** Target car index (-1 = follow local playerCarIndex) */
  targetCarIndex: number;

  /** 1. Ground reachability isochrones (auto-hides when car is not on ground) */
  showGround: boolean;
  groundMode: GroundReachabilityMode;
  groundFillOpacity: number;
  groundLineWidth: number;

  /** 2. Aerial 3D spacetime funnel / horn */
  showAerial: boolean;
  aerialMode: AerialReachabilityMode;
  aerialOpacity: number;
  aerialShowRings: boolean;
  aerialShowRails: boolean;
  /** Default true: includes minimum single-jump upward impulse (328.125 UU/s) when car is on ground */
  includeJumpImpulse: boolean;

  /** 3. Optimal intercept point (3D orthogonal cross) */
  showIntercept: boolean;
  crossArmLength: number;
  crossThickness: number;
  crossOrientation: InterceptCrossOrientation;
  showClosestWhenUnreachable: boolean;
  edgeCrossColor: string;
  midCrossColor: string;
  centerCrossColor: string;
  reachableCrossColor: string;
  unreachableCrossColor: string;
}

export type InterceptPaceStatus = 'none' | 'unreachable' | 'catching' | 'sweet-spot' | 'overshoot';

export interface ReachabilityTelemetry {
  computeTimeUs: number;
  groundComputeUs: number;
  aerialComputeUs: number;
  interceptComputeUs: number;
  isOnGround: boolean;
  boostAmount: number;
  forwardSpeed: number;
  interceptStatus: 'none' | 'reachable' | 'closest-fallback';
  interceptTimeSec: number;
  interceptDistance: number;
  interceptMargin: number;
  interceptCentrality: number;
  interceptPaceStatus: InterceptPaceStatus;
  interceptMinBoost: number;
  interceptPos: [number, number, number];
}

export const DEFAULT_REACHABILITY_CONFIG: Readonly<ReachabilityConfig> = Object.freeze({
  enabled: false,
  targetCarIndex: -1,

  showGround: false,
  groundMode: 'lut',
  groundFillOpacity: 0.16,
  groundLineWidth: 2.5,

  showAerial: false,
  aerialMode: 'funnel',
  aerialOpacity: 0.22,
  aerialShowRings: true,
  aerialShowRails: true,
  includeJumpImpulse: true,

  showIntercept: true,
  crossArmLength: 50,
  crossThickness: 5,
  crossOrientation: 'world',
  showClosestWhenUnreachable: false,
  edgeCrossColor: '#ff3b5c',
  midCrossColor: '#ffbe0b',
  centerCrossColor: '#00f59b',
  reachableCrossColor: '#00f59b',
  unreachableCrossColor: '#ff3b5c',
});

const INITIAL_TELEMETRY: Readonly<ReachabilityTelemetry> = Object.freeze({
  computeTimeUs: 0,
  groundComputeUs: 0,
  aerialComputeUs: 0,
  interceptComputeUs: 0,
  isOnGround: true,
  boostAmount: 33.3,
  forwardSpeed: 0,
  interceptStatus: 'none',
  interceptTimeSec: 0,
  interceptDistance: 0,
  interceptMargin: 0,
  interceptCentrality: 0,
  interceptPaceStatus: 'none',
  interceptMinBoost: 0,
  interceptPos: [0, 0, 0] as [number, number, number],
});

interface ReachabilityStoreState {
  config: ReachabilityConfig;
  telemetry: ReachabilityTelemetry;
}

const core = createExternalStore<ReachabilityStoreState>({
  config: { ...DEFAULT_REACHABILITY_CONFIG },
  telemetry: { ...INITIAL_TELEMETRY },
});

export const reachabilityStore = {
  getSnapshot: core.getSnapshot,

  getConfig(): ReachabilityConfig {
    return core.getSnapshot().config;
  },

  getTelemetry(): ReachabilityTelemetry {
    return core.getSnapshot().telemetry;
  },

  updateConfig(patch: Partial<ReachabilityConfig>): ReachabilityConfig {
    const next = core.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        ...patch,
      },
    }));
    return next.config;
  },

  resetConfig(): ReachabilityConfig {
    const next = core.setState((state) => ({
      ...state,
      config: { ...DEFAULT_REACHABILITY_CONFIG, enabled: state.config.enabled },
    }));
    return next.config;
  },

  publishTelemetry(nextTelemetry: Partial<ReachabilityTelemetry>): void {
    core.setState((state) => ({
      ...state,
      telemetry: {
        ...state.telemetry,
        ...nextTelemetry,
      },
    }));
  },

  subscribe: core.subscribe,
};

export function useReachabilityStore(): ReachabilityStoreState {
  return useSyncExternalStore(
    reachabilityStore.subscribe,
    reachabilityStore.getSnapshot,
    reachabilityStore.getSnapshot
  );
}
