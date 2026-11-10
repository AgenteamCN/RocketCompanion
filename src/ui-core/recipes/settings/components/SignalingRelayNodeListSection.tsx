import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Lock,
  Server,
  RotateCcw,
} from 'lucide-react';
import { useSignalingProfileStore } from '../../../stores/signalingProfileStore';

export interface SignalingRelayNodeListSectionProps {
  isLight?: boolean;
}

/**
 * [Layer 2 Settings -> Advanced Tab -> Signaling Credential Bundle -> Relay Node List & Custom Broker]
 * Renders the 3-tier mutex lock notice (when imported-bundle is active), the custom/public relay
 * override form, status/error messages, and the 4-server signaling probe health grid.
 */
export const SignalingRelayNodeListSection: React.FC<SignalingRelayNodeListSectionProps> =
  React.memo(({ isLight = false }) => {
    const source = useSignalingProfileStore((s) => s.source);
    const shortHash = useSignalingProfileStore((s) => s.shortHash);
    const customUrl = useSignalingProfileStore((s) => s.customUrl);
    const customUsername = useSignalingProfileStore((s) => s.customUsername);
    const statusMessage = useSignalingProfileStore((s) => s.statusMessage);
    const errorMessage = useSignalingProfileStore((s) => s.errorMessage);
    const probeResults = useSignalingProfileStore((s) => s.probeResults);
    const saveCustomRelay = useSignalingProfileStore((s) => s.saveCustomRelay);
    const clearMessages = useSignalingProfileStore((s) => s.clearMessages);

    const [draftCustomUrl, setDraftCustomUrl] = useState<string>(customUrl);
    const [draftCustomUser, setDraftCustomUser] = useState<string>(customUsername);
    const [draftCustomPass, setDraftCustomPass] = useState<string>('');

    useEffect(() => {
      setDraftCustomUrl(customUrl);
      setDraftCustomUser(customUsername);
    }, [customUrl, customUsername]);

    const isImportedLocked = source === 'imported-bundle';

    const handleSaveCustom = () => {
      clearMessages();
      saveCustomRelay({
        url: draftCustomUrl.trim(),
        username: draftCustomUser.trim(),
        password: draftCustomPass,
      });
      setDraftCustomPass('');
    };

    const handleResetToPublic = () => {
      clearMessages();
      setDraftCustomUrl('');
      setDraftCustomUser('');
      setDraftCustomPass('');
      saveCustomRelay(null);
    };

    return (
      <>
        {isImportedLocked ? (
          <div
            data-ui-element="imported-bundle-mutex-lock-notice"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
              isLight
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>
              An imported encrypted credential bundle (<strong>#{shortHash}</strong>) is
              currently active. Public broker fallback and custom server parameters are
              disabled. To configure a custom self-hosted server, click{' '}
              <strong>Delete Imported Bundle</strong> first.
            </span>
          </div>
        ) : (
          <div
            data-ui-element="custom-self-hosted-relay-form"
            className={`flex flex-col gap-2 pt-2 border-t ${
              isLight ? 'border-neutral-200/80' : 'border-neutral-800/80'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="inline-flex items-center gap-1.5 font-semibold">
                <Server className="h-3.5 w-3.5 text-sky-400" />
                <span>Custom / Public Relay Override (Unverified / No SLA)</span>
              </div>
              <span className="font-mono text-[11px] text-neutral-400">
                Active Hash: #{shortHash}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="wss://relay.carball.dev:8084/mqtt (Custom or Public Broker URL)"
                value={draftCustomUrl}
                onChange={(e) => setDraftCustomUrl(e.target.value)}
                className={`flex-1 min-w-[220px] px-2.5 py-1.5 rounded-lg text-xs font-mono border outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900 focus:border-sky-500'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-sky-400'
                }`}
              />

              <input
                type="text"
                placeholder="Username (Optional)"
                value={draftCustomUser}
                onChange={(e) => setDraftCustomUser(e.target.value)}
                className={`w-36 px-2.5 py-1.5 rounded-lg text-xs font-mono border outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900 focus:border-sky-500'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-sky-400'
                }`}
              />

              <input
                type="password"
                placeholder="Password / Token"
                value={draftCustomPass}
                onChange={(e) => setDraftCustomPass(e.target.value)}
                className={`w-36 px-2.5 py-1.5 rounded-lg text-xs font-mono border outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900 focus:border-sky-500'
                    : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-sky-400'
                }`}
              />

              <button
                type="button"
                onClick={handleSaveCustom}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-800'
                    : 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-300'
                }`}
              >
                <span>Apply Custom</span>
              </button>

              {source === 'custom' && (
                <button
                  type="button"
                  onClick={handleResetToPublic}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-600'
                      : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Use Public</span>
                </button>
              )}
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {probeResults.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1.5 pt-1">
            {probeResults.map((probe) => (
              <div
                key={probe.id}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[11px] font-mono ${
                  probe.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <span className="truncate">{probe.label}</span>
                <span className="shrink-0 ml-2 font-semibold">
                  {probe.ok ? `${probe.rttMs}ms` : 'FAIL'}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  });

SignalingRelayNodeListSection.displayName = 'SignalingRelayNodeListSection';
