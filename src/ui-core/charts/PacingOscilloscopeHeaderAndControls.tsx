import React from 'react';
import { Activity, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { PACING_EVENT_FLAGS, PacingRingBuffer } from './pacingRingBuffer';

export function createSeededPacingRingBuffer(capacity = 360): PacingRingBuffer {
  const buf = new PacingRingBuffer(capacity);
  let rtt = 26;
  let eff = 3.0;
  for (let i = 0; i < 240; i++) {
    const spike = i === 110 || i === 111 ? 28 : 0;
    rtt = 26 + Math.sin(i * 0.08) * 3.5 + (Math.random() - 0.5) * 2.2 + spike;
    const tgt = 3.0;
    const srv = spike > 0 ? -0.5 : 3.0 + Math.sin(i * 0.06) * 1.1;
    eff = eff * 0.82 + srv * 0.18;
    const err = eff - tgt;
    const rate = Math.max(115, Math.min(125, 120 - err * 0.85));
    const flags =
      srv < 0
        ? PACING_EVENT_FLAGS.STARVATION
        : spike > 0
        ? PACING_EVENT_FLAGS.JITTER_SPIKE
        : 0;
    buf.push({
      rawRttMs: rtt,
      serverBuffer: srv,
      effectiveBuffer: eff,
      targetBuffer: tgt,
      physicsRateHz: rate,
      eventFlags: flags,
    });
  }
  return buf;
}

export interface PacingOscilloscopeHeaderBarProps {
  isLight: boolean;
  rttBadgeRef: React.RefObject<HTMLSpanElement | null>;
  bufBadgeRef: React.RefObject<HTMLSpanElement | null>;
  rateBadgeRef: React.RefObject<HTMLSpanElement | null>;
}

export const PacingOscilloscopeHeaderBar: React.FC<PacingOscilloscopeHeaderBarProps> =
  React.memo(({ isLight, rttBadgeRef, bufBadgeRef, rateBadgeRef }) => {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-500" />
          <span className="font-bold text-xs tracking-tight">
            3-Pane Network Clock-Pacing & Buffer Deadband Oscilloscope
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            Float32 RingBuffer · 0 VDOM Diff
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-sky-500 font-semibold">
            EWMA: <b ref={rttBadgeRef}>26.0 ms</b>
          </span>
          <span className="opacity-30">|</span>
          <span className="text-emerald-500 font-semibold">
            Buf: <b ref={bufBadgeRef}>3.0 ticks</b>
          </span>
          <span className="opacity-30">|</span>
          <span className="text-amber-500 font-semibold">
            Rate: <b ref={rateBadgeRef}>120.0 Hz</b>
          </span>
        </div>
      </div>
    );
  });

PacingOscilloscopeHeaderBar.displayName = 'PacingOscilloscopeHeaderBar';

export interface PacingOscilloscopeFooterBarProps {
  isEmbedded: boolean;
  isLight: boolean;
  isFrozen: boolean;
  showInjectStarvation: boolean;
  onInjectStarvation: () => void;
  onToggleFreeze: () => void;
  onClearBuffer: () => void;
}

export const PacingOscilloscopeFooterBar: React.FC<PacingOscilloscopeFooterBarProps> =
  React.memo(
    ({
      isEmbedded,
      isLight,
      isFrozen,
      showInjectStarvation,
      onInjectStarvation,
      onToggleFreeze,
      onClearBuffer,
    }) => {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
          <div className="flex items-center gap-3 font-mono text-[10px] opacity-80">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />{' '}
              {isEmbedded ? 'RTT' : 'RTT / EWMA'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />{' '}
              {isEmbedded ? 'Lead Buffer' : 'Eff. Buffer & Deadband'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />{' '}
              {isEmbedded ? 'Physics Rate' : 'Clock Rate (Hz)'}
            </span>
            {!isEmbedded && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-rose-500/60 inline-block" /> Starvation (&lt;0t)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            {showInjectStarvation && (
              <button
                type="button"
                onClick={onInjectStarvation}
                className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
                }`}
              >
                <Zap className="h-3 w-3" />
                <span>Inject Starvation + Resync</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleFreeze}
              className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isFrozen
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                  : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              {isFrozen ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              <span>{isFrozen ? 'Resume' : 'Freeze'}</span>
            </button>

            <button
              type="button"
              onClick={onClearBuffer}
              className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
              title="Clear / Reset Oscilloscope RingBuffer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      );
    }
  );

PacingOscilloscopeFooterBar.displayName = 'PacingOscilloscopeFooterBar';
