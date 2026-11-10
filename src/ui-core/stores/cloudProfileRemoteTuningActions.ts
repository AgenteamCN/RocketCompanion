import { isDeepEqualJsonValue, normalizeCloudUsername } from '../config/cloudProfileMergePipeline';
import type {
  ActiveRemoteTuningSession,
  CloudManagedAccountItem,
  CloudProfileSyncBridgeCallbacks,
  CloudProfileSyncState,
  ProfileFlatSnapshot,
} from '../config/cloudProfileSyncTypes';
import { useAppStore } from './appStore';
import { collectUnifiedProfileSnapshot } from './cloudProfileSnapshotCollector';
import { buildUpdatedIndexAfterRemotePush, evaluateRemoteTuningSessionFromRecord, performLocalUserBackupExport, performRemoteAccountBackupExport } from './cloudProfileSyncPipeline';

export async function executeUpsertCloudAccount(params: {
  bridge: CloudProfileSyncBridgeCallbacks;
  accounts: CloudManagedAccountItem[];
  username: string;
  password: string;
  alias: string;
  displayName?: string;
  explicitUserId?: string;
}): Promise<{
  item: CloudManagedAccountItem;
  nextAccounts: CloudManagedAccountItem[];
  statusMessage: string;
}> {
  const cleanUsername = normalizeCloudUsername(params.username);
  const trimmedPassword = params.password.trim();
  const trimmedAlias = params.alias.trim() || cleanUsername;
  const existing =
    (params.explicitUserId
      ? params.accounts.find((a) => a.userId === params.explicitUserId)
      : params.accounts.find(
          (a) => a.username === cleanUsername || a.userId === cleanUsername
        )) ?? null;

  const item = await params.bridge.upsertAccountDirectoryEntry({
    userId: params.explicitUserId || existing?.userId,
    username: cleanUsername,
    alias: trimmedAlias,
    displayName: params.displayName?.trim() || existing?.displayName || trimmedAlias,
    password: trimmedPassword,
    existingIndex: existing,
  });

  const nextAccounts = [
    ...params.accounts.filter((a) => a.userId !== item.userId),
    item,
  ].sort((a, b) => a.username.localeCompare(b.username));

  return {
    item,
    nextAccounts,
    statusMessage: `Saved account @${item.username} (#${item.alias}, ID: ${item.userId}).`,
  };
}

export async function executeStartRemoteTuningSession(params: {
  bridge: CloudProfileSyncBridgeCallbacks;
  account: {
    userId: string;
    username?: string;
    alias?: string;
    displayName?: string;
    password?: string;
  };
  existingSession: ActiveRemoteTuningSession | null;
  applySnapshotSafely: (snapshot: ProfileFlatSnapshot) => void;
  setLastPushedSnapshotJson: (json: string) => void;
}): Promise<{
  session: ActiveRemoteTuningSession;
  statusMessage: string;
}> {
  const targetId = String(params.account.userId || params.account.username || '').trim();
  const stashedLocalSnapshot = params.existingSession
    ? params.existingSession.stashedLocalSnapshot
    : collectUnifiedProfileSnapshot();

  const record = await params.bridge.fetchUserCompleteRecord(targetId, 'dev');
  const { session, effectiveTargetSnap, initialHash } =
    evaluateRemoteTuningSessionFromRecord({
      account: params.account,
      targetId,
      record,
      fallbackSnapshot: collectUnifiedProfileSnapshot(),
      stashedLocalSnapshot,
    });

  params.applySnapshotSafely(effectiveTargetSnap);
  params.setLastPushedSnapshotJson(JSON.stringify(effectiveTargetSnap));
  useAppStore.getState().navigate('settings');

  return {
    session,
    statusMessage: `Remote tuning active for #${session.alias} (@${session.username}, base commit #${initialHash}).`,
  };
}

export async function executePushActiveRemoteSession(params: {
  bridge: CloudProfileSyncBridgeCallbacks;
  session: ActiveRemoteTuningSession;
  currentSnap: ProfileFlatSnapshot;
}): Promise<{
  rev: number;
  revHash: string;
  patchState: (state: CloudProfileSyncState) => Partial<CloudProfileSyncState>;
}> {
  const { bridge, session, currentSnap } = params;
  const pub = await bridge.publishDevProfileSlot({
    userId: session.userId,
    username: session.username,
    alias: session.alias,
    displayName: session.displayName,
    password: session.password,
    snapshot: currentSnap,
    baseSnapshot: session.baseTargetSnapshot,
    prevIndex: session.existingIndex,
  });

  return {
    rev: pub.rev,
    revHash: pub.revHash,
    patchState: (state) => {
      if (
        !state.activeRemoteSession ||
        state.activeRemoteSession.userId !== session.userId
      ) {
        return state;
      }
      const nextIndex = buildUpdatedIndexAfterRemotePush({
        userId: session.userId,
        username: session.username,
        alias: session.alias,
        displayName: session.displayName,
        password: session.password,
        existingIndex: state.activeRemoteSession.existingIndex,
        devRev: pub.rev,
        devRevHash: pub.revHash,
        snapshot: currentSnap,
      });
      return {
        devRev: pub.rev,
        devRevHash: pub.revHash,
        lastSyncedAt: Date.now(),
        statusMessage: `Deployed live commit #${pub.revHash} to #${session.alias}.`,
        activeRemoteSession: {
          ...state.activeRemoteSession,
          existingIndex: nextIndex,
          lastPushedAt: Date.now(),
          pushCount: state.activeRemoteSession.pushCount + 1,
          lastCommitHash: pub.revHash,
        },
      };
    },
  };
}

export async function executeExitRemoteTuningSession(params: {
  bridge: CloudProfileSyncBridgeCallbacks | null;
  session: ActiveRemoteTuningSession;
  lastPushedSnapshotJson: string;
  clearRemotePushDebounceTimer: () => void;
  applySnapshotSafely: (snapshot: ProfileFlatSnapshot) => void;
  setLastPushedSnapshotJson: (json: string) => void;
}): Promise<string> {
  const {
    bridge,
    session,
    lastPushedSnapshotJson,
    clearRemotePushDebounceTimer,
    applySnapshotSafely,
    setLastPushedSnapshotJson,
  } = params;

  clearRemotePushDebounceTimer();

  const finalSnap = collectUnifiedProfileSnapshot();
  if (
    bridge &&
    !isDeepEqualJsonValue(finalSnap, session.baseTargetSnapshot) &&
    JSON.stringify(finalSnap) !== lastPushedSnapshotJson
  ) {
    try {
      await bridge.publishDevProfileSlot({
        userId: session.userId,
        username: session.username,
        alias: session.alias,
        displayName: session.displayName,
        password: session.password,
        snapshot: finalSnap,
        baseSnapshot: session.baseTargetSnapshot,
        prevIndex: session.existingIndex,
      });
    } catch {
      // Always restore developer local state even if final flush fails
    }
  }

  applySnapshotSafely(session.stashedLocalSnapshot);
  setLastPushedSnapshotJson(JSON.stringify(session.stashedLocalSnapshot));
  useAppStore.getState().navigate('dev-remote-profile');

  return `Exited remote profile #${session.alias} and restored local configuration.`;
}

export function executeLocalUserProfileBackupExport(state: CloudProfileSyncState): {
  filename: string;
  statusMessage: string;
} {
  const filename = performLocalUserBackupExport({
    snapshot: collectUnifiedProfileSnapshot(),
    loggedInUser: state.loggedInUser,
    userRev: state.userRev,
    userRevHash: state.userRevHash,
    devRev: state.devRev,
    devRevHash: state.devRevHash,
  });
  return {
    filename,
    statusMessage: `Exported profile backup "${filename}".`,
  };
}

export async function executeRemoteAccountProfileBackupExport(
  bridge: CloudProfileSyncBridgeCallbacks,
  account: CloudManagedAccountItem
): Promise<{ filename: string; statusMessage: string }> {
  const filename = await performRemoteAccountBackupExport(
    bridge,
    account,
    collectUnifiedProfileSnapshot()
  );
  return {
    filename,
    statusMessage: `Exported backup "${filename}" for #${account.alias} (@${account.username}).`,
  };
}

export function processWatchedDevSlotUpdate(params: {
  devPayload: import('../config/cloudProfileSyncTypes').CloudDevSlotRecord;
  indexPayload?: CloudManagedAccountItem | null;
  loggedInUser: import('../config/cloudProfileSyncTypes').LoggedInCloudUser;
  previousAppliedDevSnapshot: ProfileFlatSnapshot | null;
  currentLocalSnapshot: ProfileFlatSnapshot;
  formatCloudCommitHashFn: (hash?: string, rev?: number) => string;
  evaluateIncomingDevSlotMergeFn: typeof import('./cloudProfileUserSyncActions').evaluateIncomingDevSlotMerge;
  saveCloudUserFn: typeof import('./cloudProfileUserSyncActions').saveCloudUser;
  saveStoredDevAckStateFn: typeof import('./cloudProfileUserSyncActions').saveStoredDevAckState;
}): {
  mergedSnapshot: ProfileFlatSnapshot;
  patchState: Partial<CloudProfileSyncState>;
} {
  const {
    devPayload,
    indexPayload,
    loggedInUser,
    previousAppliedDevSnapshot,
    currentLocalSnapshot,
    formatCloudCommitHashFn,
    evaluateIncomingDevSlotMergeFn,
    saveCloudUserFn,
    saveStoredDevAckStateFn,
  } = params;

  const mergeRes = evaluateIncomingDevSlotMergeFn({
    devPayload,
    previousAppliedDevSnapshot,
    currentLocalSnapshot,
  });

  const incomingHash = formatCloudCommitHashFn(devPayload.revHash, devPayload.rev);
  const resolvedUserId = indexPayload?.userId || loggedInUser.userId;
  const snapName = mergeRes.mergedSnapshot['garage.displayName'];
  const nextUser = {
    ...loggedInUser,
    userId: resolvedUserId,
    username: indexPayload?.username || loggedInUser.username,
    alias: indexPayload?.alias || loggedInUser.alias,
    displayName:
      typeof snapName === 'string' && snapName.trim()
        ? snapName.trim()
        : indexPayload?.displayName || loggedInUser.displayName,
  };
  saveCloudUserFn(nextUser);

  if (mergeRes.conflicts.length === 0) {
    saveStoredDevAckStateFn(resolvedUserId, {
      devRev: devPayload.rev,
      devRevHash: incomingHash,
      appliedDevSnapshot: devPayload.snapshot,
    });
  }

  return {
    mergedSnapshot: mergeRes.mergedSnapshot,
    patchState: {
      loggedInUser: nextUser,
      devRev: devPayload.rev,
      devRevHash: incomingHash,
      mergedBaseSnapshot: mergeRes.mergedSnapshot,
      conflicts: mergeRes.conflicts,
      syncStatus: mergeRes.conflicts.length > 0 ? 'conflict' : 'synced',
      lastSyncedAt: Date.now(),
      statusMessage:
        mergeRes.conflicts.length > 0
          ? `${mergeRes.conflicts.length} conflict(s) detected from developer commit #${incomingHash}.`
          : `Applied live developer commit #${incomingHash} (${mergeRes.autoAppliedDevKeys.length} field(s)).`,
    },
  };
}

