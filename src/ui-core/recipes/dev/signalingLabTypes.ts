import type { StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';
import type { PanelSizingConfig } from '../../tokens/menuLayoutTokens';

export type CanonicalLabRelayId = 'emqx_cn' | 'emqx_gb' | 'supabase_jp' | 'supabase_sg';
export type CanonicalLabEdgeNodeId = 'supabase_jp' | 'supabase_sg';

export type SignalingLabScenarioId =
  | 'emqx-cn-direct'
  | 'emqx-gb-direct'
  | 'supabase-jp-direct'
  | 'supabase-sg-direct'
  | 'bridge-jp-to-cn'
  | 'bridge-sg-to-gb'
  | 'bridge-cn-to-jp'
  | 'bridge-gb-to-sg'
  | 'bridge-cn-to-gb'
  | 'bridge-jp-to-sg'
  | 'bridge-custom-pair'
  | 'anti-loop-torture'
  | 'one-click-full-diagnostic';

export interface SignalingLabSlotViewItem {
  id: CanonicalLabRelayId;
  label: string;
  bit: number;
  protocol: 'mqtt' | 'supabase';
  url: string;
  username: string;
  edgeNodeId: CanonicalLabEdgeNodeId;
  edgeFunctionBridgeUrl: string;
  ok: boolean;
  rttMs: number;
  error: string | null;
}

export interface SignalingLabEndpointViewConfig {
  topicNamespace: string;
  jpEdgeFunctionUrl: string;
  sgEdgeFunctionUrl: string;
  slots: Record<CanonicalLabRelayId, SignalingLabSlotViewItem>;
}

export interface SignalingLabPacketTraceItem {
  id: string;
  ts: number;
  direction: 'TX' | 'RX' | 'BRG' | 'GUARD' | 'SYS';
  channel: 'dir' | 'brg' | 'edge' | 'crypto';
  relayId: string;
  topic: string;
  hop: number;
  summary: string;
  latencyMs?: number;
  ok: boolean;
}

export interface SignalingLabCloudAuditLogItem {
  id: string;
  ts: number;
  edgeNode?: CanonicalLabEdgeNodeId;
  event: string;
  topicHash: string;
  comingFrom: string;
  targets: string[];
  hop: number;
  msgId: string;
  status: string;
  detail?: string;
  latencyMs?: number;
}

export interface SignalingLabCloudStatsView {
  ok: boolean;
  edgeNode: CanonicalLabEdgeNodeId;
  totalForwardedCount: number;
  totalDroppedLoopCount: number;
  totalRateLimitedCount: number;
  dedupCacheSize: number;
  warmMqttConnections: number;
  logs: SignalingLabCloudAuditLogItem[];
}

export interface SignalingLabProbeSummaryView {
  slots: Record<CanonicalLabRelayId, SignalingLabSlotViewItem>;
  computedMask: number;
  sampleRandomCode: string;
  sampleCustomCode: string;
  jpEdgeStats: SignalingLabCloudStatsView | null;
  sgEdgeStats: SignalingLabCloudStatsView | null;
  combinedLogs: SignalingLabCloudAuditLogItem[];
}

export interface Layer4DevSignalingLabStateOverride {
  sizing?: PanelSizingConfig;
  endpointConfig?: SignalingLabEndpointViewConfig;
  probeSummary?: SignalingLabProbeSummaryView | null;
  traces?: SignalingLabPacketTraceItem[];
  roomCode?: string;
  onRoomCodeChange?: (next: string) => void;
  roomPassword?: string;
  onRoomPasswordChange?: (next: string) => void;
  customSourceRelay?: CanonicalLabRelayId;
  onCustomSourceRelayChange?: (next: CanonicalLabRelayId) => void;
  customTargetRelay?: CanonicalLabRelayId;
  onCustomTargetRelayChange?: (next: CanonicalLabRelayId) => void;
  isBusy?: boolean;
  activeActionLabel?: string | null;
  lastResultBanner?: { ok: boolean; text: string } | null;
  onProbeAll?: () => void;
  onCloudSelfTest?: () => void;
  onOneClickFullDiagnostic?: () => void;
  onRunScenario?: (scenario: SignalingLabScenarioId, label: string) => void;
  onClearTraces?: () => void;
}

export interface Layer4DevSignalingLabRecipeProps extends StandardSurfaceProps {
  sizing?: PanelSizingConfig;
  stateOverride?: Layer4DevSignalingLabStateOverride;
  className?: string;
}

export const DEFAULT_PLACEHOLDER_ENDPOINT_CONFIG: SignalingLabEndpointViewConfig = {
  topicNamespace: '<topic_namespace>',
  jpEdgeFunctionUrl: 'https://relay-jp.carball.dev/functions/v1/signaling-bridge',
  sgEdgeFunctionUrl: 'https://relay-sg.carball.dev/functions/v1/signaling-bridge',
  slots: {
    emqx_cn: {
      id: 'emqx_cn',
      label: 'EMQX_CN (Hangzhou)',
      bit: 8,
      protocol: 'mqtt',
      url: 'wss://emqx-cn.carball.dev:8084/mqtt',
      username: '',
      edgeNodeId: 'supabase_jp',
      edgeFunctionBridgeUrl: 'https://relay-jp.carball.dev/functions/v1/signaling-bridge',
      ok: false,
      rttMs: 0,
      error: null,
    },
    emqx_gb: {
      id: 'emqx_gb',
      label: 'EMQX_GB (Asia-SE1)',
      bit: 4,
      protocol: 'mqtt',
      url: 'wss://emqx-gb.carball.dev:8084/mqtt',
      username: '',
      edgeNodeId: 'supabase_sg',
      edgeFunctionBridgeUrl: 'https://relay-sg.carball.dev/functions/v1/signaling-bridge',
      ok: false,
      rttMs: 0,
      error: null,
    },
    supabase_jp: {
      id: 'supabase_jp',
      label: 'SUPABASE_JP (Tokyo RTJP)',
      bit: 2,
      protocol: 'supabase',
      url: 'https://relay-jp.carball.dev',
      username: '',
      edgeNodeId: 'supabase_jp',
      edgeFunctionBridgeUrl: 'https://relay-jp.carball.dev/functions/v1/signaling-bridge',
      ok: false,
      rttMs: 0,
      error: null,
    },
    supabase_sg: {
      id: 'supabase_sg',
      label: 'SUPABASE_SG (Singapore RTSG)',
      bit: 1,
      protocol: 'supabase',
      url: 'https://relay-sg.carball.dev',
      username: '',
      edgeNodeId: 'supabase_sg',
      edgeFunctionBridgeUrl: 'https://relay-sg.carball.dev/functions/v1/signaling-bridge',
      ok: false,
      rttMs: 0,
      error: null,
    },
  },
};

export function deriveBridgeAccountLabel(clientUsername: string, fallback: string): string {
  const clean = (clientUsername || '').trim();
  if (!clean) return fallback;
  if (/client/i.test(clean)) {
    return clean.replace(/client/i, 'EdgeBridge');
  }
  return `${clean}_bridge`;
}

export function buildEmqxBridgeRuleSql(
  topicNamespace: string,
  bridgeUser = '<bridge_mqtt_username>'
): string {
  const cleanNs = (topicNamespace || '<topic_namespace>').replace(/\/+$/, '');
  return `SELECT
  topic,
  payload,
  username,
  clientid,
  timestamp
FROM
  "${cleanNs}/brg/+"
WHERE
  username <> '${bridgeUser}'`;
}
