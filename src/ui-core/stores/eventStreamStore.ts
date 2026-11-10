import { useSyncExternalStore } from 'react';
import {
  setCarBallHitImpulseThreshold,
  setGoalpostHitThreshold,
  setCarBallHitCooldownMs,
  setGoalpostHitCooldownMs,
} from '../config/audioConfig';
import { createExternalStore } from './createExternalStore';

export interface PhysicsEventRecord {
  timestamp: number;
  type: number;
  value: number;
  impulse: number;
  relSpeed: number;
  normalRelVel: number;
  speed: number;
  x: number;
  y: number;
  z: number;
  carIndex: number;
  tick?: number;
}

export type EventParamType = 'impulse' | 'relSpeed' | 'normalRelVel' | 'speed' | 'z';

export interface EventStreamState {
  events: PhysicsEventRecord[];
  activeParam: EventParamType;
  timeWindowSec: number;
  threshold: number;
  cooldownMs: number;
  eventFilter: 'all' | 'car-ball' | 'car-world';
  minY: number;
  maxY: number;
  totalHits: number;
}

const core = createExternalStore<EventStreamState>(
  {
    events: [],
    activeParam: 'impulse',
    timeWindowSec: 4.0,
    threshold: 300,
    cooldownMs: 40,
    eventFilter: 'all',
    minY: 0,
    maxY: 1200,
    totalHits: 0,
  },
  {
    onFirstSubscribe: (state, replaceState) => {
      replaceState({ ...state, events: [...state.events] });
    },
  }
);

export const eventStreamStore = {
  getSnapshot: core.getSnapshot,
  subscribe: core.subscribe,

  addEvent: (raw: any) => {
    const state = core.getSnapshot();
    const now = performance.now();
    let impulse = Number(raw.impulse ?? raw.force ?? 0);
    const relSpeed = Number(raw.relSpeed ?? 0);
    const normalRelVel = Number(raw.normalRelVel ?? 0);
    const speed = Number(raw.speed ?? 0);
    if ((!impulse || impulse === 0) && (normalRelVel || speed || relSpeed)) {
      impulse = Math.abs(normalRelVel || speed || relSpeed || 0);
    }
    const z = Number(raw.z ?? raw.pos?.[2] ?? 0);
    const x = Number(raw.x ?? raw.pos?.[0] ?? 0);
    const y = Number(raw.y ?? raw.pos?.[1] ?? 0);
    const type = Number(raw.type ?? 0);

    const safeImpulse = Number.isFinite(impulse) ? impulse : 0;
    const safeRelSpeed = Number.isFinite(relSpeed) ? relSpeed : 0;
    const safeNormalRelVel = Number.isFinite(normalRelVel) ? normalRelVel : 0;
    const safeSpeed = Number.isFinite(speed) ? speed : 0;
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeZ = Number.isFinite(z) ? z : 0;

    let val = safeImpulse;
    if (state.activeParam === 'relSpeed') val = safeRelSpeed;
    else if (state.activeParam === 'normalRelVel') val = safeNormalRelVel;
    else if (state.activeParam === 'speed') val = safeSpeed;
    else if (state.activeParam === 'z') val = safeZ;

    const record: PhysicsEventRecord = {
      timestamp: now,
      type,
      value: val,
      impulse,
      relSpeed,
      normalRelVel,
      speed,
      x,
      y,
      z,
      carIndex: Number(raw.carIndex ?? 0),
      tick: raw.tick,
    };

    const cutoff = now - 15000;
    const MAX_EVENTS = 512;

    if (core.getListenerCount() === 0) {
      while (state.events.length > 0 && state.events[0].timestamp < cutoff) {
        state.events.shift();
      }
      if (state.events.length >= MAX_EVENTS) {
        state.events.shift();
      }
      state.events.push(record);
      state.totalHits += 1;
      return;
    }

    const kept = state.events.filter((e) => e.timestamp >= cutoff);
    if (kept.length >= MAX_EVENTS) {
      kept.splice(0, kept.length - MAX_EVENTS + 1);
    }
    kept.push(record);

    core.setState({
      ...state,
      events: kept,
      totalHits: state.totalHits + 1,
    });
  },

  setParam: (param: EventParamType) => {
    const state = core.getSnapshot();
    let minY = 0;
    let maxY = 1200;
    let threshold = state.threshold;

    if (param === 'impulse') {
      minY = 0;
      maxY = 1200;
      threshold = 300;
    } else if (param === 'relSpeed' || param === 'normalRelVel' || param === 'speed') {
      minY = 0;
      maxY = 3000;
      threshold = 800;
    } else if (param === 'z') {
      minY = 0;
      maxY = 2048;
      threshold = 200;
    }

    core.setState({ ...state, activeParam: param, minY, maxY, threshold });
  },

  setActiveParam: (param: EventParamType) => {
    eventStreamStore.setParam(param);
  },

  setTimeWindow: (sec: number) => {
    core.setState((state) => ({ ...state, timeWindowSec: Math.max(1, Math.min(10, sec)) }));
  },

  setThreshold: (val: number) => {
    core.setState((state) => ({ ...state, threshold: val }), false);
    try {
      setCarBallHitImpulseThreshold(val);
      setGoalpostHitThreshold(val * 0.85);
    } catch (err) {
      console.warn('[eventStreamStore] Failed to update audio engine thresholds:', err);
    }
    core.notify();
  },

  setCooldownMs: (ms: number) => {
    core.setState((state) => ({ ...state, cooldownMs: ms }), false);
    try {
      setCarBallHitCooldownMs(ms);
      setGoalpostHitCooldownMs(ms);
    } catch (err) {
      console.warn('[eventStreamStore] Failed to update audio engine cooldown:', err);
    }
    core.notify();
  },

  setFilter: (f: 'all' | 'car-ball' | 'car-world') => {
    core.setState((state) => ({ ...state, eventFilter: f }));
  },

  clearEvents: () => {
    core.setState((state) => ({ ...state, events: [], totalHits: 0 }));
  },
};

export const useEventStreamData = () => {
  return useSyncExternalStore(eventStreamStore.subscribe, eventStreamStore.getSnapshot);
};
