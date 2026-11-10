import React, { useRef } from 'react';
import {
  Play,
  Square,
  Rewind,
  FastForward,
  Trash2,
  Timer,
  Upload,
  Download,
} from 'lucide-react';
import { RotateCcwClockIcon } from '../../../navigation/FloatingWindowIcon';
import {
  useRewinderStore,
  type RewinderFlowPreset,
  type RewinderDownCounterOption,
} from '../../../stores/rewinderStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { KeycapBadge } from '../../../primitives/KeycapBadge';

export interface StateReplayBenchPanelProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
}

export const StateReplayBenchPanel: React.FC<StateReplayBenchPanelProps> = ({
  isLight,
  cardBg,
  subPanelBg,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    rewinderState,
    rewinderRecordedFrames,
    rewinderCursorFrame,
    rewinderTargetFrame,
    rewinderDownCounterSec,
    rewinderPrerollRemainingSec,
    rewinderFlowPreset,
    rewinderCustomFlowPct,
    rewinderEffectiveFlowPct,
    setRewinderDownCounterSec,
    setRewinderFlowPreset,
    setRewinderCustomFlowPct,
    runtimeHandlers,
  } = useRewinderStore();

  const minRequiredFrames = rewinderDownCounterSec === 0 ? 120 : 240;
  const canResumeFromHere = rewinderRecordedFrames >= minRequiredFrames;

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <RotateCcwClockIcon className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">Rewinder Configurator</span>
          </div>
          <div className="flex items-center gap-1.5">
            {rewinderState === 'preroll-countdown' && (
              <Badge variant="amber" size="sm" isLight={isLight} className="font-mono text-[10px]">
                COUNTDOWN {rewinderPrerollRemainingSec}s
              </Badge>
            )}
            <Badge
              variant={
                rewinderState === 'recording' || rewinderState === 'preroll-countdown'
                  ? 'amber'
                  : rewinderState === 'idle'
                  ? 'neutral'
                  : 'emerald'
              }
              size="sm"
              isLight={isLight}
              className="font-mono text-[10px] uppercase"
            >
              {rewinderState}
            </Badge>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".gz,.rcreplay,.rcreplay.gz,.json,application/gzip,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              runtimeHandlers.onRewinderImportReplay?.(file);
            }
            e.target.value = '';
          }}
        />

        <div className={`p-2 rounded-lg border font-mono text-[10px] flex flex-col gap-1.5 ${subPanelBg}`}>
          <div className="flex items-center justify-between">
            <span>
              Cursor: <b>Frame #{rewinderCursorFrame}</b> ({(rewinderCursorFrame / 120).toFixed(2)}s)
            </span>
            <span>
              Recorded: <b>{rewinderRecordedFrames}f</b> ({(rewinderRecordedFrames / 120).toFixed(2)}s)
            </span>
          </div>
          <div className="flex items-center justify-between text-[9.5px] opacity-80">
            <span>
              Release Marker: <b>Frame #{rewinderTargetFrame}</b> ({(rewinderTargetFrame / 120).toFixed(2)}s)
            </span>
            <span className={canResumeFromHere ? 'text-emerald-400' : 'text-amber-400'}>
              {canResumeFromHere
                ? `Ready (>= ${minRequiredFrames}f / ${(minRequiredFrames / 120).toFixed(1)}s)`
                : `Need >= ${minRequiredFrames}f (${Math.max(0, minRequiredFrames - rewinderRecordedFrames)}f more)`}
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (rewinderRecordedFrames <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetF = Math.round(pct * rewinderRecordedFrames);
              runtimeHandlers.onRewinderSeekFrame?.(targetF);
            }}
            title="Click to seek frame"
          >
            <div
              className="h-full bg-amber-400 transition-all duration-75 pointer-events-none"
              style={{
                width: `${
                  rewinderRecordedFrames > 0
                    ? Math.min(100, Math.max(0, (rewinderCursorFrame / rewinderRecordedFrames) * 100))
                    : 0
                }%`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button
            variant={rewinderState === 'recording' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => runtimeHandlers.onRewinderStartRecording?.()}
            isLight={isLight}
            className="justify-between px-2.5 py-1.5 text-[11px]"
          >
            <span className="flex items-center gap-1.5">
              <Play className="h-3 w-3 fill-current text-rose-400" />
              <span>New Recording</span>
            </span>
            <KeycapBadge label="O" size="sm" isLight={isLight} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onRewinderStopRecording?.()}
            isLight={isLight}
            className="justify-between px-2.5 py-1.5 text-[11px]"
          >
            <span className="flex items-center gap-1.5">
              <Square className="h-3 w-3 fill-current" />
              <span>Stop Rec</span>
            </span>
            <KeycapBadge label="P" size="sm" isLight={isLight} />
          </Button>

          <button
            type="button"
            onMouseDown={() => runtimeHandlers.onRewinderPushBackwardStart?.()}
            onMouseUp={() => runtimeHandlers.onRewinderPushBackwardStop?.()}
            onMouseLeave={() => runtimeHandlers.onRewinderPushBackwardStop?.()}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer active:scale-95 transition-all ${
              rewinderState === 'rewinding'
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Rewind className="h-3.5 w-3.5" />
              <span>Hold Rewind</span>
            </span>
            <KeycapBadge label="[" size="sm" isLight={isLight} />
          </button>

          <button
            type="button"
            onMouseDown={() => runtimeHandlers.onRewinderPushForwardStart?.()}
            onMouseUp={() => runtimeHandlers.onRewinderPushForwardStop?.()}
            onMouseLeave={() => runtimeHandlers.onRewinderPushForwardStop?.()}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer active:scale-95 transition-all ${
              rewinderState === 'forwarding'
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <FastForward className="h-3.5 w-3.5" />
              <span>Hold Forward</span>
            </span>
            <KeycapBadge label="]" size="sm" isLight={isLight} />
          </button>
        </div>

        {/* Replay Import & Export */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            isLight={isLight}
            className="gap-1.5 py-1.5 text-[11px]"
          >
            <Upload className="h-3.5 w-3.5 text-sky-400" />
            <span>Import Replay</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={rewinderRecordedFrames === 0}
            onClick={() => runtimeHandlers.onRewinderExportReplay?.()}
            isLight={isLight}
            className="gap-1.5 py-1.5 text-[11px]"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            <span>Export Replay</span>
          </Button>
        </div>

        {/* Down Counter (3 / 2 / 1 / 0) Segmented Control */}
        <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${subPanelBg}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-[11px]">
              <Timer className="h-3.5 w-3.5 text-sky-400" />
              <span>Down Counter</span>
            </span>
            <span className="font-mono text-[10px] opacity-75">
              {rewinderDownCounterSec === 0
                ? 'Replays from -1s (120f, immediate 1s beep)'
                : `Replays from -${(rewinderDownCounterSec || 0) + 1}s (${((rewinderDownCounterSec || 0) + 1) * 120}f)`}
            </span>
          </div>
          <SegmentedSwitch
            value={String(rewinderDownCounterSec ?? 0)}
            fullWidth
            size="sm"
            isLight={isLight}
            onValueChange={(v) => setRewinderDownCounterSec(Number(v) as RewinderDownCounterOption)}
            options={[
              { value: '3', label: '3 (-4s)' },
              { value: '2', label: '2 (-3s)' },
              { value: '1', label: '1 (-2s)' },
              { value: '0', label: '0 (-1s)' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={!canResumeFromHere}
            onClick={() => runtimeHandlers.onRewinderResumeFromHere?.()}
            isLight={isLight}
            className="justify-between px-2.5 py-1.5 text-[11px] font-bold"
          >
            <span className="flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Resume From Here</span>
            </span>
            <KeycapBadge label="G" size="sm" isLight={isLight} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              (runtimeHandlers.onRewinderClearBuffer ?? runtimeHandlers.onRewinderCancelToFreeplay)?.()
            }
            isLight={isLight}
            className="gap-1.5 py-1.5 text-[11px]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Buffer</span>
          </Button>
        </div>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[11px]">Rewind / Forward Flow Speed</span>
          <Badge variant="neutral" size="sm" isLight={isLight} className="font-mono text-[10px]">
            {rewinderEffectiveFlowPct}% ({Math.round((120 * rewinderEffectiveFlowPct) / 100)} fps)
          </Badge>
        </div>

        <SegmentedSwitch
          value={rewinderFlowPreset}
          fullWidth
          size="sm"
          isLight={isLight}
          onValueChange={(v) => setRewinderFlowPreset(v as RewinderFlowPreset)}
          options={[
            { value: '100', label: '100%' },
            { value: '75', label: '75%' },
            { value: '50', label: '50%' },
            { value: '25', label: '25%' },
            { value: 'custom', label: 'Custom' },
          ]}
        />

        {rewinderFlowPreset === 'custom' && (
          <div className={`p-2 rounded-lg border ${subPanelBg}`}>
            <SliderControl
              label={`Custom Flow Speed (${rewinderCustomFlowPct}%)`}
              value={rewinderCustomFlowPct}
              min={5}
              max={200}
              step={5}
              unit="%"
              showStepper={true}
              colorScheme="neutral"
              isLight={isLight}
              onChange={(val) => setRewinderCustomFlowPct(val)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
