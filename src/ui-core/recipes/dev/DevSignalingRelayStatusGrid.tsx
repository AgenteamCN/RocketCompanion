import React from 'react';
import { Database, Server, ShieldCheck } from 'lucide-react';
import { Card } from '../../layout/Card';
import type {
  CanonicalLabRelayId,
  SignalingLabEndpointViewConfig,
  SignalingLabProbeSummaryView,
  SignalingLabScenarioId,
} from './signalingLabTypes';

export interface DevSignalingRelayStatusGridProps {
  isLight: boolean;
  endpointConfig: SignalingLabEndpointViewConfig;
  probeSummary: SignalingLabProbeSummaryView | null;
  isBusy: boolean;
  customSourceRelay: CanonicalLabRelayId;
  onCustomSourceRelayChange: (next: CanonicalLabRelayId) => void;
  customTargetRelay: CanonicalLabRelayId;
  onCustomTargetRelayChange: (next: CanonicalLabRelayId) => void;
  onRunScenario: (scenario: SignalingLabScenarioId, label: string) => void;
  onHover: (desc: string | null) => void;
}

const CANONICAL_SLOT_KEYS: readonly CanonicalLabRelayId[] = [
  'emqx_cn',
  'emqx_gb',
  'supabase_jp',
  'supabase_sg',
];

export const DevSignalingRelayStatusGrid: React.FC<DevSignalingRelayStatusGridProps> = React.memo(
  ({
    isLight,
    endpointConfig,
    probeSummary,
    isBusy,
    customSourceRelay,
    onCustomSourceRelayChange,
    customTargetRelay,
    onCustomTargetRelayChange,
    onRunScenario,
    onHover,
  }) => {
    const maskVal = probeSummary?.computedMask ?? 0;
    const jpStats = probeSummary?.jpEdgeStats;
    const sgStats = probeSummary?.sgEdgeStats;

    const statusBadgeClass = (ok: boolean | undefined) =>
      ok
        ? isLight
          ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/35'
          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        : isLight
        ? 'bg-rose-500/15 text-rose-800 border-rose-500/35'
        : 'bg-rose-500/20 text-rose-300 border-rose-500/30';

    const pillClass = isLight
      ? 'px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200/80 text-neutral-700'
      : 'px-1.5 py-0.5 rounded bg-neutral-900/70 border border-neutral-800 text-neutral-300';

    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          {CANONICAL_SLOT_KEYS.map((slotKey) => {
            const cfgSlot = endpointConfig.slots[slotKey];
            const probedSlot = probeSummary?.slots?.[slotKey];
            const isOnline = probedSlot?.ok;
            const rttMs = probedSlot?.rttMs ?? 0;
            const isMqtt = cfgSlot.protocol === 'mqtt';
            const shortHost = cfgSlot.url
              .replace(/^wss?:\/\//, '')
              .replace(/^https?:\/\//, '')
              .replace(/\/mqtt$/, '');

            return (
              <Card
                key={slotKey}
                isLight={isLight}
                variant="outlined"
                padding="sm"
                className="flex flex-col gap-1"
                onMouseEnter={() =>
                  onHover(
                    `${cfgSlot.label} (Bit=${cfgSlot.bit}): ${cfgSlot.url} | Inbound Edge: ${cfgSlot.edgeNodeId}`
                  )
                }
                onMouseLeave={() => onHover(null)}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[11px] font-bold font-mono inline-flex items-center gap-1 whitespace-nowrap ${
                      isLight ? 'text-neutral-800' : 'text-neutral-200'
                    }`}
                  >
                    {isMqtt ? (
                      <Server
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isLight ? 'text-purple-600' : 'text-purple-400'
                        }`}
                      />
                    ) : (
                      <Database
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isLight ? 'text-emerald-600' : 'text-emerald-400'
                        }`}
                      />
                    )}
                    <span>
                      {slotKey} ({cfgSlot.bit})
                    </span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusBadgeClass(
                      isOnline
                    )}`}
                  >
                    {isOnline ? `${rttMs}ms` : probeSummary ? 'ERR' : 'IDLE'}
                  </span>
                </div>
                <div
                  title={cfgSlot.url}
                  className={`text-[10px] font-mono truncate ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  {shortHost}
                </div>
                <div
                  className={`text-[10px] flex items-center justify-between gap-1 ${
                    isLight ? 'text-neutral-600' : 'text-neutral-400'
                  }`}
                >
                  <span className="font-mono whitespace-nowrap">
                    {isMqtt ? cfgSlot.username : 'Phoenix RT'}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] opacity-85 whitespace-nowrap">
                    -&gt; <b>{cfgSlot.edgeNodeId}</b>
                  </span>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0">
          <Card isLight={isLight} variant="outlined" padding="sm" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap ${
                  isLight ? 'text-neutral-800' : 'text-neutral-200'
                }`}
              >
                <ShieldCheck
                  className={`h-3.5 w-3.5 shrink-0 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}
                />
                <span>JP EDGE (supabase_jp)</span>
              </span>
              <span className="text-[10px] font-mono text-cyan-500 font-bold whitespace-nowrap">
                cn + jp
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className={pillClass}>Fwd: <b>{jpStats?.totalForwardedCount ?? 0}</b></div>
              <div className={pillClass}>Blk: <b>{jpStats?.totalDroppedLoopCount ?? 0}</b></div>
              <div className={pillClass}>Warm: <b>{jpStats?.warmMqttConnections ?? 0}</b></div>
            </div>
          </Card>

          <Card isLight={isLight} variant="outlined" padding="sm" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap ${
                  isLight ? 'text-neutral-800' : 'text-neutral-200'
                }`}
              >
                <ShieldCheck
                  className={`h-3.5 w-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
                />
                <span>SG EDGE (supabase_sg)</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-500 font-bold whitespace-nowrap">
                gb + sg
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className={pillClass}>Fwd: <b>{sgStats?.totalForwardedCount ?? 0}</b></div>
              <div className={pillClass}>Blk: <b>{sgStats?.totalDroppedLoopCount ?? 0}</b></div>
              <div className={pillClass}>Warm: <b>{sgStats?.warmMqttConnections ?? 0}</b></div>
            </div>
          </Card>

          <Card isLight={isLight} variant="outlined" padding="sm" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[11px] font-bold whitespace-nowrap ${
                  isLight ? 'text-neutral-800' : 'text-neutral-200'
                }`}
              >
                MASK: 0x{maskVal.toString(16).toUpperCase()} ({maskVal.toString(2).padStart(4, '0')})
              </span>
              <span
                className={`text-[10px] font-mono whitespace-nowrap ${
                  isLight ? 'text-cyan-700' : 'text-cyan-300'
                }`}
              >
                {probeSummary?.sampleRandomCode || '----'} / {probeSummary?.sampleCustomCode || 'rocket-f'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <select
                value={customSourceRelay}
                onChange={(e) => onCustomSourceRelayChange(e.target.value as CanonicalLabRelayId)}
                className={`min-w-0 flex-1 px-1 py-0.5 rounded border font-mono text-[10px] outline-none ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-800'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-200'
                }`}
              >
                {CANONICAL_SLOT_KEYS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <span className="shrink-0 font-mono opacity-60">-&gt;</span>
              <select
                value={customTargetRelay}
                onChange={(e) => onCustomTargetRelayChange(e.target.value as CanonicalLabRelayId)}
                className={`min-w-0 flex-1 px-1 py-0.5 rounded border font-mono text-[10px] outline-none ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-800'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-200'
                }`}
              >
                {CANONICAL_SLOT_KEYS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  onRunScenario(
                    'bridge-custom-pair',
                    `Testing ${customSourceRelay} <-> ${customTargetRelay} 2-Way Handshake...`
                  )
                }
                className={`shrink-0 px-2 py-0.5 rounded font-bold border cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                  isLight
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-800'
                    : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                }`}
              >
                Run Pair
              </button>
            </div>
          </Card>
        </div>
      </>
    );
  }
);

DevSignalingRelayStatusGrid.displayName = 'DevSignalingRelayStatusGrid';
