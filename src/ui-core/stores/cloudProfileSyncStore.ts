/**
 * cloudProfileSyncStore.ts
 * Zustand store orchestrating User Cloud Profile Sync, persistent live remote profile subscriptions,
 * Developer Account Directory Management & Live Remote Profile Tuning, and JSON Profile Backup Export.
 */

import { create } from 'zustand';
import { normalizeCloudUsername } from '../config/cloudProfileMergePipeline';
import { type CloudProfileSyncState, type LoggedInCloudUser } from '../config/cloudProfileSyncTypes';
import { loadStoredPlayerName, saveStoredPlayerName } from '../config/vehiclePresets';
import { useAppStore } from './appStore';
import { CloudProfileLiveRuntimeController } from './cloudProfileLiveRuntimeController';
import { executeExitRemoteTuningSession, executeLocalUserProfileBackupExport, executePushActiveRemoteSession, executeRemoteAccountProfileBackupExport, executeStartRemoteTuningSession, executeUpsertCloudAccount } from './cloudProfileRemoteTuningActions';
import { collectUnifiedProfileSnapshot } from './cloudProfileSnapshotCollector';
import { buildResolvedConflictsSnapshot, executeUserCloudLoginAndMerge, executeUserCloudProfilePush, loadAllowRemoteProfileDeployment, loadSavedCloudUser, loadStoredDevAckState, saveAllowRemoteProfileDeployment, saveCloudUser, saveStoredDevAckState } from './cloudProfileUserSyncActions';

const initialSavedUser = loadSavedCloudUser();
const initialDevAck = initialSavedUser ? loadStoredDevAckState(initialSavedUser.userId) : null;
const runtime = new CloudProfileLiveRuntimeController(initialDevAck?.appliedDevSnapshot ?? null);

export const useCloudProfileSyncStore = create<CloudProfileSyncState>((set, get) => ({
  available: false,
  canManageAccounts: false,
  source: 'public',
  loggedInUser: initialSavedUser,
  syncStatus: 'idle',
  statusMessage: null,
  errorMessage: null,
  lastSyncedAt: null,
  userRev: 0,
  userRevHash: 'none',
  devRev: initialDevAck?.devRev ?? 0,
  devRevHash: initialDevAck?.devRevHash ?? 'none',
  autoSyncEnabled: true,
  allowRemoteProfileDeployment: loadAllowRemoteProfileDeployment(),
  mergedBaseSnapshot: null,
  conflicts: [],
  accounts: [],
  isLoadingAccounts: false,
  activeRemoteSession: null,
  isApplyingSnapshotInternally: false,

  setCapabilityState: ({ available, canManageAccounts, source }) => {
    set({ available, canManageAccounts, source });
    const cur = get();
    if (available && cur.loggedInUser && cur.allowRemoteProfileDeployment && !cur.activeRemoteSession) {
      runtime.attachDevSlotWatchIfAllowed(cur.loggedInUser.userId, cur.loggedInUser.username);
    }
  },

  setBridgeCallbacks: (callbacks) => {
    runtime.bridgeCallbacks = callbacks;
    runtime.ensureLiveStoreSubscriptions();
    const cur = get();
    if (callbacks && cur.available && cur.loggedInUser && cur.allowRemoteProfileDeployment && !cur.activeRemoteSession) {
      runtime.attachDevSlotWatchIfAllowed(cur.loggedInUser.userId, cur.loggedInUser.username);
    }
  },

  setAutoSyncEnabled: (enabled) => set({ autoSyncEnabled: enabled }),

  setAllowRemoteProfileDeployment: (enabled) => {
    const next = Boolean(enabled);
    saveAllowRemoteProfileDeployment(next);
    set({ allowRemoteProfileDeployment: next });
    const user = get().loggedInUser;
    if (!next) {
      runtime.stopActiveDevSlotWatch();
      set({ statusMessage: 'Live remote profile deployment paused (manual sync only).' });
    } else if (user && get().available && runtime.bridgeCallbacks) {
      runtime.attachDevSlotWatchIfAllowed(user.userId, user.username);
      void get().pullUserCloudProfile(true);
    }
  },

  updateUserDisplayName: async (displayName) => {
    const clean = String(displayName || '').trim().slice(0, 24) || loadStoredPlayerName();
    saveStoredPlayerName(clean);
    useAppStore.getState().setOnlineSession({ playerName: clean });

    const currentUser = get().loggedInUser;
    if (currentUser) {
      const updatedUser: LoggedInCloudUser = { ...currentUser, displayName: clean };
      saveCloudUser(updatedUser);
      set({ loggedInUser: updatedUser, statusMessage: `Updated Multiplayer Display Name to "${clean}".` });
      if (get().available && runtime.bridgeCallbacks) {
        await get().pushUserCloudProfile();
      }
    }
  },

  loginAndSyncUser: async (usernameInput, password, forceIncludeDevSlot = false) => {
    const normalizedInput = normalizeCloudUsername(usernameInput);
    const trimmedPassword = password.trim();
    if (!normalizedInput || !trimmedPassword) {
      set({ syncStatus: 'error', errorMessage: 'Enter a valid username and password.' });
      return false;
    }
    if (!runtime.bridgeCallbacks || !get().available) {
      set({ syncStatus: 'error', errorMessage: 'Cloud profile credentials are not active.' });
      return false;
    }

    set({
      syncStatus: 'syncing',
      errorMessage: null,
      statusMessage: `Connecting to cloud profile "@${normalizedInput}"...`,
    });

    try {
      const res = await executeUserCloudLoginAndMerge({
        bridge: runtime.bridgeCallbacks,
        normalizedInput,
        trimmedPassword,
        currentLocalSnapshot: collectUnifiedProfileSnapshot(),
        allowRemoteDeployment: get().allowRemoteProfileDeployment || forceIncludeDevSlot,
        previousAppliedDevSnapshot: runtime.lastAppliedDevSnapshot,
        applySnapshotSafely: runtime.applySnapshotSafely,
      });

      if (!res.ok) {
        set({ syncStatus: 'error', errorMessage: res.errorMessage, statusMessage: null });
        return false;
      }

      const { evaluated, nextUserRev, nextUserRevHash, statusMessage } = res;
      runtime.lastAppliedDevSnapshot = evaluated.appliedDevSnapshot;
      runtime.lastPushedSnapshotJson = JSON.stringify(evaluated.targetSnap);
      runtime.attachDevSlotWatchIfAllowed(evaluated.userObj.userId, evaluated.userObj.username);

      set({
        loggedInUser: evaluated.userObj,
        userRev: nextUserRev,
        userRevHash: nextUserRevHash,
        devRev: evaluated.devRev,
        devRevHash: evaluated.devRevHash,
        mergedBaseSnapshot: evaluated.targetSnap,
        conflicts: evaluated.conflicts,
        syncStatus: evaluated.conflicts.length > 0 ? 'conflict' : 'synced',
        lastSyncedAt: Date.now(),
        errorMessage: null,
        statusMessage,
      });

      return true;
    } catch (err) {
      const fallbackUser = get().loggedInUser;
      if (fallbackUser && get().allowRemoteProfileDeployment) {
        runtime.attachDevSlotWatchIfAllowed(fallbackUser.userId, fallbackUser.username);
      }
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : 'Cloud sync failed.', statusMessage: null });
      return false;
    }
  },

  logoutUser: () => {
    runtime.stopActiveDevSlotWatch();
    saveCloudUser(null);
    set({ loggedInUser: null, syncStatus: 'idle', statusMessage: 'Signed out of cloud profile sync.', errorMessage: null, conflicts: [] });
  },

  pullUserCloudProfile: async (forceIncludeDevSlot = true) => {
    const user = get().loggedInUser;
    if (!user) return false;
    return get().loginAndSyncUser(user.username || user.userId, user.password, forceIncludeDevSlot);
  },

  pushUserCloudProfile: async () => {
    const { loggedInUser, available, devRev, devRevHash } = get();
    if (!loggedInUser || !runtime.bridgeCallbacks || !available) return false;
    set({ syncStatus: 'syncing', errorMessage: null });
    try {
      const snapshot = collectUnifiedProfileSnapshot();
      const pub = await executeUserCloudProfilePush({
        bridge: runtime.bridgeCallbacks,
        loggedInUser,
        snapshot,
        devRev,
        devRevHash,
      });
      runtime.lastPushedSnapshotJson = JSON.stringify(snapshot);
      set({
        loggedInUser: pub.updatedUser,
        userRev: pub.rev,
        userRevHash: pub.revHash,
        mergedBaseSnapshot: snapshot,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        statusMessage: `Pushed local settings to cloud (commit #${pub.revHash}).`,
      });
      return true;
    } catch (err) {
      set({ syncStatus: 'error', errorMessage: err instanceof Error ? err.message : 'Failed to push profile.' });
      return false;
    }
  },

  selectConflictSource: (key, source) =>
    set((state) => ({
      conflicts: state.conflicts.map((item) => (item.key === key ? { ...item, selectedSource: source } : item)),
    })),

  resolveConflicts: async (mode) => {
    const { conflicts, loggedInUser, devRev, devRevHash } = get();
    if (conflicts.length === 0) return;
    const resolvedSnap = buildResolvedConflictsSnapshot(collectUnifiedProfileSnapshot(), conflicts, mode);
    runtime.applySnapshotSafely(resolvedSnap);
    if (loggedInUser && devRev > 0) {
      saveStoredDevAckState(loggedInUser.userId, {
        devRev,
        devRevHash,
        appliedDevSnapshot: runtime.lastAppliedDevSnapshot ?? resolvedSnap,
      });
    }
    set({
      conflicts: [],
      mergedBaseSnapshot: resolvedSnap,
      syncStatus: 'synced',
      statusMessage: 'Resolved all profile conflicts and synced to cloud.',
    });
    if (loggedInUser && runtime.bridgeCallbacks) {
      await get().pushUserCloudProfile();
    }
  },

  refreshAccounts: async () => {
    if (!runtime.bridgeCallbacks || !get().available) return;
    set({ isLoadingAccounts: true, errorMessage: null });
    try {
      const list = await runtime.bridgeCallbacks.fetchAllAccounts();
      set({ accounts: list, isLoadingAccounts: false });
    } catch (err) {
      set({ isLoadingAccounts: false, errorMessage: err instanceof Error ? err.message : 'Failed to load accounts.' });
    }
  },

  upsertAccount: async (username, password, alias, displayName, explicitUserId) => {
    const cleanUsername = normalizeCloudUsername(username);
    const trimmedPassword = password.trim();
    if (!cleanUsername || !trimmedPassword || !runtime.bridgeCallbacks) return false;
    try {
      const res = await executeUpsertCloudAccount({
        bridge: runtime.bridgeCallbacks,
        accounts: get().accounts,
        username,
        password,
        alias,
        displayName,
        explicitUserId,
      });
      set({ accounts: res.nextAccounts, statusMessage: res.statusMessage, errorMessage: null });
      return true;
    } catch (err) {
      set({ errorMessage: err instanceof Error ? err.message : 'Failed to save account.' });
      return false;
    }
  },

  deleteAccount: async (userId) => {
    const cleanId = String(userId || '').trim();
    if (!cleanId || !runtime.bridgeCallbacks) return false;
    try {
      await runtime.bridgeCallbacks.deleteAccountDirectoryEntry(cleanId);
      set((state) => ({
        accounts: state.accounts.filter((a) => a.userId !== cleanId),
        statusMessage: `Removed account (${cleanId}) from cloud directory.`,
      }));
      return true;
    } catch (err) {
      set({ errorMessage: err instanceof Error ? err.message : 'Failed to delete account.' });
      return false;
    }
  },

  startRemoteTuningSession: async (account) => {
    const targetId = String(account.userId || account.username || '').trim();
    if (!targetId || !runtime.bridgeCallbacks || !get().available) return false;
    set({
      syncStatus: 'syncing',
      errorMessage: null,
      statusMessage: `Syncing latest user data for #${account.alias || targetId}...`,
    });
    try {
      const res = await executeStartRemoteTuningSession({
        bridge: runtime.bridgeCallbacks,
        account,
        existingSession: get().activeRemoteSession,
        applySnapshotSafely: runtime.applySnapshotSafely,
        setLastPushedSnapshotJson: runtime.setLastPushedSnapshotJson,
      });
      set({ activeRemoteSession: res.session, syncStatus: 'synced', statusMessage: res.statusMessage });
      return true;
    } catch (err) {
      set({
        syncStatus: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to enter remote tuning session.',
      });
      return false;
    }
  },

  pushActiveRemoteSessionNow: async () => {
    const session = get().activeRemoteSession;
    if (!session || !runtime.bridgeCallbacks || get().isApplyingSnapshotInternally) return false;
    if (runtime.remotePushInFlight) {
      runtime.remotePushQueued = true;
      return true;
    }
    const currentSnap = collectUnifiedProfileSnapshot();
    const currentJson = JSON.stringify(currentSnap);
    if (currentJson === runtime.lastPushedSnapshotJson) return true;
    runtime.lastPushedSnapshotJson = currentJson;

    runtime.remotePushInFlight = true;
    try {
      const latestSession = get().activeRemoteSession ?? session;
      const res = await executePushActiveRemoteSession({
        bridge: runtime.bridgeCallbacks,
        session: latestSession,
        currentSnap,
      });
      set(res.patchState);
      return true;
    } catch (err) {
      set({ errorMessage: err instanceof Error ? err.message : 'Failed to push remote developer profile.' });
      return false;
    } finally {
      runtime.remotePushInFlight = false;
      if (runtime.remotePushQueued) {
        runtime.remotePushQueued = false;
        void get().pushActiveRemoteSessionNow();
      }
    }
  },

  exitRemoteTuningSession: async () => {
    const session = get().activeRemoteSession;
    if (!session) return;
    set({ activeRemoteSession: null });
    const statusMessage = await executeExitRemoteTuningSession({
      bridge: runtime.bridgeCallbacks,
      session,
      lastPushedSnapshotJson: runtime.lastPushedSnapshotJson,
      clearRemotePushDebounceTimer: runtime.clearRemotePushDebounceTimer,
      applySnapshotSafely: runtime.applySnapshotSafely,
      setLastPushedSnapshotJson: runtime.setLastPushedSnapshotJson,
    });
    set({ syncStatus: 'idle', statusMessage });
    void get().refreshAccounts();
  },

  exportLocalUserProfileBackup: () => {
    const { filename, statusMessage } = executeLocalUserProfileBackupExport(get());
    set({ statusMessage, errorMessage: null });
    return filename;
  },

  exportRemoteAccountProfileBackup: async (account) => {
    if (!runtime.bridgeCallbacks || !get().available) {
      set({ errorMessage: 'Cloud profile transport is not available.' });
      return false;
    }
    try {
      const { statusMessage } = await executeRemoteAccountProfileBackupExport(runtime.bridgeCallbacks, account);
      set({ statusMessage, errorMessage: null });
      return true;
    } catch (err) {
      set({ errorMessage: err instanceof Error ? err.message : 'Failed to export remote profile backup.' });
      return false;
    }
  },
}));

runtime.bindStore(useCloudProfileSyncStore);
