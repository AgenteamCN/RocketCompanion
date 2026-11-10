import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  Download,
  RotateCcw,
  Camera,
  Play,
  Pause,
  Radio,
} from 'lucide-react';
import { useCameraDeterminismData, cameraDeterminismStore } from '../../stores/cameraDeterminismStore';
import { PRE_TRIGGER_FRAME_LIMIT, POST_TRIGGER_FRAME_LIMIT } from '../../config/cameraDefaults';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'camera-determinism',
  title: 'Camera Deterministic Harness',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 460,
    height: 460,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface CameraDeterminismFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const CameraDeterminismFloatingWindow: React.FC<CameraDeterminismFloatingWindowProps> = ({
  isLight = false,
}) => {
  const { metrics, activeSource, autoCaptureEnabled, posTolerance } = useCameraDeterminismData();
  const isCleanActive = activeSource === 'clean_js';
  const isMatching = metrics.isMatching;

  const formatMetric = (val: number) => {
    if (!Number.isFinite(val) || val === 0) return '0.00e+0';
    return val.toExponential(2);
  };

  const renderCaptureBadge = () => {
    if (metrics.captureState === 'capturing_post') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
          POST-CAPTURE ({metrics.postBufferCount}/{POST_TRIGGER_FRAME_LIMIT}f)
        </span>
      );
    }
    if (metrics.captureState === 'captured_ready') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-400">
          LOCKED ({metrics.totalCapturedCount}f READY)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
        RING ({metrics.preBufferCount}/{PRE_TRIGGER_FRAME_LIMIT}f)
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs">
      {/* 1. Equivalence Status Banner */}
      <div
        className={`p-2.5 rounded-xl border flex items-center justify-between font-mono transition-colors ${
          isMatching
            ? isLight
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
            : isLight
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-rose-950/30 border-rose-500/40 text-rose-400'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isMatching ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertOctagon className="h-4 w-4 text-rose-500 shrink-0" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs uppercase tracking-wide truncate">
              {isMatching ? '8-DIGIT EQUIVALENT (WASM == JS)' : 'CAMERA DIVERGENCE DETECTED'}
            </span>
            <span className="text-[10px] opacity-75 truncate">
              {isMatching
                ? `Dual-kernel lockstep verified (Tol: ${posTolerance} UU)`
                : `Triggered at frame #${metrics.triggerFrameIndex} (${metrics.divergenceCount} frames diverged)`}
            </span>
          </div>
        </div>
        {renderCaptureBadge()}
      </div>

      {/* 2. Active Camera Source Toggle Switch (Legacy WASM vs New Clean JS) */}
      <div
        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 font-mono ${
          isLight
            ? 'bg-neutral-50 border-neutral-200'
            : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className={`font-bold text-[11px] ${isLight ? 'text-neutral-800' : 'text-neutral-100'}`}>
              Active Camera Engine
            </span>
            <span className="text-[10px] text-neutral-400 truncate">
              {isCleanActive
                ? 'POV (Default · Clean JS Engine)'
                : 'WasmPOV (Legacy camera.wasm)'}
            </span>
          </div>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-bold cursor-pointer transition-colors ${
              !isCleanActive ? 'text-amber-400' : 'text-neutral-500'
            }`}
            onClick={() => cameraDeterminismStore.setActiveSource('wasm')}
          >
            WasmPOV
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={isCleanActive}
            onClick={() => cameraDeterminismStore.toggleActiveSource()}
            title="Toggle between WasmPOV (WASM) and POV (Default Clean JS)"
            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isCleanActive ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isCleanActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          <span
            className={`text-[10px] font-bold cursor-pointer transition-colors ${
              isCleanActive ? 'text-emerald-400' : 'text-neutral-500'
            }`}
            onClick={() => cameraDeterminismStore.setActiveSource('clean_js')}
          >
            POV (Default)
          </span>
        </div>
      </div>

      {/* 3. Frame & Capture Counters */}
      <div className="grid grid-cols-3 gap-2">
        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Camera Frame</span>
          <span className="text-sm font-mono font-bold text-sky-400">#{metrics.frameIndex}</span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Pre / Post Buffer</span>
          <span className="text-sm font-mono font-bold text-amber-400">
            {metrics.preBufferCount} / {metrics.postBufferCount}f
          </span>
        </div>

        <div
          className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <span className="text-[10px] text-neutral-400 font-mono">Peak Rel Error</span>
          <span className="text-sm font-mono font-bold text-emerald-400">
            {formatMetric(metrics.peakRelError)}
          </span>
        </div>
      </div>

      {/* 4. Side-by-Side Output Delta Inspection */}
      <div
        className={`p-2.5 rounded-xl border font-mono text-[11px] flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
          WASM vs Clean JS Output Deltas (toPrecision(8))
        </span>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Live ΔPos:</span>
            <span
              className={
                metrics.deltaPos > posTolerance
                  ? 'text-rose-400 font-bold'
                  : isLight
                  ? 'text-neutral-900 font-bold'
                  : 'text-emerald-400 font-bold'
              }
            >
              {formatMetric(metrics.deltaPos)} UU
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Peak ΔPos:</span>
            <span className={isLight ? 'text-neutral-800 font-semibold' : 'text-neutral-200'}>
              {formatMetric(metrics.peakDeltaPos)} UU
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Live ΔDir:</span>
            <span
              className={
                metrics.deltaDir > 1e-4
                  ? 'text-rose-400 font-bold'
                  : isLight
                  ? 'text-neutral-900 font-bold'
                  : 'text-emerald-400 font-bold'
              }
            >
              {formatMetric(metrics.deltaDir)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Peak ΔDir:</span>
            <span className={isLight ? 'text-neutral-800 font-semibold' : 'text-neutral-200'}>
              {formatMetric(metrics.peakDeltaDir)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Live ΔUp:</span>
            <span
              className={
                metrics.deltaUp > 1e-4
                  ? 'text-rose-400 font-bold'
                  : isLight
                  ? 'text-neutral-900 font-bold'
                  : 'text-emerald-400 font-bold'
              }
            >
              {formatMetric(metrics.deltaUp)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>Peak ΔFOV:</span>
            <span className={isLight ? 'text-neutral-800 font-semibold' : 'text-neutral-200'}>
              {formatMetric(metrics.peakDeltaFov)} deg
            </span>
          </div>
        </div>
      </div>

      {/* 5. Recording & CSV Export Controls */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-2 font-mono text-[11px] ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => cameraDeterminismStore.toggleAutoCapture()}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
              autoCaptureEnabled
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            {autoCaptureEnabled ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            <span>Auto Record ({autoCaptureEnabled ? 'ON' : 'OFF'})</span>
          </button>

          <button
            type="button"
            onClick={() => cameraDeterminismStore.triggerManualCapture()}
            disabled={metrics.captureState !== 'monitoring'}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border flex items-center gap-1 transition-colors ${
              metrics.captureState === 'monitoring'
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300 cursor-pointer'
                : 'bg-neutral-800/40 border-neutral-700/40 text-neutral-500 cursor-not-allowed'
            }`}
          >
            <Radio className="h-3 w-3" />
            <span>Lock +600f Capture</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => cameraDeterminismStore.exportCsvFile()}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-[11px] cursor-pointer transition-all active:scale-95 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV ({metrics.totalCapturedCount}f)</span>
          </button>

          <button
            type="button"
            onClick={() => cameraDeterminismStore.resetCaptureAndPeaks()}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-[11px] border cursor-pointer transition-all active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Buffer & Peaks</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraDeterminismFloatingWindow;
