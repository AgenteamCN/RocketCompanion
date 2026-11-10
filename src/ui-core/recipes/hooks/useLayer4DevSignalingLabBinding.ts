import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useSignalingProfileStore } from '../../stores/signalingProfileStore';
import {
  DEFAULT_PLACEHOLDER_ENDPOINT_CONFIG,
  type CanonicalLabRelayId,
  type Layer4DevSignalingLabRecipeProps,
  type Layer4DevSignalingLabStateOverride,
  type SignalingLabCloudAuditLogItem,
  type SignalingLabCloudStatsView,
  type SignalingLabEndpointViewConfig,
  type SignalingLabPacketTraceItem,
  type SignalingLabProbeSummaryView,
  type SignalingLabScenarioId,
} from '../dev/signalingLabTypes';

export interface DevSignalingLabDualEdgeStatsResult {
  jpEdgeStats: SignalingLabCloudStatsView | null;
  sgEdgeStats: SignalingLabCloudStatsView | null;
  combinedLogs: SignalingLabCloudAuditLogItem[];
}

export interface DevSignalingLabBridgePort {
  getEndpointConfig: () => SignalingLabEndpointViewConfig;
  getTraces: () => SignalingLabPacketTraceItem[];
  clearTraces: () => void;
  subscribe: (listener: () => void) => () => void;
  probeAllRelaysAndDualBridges: (timeoutMs?: number) => Promise<SignalingLabProbeSummaryView>;
  fetchDualEdgeBridgeStats: () => Promise<DevSignalingLabDualEdgeStatsResult>;
  runCloudSelfTest: (roomCode: string) => Promise<{ ok: boolean; summary: string }>;
  runOneClickFullDiagnostic: (
    roomCode: string,
    password: string,
    onProgress: (stepText: string) => void
  ) => Promise<{ ok: boolean; summary: string }>;
  runScenario: (
    scenario: SignalingLabScenarioId,
    sourceRelay: CanonicalLabRelayId,
    targetRelay: CanonicalLabRelayId,
    roomCode: string,
    password: string
  ) => Promise<{ ok: boolean; latencyMs: number; summary: string }>;
}

let activeSignalingLabBridge: DevSignalingLabBridgePort | null = null;

export function registerDevSignalingLabBridge(bridge: DevSignalingLabBridgePort): void {
  activeSignalingLabBridge = bridge;
}

export function useLayer4DevSignalingLabBinding(rawProps: Layer4DevSignalingLabRecipeProps & Layer4DevSignalingLabStateOverride) {
  const storeGoBack = useAppStore((s) => s.goBack);
  const signalingSource = useSignalingProfileStore((s) => s.source);
  const isDevPrivateSource =
    signalingSource === 'dev-private' || rawProps.endpointConfig !== undefined;

  const [, setTick] = useState(0);
  const [probeSummary, setProbeSummary] = useState<SignalingLabProbeSummaryView | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
  const [lastResultBanner, setLastResultBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [roomCodeInput, setRoomCodeInput] = useState('rocket-f');
  const [passwordInput, setPasswordInput] = useState('lab-pass');
  const [customSourceRelay, setCustomSourceRelay] = useState<CanonicalLabRelayId>('emqx_cn');
  const [customTargetRelay, setCustomTargetRelay] = useState<CanonicalLabRelayId>('emqx_gb');

  const roomCode = rawProps.roomCode ?? roomCodeInput;
  const setRoomCode = rawProps.onRoomCodeChange ?? setRoomCodeInput;
  const roomPassword = rawProps.roomPassword ?? passwordInput;
  const setRoomPassword = rawProps.onRoomPasswordChange ?? setPasswordInput;
  const sourceRelay = rawProps.customSourceRelay ?? customSourceRelay;
  const setSourceRelay = rawProps.onCustomSourceRelayChange ?? setCustomSourceRelay;
  const targetRelay = rawProps.customTargetRelay ?? customTargetRelay;
  const setTargetRelay = rawProps.onCustomTargetRelayChange ?? setCustomTargetRelay;

  useEffect(() => {
    if (!isDevPrivateSource || !activeSignalingLabBridge) return;
    return activeSignalingLabBridge.subscribe(() => setTick((n) => n + 1));
  }, [isDevPrivateSource]);

  const syncDualEdgeLogs = useCallback(async () => {
    if (!activeSignalingLabBridge) return;
    const dual = await activeSignalingLabBridge.fetchDualEdgeBridgeStats();
    setProbeSummary((prev) =>
      prev
        ? {
            ...prev,
            jpEdgeStats: dual.jpEdgeStats,
            sgEdgeStats: dual.sgEdgeStats,
            combinedLogs: dual.combinedLogs,
          }
        : prev
    );
  }, []);

  const refreshProbe = useCallback(async () => {
    if (!isDevPrivateSource || !activeSignalingLabBridge) return;
    setIsBusy(true);
    setActiveActionLabel(
      'Probing 4 Canonical Relays (emqx_cn, emqx_gb, supabase_jp, supabase_sg) + Dual Edge Bridges...'
    );
    try {
      const res = await activeSignalingLabBridge.probeAllRelaysAndDualBridges(4500);
      setProbeSummary(res);
      const s = res.slots;
      const allOk = s.emqx_cn.ok && s.emqx_gb.ok && s.supabase_jp.ok && s.supabase_sg.ok;
      setLastResultBanner({
        ok: allOk,
        text: `Probed 4+2 Mesh: emqx_cn=${s.emqx_cn.ok ? `${s.emqx_cn.rttMs}ms` : 'ERR'} | emqx_gb=${
          s.emqx_gb.ok ? `${s.emqx_gb.rttMs}ms` : 'ERR'
        } | supabase_jp=${s.supabase_jp.ok ? `${s.supabase_jp.rttMs}ms` : 'ERR'} | supabase_sg=${
          s.supabase_sg.ok ? `${s.supabase_sg.rttMs}ms` : 'ERR'
        } | Mask=0x${res.computedMask.toString(16).toUpperCase()} (${res.computedMask
          .toString(2)
          .padStart(4, '0')})`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResultBanner({ ok: false, text: msg });
    } finally {
      setIsBusy(false);
      setActiveActionLabel(null);
    }
  }, [isDevPrivateSource]);

  useEffect(() => {
    if (!isDevPrivateSource || !activeSignalingLabBridge) return;
    void refreshProbe();
  }, [isDevPrivateSource, refreshProbe]);

  const handleRunCloudSelfTest = useCallback(async () => {
    if (!activeSignalingLabBridge) return;
    setIsBusy(true);
    setActiveActionLabel('Running Dual Cloud Edge Self-Test (JP + SG -> 4 Relays)...');
    try {
      const report = await activeSignalingLabBridge.runCloudSelfTest(roomCode);
      await syncDualEdgeLogs();
      setLastResultBanner({
        ok: report.ok,
        text: report.summary,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResultBanner({ ok: false, text: msg });
    } finally {
      setIsBusy(false);
      setActiveActionLabel(null);
    }
  }, [roomCode, syncDualEdgeLogs]);

  const handleOneClickFullDiagnostic = useCallback(async () => {
    if (!activeSignalingLabBridge) return;
    setIsBusy(true);
    setActiveActionLabel('Starting One-Click 5-Stage Full Diagnostic...');
    try {
      const res = await activeSignalingLabBridge.runOneClickFullDiagnostic(
        roomCode,
        roomPassword,
        (stepText) => setActiveActionLabel(stepText)
      );
      await syncDualEdgeLogs();
      setLastResultBanner({
        ok: res.ok,
        text: res.summary,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResultBanner({ ok: false, text: msg });
    } finally {
      setIsBusy(false);
      setActiveActionLabel(null);
    }
  }, [roomCode, roomPassword, syncDualEdgeLogs]);

  const handleRunScenario = useCallback(
    async (scenario: SignalingLabScenarioId, label: string) => {
      if (scenario === 'one-click-full-diagnostic') {
        await handleOneClickFullDiagnostic();
        return;
      }
      if (!activeSignalingLabBridge) return;
      setIsBusy(true);
      setActiveActionLabel(label);
      try {
        const res = await activeSignalingLabBridge.runScenario(
          scenario,
          sourceRelay,
          targetRelay,
          roomCode,
          roomPassword
        );
        await syncDualEdgeLogs();
        setLastResultBanner({
          ok: res.ok,
          text: `[${res.latencyMs}ms] ${res.summary}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastResultBanner({ ok: false, text: msg });
      } finally {
        setIsBusy(false);
        setActiveActionLabel(null);
      }
    },
    [handleOneClickFullDiagnostic, roomCode, roomPassword, sourceRelay, syncDualEdgeLogs, targetRelay]
  );

  const bridgeEndpointConfig = activeSignalingLabBridge?.getEndpointConfig();
  const bridgeTraces = activeSignalingLabBridge?.getTraces();

  return {
    isDevPrivateSource,
    isLight: rawProps.isLight ?? false,
    onBack: rawProps.onBack ?? storeGoBack,
    sizing: rawProps.sizing,
    endpointConfig:
      rawProps.endpointConfig ?? bridgeEndpointConfig ?? DEFAULT_PLACEHOLDER_ENDPOINT_CONFIG,
    probeSummary: rawProps.probeSummary ?? probeSummary,
    traces: rawProps.traces ?? bridgeTraces ?? [],
    roomCode,
    onRoomCodeChange: setRoomCode,
    roomPassword,
    onRoomPasswordChange: setRoomPassword,
    customSourceRelay: sourceRelay,
    onCustomSourceRelayChange: setSourceRelay,
    customTargetRelay: targetRelay,
    onCustomTargetRelayChange: setTargetRelay,
    isBusy: rawProps.isBusy ?? isBusy,
    activeActionLabel: rawProps.activeActionLabel ?? activeActionLabel,
    lastResultBanner: rawProps.lastResultBanner ?? lastResultBanner,
    onProbeAll: rawProps.onProbeAll ?? (() => void refreshProbe()),
    onCloudSelfTest: rawProps.onCloudSelfTest ?? (() => void handleRunCloudSelfTest()),
    onOneClickFullDiagnostic:
      rawProps.onOneClickFullDiagnostic ?? (() => void handleOneClickFullDiagnostic()),
    onRunScenario:
      rawProps.onRunScenario ?? ((scenario, label) => void handleRunScenario(scenario, label)),
    onClearTraces:
      rawProps.onClearTraces ?? (() => activeSignalingLabBridge?.clearTraces()),
  };
}
