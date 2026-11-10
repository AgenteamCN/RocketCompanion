import React, { useState, useEffect } from 'react';
import { IdCard, Sparkles, Check } from 'lucide-react';
import type { SurfaceVariantMeta } from '../../manifest/surfaceMetaTypes';
import { loadStoredPlayerName } from '../../config/vehiclePresets';
import { useAppStore } from '../../stores/appStore';
import { useCloudProfileSyncStore } from '../../stores/cloudProfileSyncStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { attachCloudProfileConflictDialogueAutoSync } from './CloudProfileConflictDialogue';
import { GarageCloudAccountSyncSection } from './GarageCloudAccountSyncSection';

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'sync',
  label: '5. Cloud Profile Sync',
  description:
    'Multiplayer Name Card display name & cross-device cloud profile 3-way merge synchronization.',
};

export interface GarageSyncTabProps {
  isLight?: boolean;
  onHoverDesc?: (desc: string | null) => void;
}

export const GarageSyncTab: React.FC<GarageSyncTabProps> = ({
  isLight = false,
  onHoverDesc,
}) => {
  useEffect(() => {
    attachCloudProfileConflictDialogueAutoSync();
  }, []);

  const loggedInUser = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.loggedInUser
  );
  const updateUserDisplayName = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.updateUserDisplayName
  );
  const storePlayerName = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.onlineSession?.playerName
  );

  const activeDisplayName =
    storePlayerName || loggedInUser?.displayName || loadStoredPlayerName();

  const [displayNameInput, setDisplayNameInput] = useState(activeDisplayName);
  const [displayNameSavedFlash, setDisplayNameSavedFlash] = useState(false);

  useEffect(() => {
    setDisplayNameInput(activeDisplayName);
  }, [activeDisplayName]);

  const handleDisplayNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayNameInput.trim();
    if (!trimmed) return;
    await updateUserDisplayName(trimmed);
    setDisplayNameSavedFlash(true);
    setTimeout(() => setDisplayNameSavedFlash(false), 1600);
  };

  return (
    <div className="flex flex-col gap-2.5 w-full h-full overflow-y-auto pr-0.5">
      <div
        className={`rounded-xl border p-3 flex flex-col gap-2 transition-colors ${
          isLight
            ? 'bg-white/90 border-neutral-200/90 text-neutral-900'
            : 'bg-neutral-900/70 border-neutral-800/90 text-neutral-100'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <IdCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <span>Multiplayer Name Card (Display Name)</span>
              </div>
              <div
                className={`text-[11px] truncate ${
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                Shown on your in-game Name Card, Scoreboard, and Online Rooms (independent from Login Account &amp; Dev Alias)
              </div>
            </div>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 shrink-0 ${
              isLight
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800'
                : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
            }`}
            title="Live Multiplayer Name Card Preview"
          >
            <Sparkles className="h-3 w-3 shrink-0" />
            <span className="text-xs font-extrabold tracking-tight max-w-[140px] truncate">
              {displayNameInput.trim() || activeDisplayName}
            </span>
          </div>
        </div>

        <form onSubmit={handleDisplayNameSubmit} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-9 relative flex items-center">
            <IdCard
              className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              type="text"
              maxLength={24}
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              placeholder="Enter your Multiplayer Display Name..."
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Display Name: Your custom Multiplayer Name Card displayed above your car and on scoreboards.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none transition ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-amber-500'
                  : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-amber-500'
              }`}
            />
          </div>
          <div className="col-span-3 flex justify-end">
            <button
              type="submit"
              className={`w-full py-1.5 px-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95 ${
                displayNameSavedFlash
                  ? 'bg-emerald-500 text-neutral-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
              }`}
            >
              {displayNameSavedFlash ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Update Card</span>
              )}
            </button>
          </div>
        </form>
      </div>

      <GarageCloudAccountSyncSection isLight={isLight} onHoverDesc={onHoverDesc} />
    </div>
  );
};
