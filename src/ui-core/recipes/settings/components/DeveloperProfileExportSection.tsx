import React, { useState } from 'react';
import {
  FileKey2,
  Download,
  Copy,
  Check,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useSignalingProfileStore } from '../../../stores/signalingProfileStore';

export interface DeveloperProfileExportSectionProps {
  onHover?: (desc: string) => void;
  onLeave?: () => void;
  isLight?: boolean;
}

function triggerBundleDownload(content: string, filename: string): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * [Layer 2 -> Developer Settings -> Export Time-Bound .rctbnspib Bundle]
 * Allows developers with an active private signaling profile to generate a time-bound
 * AES-256-GCM encrypted `.rctbnspib` bundle + 6-digit PIN to share with friends.
 */
export const DeveloperProfileExportSection: React.FC<DeveloperProfileExportSectionProps> =
  React.memo(({ onHover, onLeave, isLight = false }) => {
    const loaded = useSignalingProfileStore((s) => s.loaded);
    const source = useSignalingProfileStore((s) => s.source);
    const profileHash = useSignalingProfileStore((s) => s.profileHash);
    const isBusy = useSignalingProfileStore((s) => s.isBusy);
    const lastExport = useSignalingProfileStore((s) => s.lastExport);
    const exportBundle = useSignalingProfileStore((s) => s.exportBundle);

    const [isExpanded, setIsExpanded] = useState(false);
    const [showOverride, setShowOverride] = useState(false);
    const [windowMinutes, setWindowMinutes] = useState<number>(15);
    const [customPin, setCustomPin] = useState<string>('');
    const [emqxCnUsername, setEmqxCnUsername] = useState<string>('');
    const [emqxCnPassword, setEmqxCnPassword] = useState<string>('');
    const [emqxGbUsername, setEmqxGbUsername] = useState<string>('');
    const [emqxGbPassword, setEmqxGbPassword] = useState<string>('');
    const [copiedPin, setCopiedPin] = useState(false);

    const { borderRadius, rowGap } = useSettingActionRowStore();

    // Only show developer bundle export when loaded from developer private profile
    if (source !== 'dev-private') {
      return null;
    }

    const handleExport = async () => {
      const hasOverride =
        Boolean(emqxCnUsername.trim()) ||
        Boolean(emqxCnPassword) ||
        Boolean(emqxGbUsername.trim()) ||
        Boolean(emqxGbPassword);

      const result = await exportBundle({
        windowMinutes,
        pinCode: customPin.length === 6 ? customPin : undefined,
        credentialOverrides: hasOverride
          ? {
              emqxCnUsername: emqxCnUsername.trim() || undefined,
              emqxCnPassword: emqxCnPassword || undefined,
              emqxGbUsername: emqxGbUsername.trim() || undefined,
              emqxGbPassword: emqxGbPassword || undefined,
            }
          : undefined,
      });
      if (result) {
        triggerBundleDownload(result.serializedJson, result.suggestedFileName);
      }
    };

    const handleCopyPin = () => {
      if (!lastExport?.pinCode || typeof navigator === 'undefined') return;
      navigator.clipboard?.writeText(lastExport.pinCode).catch(() => {});
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    };

    const inputClass = `px-2.5 py-1 rounded-lg text-xs font-mono border outline-none ${
      isLight
        ? 'bg-white border-neutral-300 text-neutral-900'
        : 'bg-neutral-950 border-neutral-700 text-neutral-100'
    }`;

    return (
      <div
        data-ui-element="compound-developer-profile-export"
        style={{
          borderRadius: `${Math.max(0, borderRadius)}px`,
          gap: `${rowGap}px`,
        }}
        className="flex flex-col w-full"
      >
        <SettingActionRow
          icon={FileKey2}
          iconName="file-key-2"
          iconColor="text-amber-400"
          title="Export .rctbnspib Credential Bundle"
          description={
            loaded
              ? `Generate a minimal time-bound AES-256-GCM encrypted .rctbnspib file + 6-digit PIN [#${profileHash.slice(0, 8) || 'local'}]`
              : 'Requires an active developer signaling profile'
          }
          onAction={() => setIsExpanded((prev) => !prev)}
          onHover={onHover}
          onLeave={onLeave}
          isLight={isLight}
          rightSlot={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-800'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-300'
              }`}
            >
              <span>{isExpanded ? 'Close' : 'Configure Export'}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          }
        />

        {isExpanded && (
          <div
            style={{ borderRadius: `${Math.max(6, borderRadius)}px` }}
            className={`mt-1 p-3 border flex flex-col gap-2.5 w-full ${
              isLight
                ? 'bg-neutral-100/75 border-neutral-200/90 text-neutral-800'
                : 'bg-neutral-900/55 border-neutral-800/90 text-neutral-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-medium">Valid Window:</span>
              </div>

              {[5, 10, 15, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setWindowMinutes(mins)}
                  className={`px-2 py-1 rounded-md text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                    windowMinutes === mins
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : isLight
                      ? 'bg-white border-neutral-300 text-neutral-600'
                      : 'bg-neutral-850 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {mins}m
                </button>
              ))}

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Auto 6-Digit PIN"
                value={customPin}
                onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`w-36 text-center tracking-wider ${inputClass}`}
              />

              <button
                type="button"
                disabled={!loaded || isBusy}
                onClick={handleExport}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ml-auto disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLight
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-800'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isBusy ? 'Encrypting...' : 'Download .rctbnspib'}</span>
              </button>
            </div>

            {/* Optional Per-Friend Credential Override Section */}
            <div className="flex flex-col gap-2 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowOverride((prev) => !prev)}
                className="inline-flex items-center justify-between text-[11px] font-semibold opacity-80 hover:opacity-100 cursor-pointer"
              >
                <span>Override Relay Credentials (Optional · For Per-Friend Revocation)</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showOverride ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showOverride && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="emqx_cn Username (default if empty)"
                    value={emqxCnUsername}
                    onChange={(e) => setEmqxCnUsername(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="password"
                    placeholder="emqx_cn Password (default if empty)"
                    value={emqxCnPassword}
                    onChange={(e) => setEmqxCnPassword(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    placeholder="emqx_gb Username (default if empty)"
                    value={emqxGbUsername}
                    onChange={(e) => setEmqxGbUsername(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="password"
                    placeholder="emqx_gb Password (default if empty)"
                    value={emqxGbPassword}
                    onChange={(e) => setEmqxGbPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            {lastExport && (
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                  isLight
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-900'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Unlock PIN ({lastExport.windowMinutes}m window):</span>
                  <span className="font-mono text-sm font-bold tracking-widest px-2 py-0.5 rounded bg-black/25 text-amber-300">
                    {lastExport.pinCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPin}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer"
                >
                  {copiedPin ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

DeveloperProfileExportSection.displayName = 'DeveloperProfileExportSection';
