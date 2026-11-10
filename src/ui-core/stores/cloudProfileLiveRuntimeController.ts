/**
 * cloudProfileLiveRuntimeController.ts
 * Encapsulates live dev-slot subscription watching, debounced auto-push scheduling,
 * and remote tuning session concurrency queues for `cloudProfileSyncStore`.
 */

import { formatCloudCommitHash } from '../config/cloudProfileMergePipeline';
import {
  type CloudProfileSyncBridgeCallbacks,
  type CloudProfileSyncState,
  type ProfileFlatSnapshot,
} from '../config/cloudProfileSyncTypes';
import { processWatchedDevSlotUpdate } from './cloudProfileRemoteTuningActions';
import {
  applyUnifiedProfileSnapshot,
  attachUnifiedProfileChangeSubscription,
  collectUnifiedProfileSnapshot,
} from './cloudProfileSnapshotCollector';
import {
  evaluateIncomingDevSlotMerge,
  saveCloudUser,
  saveStoredDevAckState,
  shouldApplyIncomingDevSlot,
} from './cloudProfileUserSyncActions';

export interface CloudProfileStoreAccess {
  getState: () => CloudProfileSyncState;
  setState: (
    partial:
      | Partial<CloudProfileSyncState>
      | ((state: CloudProfileSyncState) => Partial<CloudProfileSyncState>)
  ) => void;
}

export class CloudProfileLiveRuntimeController {
  bridgeCallbacks: CloudProfileSyncBridgeCallbacks | null = null;
  lastPushedSnapshotJson = '';
  lastAppliedDevSnapshot: ProfileFlatSnapshot | null = null;
  remotePushInFlight = false;
  remotePushQueued = false;

  private activeDevWatchUnsubscribe: (() => void) | null = null;
  private activeWatchedUserKey = '';
  private liveStoreSubscriptionsInitialized = false;
  private remotePushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private userAutoPushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private storeAccess: CloudProfileStoreAccess | null = null;

  constructor(initialAppliedDevSnapshot: ProfileFlatSnapshot | null) {
    this.lastAppliedDevSnapshot = initialAppliedDevSnapshot;
  }

  bindStore(access: CloudProfileStoreAccess): void {
    this.storeAccess = access;
  }

  clearRemotePushDebounceTimer = (): void => {
    if (this.remotePushDebounceTimer) {
      clearTimeout(this.remotePushDebounceTimer);
      this.remotePushDebounceTimer = null;
    }
  };

  setLastPushedSnapshotJson = (json: string): void => {
    this.lastPushedSnapshotJson = json;
  };

  applySnapshotSafely = (snapshot: ProfileFlatSnapshot): void => {
    this.storeAccess?.setState({ isApplyingSnapshotInternally: true });
    try {
      applyUnifiedProfileSnapshot(snapshot);
    } finally {
      this.storeAccess?.setState({ isApplyingSnapshotInternally: false });
    }
  };

  stopActiveDevSlotWatch = (): void => {
    this.activeWatchedUserKey = '';
    if (this.activeDevWatchUnsubscribe) {
      this.activeDevWatchUnsubscribe();
      this.activeDevWatchUnsubscribe = null;
    }
  };

  attachDevSlotWatchIfAllowed = (userId: string, username?: string): void => {
    const state = this.storeAccess?.getState();
    if (!state || !this.bridgeCallbacks || !state.allowRemoteProfileDeployment) {
      this.stopActiveDevSlotWatch();
      return;
    }

    const resolvedUsername = username || state.loggedInUser?.username || '';
    const watchKey = `${userId}:${resolvedUsername}`;
    if (this.activeDevWatchUnsubscribe && this.activeWatchedUserKey === watchKey) {
      return;
    }

    this.stopActiveDevSlotWatch();
    this.activeWatchedUserKey = watchKey;

    this.activeDevWatchUnsubscribe = this.bridgeCallbacks.watchUserDevSlot(
      userId,
      (devPayload, indexPayload) => {
        const cur = this.storeAccess?.getState();
        if (!cur || !cur.loggedInUser) return;
        const matchesUser =
          cur.loggedInUser.userId === userId ||
          (resolvedUsername && cur.loggedInUser.username === resolvedUsername);
        if (!matchesUser || !cur.allowRemoteProfileDeployment || cur.activeRemoteSession) return;
        if (
          !shouldApplyIncomingDevSlot(
            devPayload,
            cur.devRev,
            cur.devRevHash,
            cur.loggedInUser.userId
          )
        ) {
          return;
        }

        const { mergedSnapshot, patchState } = processWatchedDevSlotUpdate({
          devPayload,
          indexPayload,
          loggedInUser: cur.loggedInUser,
          previousAppliedDevSnapshot: this.lastAppliedDevSnapshot,
          currentLocalSnapshot: collectUnifiedProfileSnapshot(),
          formatCloudCommitHashFn: formatCloudCommitHash,
          evaluateIncomingDevSlotMergeFn: evaluateIncomingDevSlotMerge,
          saveCloudUserFn: saveCloudUser,
          saveStoredDevAckStateFn: saveStoredDevAckState,
        });
        this.lastAppliedDevSnapshot = devPayload.snapshot;
        this.applySnapshotSafely(mergedSnapshot);
        this.lastPushedSnapshotJson = JSON.stringify(mergedSnapshot);
        this.storeAccess?.setState(patchState);
      },
      resolvedUsername
    );
  };

  scheduleLiveSyncFromStoreChange = (): void => {
    const state = this.storeAccess?.getState();
    if (!state || state.isApplyingSnapshotInternally || !this.bridgeCallbacks) return;

    if (state.activeRemoteSession) {
      if (this.remotePushDebounceTimer) clearTimeout(this.remotePushDebounceTimer);
      this.remotePushDebounceTimer = setTimeout(() => {
        this.remotePushDebounceTimer = null;
        void this.storeAccess?.getState().pushActiveRemoteSessionNow();
      }, 80);
      return;
    }

    if (state.loggedInUser && state.autoSyncEnabled && state.conflicts.length === 0) {
      if (this.userAutoPushDebounceTimer) clearTimeout(this.userAutoPushDebounceTimer);
      this.userAutoPushDebounceTimer = setTimeout(() => {
        this.userAutoPushDebounceTimer = null;
        const curState = this.storeAccess?.getState();
        if (!curState || !curState.loggedInUser || curState.activeRemoteSession) return;
        const snap = collectUnifiedProfileSnapshot();
        if (JSON.stringify(snap) === this.lastPushedSnapshotJson) return;
        void curState.pushUserCloudProfile();
      }, 650);
    }
  };

  ensureLiveStoreSubscriptions = (): void => {
    if (this.liveStoreSubscriptionsInitialized) return;
    this.liveStoreSubscriptionsInitialized = true;
    attachUnifiedProfileChangeSubscription(this.scheduleLiveSyncFromStoreChange);
  };
}
