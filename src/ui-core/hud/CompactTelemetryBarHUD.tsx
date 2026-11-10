import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { MonitorPlay, Ruler, Gauge, Router } from 'lucide-react';
import {
  CompactTelemetryTransientSnapshot,
  CompactTelemetryTransientListener,
} from '../stores/hudTransientTypes';

export type TelemetryMetricVisibilityMode = 'off' | 'always';

export interface CompactTelemetryConfig {
  alwaysShow: boolean;
  fpsMode: TelemetryMetricVisibilityMode;
  refreshRateMode: TelemetryMetricVisibilityMode;
  renderScaleMode: TelemetryMetricVisibilityMode;
  physicsRateMode: TelemetryMetricVisibilityMode;
  latencyMode: TelemetryMetricVisibilityMode;
}

export const DEFAULT_COMPACT_TELEMETRY_CONFIG: CompactTelemetryConfig = {
  alwaysShow: true,
  fpsMode: 'always',
  refreshRateMode: 'always',
  renderScaleMode: 'always',
  physicsRateMode: 'always',
  latencyMode: 'always',
};

export interface CompactTelemetryBarHandle {
  /** Imperatively push live telemetry numbers to DOM refs with zero React re-renders */
  setTelemetry: (snapshot: CompactTelemetryTransientSnapshot) => void;
}

export interface CompactTelemetryBarHUDProps {
  config?: CompactTelemetryConfig;
  snapshot?: CompactTelemetryTransientSnapshot;
  /** Optional sampler error message to display loud diagnostic banner */
  errorMessage?: string | null;
  /** Optional high-frequency transient channel subscription (0 React VDOM re-renders) */
  subscribeTelemetry?: (listener: CompactTelemetryTransientListener) => () => void;
  /** Turns the top-left FPS icon and readout yellow when ESC menu is open or window loses focus */
  isFpsPaused?: boolean;
  isLight?: boolean;
  className?: string;
}

/**
 * CompactTelemetryBarHUD
 * Top-left decoupled 4-metric minimal telemetry pill:
 * 1. FPS & Screen Refresh Rate (`MonitorPlay`: `120 / 120 hz` or `120 hz`)
 * 2. Viewport Render Scale (`Ruler`: `100%`)
 * 3. Physical Simulation Rate (`Gauge`: `120.0`, 1 decimal place, no unit)
 * 4. Network Latency & RTT Offset (`Router`: `18ms(+0)`)
 *
 * Supports both declarative `snapshot` props and high-frequency `subscribeTelemetry`
 * / `forwardRef` direct DOM textContent updates with zero React re-renders.
 */
export const CompactTelemetryBarHUD = React.memo(
  forwardRef<CompactTelemetryBarHandle, CompactTelemetryBarHUDProps>(
    (
      {
        config = DEFAULT_COMPACT_TELEMETRY_CONFIG,
        snapshot = {
          fps: 120,
          refreshHz: 120,
          renderScalePct: 100,
          physicsRateHz: 120.0,
          baseLatencyMs: 18,
          extraLatencyMs: 0,
        },
        errorMessage = null,
        subscribeTelemetry,
        isFpsPaused = false,
        isLight = true,
        className = '',
      },
      ref
    ) => {
    const fpsTextRef = useRef<HTMLSpanElement | null>(null);
    const refreshTextRef = useRef<HTMLSpanElement | null>(null);
    const scaleTextRef = useRef<HTMLSpanElement | null>(null);
    const physicsTextRef = useRef<HTMLSpanElement | null>(null);
    const latencyTextRef = useRef<HTMLSpanElement | null>(null);

    const applySnapshotToDom = useCallback((snap: CompactTelemetryTransientSnapshot) => {
      if (fpsTextRef.current) {
        const nextFps = String(Math.round(snap.fps));
        if (fpsTextRef.current.textContent !== nextFps) {
          fpsTextRef.current.textContent = nextFps;
        }
      }
      if (refreshTextRef.current) {
        const nextRefresh = String(Math.round(snap.refreshHz));
        if (refreshTextRef.current.textContent !== nextRefresh) {
          refreshTextRef.current.textContent = nextRefresh;
        }
      }
      if (scaleTextRef.current) {
        const nextScale = `${Math.round(snap.renderScalePct)}%`;
        if (scaleTextRef.current.textContent !== nextScale) {
          scaleTextRef.current.textContent = nextScale;
        }
      }
      if (physicsTextRef.current) {
        const clampedPhy = Math.max(1, Math.min(600, snap.physicsRateHz || 120));
        const nextPhy = clampedPhy.toFixed(1);
        if (physicsTextRef.current.textContent !== nextPhy) {
          physicsTextRef.current.textContent = nextPhy;
        }
      }
      if (latencyTextRef.current) {
        const nextLat = `${Math.round(snap.baseLatencyMs)}ms(+${Math.round(snap.extraLatencyMs)})`;
        if (latencyTextRef.current.textContent !== nextLat) {
          latencyTextRef.current.textContent = nextLat;
        }
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setTelemetry: applySnapshotToDom,
      }),
      [applySnapshotToDom]
    );

    useEffect(() => {
      applySnapshotToDom(snapshot);
    }, [snapshot, applySnapshotToDom]);

    useEffect(() => {
      if (!subscribeTelemetry) return;
      return subscribeTelemetry(applySnapshotToDom);
    }, [subscribeTelemetry, applySnapshotToDom]);

    if (!config.alwaysShow) return null;

    if (errorMessage) {
      return (
        <div
          data-ui-element="hud-telemetry-error"
          className={`px-3 py-1.5 rounded-xl border border-rose-500/50 bg-rose-950/95 text-rose-300 font-mono text-[11px] flex items-center gap-2 shadow-md select-none pointer-events-auto ${className}`}
        >
          <span className="font-bold text-rose-400">Telemetry Error:</span>
          <span className="truncate max-w-xs">{errorMessage}</span>
        </div>
      );
    }

    const showFps = config.fpsMode === 'always';
    const showRefreshRate = showFps && config.refreshRateMode === 'always';
    const showRenderScale = config.renderScaleMode === 'always';
    const showPhysicsRate = config.physicsRateMode === 'always';
    const showLatency = config.latencyMode === 'always';

    if (!showFps && !showRenderScale && !showPhysicsRate && !showLatency) {
      return null;
    }

    const isHighPing = (snapshot.baseLatencyMs ?? 0) > 80;
    const bgBorderClass = isLight
      ? 'bg-white/95 border-neutral-300 text-neutral-800 shadow-md'
      : 'bg-neutral-950/92 border-neutral-800 text-neutral-300 shadow-md';

    const items: React.ReactNode[] = [];

    if (showFps) {
      const fpsIconColorClass = isFpsPaused
        ? isLight
          ? 'text-amber-500'
          : 'text-amber-400'
        : isLight
          ? 'text-emerald-600'
          : 'text-emerald-400';
      const fpsValueColorClass = isFpsPaused
        ? isLight
          ? 'text-amber-600'
          : 'text-amber-400'
        : isLight
          ? 'text-neutral-900'
          : 'text-white';
      items.push(
        <div
          key="fps"
          className="flex items-center gap-1"
          title={
            isFpsPaused
              ? 'Gameplay telemetry paused (menu open or window unfocused)'
              : 'Live foreground gameplay FPS'
          }
        >
          <MonitorPlay className={`h-3 w-3 transition-colors ${fpsIconColorClass}`} />
          <span
            ref={fpsTextRef}
            className={`font-bold tabular-nums transition-colors ${fpsValueColorClass}`}
          >
            {Math.round(snapshot.fps)}
          </span>
          {showRefreshRate && (
            <>
              <span className={isLight ? 'text-neutral-400' : 'text-neutral-500'}>/</span>
              <span
                ref={refreshTextRef}
                className={`tabular-nums ${isLight ? 'text-neutral-600' : 'text-neutral-300'}`}
              >
                {Math.round(snapshot.refreshHz)}
              </span>
            </>
          )}
          <span className={`text-[9px] uppercase ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            hz
          </span>
        </div>
      );
    }

    if (showRenderScale) {
      items.push(
        <div key="scale" className="flex items-center gap-1">
          <Ruler className={`h-3 w-3 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
          <span
            ref={scaleTextRef}
            className={`font-bold tabular-nums ${isLight ? 'text-neutral-900' : 'text-white'}`}
          >
            {Math.round(snapshot.renderScalePct)}%
          </span>
        </div>
      );
    }

    if (showPhysicsRate) {
      const clampedPhysicsRate = Math.max(1, Math.min(600, snapshot.physicsRateHz ?? 120));
      items.push(
        <div key="physics" className="flex items-center gap-1">
          <Gauge className={`h-3 w-3 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
          <span
            ref={physicsTextRef}
            className={`font-bold tabular-nums ${isLight ? 'text-neutral-900' : 'text-white'}`}
          >
            {clampedPhysicsRate.toFixed(1)}
          </span>
        </div>
      );
    }

    if (showLatency) {
      items.push(
        <div key="latency" className="flex items-center gap-1">
          <Router
            className={`h-3 w-3 ${
              isHighPing
                ? isLight
                  ? 'text-amber-600'
                  : 'text-amber-400'
                : isLight
                ? 'text-emerald-600'
                : 'text-emerald-400'
            }`}
          />
          <span
            ref={latencyTextRef}
            className={`font-bold tabular-nums ${isLight ? 'text-neutral-900' : 'text-white'}`}
          >
            {Math.round(snapshot.baseLatencyMs)}ms(+{Math.round(snapshot.extraLatencyMs)})
          </span>
        </div>
      );
    }

    return (
      <div
        data-alpha-id="Alpha:CompactTelemetryBarHUD"
        data-ui-element="hud-compact-telemetry-bar"
        className={`select-none pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-mono transition-colors ${bgBorderClass} ${className}`}
      >
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <span className={isLight ? 'text-neutral-300' : 'text-neutral-700'}>|</span>
            )}
            {item}
          </React.Fragment>
        ))}
      </div>
    );
  })
);

CompactTelemetryBarHUD.displayName = 'CompactTelemetryBarHUD';
