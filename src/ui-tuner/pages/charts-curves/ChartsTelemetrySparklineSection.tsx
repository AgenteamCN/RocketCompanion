import React, { useEffect, useRef } from 'react';
import { Activity, Flame, Gauge, Wifi } from 'lucide-react';
import { TelemetryRingBuffer } from '../../../ui-core/charts/telemetryRingBuffer';
import { TelemetrySparklineChart } from '../../../ui-core/charts/TelemetrySparklineChart';
import { Button } from '../../../ui-core/primitives/Button';
import { useChartsAndCurvesSyncedState } from './useChartsAndCurvesSyncedState';

export interface ChartsTelemetrySparklineSectionProps {
  isLight: boolean;
}

export const ChartsTelemetrySparklineSection: React.FC<ChartsTelemetrySparklineSectionProps> = ({
  isLight,
}) => {
  const { telemetryPreset, setTelemetryPreset } = useChartsAndCurvesSyncedState();

  const frameRingBufferRef = useRef<TelemetryRingBuffer | null>(null);
  if (!frameRingBufferRef.current) {
    const initial: number[] = [];
    for (let i = 0; i < 240; i++) {
      const spike = i % 79 === 0 ? 11.8 : i % 53 === 0 ? 9.4 : 0;
      initial.push(spike || Number((5.2 + Math.sin(i * 0.14) * 1.1 + (i % 7) * 0.12).toFixed(2)));
    }
    frameRingBufferRef.current = new TelemetryRingBuffer(240, initial);
  }

  const reactRenderCountRef = useRef<number>(0);
  reactRenderCountRef.current += 1;
  const sampleRateReadoutRef = useRef<HTMLSpanElement | null>(null);
  const reactRenderReadoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const isNetRtt = telemetryPreset === 'network-rtt';
    let rafId = 0;
    let samplePhase = 0;
    let samplesThisWindow = 0;
    let lastTime = performance.now();
    let lastSecMark = lastTime;
    let accumulatorMs = 0;
    let lastRenderSnap = reactRenderCountRef.current;
    const stepMs = 1000 / 120;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      const dt = Math.min(34, Math.max(0, now - lastTime));
      lastTime = now;
      accumulatorMs += dt;

      let steps = 0;
      while (accumulatorMs >= stepMs && steps < 4) {
        accumulatorMs -= stepMs;
        steps++;
        samplePhase += 1;
        samplesThisWindow += 1;

        const wave = Math.sin(samplePhase * 0.09) * (isNetRtt ? 3.2 : 0.95);
        const jitter = (Math.random() - 0.48) * (isNetRtt ? 2.4 : 1.1);
        const occasionalSpike =
          Math.random() < 0.022
            ? isNetRtt
              ? 28.5 + Math.random() * 14.0
              : 9.2 + Math.random() * 5.2
            : 0;
        const base = isNetRtt ? 16.5 : 5.3;
        const floor = isNetRtt ? 10.0 : 3.1;
        const ceil = isNetRtt ? 23.5 : 8.0;
        const val = occasionalSpike || Math.max(floor, Math.min(ceil, base + wave + jitter));

        frameRingBufferRef.current!.push(val);
      }

      if (now - lastSecMark >= 600) {
        const elapsedSec = (now - lastSecMark) / 1000;
        const hz = Math.round(samplesThisWindow / elapsedSec);
        const rendersDelta = reactRenderCountRef.current - lastRenderSnap;
        const rendersPerSec = Math.round(rendersDelta / elapsedSec);

        if (sampleRateReadoutRef.current) {
          sampleRateReadoutRef.current.textContent = `${hz} Hz`;
        }
        if (reactRenderReadoutRef.current) {
          reactRenderReadoutRef.current.textContent = `${rendersPerSec} / sec`;
        }
        samplesThisWindow = 0;
        lastSecMark = now;
        lastRenderSnap = reactRenderCountRef.current;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [telemetryPreset]);

  const injectFrameSpike = () => {
    const isNetRtt = telemetryPreset === 'network-rtt';
    const spikes = isNetRtt ? [31.4, 42.8, 36.2, 27.9] : [14.8, 18.4, 15.2, 11.9];
    frameRingBufferRef.current!.pushBatch(spikes);
  };

  const isNetPreset = telemetryPreset === 'network-rtt';

  return (
    <div
      id="chart-5b-1-sparkline"
      className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-white border-neutral-200 shadow-2xs'
          : 'bg-neutral-900/60 border-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-500" />
          <span className="font-bold text-sm">
            1. 120Hz Zero-allocation telemetry oscilloscope (TelemetrySparklineChart · Float32 RingBuffer)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={<Flame className="h-3.5 w-3.5 text-rose-500" />}
            onClick={injectFrameSpike}
          >
            Injection spike (Inject Spike)
          </Button>
        </div>
      </div>

      <div
        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
          isLight
            ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
            : 'bg-neutral-950/70 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-neutral-400 mr-1">Telemetry data source:</span>
          <button
            type="button"
            onClick={() => setTelemetryPreset('frame-time')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${
              telemetryPreset === 'frame-time'
                ? 'bg-emerald-500 text-neutral-950 border-emerald-400 font-bold'
                : isLight
                  ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <Gauge className="h-3 w-3" />
            <span>120Hz Frame Time (8.33ms Budget)</span>
          </button>
          <button
            type="button"
            onClick={() => setTelemetryPreset('network-rtt')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${
              telemetryPreset === 'network-rtt'
                ? 'bg-emerald-500 text-neutral-950 border-emerald-400 font-bold'
                : isLight
                  ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <Wifi className="h-3 w-3" />
            <span>120Hz Network RTT &amp; Jitter (24.0ms Gate)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-neutral-400">Sample rate:</span>
            <span ref={sampleRateReadoutRef} className="font-bold text-sky-400 tabular-nums">
              120 Hz
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neutral-400">React Re-renders:</span>
            <span ref={reactRenderReadoutRef} className="font-bold text-emerald-400 tabular-nums">
              0 / sec
            </span>
          </div>
        </div>
      </div>

      <p className={`text-xs ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
        Hover over the chart to move the crosshair and inspect time and budget variance frame by
        frame; Click Top-right <strong>Freeze</strong> Freeze at any time 120Hz Waveform:
      </p>

      <TelemetrySparklineChart
        ringBuffer={frameRingBufferRef.current!}
        title={
          isNetPreset
            ? '120Hz Network RTT & Sub-Tick Jitter Telemetry'
            : '120Hz Frame Time & Budget Telemetry'
        }
        budgetMs={isNetPreset ? 24.0 : 8.33}
        refreshHz={120}
        unit="ms"
        showFpsReadout={!isNetPreset}
        isLight={isLight}
        phases={
          isNetPreset
            ? undefined
            : [
                { phase: 'sim', avgMs: 1.42, share: 0.26 },
                { phase: 'scene', avgMs: 1.68, share: 0.31 },
                { phase: 'camera', avgMs: 0.34, share: 0.06 },
                { phase: 'prep', avgMs: 0.58, share: 0.11 },
                { phase: 'bloom', avgMs: 0.89, share: 0.16 },
                { phase: 'final', avgMs: 0.52, share: 0.1 },
              ]
        }
      />
    </div>
  );
};
