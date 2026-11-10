import { signalingProfileStore } from '../../ui-core/stores/signalingProfileStore.ts';
import { credentialBundleManager } from '../../network/transport/CredentialBundleManager.ts';
import { testAllSignalingRelays } from '../../network/transport/diagnostics/signalingDiagnosticsProbe.ts';
import { setSignalingRelayMatchPolicy } from '../../network/transport/SignalingRelayLifecyclePolicy.ts';
import { ensureCloudProfileSyncBridge } from './runtimeProfileSyncBridge.ts';
import { ensureDevSignalingLabBridge } from './runtimeSignalingLabBridge.ts';

let signalingProfileUnsubscribe: (() => void) | null = null;

export function ensureSignalingProfileBridge(): void {
  ensureCloudProfileSyncBridge();
  ensureDevSignalingLabBridge();
  if (!signalingProfileUnsubscribe) {
    signalingProfileUnsubscribe = credentialBundleManager.subscribe((status) => {
      signalingProfileStore.getState().syncStatus(status);
    });
  }

  signalingProfileStore.getState().registerBridge({
    async onImportBundle(rawContent: string, pinCode: string) {
      await credentialBundleManager.importEncryptedBundle(rawContent, pinCode);
    },
    async onExportBundle(options) {
      const exported = await credentialBundleManager.exportActiveBundle(options);
      return {
        suggestedFileName: exported.suggestedFileName,
        serializedJson: exported.serializedJson,
        pinCode: exported.pinCode,
        windowMinutes: exported.windowMinutes,
        expiresAtMs: Date.now() + exported.expiresInSeconds * 1000,
      };
    },
    onClearBundle() {
      credentialBundleManager.clearImportedProfile();
    },
    onSaveCustomRelay(payload) {
      if (!payload || !payload.url.trim()) {
        credentialBundleManager.setCustomRelayConfig(null);
      } else {
        credentialBundleManager.setCustomRelayConfig({
          url: payload.url,
          username: payload.username,
          password: payload.password,
        });
      }
    },
    onSetRelayMatchPolicy(policy) {
      setSignalingRelayMatchPolicy(policy);
    },
    async onVerifyRelays() {
      const results = await testAllSignalingRelays(4000);
      return results.map((r) => ({
        id: r.id,
        label: r.label,
        protocol: (r.protocol === 'ws' ? 'ws' : r.protocol === 'supabase' ? 'supabase' : 'mqtt') as
          'mqtt' | 'ws' | 'supabase',
        ok: r.ok,
        rttMs: r.rttMs,
        error: r.error ?? undefined,
      }));
    },
  });
}
