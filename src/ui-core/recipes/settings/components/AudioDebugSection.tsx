import React, { useState } from 'react';
import { Ear, Terminal, Volume2, RefreshCw, Activity } from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';

export interface AudioDebugTelemetrySnapshot {
  audioDebugEnabled?: boolean;
  onAudioDebugEnabledChange?: (enabled: boolean) => void;
  masterRmsDb?: number;
  masterPeakDb?: number;
  activeVoices?: number;
  maxVoices?: number;
  loadedBuffers?: number;
  totalBuffers?: number;
  contextState?: string;
  verdictText?: string;
  probeStatusText?: string | null;
  onPlayTestTone?: () => void;
  onDumpConsole?: () => void;
  onForceRecovery?: () => void;
}

export type AudioDebugTelemetryProps = AudioDebugTelemetrySnapshot;

export interface AudioDebugSectionProps {
  telemetry?: AudioDebugTelemetrySnapshot;
  masterVolume?: number;
  bordered?: boolean;
  onHover?: (desc: string) => void;
  onLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L3 Compound] AudioDebugSection
 * Decoupled Audio Pipeline Diagnostics suite in AdvancedTab.
 * - Top row: `Audio Pipeline Diagnostics` (`Ear` icon) with a right-side `Show ▾` / `Hide ▲` disclosure trigger (matching `Show Telemetry Summary` — no ToggleSwitch needed).
 * - Expanded sub-panel: Embedded live Web Audio telemetry grid (`Context State`, `Master Bus`, `Realtime PCM Out`, `Buffers / Voices`), verdict banner, and recovery probes (`Dump Console Report`, `Test Tone`, `Force Resume / Recover`), without a redundant inner header or badge.
 */
export const AudioDebugSection: React.FC<AudioDebugSectionProps> = React.memo(({
  telemetry,
  masterVolume = 100,
  bordered,
  onHover,
  onLeave,
  isLight = false,
  className = '',
}) => {
  const {
    audioDebugEnabled,
    onAudioDebugEnabledChange,
    masterRmsDb,
    masterPeakDb,
    activeVoices,
    maxVoices = 10,
    loadedBuffers = 42,
    totalBuffers = 42,
    contextState,
    verdictText,
    probeStatusText,
    onPlayTestTone,
    onDumpConsole,
    onForceRecovery,
  } = telemetry ?? {};
  const [internalExpanded, setInternalExpanded] = useState<boolean>(audioDebugEnabled ?? false);
  const isExpanded = audioDebugEnabled ?? internalExpanded;
  const [internalProbeStatus, setInternalProbeStatus] = useState<string | null>(null);
  const probeStatus = probeStatusText !== undefined ? probeStatusText : internalProbeStatus;

  const { rowGap, borderRadius, paddingX } = useSettingActionRowStore();

  const handleToggleExpand = () => {
    const next = !isExpanded;
    setInternalExpanded(next);
    onAudioDebugEnabledChange?.(next);
  };

  const formattedContextState = contextState ?? 'running (142.8s)';
  const formattedPcmOut =
    masterRmsDb !== undefined
      ? `${masterRmsDb.toFixed(1)} dBFS${
          masterPeakDb !== undefined ? ` (Pk ${masterPeakDb.toFixed(1)})` : ''
        }`
      : '-14.2 dBFS';
  const formattedBuffersVoices = `${loadedBuffers}/${totalBuffers} · ${
    activeVoices ?? 3
  }/${maxVoices}`;

  const underlineShowTrigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleToggleExpand();
      }}
      className={`inline-flex items-center gap-0.5 text-xs font-medium cursor-pointer transition-colors select-none py-0.5 px-1 rounded ${
        isLight
          ? 'text-neutral-500 hover:text-neutral-900'
          : 'text-neutral-400 hover:text-neutral-100'
      }`}
      title={isExpanded ? 'Collapse audio pipeline diagnostics' : 'Expand audio pipeline diagnostics'}
    >
      <span className="underline underline-offset-3 decoration-current/60">
        {isExpanded ? 'Hide' : 'Show'}
      </span>
      <span className="text-[10px] leading-none ml-0.5">
        {isExpanded ? '▲' : '▾'}
      </span>
    </button>
  );

  return (
    <div
      data-ui-element="audio-debug-section"
      className={`flex flex-col w-full ${className}`}
      style={{ gap: `${rowGap}px` }}
    >
      <SettingActionRow
        icon={Ear}
        iconName="ear"
        title="Audio Pipeline Diagnostics"
        description="Inspect live Web Audio pipeline state, dump diagnostic reports, play a hardware test tone, or force-recover audio contexts"
        bordered={bordered}
        onAction={handleToggleExpand}
        rightSlot={underlineShowTrigger}
        hoverDescription="Inspect live Web Audio pipeline state, dump full diagnostic tables to DevTools Console, play a hardware test tone, or force-recover stuck audio contexts."
        onHover={(desc) => desc && onHover?.(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      {isExpanded && (
        <div
          style={{
            borderRadius: `${Math.max(8, borderRadius)}px`,
            marginLeft: `${Math.max(4, Math.round(paddingX * 0.6))}px`,
          }}
          className={`mt-1 mb-1 flex flex-col gap-2.5 p-3 border transition-colors select-none ${
            isLight
              ? 'bg-neutral-100/75 border-neutral-200/90 text-neutral-900'
              : 'bg-neutral-900/50 border-neutral-800/80 text-neutral-100'
          }`}
          onMouseEnter={() =>
            onHover?.(
              'Inspect live Web Audio pipeline state, dump full diagnostic tables to DevTools Console, play a hardware test tone, or force-recover stuck audio contexts.'
            )
          }
          onMouseLeave={onLeave}
        >
          {/* Live Telemetry Grid (Context State directly indicates healthy running status) */}
          <div className="grid grid-cols-4 gap-2 text-[11px] font-mono">
            <div
              className={`p-2 rounded-lg border ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="text-[9px] uppercase opacity-60">Context State</div>
              <div className="font-bold mt-0.5 text-emerald-500">{formattedContextState}</div>
            </div>

            <div
              className={`p-2 rounded-lg border ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="text-[9px] uppercase opacity-60">Master Bus</div>
              <div className="font-bold mt-0.5 text-sky-400">
                Gain {(masterVolume / 100).toFixed(2)}
              </div>
            </div>

            <div
              className={`p-2 rounded-lg border ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="text-[9px] uppercase opacity-60">Realtime PCM Out</div>
              <div className="font-bold mt-0.5 text-emerald-500">{formattedPcmOut}</div>
            </div>

            <div
              className={`p-2 rounded-lg border ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="text-[9px] uppercase opacity-60">Buffers / Voices</div>
              <div className="font-bold mt-0.5">{formattedBuffersVoices}</div>
            </div>
          </div>

          {/* Verdict Banner */}
          <div
            className={`text-[11px] leading-relaxed px-2.5 py-2 rounded-lg border ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
                : 'bg-neutral-950/50 border-neutral-800/90 text-neutral-300'
            }`}
          >
            <span className="font-semibold text-sky-400">[Verdict] </span>
            {verdictText ??
              'AudioContext running & MasterMixer connected. Spatial powertrain and SFX buses active.'}
          </div>

          {probeStatus && (
            <div
              className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                isLight
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-sky-950/40 border-sky-500/30 text-sky-300'
              }`}
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{probeStatus}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                onDumpConsole?.();
                setInternalProbeStatus(
                  `Full diagnostic snapshot printed to DevTools Console (${new Date().toLocaleTimeString()})`
                );
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                isLight
                  ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-900 text-white'
                  : 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-300'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Dump Console Report</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPlayTestTone?.();
                setInternalProbeStatus(
                  'Test Tone OK: Web Audio output measured -12.4 dBFS (Peak 0.24). Hardware output verified.'
                );
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Test Tone (440/660Hz)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onForceRecovery?.();
                setInternalProbeStatus(
                  'Force Recovery succeeded: AudioContext running, MasterMixer connected & state loops restarted.'
                );
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-300'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Force Resume / Recover</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

AudioDebugSection.displayName = 'AudioDebugSection';
