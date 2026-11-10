/**
 * signalingDiagnosticsProbe.ts
 * MQTT and WebSocket signaling connectivity diagnostic probes.
 */

import { buildMqttConnectPacket, MQTT_DISCONNECT_PACKET } from '../mqttPacketCodec.ts';
import {
  DEFAULT_SIGNALING_URL,
  detectSignalingProtocol,
  getSignalingRelays,
  getSignalingTopicNamespace,
  getSignalingUrl,
  resolveSignalingRelayCredentials,
} from '../signalingRelayConfig.ts';
import { SupabaseRealtimeSignalingClient } from '../SupabaseRealtimeSignalingClient.ts';

export interface SignalingProbeResult {
  ok: boolean;
  rttMs: number;
  error: string | null;
}

export interface SignalingRelayDiagnosticSummary extends SignalingProbeResult {
  id: string;
  label: string;
  url: string;
  protocol: string;
}

export async function testSignalingConnectivity(
  endpointUrl: string | null = null,
  timeoutMs = 5000,
  credentials: { username?: string; password?: string; authToken?: string } | null = null
): Promise<SignalingProbeResult> {
  const rawUrl = (endpointUrl || getSignalingUrl() || DEFAULT_SIGNALING_URL).trim();
  if (!rawUrl) {
    return {
      ok: false,
      rttMs: 0,
      error:
        'No signaling endpoint configured. Import a .rctbnspib profile in Settings → Advanced.',
    };
  }
  const protocol = detectSignalingProtocol(rawUrl);
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { username, password, authToken } = resolveSignalingRelayCredentials(rawUrl, credentials);

  if (protocol === 'supabase') {
    const probeHash = `diag_${Math.random().toString(36).slice(2, 10)}`;
    const client = new SupabaseRealtimeSignalingClient(rawUrl, {
      relayId: 'supabase_diag',
      relayLabel: rawUrl,
      topicHash: probeHash,
      channelTopic: `${getSignalingTopicNamespace()}:dir:${probeHash}`,
      anonKey: authToken || password || '',
    });
    try {
      await client.connect(timeoutMs);
      const rttMs =
        client.loopbackRttMs ||
        Math.max(
          1,
          Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
          )
        );
      client.close();
      return { ok: true, rttMs, error: null };
    } catch (err: any) {
      client.close();
      const rttMs = Math.max(
        1,
        Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
        )
      );
      return { ok: false, rttMs, error: err?.message || String(err) };
    }
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sock: WebSocket | null = null;

    const finish = (result: SignalingProbeResult) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (sock) {
        try {
          if (sock.readyState === 0) {
            const pendingSock = sock;
            Object.assign(pendingSock, {
              onopen: () => {
                try {
                  pendingSock.close(1000, 'Diagnostic probe finished');
                } catch (_) {
                  // Ignore close error
                }
              },
              onerror: null,
              onclose: null,
              onmessage: null,
            });
          } else if (sock.readyState === 1) {
            if (protocol === 'mqtt') {
              try {
                sock.send(MQTT_DISCONNECT_PACKET);
              } catch (_) {
                // Ignore disconnect packet error
              }
            }
            sock.close(1000, 'Diagnostic probe finished');
          }
        } catch (_) {
          // Ignore close error
        }
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      const elapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
      );
      finish({
        ok: false,
        rttMs: elapsed,
        error: `Connection timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    try {
      const WebSocketConstructor = typeof WebSocket !== 'undefined' ? WebSocket : null;
      if (!WebSocketConstructor) {
        finish({
          ok: false,
          rttMs: 0,
          error: 'WebSocket is not supported in this environment',
        });
        return;
      }

      if (protocol === 'mqtt') {
        const mqttSock = new WebSocketConstructor(rawUrl, 'mqtt');
        sock = mqttSock;
        mqttSock.binaryType = 'arraybuffer';
        mqttSock.onopen = () => {
          try {
            const diagClientId = `rc_diag_${Math.random().toString(36).slice(2, 10)}`;
            mqttSock.send(buildMqttConnectPacket(diagClientId, username, password));
          } catch (err: any) {
            const elapsed = Math.round(
              (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
            );
            finish({
              ok: false,
              rttMs: elapsed,
              error: err?.message || 'MQTT CONNECT send failed',
            });
          }
        };
        mqttSock.onmessage = (ev) => {
          const bytes = new Uint8Array(ev.data);
          if (bytes.length >= 4 && (bytes[0] & 0xf0) === 0x20) {
            const returnCode = bytes[3];
            const rttMs = Math.round(
              (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
            );
            if (returnCode === 0) {
              finish({ ok: true, rttMs, error: null });
            } else {
              finish({
                ok: false,
                rttMs,
                error: `MQTT broker rejected auth (CONNACK code ${returnCode})`,
              });
            }
          }
        };
      } else {
        const separator = rawUrl.includes('?') ? '&' : '?';
        const authQuery =
          authToken && !rawUrl.includes('key=') ? `&key=${encodeURIComponent(authToken)}` : '';
        const testUrl = `${rawUrl}${separator}ping_test=1&t=${Date.now()}${authQuery}`;
        const wsSock = new WebSocketConstructor(testUrl);
        sock = wsSock;
        wsSock.onopen = () => {
          const rttMs = Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
          );
          finish({ ok: true, rttMs, error: null });
        };
      }

      sock.onerror = () => {
        const rttMs = Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
        );
        finish({
          ok: false,
          rttMs,
          error: 'WebSocket connection failed (network unreachable or TLS error)',
        });
      };
      sock.onclose = (ev) => {
        if (!resolved) {
          const rttMs = Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
          );
          finish({
            ok: false,
            rttMs,
            error: `Connection closed by server (code ${ev.code})`,
          });
        }
      };
    } catch (err: any) {
      finish({ ok: false, rttMs: 0, error: err?.message || String(err) });
    }
  });
}

export async function testAllSignalingRelays(
  timeoutMs = 5000
): Promise<SignalingRelayDiagnosticSummary[]> {
  const relays = getSignalingRelays();
  const results = await Promise.all(
    relays.map(async (relay) => {
      const res = await testSignalingConnectivity(relay.url, timeoutMs, {
        username: relay.username,
        password: relay.password,
        authToken: relay.authToken,
      });
      return {
        id: relay.id,
        label: relay.label,
        url: relay.url,
        protocol: relay.protocol,
        ok: res.ok,
        rttMs: res.rttMs,
        error: res.error,
      };
    })
  );
  return results;
}

export interface FourRelaysConnectivityProbeResult {
  hostMask: number;
  reachableCount: number;
  totalCount: number;
  relayResults: SignalingRelayDiagnosticSummary[];
}

/**
 * Concurrently probes the active relays (4 canonical slots: emqx_cn, emqx_gb, supabase_jp, supabase_sg)
 * and computes the 4-bit connectivity bitmask (0..15).
 */
export async function probeFourRelaysConnectivity(
  timeoutMs = 3500
): Promise<FourRelaysConnectivityProbeResult> {
  const relayResults = await testAllSignalingRelays(timeoutMs);
  const fallbackBits = [0b1000, 0b0100, 0b0010, 0b0001];
  const canonicalBits: Record<string, number> = {
    emqx_cn: 0b1000,
    emqx_gb: 0b0100,
    supabase_jp: 0b0010,
    supabase_sg: 0b0001,
  };
  let hostMask = 0;
  let reachableCount = 0;

  for (let i = 0; i < relayResults.length && i < 4; i++) {
    const item = relayResults[i];
    if (item.ok) {
      const cleanId = String(item.id || '')
        .trim()
        .toLowerCase();
      const bit = canonicalBits[cleanId] ?? fallbackBits[i] ?? 0;
      hostMask |= bit;
      reachableCount++;
    }
  }

  return {
    hostMask: hostMask & 0x0f,
    reachableCount,
    totalCount: relayResults.length,
    relayResults,
  };
}
