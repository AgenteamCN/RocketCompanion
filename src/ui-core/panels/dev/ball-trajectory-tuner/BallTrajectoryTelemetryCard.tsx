import React from 'react';
import { Activity } from 'lucide-react';
import {
  useBallTrajectoryTunerStore,
  type BallTrajectoryTelemetry,
} from '../../../stores/ballTrajectoryTunerStore';

export interface BallTrajectoryTelemetryCardProps {
  isLight?: boolean;
}

function resolveUpdateBadge(kind: BallTrajectoryTelemetry['lastUpdateKind']): {
  label: string;
  cls: string;
} {
  switch (kind) {
    case 'incremental-tail':
      return {
        label: 'INCREMENTAL (+1 TAIL)',
        cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15',
      };
    case 'progressive-catchup':
      return {
        label: 'CATCH-UP (+N RAMP)',
        cls: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/15',
      };
    case 'wasm-seam-resync':
      return {
        label: 'SEAM RESYNC (600T)',
        cls: 'text-purple-400 border-purple-500/40 bg-purple-500/15',
      };
    case 'full-car-hit':
      return {
        label: 'FULL (CAR-BALL HIT)',
        cls: 'text-amber-400 border-amber-500/40 bg-amber-500/15',
      };
    case 'full-deviation':
      return {
        label: 'FULL (POS DEVIATION)',
        cls: 'text-rose-400 border-rose-500/40 bg-rose-500/15',
      };
    case 'full-initial':
      return {
        label: 'FULL (WAKEUP)',
        cls: 'text-sky-400 border-sky-500/40 bg-sky-500/15',
      };
    case 'full-world-bounce':
      return {
        label: 'FULL (WORLD BOUNCE)',
        cls: 'text-amber-400 border-amber-500/40 bg-amber-500/15',
      };
    case 'full-forced':
      return {
        label: 'FULL (EVERY TICK)',
        cls: 'text-rose-400 border-rose-500/40 bg-rose-500/15',
      };
    case 'cached-tick':
      return {
        label: 'CACHED (0 WASM)',
        cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      };
    case 'static-preview':
      return {
        label: 'STATIC PREVIEW',
        cls: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
      };
    default:
      return {
        label: 'SLEEPING / IDLE',
        cls: 'text-neutral-400 border-neutral-500/30 bg-neutral-500/10',
      };
  }
}

export const BallTrajectoryTelemetryCard: React.FC<
  BallTrajectoryTelemetryCardProps
> = ({ isLight = false }) => {
  const { telemetry } = useBallTrajectoryTunerStore();

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const updateBadge = resolveUpdateBadge(telemetry.lastUpdateKind);

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
      <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-bold text-[11px]">Live 120Hz WASM &amp; 3D Geometry Telemetry</span>
        </div>
        <span
          className={`font-mono text-[9px] px-1.5 py-0.5 rounded border font-semibold ${updateBadge.cls}`}
        >
          {updateBadge.label}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>WASM Step</span>
          <span className="font-bold text-emerald-400">
            {telemetry.wasmComputeTimeUs.toFixed(1)} µs
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>3D Mesh Build</span>
          <span className="font-bold text-sky-400">
            {telemetry.geometryBuildTimeUs.toFixed(1)} µs
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>Lookahead</span>
          <span className="font-bold text-amber-400">
            {telemetry.remainingSlices}/{telemetry.activeSlices}t
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>3D Triangles</span>
          <span className="font-bold text-purple-400">{telemetry.primitiveCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
        <div className="px-1.5 py-1 rounded bg-black/15 border border-white/5 flex items-center justify-between">
          <span className={mutedText}>Inc Steps</span>
          <span className="font-bold text-emerald-400">{telemetry.incrementalStepCount}</span>
        </div>
        <div className="px-1.5 py-1 rounded bg-black/15 border border-white/5 flex items-center justify-between">
          <span className={mutedText}>Full Syncs</span>
          <span className="font-bold text-amber-400">{telemetry.fullRecomputeCount}</span>
        </div>
        <div className="px-1.5 py-1 rounded bg-black/15 border border-white/5 flex items-center justify-between">
          <span className={mutedText}>Car Hits</span>
          <span className="font-bold text-sky-400">{telemetry.carHitRecomputeCount}</span>
        </div>
        <div className="px-1.5 py-1 rounded bg-black/15 border border-white/5 flex items-center justify-between">
          <span className={mutedText}>Bounces</span>
          <span className="font-bold text-purple-400">{telemetry.bounceCount}</span>
        </div>
      </div>
    </div>
  );
};
