/**
 * runtimeProfileSyncBridge.ts
 * Connects `credentialBundleManager` and `cloudProfileSyncClient` (in `src/network/transport`)
 * to `useCloudProfileSyncStore` (in `src/ui-core/stores`), keeping `src/ui-core` 100% transport-free.
 */

import { cloudProfileSyncClient } from '../../network/transport/CloudProfileSyncClient.ts';
import { computePassphraseHash } from '../../network/transport/cloudProfileRecordPipeline.ts';
import { credentialBundleManager } from '../../network/transport/CredentialBundleManager.ts';
import { formatCloudCommitHash } from '../../ui-core/config/cloudProfileMergePipeline.ts';
import { useCloudProfileSyncStore } from '../../ui-core/stores/cloudProfileSyncStore.ts';
import type { SignalingProfileSource } from '../../ui-core/stores/signalingProfileStore.ts';

let profileSyncUnsubscribe: (() => void) | null = null;
let initialAutoPullTriggered = false;

function syncProfileCapabilitiesFromCredentialManager(): void {
  const avail = cloudProfileSyncClient.getAvailability();

  useCloudProfileSyncStore.getState().setCapabilityState({
    available: avail.available,
    canManageAccounts: avail.canManageAccounts,
    source: avail.source as SignalingProfileSource,
  });

  if (avail.available && !initialAutoPullTriggered) {
    const state = useCloudProfileSyncStore.getState();
    if (state.loggedInUser && !state.activeRemoteSession) {
      initialAutoPullTriggered = true;
      void state.pullUserCloudProfile(state.allowRemoteProfileDeployment);
    }
  }
}

export function ensureCloudProfileSyncBridge(): void {
  useCloudProfileSyncStore.getState().setBridgeCallbacks({
    fetchUserCompleteRecord: async (userIdOrUsername, role) => {
      const record = await cloudProfileSyncClient.fetchUserCompleteRecord(userIdOrUsername, role);
      return {
        index: record.index
          ? {
              userId: record.index.userId,
              username: record.index.username || record.index.userId,
              alias: record.index.alias || record.index.username || record.index.userId,
              displayName:
                record.index.displayName ||
                record.index.alias ||
                record.index.username ||
                record.index.userId,
              password: record.index.password || '',
              passphraseHash: record.index.passphraseHash || '',
              updatedAt: record.index.updatedAt || 0,
              userRev: record.index.userRev || 0,
              userRevHash: formatCloudCommitHash(record.index.userRevHash, record.index.userRev),
              devRev: record.index.devRev || 0,
              devRevHash: formatCloudCommitHash(record.index.devRevHash, record.index.devRev),
            }
          : null,
        userSlot: record.userSlot
          ? {
              rev: record.userSlot.rev,
              revHash: formatCloudCommitHash(record.userSlot.revHash, record.userSlot.rev),
              updatedAt: record.userSlot.updatedAt,
              passphraseHash: record.userSlot.passphraseHash,
              snapshot: record.userSlot.snapshot,
              ackDevRev: record.userSlot.ackDevRev,
              ackDevRevHash: record.userSlot.ackDevRevHash,
            }
          : null,
        devSlot: record.devSlot
          ? {
              rev: record.devSlot.rev,
              revHash: formatCloudCommitHash(record.devSlot.revHash, record.devSlot.rev),
              updatedAt: record.devSlot.updatedAt,
              snapshot: record.devSlot.snapshot,
              baseSnapshot: record.devSlot.baseSnapshot,
            }
          : null,
      };
    },
    publishUserProfileSlot: async (params) => {
      const res = await cloudProfileSyncClient.pushUserSlot({
        userId: params.userId,
        username: params.username,
        password: params.password || '',
        alias: params.alias,
        displayName: params.displayName,
        snapshot: params.snapshot,
        existingIndex: params.prevIndex,
        ackDevRev: params.ackDevRev,
        ackDevRevHash: params.ackDevRevHash,
      });
      return { rev: res.userSlot.rev, revHash: res.userSlot.revHash };
    },
    publishDevProfileSlot: async (params) => {
      const res = await cloudProfileSyncClient.pushDevSlot({
        userId: params.userId,
        username: params.username,
        password: params.password,
        alias: params.alias,
        displayName: params.displayName,
        snapshot: params.snapshot,
        baseSnapshot: params.baseSnapshot,
        existingIndex: params.prevIndex,
      });
      return { rev: res.devSlot.rev, revHash: res.devSlot.revHash };
    },
    fetchAllAccounts: async () => {
      const list = await cloudProfileSyncClient.fetchAccountDirectory();
      return list.map((item) => ({
        userId: item.userId,
        username: item.username || item.userId,
        alias: item.alias || item.username || item.userId,
        displayName: item.displayName || item.alias || item.username || item.userId,
        password: item.password || '',
        passphraseHash: item.passphraseHash || '',
        updatedAt: item.updatedAt || 0,
        userRev: item.userRev || 0,
        userRevHash: formatCloudCommitHash(item.userRevHash, item.userRev),
        devRev: item.devRev || 0,
        devRevHash: formatCloudCommitHash(item.devRevHash, item.devRev),
      }));
    },
    upsertAccountDirectoryEntry: async (params) => {
      const entry = await cloudProfileSyncClient.upsertAccountIndex({
        userId: params.userId,
        username: params.username,
        password: params.password,
        alias: params.alias,
        displayName: params.displayName,
        existingIndex: params.existingIndex,
      });
      return {
        userId: entry.userId,
        username: entry.username,
        alias: entry.alias,
        displayName: entry.displayName,
        password: entry.password || '',
        passphraseHash: entry.passphraseHash || '',
        updatedAt: entry.updatedAt || 0,
        userRev: entry.userRev || 0,
        userRevHash: entry.userRevHash,
        devRev: entry.devRev || 0,
        devRevHash: entry.devRevHash,
      };
    },
    deleteAccountDirectoryEntry: async (userId) => {
      await cloudProfileSyncClient.deleteAccount(userId);
    },
    watchUserDevSlot: (userId, onUpdate, username) => {
      let activeUnsub: (() => void) | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelled = false;

      const startWatch = () => {
        if (cancelled) return;
        void cloudProfileSyncClient
          .watchUserDevSlot(
            userId,
            'client',
            (devPayload, indexEntry) => {
              if (cancelled) return;
              onUpdate(
                {
                  rev: devPayload.rev,
                  revHash: devPayload.revHash,
                  updatedAt: devPayload.updatedAt,
                  snapshot: devPayload.snapshot,
                  baseSnapshot: devPayload.baseSnapshot,
                },
                indexEntry
                  ? {
                      userId: indexEntry.userId,
                      username: indexEntry.username,
                      alias: indexEntry.alias,
                      displayName: indexEntry.displayName,
                      password: indexEntry.password || '',
                      passphraseHash: indexEntry.passphraseHash || '',
                      updatedAt: indexEntry.updatedAt,
                      userRev: indexEntry.userRev,
                      userRevHash: indexEntry.userRevHash,
                      devRev: indexEntry.devRev,
                      devRevHash: indexEntry.devRevHash,
                    }
                  : devPayload.alias
                    ? {
                        userId: devPayload.userId,
                        username: devPayload.username || devPayload.userId,
                        alias: devPayload.alias,
                        displayName: devPayload.displayName || devPayload.alias,
                        password: '',
                        passphraseHash: '',
                        updatedAt: devPayload.updatedAt,
                        userRev: 0,
                        userRevHash: 'none',
                        devRev: devPayload.rev,
                        devRevHash: devPayload.revHash,
                      }
                    : null
              );
            },
            username
          )
          .then((unsub) => {
            if (cancelled) {
              unsub();
            } else {
              activeUnsub = unsub;
            }
          })
          .catch(() => {
            if (!cancelled) {
              retryTimer = setTimeout(startWatch, 2000);
            }
          });
      };

      startWatch();

      return () => {
        cancelled = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (activeUnsub) {
          activeUnsub();
          activeUnsub = null;
        }
      };
    },
    computePassphraseHash: async (userId, password) => computePassphraseHash(userId, password),
  });

  syncProfileCapabilitiesFromCredentialManager();

  if (!profileSyncUnsubscribe) {
    profileSyncUnsubscribe = credentialBundleManager.subscribe(() => {
      syncProfileCapabilitiesFromCredentialManager();
    });
  }
}
