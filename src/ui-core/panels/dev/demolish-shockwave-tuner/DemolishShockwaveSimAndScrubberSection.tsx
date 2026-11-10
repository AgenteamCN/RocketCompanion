import React from 'react';
import { Play, Pause, Sparkles, X } from 'lucide-react';
import {
  evaluateDemolishShockwaveFrame,
  resolveDemolishSimTargetUu,
  scrubDemolishShockwaveSim,
  setDemolishShockwaveConfig,
  stopDemolishShockwaveSim,
  triggerDemolishShockwaveSim,
  type DemolishShockwaveConfig,
  type DemolishShockwaveSimState,
} from '../../../config/demolishShockwaveConfig';
import { DemolishShockwaveArenaCoordCard } from './DemolishShockwaveArenaCoordCard';

export interface DemolishShockwaveSimSectionProps {
  config: DemolishShockwaveConfig;
  sim: DemolishShockwaveSimState;
  isLight: boolean;
}

export const DemolishShockwaveSimAndScrubberSection: React.FC<
  DemolishShockwaveSimSectionProps
> = ({ config, sim, isLight }) => {
  const frame = evaluateDemolishShockwaveFrame(sim.normT, config);
  const resolvedUu = resolveDemolishSimTargetUu(config);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const inputCls = isLight
    ? 'bg-white border-neutral-300 text-neutral-900'
    : 'bg-neutral-950 border-neutral-700 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const maxStageOuterUu = Math.max(380, config.outerKeys[3]?.size || 850);
  const previewScale = 128 / maxStageOuterUu;
  const previewPx = Math.max(4, Math.min(136, frame.size * previewScale));
  const hole = frame.innerHolePct;
  const feather = config.featherPct;
  const inStart = Math.max(0, hole - feather * (hole / 100));
  const inEnd = Math.min(100, hole + feather * (1 - hole / 100) * 0.5);
  const maskImage =
    hole <= 0.1
      ? 'none'
      : `radial-gradient(circle, transparent ${inStart.toFixed(1)}%, black ${inEnd.toFixed(1)}%)`;

  const [r, g, b] = frame.rgb;
  const glowSpread = (previewPx * 0.22 * frame.glowFactor).toFixed(1);
  const glowInset = (previewPx * 0.12 * frame.glowFactor).toFixed(1);
  const glowAlpha = Math.min(0.95, frame.glowFactor * 0.85).toFixed(2);
  const boxShadow =
    frame.glowFactor > 0.01
      ? `0 0 ${glowSpread}px rgba(${r},${g},${b},${glowAlpha}), inset 0 0 ${glowInset}px rgba(255,255,255,${glowAlpha})`
      : 'none';

  const handleFrameStep = (deltaFrames: number) => {
    const nextFrame = Math.max(
      0,
      Math.min(frame.totalFrames120, frame.frameIndex120 + deltaFrames)
    );
    scrubDemolishShockwaveSim(nextFrame / frame.totalFrames120, false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-[11px]">
              Playback &amp; 120 FPS Timeline Scrubber
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] ${mutedText}`}>Duration (s):</span>
            <input
              type="number"
              step={0.1}
              min={0.2}
              max={5.0}
              value={config.duration}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val) && val >= 0.2) {
                  setDemolishShockwaveConfig({ duration: Math.min(5.0, val) });
                }
              }}
              className={`w-14 px-1.5 py-0.5 rounded border text-[11px] font-mono text-right ${inputCls}`}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => triggerDemolishShockwaveSim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg font-semibold text-[11px] bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Play / Trigger 3D</span>
          </button>
          <button
            type="button"
            onClick={() =>
              sim.isPlaying
                ? stopDemolishShockwaveSim(false)
                : scrubDemolishShockwaveSim(
                    sim.normT >= 0.999 ? 0 : sim.normT,
                    true
                  )
            }
            className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg font-medium text-[11px] border border-neutral-600/60 hover:bg-neutral-700/40 transition-colors cursor-pointer"
          >
            <Pause className="h-3.5 w-3.5" />
            <span>{sim.isPlaying ? 'Pause' : 'Resume'}</span>
          </button>
          <button
            type="button"
            onClick={() => stopDemolishShockwaveSim(true)}
            title="Clear 3D Arena Preview"
            className="flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border border-neutral-600/60 hover:bg-neutral-700/40 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear 3D</span>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={mutedText}>Frame Scrubber (120 FPS):</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleFrameStep(-1)}
                className="px-1.5 py-0.5 rounded border border-neutral-700 text-[10px] font-mono hover:bg-neutral-700/40 cursor-pointer"
              >
                -1F
              </button>
              <span className="font-mono font-bold text-emerald-400">
                F: {frame.frameIndex120}/{frame.totalFrames120} (
                {frame.elapsedSec.toFixed(3)}s)
              </span>
              <button
                type="button"
                onClick={() => handleFrameStep(1)}
                className="px-1.5 py-0.5 rounded border border-neutral-700 text-[10px] font-mono hover:bg-neutral-700/40 cursor-pointer"
              >
                +1F
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={frame.totalFrames120}
            value={frame.frameIndex120}
            onChange={(e) => {
              const f = parseInt(e.target.value, 10) || 0;
              scrubDemolishShockwaveSim(f / frame.totalFrames120, false);
            }}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div className="relative h-36 rounded-lg bg-[#0a0e17] border border-neutral-800 overflow-hidden flex items-center justify-center">
          <div
            style={{
              width: `${previewPx}px`,
              height: `${previewPx}px`,
              borderRadius: '50%',
              backgroundColor: frame.cssRgb,
              opacity: frame.opacity,
              WebkitMaskImage: maskImage,
              maskImage,
              boxShadow,
            }}
          />
          <div className="absolute top-1.5 left-2 flex flex-col text-[10px] font-mono text-neutral-300 bg-black/55 px-1.5 py-0.5 rounded">
            <span>Outer: {Math.round(frame.worldDiameterUu)} UU</span>
            <span>Hole: {frame.innerHolePct.toFixed(1)}%</span>
          </div>
          <div className="absolute top-1.5 right-2 flex flex-col items-end text-[10px] font-mono text-neutral-300 bg-black/55 px-1.5 py-0.5 rounded">
            <span>Alpha: {(frame.opacity * 100).toFixed(0)}%</span>
            <span>Glow: {frame.glowFactor.toFixed(2)}</span>
          </div>
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-neutral-400">
            <span>2D Ring Stage + Synced 3D Arena Preview</span>
            <span className="text-amber-400">
              3D Pos: ({resolvedUu.x}, {resolvedUu.y}, {resolvedUu.z}) UU
            </span>
          </div>
        </div>
      </div>

      <DemolishShockwaveArenaCoordCard
        config={config}
        sim={sim}
        isLight={isLight}
      />
    </div>
  );
};
