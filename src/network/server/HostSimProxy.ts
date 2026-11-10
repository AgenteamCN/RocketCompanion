/**
 * src/network/server/HostSimProxy.ts
 * Worker/Fallback RocketSim proxy adapter for AuthoritativeServerHost.
 * Translates local host sim queries and mutator commands into either worker postMessage
 * envelopes or direct synchronous calls against the in-memory fallback engine.
 */

import { ArenaHeaderView } from '../../physics/RocketSimStateViews.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';
import type { PhysicsEngineManager } from './PhysicsEngineManager.ts';
import type { NetworkDataHandler } from './NetworkDataHandler.ts';

export interface HostSimProxyOptions {
  isBotMatch?: boolean;
  numCars?: number;
  [key: string]: unknown;
}

export interface HostSimRestoreStateResult {
  snapshot?: Float32Array | number[] | null;
  tickCount?: number;
}

export interface HostSimProxyPort {
  isWorker: boolean;
  worker: Worker | null;
  fallbackSim: AuthoritativePhysicsSimPort | null;
  fallbackPhysics: PhysicsEngineManager | null;
  fallbackDataHandler: NetworkDataHandler | null;
  options: HostSimProxyOptions;
  cachedSnapshot: Float32Array;
  lastServerTick: number;
  lastGoal: number;
  headerViewInstance: ArenaHeaderView | null;
  _loggedFallbackSend?: boolean;
  _postCommand(type: string, data?: Record<string, unknown>, transfer?: Transferable[]): void;
  _sendRequest(type: string, data?: Record<string, unknown>): Promise<HostSimRestoreStateResult>;
}

export function createHostSimProxy(hostWorker: HostSimProxyPort) {
  const sim = {
    isUnlimitedBoost: false,
    get numCars(): number {
      if (!hostWorker.isWorker && hostWorker.fallbackSim) {
        return hostWorker.fallbackSim.numCars;
      }
      const hdr = sim.getHeaderView();
      return (
        hdr?.numCars ??
        (hostWorker.options.isBotMatch || (hostWorker.options.numCars ?? 0) >= 2 ? 2 : 1)
      );
    },
    _carUnlimitedBoost: {} as Record<number, boolean>,
    _carBoostCollectable: {} as Record<number, boolean>,
    _carBoostRecharge: {} as Record<
      number,
      { enabled: boolean; rechargePerSecond: number; rechargeDelay: number }
    >,
    setUnlimitedBoost: (enabled: boolean) => {
      const flag = Boolean(enabled);
      sim.isUnlimitedBoost = flag;
      for (let i = 0; i < 8; i++) sim._carUnlimitedBoost[i] = flag;
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setUnlimitedBoost', { enabled: flag });
      } else if (hostWorker.fallbackSim) {
        hostWorker.fallbackSim.setUnlimitedBoost?.(flag);
      }
    },
    getUnlimitedBoost: (): boolean => {
      if (
        !hostWorker.isWorker &&
        hostWorker.fallbackSim &&
        typeof hostWorker.fallbackSim.getUnlimitedBoost === 'function'
      ) {
        return Boolean(hostWorker.fallbackSim.getUnlimitedBoost());
      }
      return Boolean(sim.isUnlimitedBoost);
    },
    setCarUnlimitedBoost: (carIndex: number, enabled: boolean) => {
      const idx = Number(carIndex) || 0;
      const flag = Boolean(enabled);
      sim._carUnlimitedBoost[idx] = flag;
      if (idx === 0) sim.isUnlimitedBoost = flag;
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setCarUnlimitedBoost', { carIndex: idx, enabled: flag });
      } else if (hostWorker.fallbackSim) {
        hostWorker.fallbackSim.setCarUnlimitedBoost?.(idx, flag);
      }
    },
    getCarUnlimitedBoost: (carIndex = 0): boolean => {
      const idx = Number(carIndex) || 0;
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getCarUnlimitedBoost === 'function'
      ) {
        return Boolean(hostWorker.fallbackSim.getCarUnlimitedBoost(idx));
      }
      if (idx in sim._carUnlimitedBoost) return Boolean(sim._carUnlimitedBoost[idx]);
      return Boolean(sim.isUnlimitedBoost);
    },
    setCarBoostCollectable: (carIndex: number, collectable: boolean) => {
      const idx = Number(carIndex) || 0;
      const flag = Boolean(collectable);
      sim._carBoostCollectable[idx] = flag;
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setCarBoostCollectable', { carIndex: idx, collectable: flag });
      } else if (hostWorker.fallbackSim) {
        hostWorker.fallbackSim.setCarBoostCollectable?.(idx, flag);
      }
    },
    getCarBoostCollectable: (carIndex = 0): boolean => {
      const idx = Number(carIndex) || 0;
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getCarBoostCollectable === 'function'
      ) {
        return Boolean(hostWorker.fallbackSim.getCarBoostCollectable(idx));
      }
      if (idx in sim._carBoostCollectable) return Boolean(sim._carBoostCollectable[idx]);
      return true;
    },
    setCarBoostRecharge: (
      carIndex: number,
      enabled: boolean,
      rechargePerSecond = 10.0,
      rechargeDelay = 0.25
    ) => {
      const idx = Number(carIndex) || 0;
      const cfg = {
        enabled: Boolean(enabled),
        rechargePerSecond: Number(rechargePerSecond),
        rechargeDelay: Number(rechargeDelay),
      };
      sim._carBoostRecharge[idx] = cfg;
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setCarBoostRecharge', { carIndex: idx, ...cfg });
      } else if (hostWorker.fallbackSim) {
        hostWorker.fallbackSim.setCarBoostRecharge?.(
          idx,
          cfg.enabled,
          cfg.rechargePerSecond,
          cfg.rechargeDelay
        );
      }
    },
    getCarBoostRechargeEnabled: (carIndex = 0): boolean => {
      const idx = Number(carIndex) || 0;
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getCarBoostRechargeEnabled === 'function'
      ) {
        return Boolean(hostWorker.fallbackSim.getCarBoostRechargeEnabled(idx));
      }
      return Boolean(sim._carBoostRecharge[idx]?.enabled);
    },
    getCarBoostRechargePerSecond: (carIndex = 0): number => {
      const idx = Number(carIndex) || 0;
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getCarBoostRechargePerSecond === 'function'
      ) {
        return Number(hostWorker.fallbackSim.getCarBoostRechargePerSecond(idx));
      }
      return sim._carBoostRecharge[idx]?.rechargePerSecond ?? 10.0;
    },
    getCarBoostRechargeDelay: (carIndex = 0): number => {
      const idx = Number(carIndex) || 0;
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getCarBoostRechargeDelay === 'function'
      ) {
        return Number(hostWorker.fallbackSim.getCarBoostRechargeDelay(idx));
      }
      return sim._carBoostRecharge[idx]?.rechargeDelay ?? 0.25;
    },
    restoreState: (state: Float32Array | number[]) => {
      if (state) {
        const arr = state instanceof Float32Array ? state : new Float32Array(state);
        const copyLen = Math.min(arr.length, hostWorker.cachedSnapshot.length);
        hostWorker.cachedSnapshot.subarray(0, copyLen).set(arr.subarray(0, copyLen));
        const tickVal =
          arr.length <= 512
            ? Math.floor(arr[0])
            : new Uint32Array(arr.buffer, arr.byteOffset, 1)[0];
        if (tickVal >= 0 && !Number.isNaN(tickVal)) {
          hostWorker.lastServerTick = tickVal;
        }
      }
      if (hostWorker.isWorker && hostWorker.worker) {
        return hostWorker
          ._sendRequest('restoreState', {
            state: state instanceof Float32Array ? Array.from(state) : state,
          })
          .then((res) => {
            if (res.snapshot) {
              const snapArr =
                res.snapshot instanceof Float32Array
                  ? res.snapshot
                  : new Float32Array(res.snapshot);
              const copyLen = Math.min(snapArr.length, hostWorker.cachedSnapshot.length);
              hostWorker.cachedSnapshot.subarray(0, copyLen).set(snapArr.subarray(0, copyLen));
            }
            if (res.tickCount !== undefined) hostWorker.lastServerTick = res.tickCount;
            return hostWorker.cachedSnapshot;
          });
      } else if (hostWorker.fallbackSim) {
        const res = hostWorker.fallbackSim.restoreState?.(state);
        hostWorker.lastServerTick = Math.floor(
          hostWorker.fallbackSim.getHeaderView?.()?.tickCount ?? 0
        );
        return res;
      }
      return undefined;
    },
    saveState: (targetBuf?: Float32Array): Float32Array => {
      if (!hostWorker.isWorker && hostWorker.fallbackSim) {
        const fn =
          typeof hostWorker.fallbackSim.saveCompactState === 'function'
            ? (hostWorker.fallbackSim.saveCompactState as (b?: Float32Array) => Float32Array)
            : (hostWorker.fallbackSim.saveState as (b?: Float32Array) => Float32Array);
        return fn.call(hostWorker.fallbackSim, targetBuf);
      }
      if (targetBuf) {
        const copyLen = Math.min(targetBuf.length, hostWorker.cachedSnapshot.length);
        targetBuf.subarray(0, copyLen).set(hostWorker.cachedSnapshot.subarray(0, copyLen));
        return targetBuf;
      }
      return new Float32Array(hostWorker.cachedSnapshot);
    },
    saveCompactState: (targetBuf?: Float32Array): Float32Array => sim.saveState(targetBuf),
    getHeaderView: (): { tickCount: number; numCars?: number; goalScoredFlag?: number } => {
      if (!hostWorker.isWorker && hostWorker.fallbackSim?.getHeaderView) {
        return hostWorker.fallbackSim.getHeaderView();
      }
      if (!hostWorker.headerViewInstance) {
        hostWorker.headerViewInstance = new ArenaHeaderView();
      }
      if (hostWorker.cachedSnapshot && hostWorker.cachedSnapshot.length > 0) {
        hostWorker.headerViewInstance.attach(hostWorker.cachedSnapshot);
        return hostWorker.headerViewInstance;
      }
      return {
        tickCount: hostWorker.lastServerTick,
        numCars: hostWorker.options.isBotMatch || (hostWorker.options.numCars ?? 0) >= 2 ? 2 : 1,
      };
    },
    resetKickoff: (seed?: number) => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('resetKickoff', { seed });
      } else if (hostWorker.fallbackPhysics) {
        hostWorker.fallbackPhysics.resetKickoff(seed);
      }
    },
    resetGoalLatch: () => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('resetGoalLatch', {});
      } else if (hostWorker.fallbackPhysics) {
        hostWorker.fallbackPhysics.resetGoalLatch();
      }
    },
    setCarState: (
      carIndex: number,
      stateObj: Float32Array | number[] | Record<string, unknown>
    ): number => {
      if (hostWorker.isWorker && hostWorker.worker) {
        const serialized = stateObj instanceof Float32Array ? Array.from(stateObj) : stateObj;
        hostWorker._postCommand('setCarState', {
          carIndex,
          state: serialized,
          stateObj: serialized,
        });
        return 1;
      }
      if (hostWorker.fallbackSim) {
        return Number(hostWorker.fallbackSim.setCarState?.(carIndex, stateObj) ?? 0);
      }
      return 0;
    },
    setBallState: (ballState: Float32Array | number[] | Record<string, unknown>): boolean => {
      if (hostWorker.isWorker && hostWorker.worker) {
        const serialized = ballState instanceof Float32Array ? Array.from(ballState) : ballState;
        hostWorker._postCommand('setBallState', { ballState: serialized });
        return true;
      }
      if (hostWorker.fallbackSim) {
        return Boolean(hostWorker.fallbackSim.setBallState?.(ballState));
      }
      return false;
    },
    controlBall: (carIndex: number, mode: number | string): boolean => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('controlBall', { carIndex, mode });
      } else if (hostWorker.fallbackSim) {
        return Boolean(hostWorker.fallbackSim.controlBall?.(carIndex, mode));
      }
      return Boolean(hostWorker.isWorker && hostWorker.worker);
    },
    setCarCollisionMask: (
      carIndex: number,
      interactWithBall = true,
      interactWithCars = true
    ): number => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setCarCollisionMask', {
          carIndex,
          interactWithBall: Boolean(interactWithBall),
          interactWithCars: Boolean(interactWithCars),
        });
        return 1;
      }
      if (hostWorker.fallbackPhysics) {
        hostWorker.fallbackPhysics.setCarCollisionMask(
          carIndex,
          interactWithBall,
          interactWithCars
        );
        return 1;
      }
      if (typeof hostWorker.fallbackSim?.setCarCollisionMask === 'function') {
        return Number(
          hostWorker.fallbackSim.setCarCollisionMask(carIndex, interactWithBall, interactWithCars)
        );
      }
      return 0;
    },
    setCarLinearFactorAndGravity: (
      carIndex: number,
      fx = 1,
      fy = 1,
      fz = 1,
      gravityScale = 1
    ): number => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setCarLinearFactorAndGravity', {
          carIndex,
          fx,
          fy,
          fz,
          gravityScale,
        });
        return 1;
      }
      if (hostWorker.fallbackSim) {
        return Number(
          hostWorker.fallbackSim.setCarLinearFactorAndGravity?.(
            carIndex,
            fx,
            fy,
            fz,
            gravityScale
          ) ?? 0
        );
      }
      return 0;
    },
    setArenaMutators: (mutators: Record<string, unknown>): boolean => {
      if (hostWorker.isWorker && hostWorker.worker) {
        hostWorker._postCommand('setArenaMutators', { mutators });
        return true;
      } else if (hostWorker.fallbackSim) {
        return Boolean(hostWorker.fallbackSim.setArenaMutators?.(mutators));
      }
      return false;
    },
    pollGoal: (): number => {
      if (!hostWorker.isWorker && hostWorker.fallbackSim?.pollGoal) {
        return hostWorker.fallbackSim.pollGoal();
      }
      const g = hostWorker.lastGoal;
      hostWorker.lastGoal = 0;
      return g;
    },
    getStateSnapshotSize: (): number => {
      if (
        !hostWorker.isWorker &&
        typeof hostWorker.fallbackSim?.getStateSnapshotSize === 'function'
      ) {
        return Number(hostWorker.fallbackSim.getStateSnapshotSize());
      }
      return hostWorker.cachedSnapshot.length || 448;
    },
  };
  return sim;
}
