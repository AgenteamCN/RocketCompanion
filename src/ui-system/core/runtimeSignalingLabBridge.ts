import {
  signalingFourServerLoopbackHarness,
  type CanonicalRelayId,
} from '../../network/transport/diagnostics/SignalingFourServerLoopbackHarness.ts';
import { executeFiveLayerAntiLoopTorture } from '../../network/transport/diagnostics/signalingFourServerProbe.ts';
import { deriveDeterministicRoomContext } from '../../network/transport/SignalingCryptoSession.ts';
import { registerDevSignalingLabBridge } from '../../ui-core/recipes/hooks/useLayer4DevSignalingLabBinding.ts';

export function ensureDevSignalingLabBridge(): void {
  registerDevSignalingLabBridge({
    getEndpointConfig: () => {
      const cfg = signalingFourServerLoopbackHarness.config;
      return {
        topicNamespace: cfg.topicNamespace,
        jpEdgeFunctionUrl: cfg.jpEdgeFunctionUrl,
        sgEdgeFunctionUrl: cfg.sgEdgeFunctionUrl,
        slots: {
          emqx_cn: { ...cfg.slots.emqx_cn, ok: false, rttMs: 0, error: null },
          emqx_gb: { ...cfg.slots.emqx_gb, ok: false, rttMs: 0, error: null },
          supabase_jp: { ...cfg.slots.supabase_jp, ok: false, rttMs: 0, error: null },
          supabase_sg: { ...cfg.slots.supabase_sg, ok: false, rttMs: 0, error: null },
        },
      };
    },
    getTraces: () => signalingFourServerLoopbackHarness.traces,
    clearTraces: () => signalingFourServerLoopbackHarness.clearTraces(),
    subscribe: (listener) => signalingFourServerLoopbackHarness.subscribe(listener),
    probeAllRelaysAndDualBridges: (timeoutMs = 4500) =>
      signalingFourServerLoopbackHarness.probeAllRelaysAndDualBridges(timeoutMs),
    fetchDualEdgeBridgeStats: () => signalingFourServerLoopbackHarness.fetchDualEdgeBridgeStats(),
    runCloudSelfTest: (roomCode) => signalingFourServerLoopbackHarness.runCloudSelfTest(roomCode),
    runOneClickFullDiagnostic: (roomCode, password, onProgress) =>
      signalingFourServerLoopbackHarness.runOneClickFullDiagnostic(roomCode, password, onProgress),
    runScenario: async (scenario, customSourceRelay, customTargetRelay, roomCode, password) => {
      if (scenario === 'anti-loop-torture') {
        const ctx = await deriveDeterministicRoomContext(roomCode, password);
        const cfg = signalingFourServerLoopbackHarness.config;
        return executeFiveLayerAntiLoopTorture(
          cfg.jpEdgeFunctionUrl,
          ctx.topicHash,
          cfg.topicNamespace,
          performance.now()
        );
      }

      const pairMap: Record<string, { src: CanonicalRelayId; dst: CanonicalRelayId; bi: boolean }> =
        {
          'emqx-cn-direct': { src: 'emqx_cn', dst: 'emqx_cn', bi: false },
          'emqx-gb-direct': { src: 'emqx_gb', dst: 'emqx_gb', bi: false },
          'supabase-jp-direct': { src: 'supabase_jp', dst: 'supabase_jp', bi: false },
          'supabase-sg-direct': { src: 'supabase_sg', dst: 'supabase_sg', bi: false },
          'bridge-jp-to-cn': { src: 'supabase_jp', dst: 'emqx_cn', bi: false },
          'bridge-sg-to-gb': { src: 'supabase_sg', dst: 'emqx_gb', bi: false },
          'bridge-cn-to-jp': { src: 'emqx_cn', dst: 'supabase_jp', bi: false },
          'bridge-gb-to-sg': { src: 'emqx_gb', dst: 'supabase_sg', bi: false },
          'bridge-cn-to-gb': { src: 'emqx_cn', dst: 'emqx_gb', bi: false },
          'bridge-jp-to-sg': { src: 'supabase_jp', dst: 'supabase_sg', bi: false },
          'bridge-custom-pair': {
            src: customSourceRelay,
            dst: customTargetRelay,
            bi: customSourceRelay !== customTargetRelay,
          },
        };

      const targetPair = pairMap[scenario] || {
        src: customSourceRelay,
        dst: customTargetRelay,
        bi: true,
      };
      return signalingFourServerLoopbackHarness.runPairScenario(
        targetPair.src,
        targetPair.dst,
        targetPair.bi,
        roomCode,
        password
      );
    },
  });
}
