import React from 'react';
import {
  Activity,
  Copy,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Card } from '../../layout/Card';
import {
  buildEmqxBridgeRuleSql,
  deriveBridgeAccountLabel,
  type SignalingLabCloudAuditLogItem,
  type SignalingLabEndpointViewConfig,
  type SignalingLabPacketTraceItem,
} from './signalingLabTypes';

export interface SignalingLabLiveMonitorsSectionProps {
  isLight: boolean;
  showEmqxRuleGuide: boolean;
  copiedLabel: string | null;
  endpointConfig: SignalingLabEndpointViewConfig;
  traces: SignalingLabPacketTraceItem[];
  combinedLogs: SignalingLabCloudAuditLogItem[];
  onCopyText: (text: string, label: string) => void;
  onClearTraces: () => void;
  onRefreshLogs: () => void;
  onHover: (desc: string | null) => void;
}

export const SignalingLabLiveMonitorsSection: React.FC<SignalingLabLiveMonitorsSectionProps> =
  React.memo(
    ({
      isLight,
      showEmqxRuleGuide,
      copiedLabel,
      endpointConfig,
      traces,
      combinedLogs,
      onCopyText,
      onClearTraces,
      onRefreshLogs,
      onHover,
    }) => {
      const cnBridgeUser = deriveBridgeAccountLabel(
        endpointConfig.slots.emqx_cn.username,
        '<cn_edge_bridge_user>'
      );
      const gbBridgeUser = deriveBridgeAccountLabel(
        endpointConfig.slots.emqx_gb.username,
        '<gb_edge_bridge_user>'
      );
      const cnRuleSql = buildEmqxBridgeRuleSql(endpointConfig.topicNamespace, cnBridgeUser);
      const gbRuleSql = buildEmqxBridgeRuleSql(endpointConfig.topicNamespace, gbBridgeUser);

      const copyBtnClass = `px-2 py-0.5 rounded border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
        isLight
          ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
          : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
      }`;

      return (
        <>
          {showEmqxRuleGuide && (
            <div
              className={`p-2.5 rounded-xl border flex flex-col gap-2 text-xs ${
                isLight
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-950'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-bold uppercase tracking-wider text-[11px] ${
                    isLight ? 'text-amber-800' : 'text-amber-300'
                  }`}
                >
                  EMQX CN &amp; EMQX GB Rule Engine + HTTP Webhook Copy-Paste Config
                </span>
                {copiedLabel && (
                  <span
                    className={`font-semibold text-[11px] ${
                      isLight ? 'text-emerald-700' : 'text-emerald-400'
                    }`}
                  >
                    Copied {copiedLabel}!
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* EMQX CN -> JP Edge */}
                <div
                  className={`p-2 rounded-lg border flex flex-col gap-1 ${
                    isLight
                      ? 'bg-white/90 border-neutral-300 text-neutral-800'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[11px]">
                      1. EMQX_CN -&gt; JP Edge (x-rc-source-relay: emqx_cn)
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopyText(endpointConfig.jpEdgeFunctionUrl, 'JP Webhook URL')}
                      className={copyBtnClass}
                    >
                      <Copy className="h-3 w-3" /> URL
                    </button>
                  </div>
                  <code className="text-[10px] font-mono truncate text-cyan-500">
                    {endpointConfig.jpEdgeFunctionUrl}
                  </code>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] opacity-75">SQL (excludes {cnBridgeUser}):</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(cnRuleSql, 'EMQX_CN Rule SQL')}
                      className={copyBtnClass}
                    >
                      <Copy className="h-3 w-3" /> SQL
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono overflow-x-auto leading-tight text-emerald-500">
                    {cnRuleSql}
                  </pre>
                </div>

                {/* EMQX GB -> SG Edge */}
                <div
                  className={`p-2 rounded-lg border flex flex-col gap-1 ${
                    isLight
                      ? 'bg-white/90 border-neutral-300 text-neutral-800'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[11px]">
                      2. EMQX_GB -&gt; SG Edge (x-rc-source-relay: emqx_gb)
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopyText(endpointConfig.sgEdgeFunctionUrl, 'SG Webhook URL')}
                      className={copyBtnClass}
                    >
                      <Copy className="h-3 w-3" /> URL
                    </button>
                  </div>
                  <code className="text-[10px] font-mono truncate text-emerald-500">
                    {endpointConfig.sgEdgeFunctionUrl}
                  </code>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] opacity-75">SQL (excludes {gbBridgeUser}):</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(gbRuleSql, 'EMQX_GB Rule SQL')}
                      className={copyBtnClass}
                    >
                      <Copy className="h-3 w-3" /> SQL
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono overflow-x-auto leading-tight text-emerald-500">
                    {gbRuleSql}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Dual Live Monitor: Browser Packet Trace + Dual Cloud Edge Audit Log */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <Card
              isLight={isLight}
              variant="outlined"
              padding="sm"
              className="flex flex-col gap-1.5"
              onMouseEnter={() =>
                onHover(
                  'Client Packet Trace: Live browser-side log of outgoing/incoming E2EE dir/+ and brg/+ frames across all 4 servers.'
                )
              }
              onMouseLeave={() => onHover(null)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                    isLight ? 'text-neutral-700' : 'text-neutral-300'
                  }`}
                >
                  <Terminal
                    className={`h-3.5 w-3.5 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}
                  />
                  Client Packet Trace ({traces.length})
                </span>
                <button
                  type="button"
                  onClick={onClearTraces}
                  className={`text-[10px] inline-flex items-center gap-1 cursor-pointer transition-colors ${
                    isLight
                      ? 'text-neutral-500 hover:text-neutral-900'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </div>

              <div className="h-40 overflow-y-auto flex flex-col gap-1 pr-1 font-mono text-[10px]">
                {traces.length === 0 ? (
                  <div
                    className={`py-8 text-center ${
                      isLight ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    Click &ldquo;One-Click Full Diagnostic&rdquo; or any scenario button above.
                  </div>
                ) : (
                  traces.map((t) => (
                    <div
                      key={t.id}
                      className={`p-1.5 rounded border ${
                        t.ok
                          ? isLight
                            ? 'bg-neutral-50 border-neutral-200/90 text-neutral-800'
                            : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
                          : isLight
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-900'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}
                        >
                          [{t.direction}] [{t.channel.toUpperCase()}] {t.relayId}
                        </span>
                        <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
                          hop={t.hop} {t.latencyMs ? `· ${t.latencyMs}ms` : ''}
                        </span>
                      </div>
                      <div
                        className={`break-words mt-0.5 ${
                          isLight ? 'text-neutral-700' : 'text-neutral-300'
                        }`}
                      >
                        {t.summary}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card
              isLight={isLight}
              variant="outlined"
              padding="sm"
              className="flex flex-col gap-1.5"
              onMouseEnter={() =>
                onHover(
                  'Dual Cloud Edge Audit Log: Combined real-time audit logs from both JP (supabase_jp) and SG (supabase_sg) Edge Functions.'
                )
              }
              onMouseLeave={() => onHover(null)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                    isLight ? 'text-neutral-700' : 'text-neutral-300'
                  }`}
                >
                  <Activity
                    className={`h-3.5 w-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
                  />
                  JP + SG Cloud Edge Audit Log ({combinedLogs.length})
                </span>
                <button
                  type="button"
                  onClick={onRefreshLogs}
                  className={`text-[10px] font-semibold hover:underline cursor-pointer ${
                    isLight ? 'text-cyan-700' : 'text-cyan-300'
                  }`}
                >
                  Refresh
                </button>
              </div>

              <div className="h-40 overflow-y-auto flex flex-col gap-1 pr-1 font-mono text-[10px]">
                {combinedLogs.length === 0 ? (
                  <div
                    className={`py-8 text-center ${
                      isLight ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    No cloud bridge events recorded yet.
                  </div>
                ) : (
                  combinedLogs.map((log) => (
                    <div
                      key={`${log.edgeNode || 'edge'}_${log.id}`}
                      className={`p-1.5 rounded border ${
                        log.status === 'forwarded' || log.status === 'self_test'
                          ? isLight
                            ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-neutral-800'
                            : 'bg-emerald-500/10 border-emerald-500/25 text-neutral-200'
                          : log.status === 'ignored'
                          ? isLight
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-900'
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                          : isLight
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-900'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold">
                          [{log.edgeNode || 'edge'}:{log.event}] {log.comingFrom} -&gt;{' '}
                          {log.targets.join(',') || 'dropped'}
                        </span>
                        <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
                          hop={log.hop} {log.latencyMs ? `· ${log.latencyMs}ms` : ''}
                        </span>
                      </div>
                      <div
                        className={`truncate mt-0.5 ${
                          isLight ? 'text-neutral-600' : 'text-neutral-400'
                        }`}
                      >
                        topic={log.topicHash} · {log.detail || log.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      );
    }
  );

SignalingLabLiveMonitorsSection.displayName = 'SignalingLabLiveMonitorsSection';
