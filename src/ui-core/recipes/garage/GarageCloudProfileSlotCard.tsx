import React from 'react';
import {
  AlertTriangle,
  CloudDownload,
  CloudUpload,
  GitMerge,
  ShieldCheck,
} from 'lucide-react';
import { formatSyncValuePreview } from '../../config/cloudProfileSyncTypes';
import { useCloudProfileSyncStore } from '../../stores/cloudProfileSyncStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export interface GarageCloudProfileSlotCardProps {
  isLight?: boolean;
  onHoverDesc?: (desc: string | null) => void;
}

export const GarageCloudProfileSlotCard: React.FC<
  GarageCloudProfileSlotCardProps
> = React.memo(({ isLight = false, onHoverDesc }) => {
  const loggedInUser = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.loggedInUser
  );
  const syncStatus = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.syncStatus
  );
  const statusMessage = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.statusMessage
  );
  const errorMessage = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.errorMessage
  );
  const autoSyncEnabled = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.autoSyncEnabled
  );
  const conflicts = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.conflicts
  );
  const pullUserCloudProfile = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.pullUserCloudProfile
  );
  const pushUserCloudProfile = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.pushUserCloudProfile
  );
  const setAutoSyncEnabled = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.setAutoSyncEnabled
  );
  const selectConflictSource = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.selectConflictSource
  );
  const resolveConflicts = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.resolveConflicts
  );

  const isSyncing = syncStatus === 'syncing';

  return (
    <>
      {loggedInUser && (
        <div
          className={`flex items-center justify-between gap-2 pt-2 border-t ${
            isLight ? 'border-neutral-200/80' : 'border-neutral-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void pullUserCloudProfile(true)}
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Pull & 3-Way Merge: Pulls latest cloud user & developer commits and runs field-level Git 3-Way Merge.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800/80 hover:bg-neutral-700/80 border-neutral-700 text-neutral-200'
              }`}
            >
              <CloudDownload className="h-3.5 w-3.5 text-sky-400" />
              <span>Pull &amp; Merge</span>
            </button>

            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void pushUserCloudProfile()}
              onMouseEnter={() =>
                onHoverDesc?.(
                  'Push Now: Uploads your current unified flat settings snapshot to your cloud user slot.'
                )
              }
              onMouseLeave={() => onHoverDesc?.(null)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800/80 hover:bg-neutral-700/80 border-neutral-700 text-neutral-200'
              }`}
            >
              <CloudUpload className="h-3.5 w-3.5 text-emerald-400" />
              <span>Push Local</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="rounded accent-sky-500 cursor-pointer"
            />
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-300'}>
              Auto-Push Changes
            </span>
          </label>
        </div>
      )}

      {(errorMessage || statusMessage) && (
        <div
          className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 ${
            errorMessage
              ? 'bg-rose-500/15 border-rose-500/35 text-rose-400'
              : syncStatus === 'conflict'
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                : isLight
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
          }`}
        >
          {errorMessage ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          ) : syncStatus === 'conflict' ? (
            <GitMerge className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{errorMessage || statusMessage}</span>
        </div>
      )}

      {conflicts.length > 0 && (
        <div
          className={`rounded-xl border p-3 flex flex-col gap-2 ${
            isLight
              ? 'bg-amber-500/10 border-amber-500/35 text-neutral-900'
              : 'bg-amber-500/10 border-amber-500/30 text-neutral-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <GitMerge className="h-4 w-4" />
              <span>Solve 3-Way Merge Conflicts ({conflicts.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void resolveConflicts('all-local')}
                className="px-2 py-1 rounded border text-[10px] font-bold uppercase bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border-neutral-600 cursor-pointer"
              >
                Keep All Mine
              </button>
              <button
                type="button"
                onClick={() => void resolveConflicts('all-dev')}
                className="px-2 py-1 rounded border text-[10px] font-bold uppercase bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40 cursor-pointer"
              >
                Use All Developer
              </button>
              <button
                type="button"
                onClick={() => void resolveConflicts('selected')}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-amber-500 hover:bg-amber-400 text-neutral-950 cursor-pointer"
              >
                Apply Selected
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
            {conflicts.map((item) => (
              <div
                key={item.key}
                className={`p-2 rounded-lg border grid grid-cols-12 items-center gap-2 text-xs ${
                  isLight
                    ? 'bg-white/90 border-neutral-200'
                    : 'bg-neutral-950/75 border-neutral-800'
                }`}
              >
                <div className="col-span-4 min-w-0">
                  <div className="font-semibold truncate">{item.label}</div>
                  <div className="text-[10px] font-mono text-neutral-500 truncate">
                    Base: {formatSyncValuePreview(item.baseValue)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => selectConflictSource(item.key, 'local')}
                  className={`col-span-4 px-2 py-1 rounded border text-left font-mono text-[11px] truncate cursor-pointer transition ${
                    item.selectedSource === 'local'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-neutral-900/40 border-neutral-700/60 text-neutral-400'
                  }`}
                >
                  Mine: {formatSyncValuePreview(item.localValue)}
                </button>
                <button
                  type="button"
                  onClick={() => selectConflictSource(item.key, 'dev')}
                  className={`col-span-4 px-2 py-1 rounded border text-left font-mono text-[11px] truncate cursor-pointer transition ${
                    item.selectedSource === 'dev'
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold'
                      : 'bg-neutral-900/40 border-neutral-700/60 text-neutral-400'
                  }`}
                >
                  Dev: {formatSyncValuePreview(item.devValue)}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

GarageCloudProfileSlotCard.displayName = 'GarageCloudProfileSlotCard';
