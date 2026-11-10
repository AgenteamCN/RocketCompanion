import { useCallback } from 'react';
import type { CubicBezierValue } from '../../../ui-core/charts/CubicBezierCurveEditor';
import type { CollisionImpulseEvent } from '../../../ui-core/charts/EventImpulseScatterChart';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';

export const DEFAULT_COLLISION_IMPULSE_EVENTS: CollisionImpulseEvent[] = [
  { id: 'ev-1', ageSec: 4.4, value: 420, type: 'car-world' },
  { id: 'ev-2', ageSec: 3.9, value: 1180, type: 'car-ball' },
  { id: 'ev-3', ageSec: 3.4, value: 290, type: 'car-ball' },
  { id: 'ev-4', ageSec: 2.8, value: 1940, type: 'goalpost' },
  { id: 'ev-5', ageSec: 2.3, value: 810, type: 'car-ball' },
  { id: 'ev-6', ageSec: 1.8, value: 520, type: 'car-world' },
  { id: 'ev-7', ageSec: 1.2, value: 1560, type: 'car-ball' },
  { id: 'ev-8', ageSec: 0.6, value: 2210, type: 'goalpost' },
  { id: 'ev-9', ageSec: 0.2, value: 930, type: 'car-ball' },
];

export const DEFAULT_ORB_BEZIER: CubicBezierValue = {
  p1x: 0.0,
  p1y: -1.15,
  p2x: 0.0,
  p2y: 1.0,
};

export const DEFAULT_GLOW_BEZIER: CubicBezierValue = {
  p1x: 0.2,
  p1y: 0.8,
  p2x: 0.25,
  p2y: 1.0,
};

export function useChartsAndCurvesSyncedState() {
  const [telemetryPreset, setTelemetryPreset] = useSyncedState<'frame-time' | 'network-rtt'>(
    'page:charts-curves:telemetryPreset',
    'frame-time'
  );
  const [threshold, setThreshold] = useSyncedState<number>(
    'page:charts-curves:impulseThreshold',
    650
  );
  const [events, setEvents] = useSyncedState<CollisionImpulseEvent[]>(
    'page:charts-curves:impulseEvents',
    DEFAULT_COLLISION_IMPULSE_EVENTS
  );
  const [orbBezier, setOrbBezier] = useSyncedState<CubicBezierValue>(
    'page:charts-curves:orbBezier',
    DEFAULT_ORB_BEZIER
  );
  const [orbDurationMs, setOrbDurationMs] = useSyncedState<number>(
    'page:charts-curves:orbDurationMs',
    200
  );
  const [orbDropDistance, setOrbDropDistance] = useSyncedState<number>(
    'page:charts-curves:orbDropDistance',
    175
  );
  const [glowBezier, setGlowBezier] = useSyncedState<CubicBezierValue>(
    'page:charts-curves:glowBezier',
    DEFAULT_GLOW_BEZIER
  );

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:charts-curves:' });
  }, []);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      sparklineChannel: {
        preset: telemetryPreset,
        budgetMs: telemetryPreset === 'network-rtt' ? 24.0 : 8.33,
        refreshHz: 120,
      },
      impulseScatter: {
        audioThreshold: threshold,
        activeEventsCount: events.length,
        events,
      },
      orbCollectTrajectory: {
        bezier: orbBezier,
        durationMs: orbDurationMs,
        dropDistanceUu: orbDropDistance,
      },
      hologramGlowBezier: glowBezier,
    };
    return `// 5B Charts & Curves Calibrated Default Snapshot\nexport const DEFAULT_5B_CHARTS_AND_CURVES_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    telemetryPreset,
    threshold,
    events,
    orbBezier,
    orbDurationMs,
    orbDropDistance,
    glowBezier,
  ]);

  return {
    telemetryPreset,
    setTelemetryPreset,
    threshold,
    setThreshold,
    events,
    setEvents,
    orbBezier,
    setOrbBezier,
    orbDurationMs,
    setOrbDurationMs,
    orbDropDistance,
    setOrbDropDistance,
    glowBezier,
    setGlowBezier,
    handleResetDefaults,
    buildExportCode,
  };
}
