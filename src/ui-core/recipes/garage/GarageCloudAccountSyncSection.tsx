import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudCheck,
  GitCommitHorizontal,
  KeyRound,
  LogOut,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { UnderConstructionPlaceholder } from '../../primitives/UnderConstructionPlaceholder';
import { useCloudProfileSyncStore } from '../../stores/cloudProfileSyncStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { GarageCloudProfileSlotCard } from './GarageCloudProfileSlotCard';

export interface GarageCloudAccountSyncSectionProps {
  isLight?: boolean;
  onHoverDesc?: (desc: string | null) => void;
}

export const GarageCloudAccountSyncSection: React.FC<
  GarageCloudAccountSyncSectionProps
> = ({ isLight = false, onHoverDesc }) => {
  const available = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.available
  );
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
  const userRevHash = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.userRevHash
  );
  const devRevHash = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.devRevHash
  );
  const allowRemoteProfileDeployment = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.allowRemoteProfileDeployment
  );
  const loginAndSyncUser = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.loginAndSyncUser
  );
  const logoutUser = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.logoutUser
  );

  const [usernameInput, setUsernameInput] = useState(
    loggedInUser?.username || loggedInUser?.userId || ''
  );
  const [passwordInput, setPasswordInput] = useState(loggedInUser?.password ?? '');

  useEffect(() => {
    if (loggedInUser) {
      setUsernameInput(loggedInUser.username || loggedInUser.userId);
      setPasswordInput(loggedInUser.password);
    }
  }, [loggedInUser]);

  const isSyncing = syncStatus === 'syncing';

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginAndSyncUser(usernameInput, passwordInput, true);
  };

  return (
    <>
      {!available ? (
        <UnderConstructionPlaceholder
          title="Cloud Sync Configuration Under Construction"
          description="Import a trusted .rctbnspib signaling & profile bundle in Settings -> Advanced before binding a cloud profile."
          badge="BUNDLE REQUIRED"
          isLight={isLight}
        />
      ) : (
        <div
          className={`rounded-xl border p-3 flex flex-col gap-2.5 transition-colors ${
            isLight
              ? 'bg-white/90 border-neutral-200/90 text-neutral-900'
              : 'bg-neutral-900/70 border-neutral-800/90 text-neutral-100'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                  loggedInUser
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-sky-500/15 border-sky-500/30 text-sky-400'
                }`}
              >
                {loggedInUser ? (
                  <CloudCheck className="h-4 w-4" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 flex-wrap">
                  <span>Cloud Profile Sync</span>
                  {loggedInUser && (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          isLight
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        }`}
                        title="Developer-assigned alias"
                      >
                        #{loggedInUser.alias}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          isLight
                            ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                        }`}
                        title="Immutable Cloud User ID"
                      >
                        ID: {loggedInUser.userId}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`text-[11px] truncate ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  {loggedInUser
                    ? `Account @${loggedInUser.username} · ${
                        allowRemoteProfileDeployment
                          ? 'Live Remote Deployment Active'
                          : 'Manual Sync Mode'
                      }`
                    : 'Sign in with your login username & passphrase to sync Garage, Settings & Floating Windows'}
                </div>
              </div>
            </div>

            {loggedInUser && (
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                <span
                  className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                    isLight
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-800/80 border-neutral-700 text-neutral-300'
                  }`}
                  title="Latest User Slot Commit Hash"
                >
                  <GitCommitHorizontal className="h-3 w-3 opacity-70" />
                  user #{userRevHash}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                    isLight
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-700'
                      : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                  }`}
                  title="Latest Developer Slot Commit Hash"
                >
                  <GitCommitHorizontal className="h-3 w-3 opacity-70" />
                  dev #{devRevHash}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleLoginSubmit} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5 relative flex items-center">
              <UserCheck
                className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                  isLight ? 'text-neutral-400' : 'text-neutral-500'
                }`}
              />
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Login Username (e.g. alex)"
                onMouseEnter={() =>
                  onHoverDesc?.(
                    'Login Username: Authenticates your cloud profile slot (independent of your Multiplayer Display Name).'
                  )
                }
                onMouseLeave={() => onHoverDesc?.(null)}
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-sky-500'
                    : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-sky-500'
                }`}
              />
            </div>

            <div className="col-span-4 relative flex items-center">
              <KeyRound
                className={`h-3.5 w-3.5 absolute left-2.5 pointer-events-none ${
                  isLight ? 'text-neutral-400' : 'text-neutral-500'
                }`}
              />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Passphrase"
                onMouseEnter={() =>
                  onHoverDesc?.(
                    'Passphrase: Verifies ownership of your cloud profile account.'
                  )
                }
                onMouseLeave={() => onHoverDesc?.(null)}
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs font-mono outline-none transition ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-sky-500'
                    : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-sky-500'
                }`}
              />
            </div>

            <div className="col-span-3 flex items-center gap-1.5 justify-end">
              <button
                type="submit"
                disabled={isSyncing}
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{loggedInUser ? 'Sync' : 'Sign In'}</span>
              </button>

              {loggedInUser && (
                <button
                  type="button"
                  onClick={logoutUser}
                  title="Sign out of cloud profile"
                  className="p-1.5 rounded-lg border bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-400 cursor-pointer transition active:scale-95"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          <GarageCloudProfileSlotCard isLight={isLight} onHoverDesc={onHoverDesc} />
        </div>
      )}
    </>
  );
};
