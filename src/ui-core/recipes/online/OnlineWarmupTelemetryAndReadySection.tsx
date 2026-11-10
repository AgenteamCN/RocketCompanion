import React, { useState } from 'react';
import {
  Download,
  Eye,
  Ghost,
  Radio,
  SlidersHorizontal,
  Sparkles,
  UserRoundX,
} from 'lucide-react';
import { SettingToggleRow } from '../../compounds/SettingToggleRow';
import { DoubleConfirmServerButton } from './OnlineRoomConfigSummaryCard';
import type { SpectatorRouteEntry } from './DuringMatchSpectatorsSection';

const INITIAL_WARMUP_SPECTATORS: SpectatorRouteEntry[] = [
  {
    id: 'ws-1',
    name: 'Coach_Tracker',
    pingMs: 18,
    pairId: '6C1A',
    fromPlayer: 'OctaneMain_99',
    isDirectHost: false,
    isViaLocalClient: true,
  },
  {
    id: 'ws-2',
    name: 'Analyst_Direct',
    pingMs: 31,
    pairId: '2E9B',
    fromPlayer: 'Host (Direct P2P)',
    isDirectHost: true,
    isViaLocalClient: false,
  },
];

export interface OnlineWarmupTelemetryAndReadySectionProps {
  isHost: boolean;
  onOpenAdvancedManagement?: () => void;
  onExportTrainingReplay?: () => Promise<boolean> | boolean | void;
  onShutdownOrLeave?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const OnlineWarmupTelemetryAndReadySection: React.FC<
  OnlineWarmupTelemetryAndReadySectionProps
> = React.memo(({
  isHost,
  onOpenAdvancedManagement,
  onExportTrainingReplay,
  onShutdownOrLeave,
  onHoverDesc,
  isLight = false,
}) => {
  const [spectators, setSpectators] = useState<SpectatorRouteEntry[]>(
    INITIAL_WARMUP_SPECTATORS
  );
  const [showAdvancedWindow, setShowAdvancedWindow] = useState<boolean>(false);
  const [clientGhostMode, setClientGhostMode] = useState<boolean>(true);
  const [modificationRequested, setModificationRequested] = useState<boolean>(false);
  const [exportStatusLabel, setExportStatusLabel] = useState<string | null>(null);

  const visibleSpectators = isHost
    ? spectators
    : spectators.filter((s) => s.isViaLocalClient);

  const handleRemoveSpectator = (id: string) => {
    setSpectators((prev) => prev.filter((s) => s.id !== id));
  };

  const handleTriggerReplayExport = () => {
    const res = onExportTrainingReplay?.();
    if (res && typeof (res as Promise<boolean>).then === 'function') {
      void (res as Promise<boolean>).then((ok) => {
        setExportStatusLabel(ok ? 'Replay Exported' : 'Replay Export Triggered');
        setTimeout(() => setExportStatusLabel(null), 2200);
      });
    } else {
      setExportStatusLabel('Replay Export Triggered');
      setTimeout(() => setExportStatusLabel(null), 2200);
    }
  };

  return (
    <>
      {/* 3. SPECTATING Section */}
      <div
        data-ui-element="warmup-spectating"
        className="flex flex-col gap-1.5"
        onMouseEnter={() =>
          onHoverDesc?.(
            isHost
              ? 'Spectating: Inspect all spectators watching the warmup session, their upstream route (from player), and Kick/Remove.'
              : 'Spectating via You: See who is observing the warmup session through your client relay and Remove them if needed.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      >
        <div className="flex items-center justify-between text-xs font-mono font-semibold text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {isHost
                ? `SPECTATING (${visibleSpectators.length} Watching)`
                : `SPECTATING VIA YOU (${visibleSpectators.length} Watching)`}
            </span>
          </span>
          <span className="text-[10px]">
            {isHost ? 'Route Diagnostics (from player)' : 'Daisy-Chain Uplink'}
          </span>
        </div>

        <div
          className={`rounded-xl border p-2 flex flex-col gap-1.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200/90'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          {visibleSpectators.length > 0 ? (
            visibleSpectators.map((spec) => (
              <div
                key={spec.id}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                  isLight
                    ? 'bg-white border-neutral-200/90'
                    : 'bg-neutral-950/65 border-neutral-800/90'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Radio
                    className={`h-3.5 w-3.5 shrink-0 ${
                      spec.isDirectHost ? 'text-amber-500' : 'text-emerald-400'
                    }`}
                  />
                  <span
                    className={`truncate font-semibold ${
                      isLight ? 'text-neutral-800' : 'text-neutral-200'
                    }`}
                  >
                    {spec.name}
                  </span>
                  <span className="text-[10px] text-neutral-400 shrink-0">
                    #{spec.pairId}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isHost ? (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        spec.isDirectHost
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-sky-500/15 border-sky-500/35 text-sky-400'
                      }`}
                    >
                      from: {spec.fromPlayer}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      via You ({spec.pingMs}ms)
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveSpectator(spec.id)}
                    className="inline-flex items-center justify-center p-1 rounded-md border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer transition-colors"
                    title="Remove spectator"
                    aria-label={`Remove spectator ${spec.name}`}
                  >
                    <UserRoundX className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-2 text-center text-[11px] font-mono text-neutral-500">
              {isHost
                ? 'No spectators watching this warmup room.'
                : 'No spectators currently observing through your client.'}
            </div>
          )}
        </div>
      </div>

      {/* 3b. Manual Online Training Replay Export (60s FIFO Ring Buffer) */}
      <button
        type="button"
        onClick={handleTriggerReplayExport}
        onMouseEnter={() =>
          onHoverDesc?.(
            'Export Training Replay (60s): Export recent online co-op training frames from the FIFO ring buffer to .rcreplay.gz (Hotkey: F8).'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
        className={`w-full py-2 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer ${
          exportStatusLabel
            ? 'bg-emerald-500/20 border-emerald-500/45 text-emerald-400'
            : isLight
            ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
        }`}
      >
        <Download className="h-3.5 w-3.5 text-emerald-400" />
        <span>{exportStatusLabel ?? 'Export Training Replay (60s · F8)'}</span>
      </button>

      {/* 4. Host vs Client Bottom Section */}
      {isHost ? (
        <>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAdvancedWindow((prev) => !prev);
                onOpenAdvancedManagement?.();
              }}
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Advanced Management: Reserved window interface for advanced online warmup orchestration.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full py-2.5 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                showAdvancedWindow
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-xs'
                  : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
              <span>Advanced Management</span>
            </button>

            {showAdvancedWindow && (
              <div
                data-ui-element="warmup-advanced-management-window"
                className={`rounded-xl border p-3.5 flex flex-col gap-1.5 font-mono text-xs ${
                  isLight
                    ? 'bg-amber-50/50 border-amber-300/80 text-neutral-800'
                    : 'bg-neutral-950/80 border-amber-500/35 text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-500 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>ADVANCED MANAGEMENT WINDOW (INTERFACE RESERVED)</span>
                  </span>
                  <span className="text-[10px] text-neutral-400">API Ready</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Reserved window interface for Online Warmup Host (`onOpenAdvancedManagement`). Future authority controls, drill state broadcasting, and mutator hooks mount here.
                </p>
              </div>
            )}
          </div>

          <DoubleConfirmServerButton
            label="Shutdown Server"
            requireDoubleConfirm={true}
            onConfirm={onShutdownOrLeave}
            onHoverDesc={onHoverDesc}
            isLight={isLight}
          />
        </>
      ) : (
        <>
          <div
            className={`rounded-xl border px-1 py-0.5 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200/90'
                : 'bg-neutral-900/55 border-neutral-800'
            }`}
          >
            <SettingToggleRow
              icon={Ghost}
              iconColor="text-purple-400"
              title="Ghost Mode"
              description="Phase car-to-car collisions for your vehicle (Client-only control; Host cannot toggle Ghost Mode)."
              checked={clientGhostMode}
              onChange={setClientGhostMode}
              bordered={false}
              showDescription={false}
              hoverDescription="Ghost Mode (Client Only): Toggle collision phasing for your car. Only clients can enable Ghost Mode; the Host car remains solid."
              onHover={(desc) => desc && onHoverDesc?.(desc)}
              onLeave={() => onHoverDesc?.(null)}
              isLight={isLight}
            />
          </div>

          <button
            type="button"
            onClick={() => setModificationRequested((prev) => !prev)}
            onMouseEnter={() =>
              onHoverDesc?.(
                'Request Modification: Ask the warmup Host to adjust drill parameters or arena rules.'
              )
            }
            onMouseLeave={() => onHoverDesc?.(null)}
            className={`w-full py-2 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              modificationRequested
                ? 'bg-amber-500/20 border-amber-500/45 text-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
            <span>
              {modificationRequested
                ? 'Modification Request Sent to Host'
                : 'Request Modification'}
            </span>
          </button>

          <DoubleConfirmServerButton
            label="Leave Room"
            requireDoubleConfirm={false}
            onConfirm={onShutdownOrLeave}
            onHoverDesc={onHoverDesc}
            isLight={isLight}
          />
        </>
      )}
    </>
  );
});

OnlineWarmupTelemetryAndReadySection.displayName = 'OnlineWarmupTelemetryAndReadySection';
