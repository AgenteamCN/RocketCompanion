import React, { useMemo, useState, useEffect } from 'react';
import {
  useEventStreamData,
  eventStreamStore,
  type EventParamType,
} from '../../stores/eventStreamStore';
import { SliderControl } from '../../primitives/SliderControl';
import {
  EventImpulseScatterChart,
  type CollisionImpulseEvent,
} from '../../charts/EventImpulseScatterChart';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'event-stream-observer',
  title: 'Event Stream Observer',
  subtitle: 'Observer',
  description:
    'Real-time physics collision observer, impulse scatter chart & audio threshold visualizer.',
  icon: 'Activity',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 460,
    height: 420,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface EventStreamObserverFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

const PARAM_UNIT_MAP: Record<EventParamType, string> = {
  impulse: 'N·s',
  relSpeed: 'uu/s',
  normalRelVel: 'uu/s',
  speed: 'uu/s',
  z: 'uu',
};

export const EventStreamObserverFloatingWindow: React.FC<EventStreamObserverFloatingWindowProps> = ({
  isLight = false,
  active = true,
}) => {
  const state = useEventStreamData();
  const [now, setNow] = useState(() => performance.now());

  // Event-driven timeline update when window is active
  useEffect(() => {
    if (!active) return;
    const unsubscribe = eventStreamStore.subscribe(() => {
      setNow(performance.now());
    });
    return () => {
      unsubscribe();
    };
  }, [active]);

  const windowMs = state.timeWindowSec * 1000;
  const startMs = now - windowMs;

  const { chartEvents, maxObserved } = useMemo(() => {
    let maxVal = 0;
    const mapped: CollisionImpulseEvent[] = [];

    for (let i = 0; i < state.events.length; i++) {
      const e = state.events[i];
      if (e.timestamp < startMs) continue;
      const ageSec = Math.max(0, (now - e.timestamp) / 1000);
      if (e.value > maxVal) maxVal = e.value;
      mapped.push({
        id: `${e.timestamp}-${i}`,
        ageSec,
        value: e.value,
        type: e.type === 1 ? 'car-ball' : 'car-world',
      });
    }

    return { chartEvents: mapped, maxObserved: maxVal };
  }, [state.events, startMs, now]);

  const lastEvent = state.events[state.events.length - 1];
  const activeUnit = PARAM_UNIT_MAP[state.activeParam] ?? '';

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs">
      {/* 1. Parameter Selector Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Monitored Telemetry Channel
        </span>
        <select
          value={state.activeParam}
          onChange={(e) => eventStreamStore.setActiveParam(e.target.value as EventParamType)}
          className={`px-2 py-1 rounded-lg border text-[11px] font-semibold outline-none cursor-pointer transition-colors ${
            isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 border-neutral-700 text-neutral-200'
          }`}
        >
          <option value="impulse">Impulse (Force)</option>
          <option value="relSpeed">Relative Speed</option>
          <option value="normalRelVel">Normal Rel Vel</option>
          <option value="speed">Speed</option>
          <option value="z">Coordinate Z</option>
        </select>
      </div>

      {/* 2. DPR-Aware Canvas Impulse Scatter Chart */}
      <EventImpulseScatterChart
        events={chartEvents}
        threshold={state.threshold}
        onThresholdChange={(val) => eventStreamStore.setThreshold(val)}
        minY={state.minY}
        maxY={state.maxY}
        timeWindowSec={state.timeWindowSec}
        unit={activeUnit}
        height={136}
        onClear={() => eventStreamStore.clearEvents()}
        isLight={isLight}
      />

      {/* 3. Stat Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Total Hits</span>
          <span className="text-sm font-mono font-bold text-sky-400">{state.totalHits}</span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Last Value</span>
          <span className="text-sm font-mono font-bold text-amber-400">
            {lastEvent ? lastEvent.value.toFixed(1) : '0.0'}
          </span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Peak In-View</span>
          <span className="text-sm font-mono font-bold text-emerald-400">
            {maxObserved.toFixed(1)}
          </span>
        </div>
      </div>

      {/* 4. Controls: Threshold & Time Window Sliders */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-2 font-mono text-[11px] ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <SliderControl
          label="Audio Threshold"
          value={state.threshold}
          min={0}
          max={state.maxY}
          step={10}
          editable={true}
          showStepper={true}
          colorScheme="amber"
          isLight={isLight}
          onChange={(val) => eventStreamStore.setThreshold(val)}
        />

        <SliderControl
          label="Time Window"
          value={state.timeWindowSec}
          min={1}
          max={10}
          step={0.5}
          unit="s"
          editable={true}
          showStepper={true}
          colorScheme="amber"
          isLight={isLight}
          onChange={(val) => eventStreamStore.setTimeWindow(val)}
        />
      </div>
    </div>
  );
};
