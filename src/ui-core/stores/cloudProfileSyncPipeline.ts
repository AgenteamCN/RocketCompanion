/**
 * cloudProfileSyncPipeline.ts
 * Remote developer session evaluation, index metadata updates, backup exports,
 * and re-exports of user sync pipeline helpers for `cloudProfileSyncStore`.
 */

import { exportManagedAccountBackup, exportUserBackupFromLoggedInState } from '../config/cloudProfileBackupExporter';
import { computeCommitHashSync, computeProfileThreeWayMerge, formatCloudCommitHash, normalizeCloudUsername } from '../config/cloudProfileMergePipeline';
import { type ActiveRemoteTuningSession, type CloudFetchedUserCompleteRecord, type CloudManagedAccountItem, type CloudProfileSyncBridgeCallbacks, type LoggedInCloudUser, type ProfileFlatSnapshot } from '../config/cloudProfileSyncTypes';

export type {
  EvaluatedCloudLoginMerge,
  StoredDevAckState,
} from './cloudProfileUserSyncActions';

export function buildUpdatedIndexAfterRemotePush(params: {
  userId: string;
  username: string;
  alias: string;
  displayName: string;
  password: string;
  existingIndex: CloudManagedAccountItem | null;
  devRev: number;
  devRevHash: string;
  snapshot: ProfileFlatSnapshot;
}): CloudManagedAccountItem {
  const {
    userId,
    username,
    alias,
    displayName,
    password,
    existingIndex,
    devRev,
    devRevHash,
    snapshot,
  } = params;
  const userRev = existingIndex?.userRev ?? 0;
  const userRevHash =
    existingIndex?.userRevHash ||
    (userRev > 0 ? computeCommitHashSync(snapshot, userRev, userId) : 'none');
  return {
    userId,
    username: username || existingIndex?.username || userId,
    alias: alias || existingIndex?.alias || username || userId,
    displayName:
      displayName ||
      (typeof snapshot['garage.displayName'] === 'string'
        ? String(snapshot['garage.displayName'])
        : existingIndex?.displayName || alias || userId),
    password: password || existingIndex?.password || '',
    passphraseHash: existingIndex?.passphraseHash ?? '',
    updatedAt: Date.now(),
    userRev,
    userRevHash,
    devRev,
    devRevHash,
  };
}

export function evaluateRemoteTuningSessionFromRecord(params: {
  account: {
    userId: string;
    username?: string;
    alias?: string;
    displayName?: string;
    password?: string;
  };
  targetId: string;
  record: CloudFetchedUserCompleteRecord;
  fallbackSnapshot: ProfileFlatSnapshot;
  stashedLocalSnapshot: ProfileFlatSnapshot;
}): {
  session: ActiveRemoteTuningSession;
  effectiveTargetSnap: ProfileFlatSnapshot;
  initialHash: string;
} {
  const { account, targetId, record, fallbackSnapshot, stashedLocalSnapshot } = params;
  const resolvedUserId = record.index?.userId || targetId;
  const resolvedUsername =
    account.username || record.index?.username || normalizeCloudUsername(targetId);
  const resolvedAlias = account.alias?.trim() || record.index?.alias?.trim() || resolvedUsername;
  const resolvedDisplayName =
    account.displayName?.trim() || record.index?.displayName?.trim() || resolvedAlias;
  const resolvedPassword = account.password?.trim() || record.index?.password?.trim() || '';
  const userSnap = record.userSlot?.snapshot ?? fallbackSnapshot;
  const effectiveTargetSnap =
    record.devSlot?.snapshot && Object.keys(record.devSlot.snapshot).length > 0
      ? computeProfileThreeWayMerge(
          record.devSlot.baseSnapshot,
          userSnap,
          record.devSlot.snapshot
        ).mergedSnapshot
      : userSnap;

  const initialHash = formatCloudCommitHash(
    record.devSlot?.revHash ?? record.userSlot?.revHash,
    record.devSlot?.rev || record.userSlot?.rev || 0
  );

  return {
    session: {
      userId: resolvedUserId,
      username: resolvedUsername,
      alias: resolvedAlias,
      displayName: resolvedDisplayName,
      password: resolvedPassword,
      stashedLocalSnapshot,
      baseTargetSnapshot: userSnap,
      existingIndex: record.index,
      startedAt: Date.now(),
      lastPushedAt: null,
      pushCount: 0,
      lastCommitHash: initialHash !== 'none' ? initialHash : null,
    },
    effectiveTargetSnap,
    initialHash,
  };
}

export function performLocalUserBackupExport(params: {
  snapshot: ProfileFlatSnapshot;
  loggedInUser: LoggedInCloudUser | null;
  userRev: number;
  userRevHash: string;
  devRev: number;
  devRevHash: string;
}): string {
  const { snapshot, loggedInUser, userRev, userRevHash, devRev, devRevHash } = params;
  const activeHash =
    userRevHash !== 'none' ? userRevHash : devRevHash !== 'none' ? devRevHash : null;
  return exportUserBackupFromLoggedInState(snapshot, loggedInUser, userRev, devRev, activeHash);
}

export async function performRemoteAccountBackupExport(
  bridge: CloudProfileSyncBridgeCallbacks,
  account: CloudManagedAccountItem,
  fallbackSnapshot: ProfileFlatSnapshot
): Promise<string> {
  const record = await bridge.fetchUserCompleteRecord(account.userId, 'dev');
  const baseSnap = record.userSlot?.snapshot ?? fallbackSnapshot;
  const mergedSnap =
    record.devSlot?.snapshot && Object.keys(record.devSlot.snapshot).length > 0
      ? computeProfileThreeWayMerge(
          record.devSlot.baseSnapshot,
          baseSnap,
          record.devSlot.snapshot
        ).mergedSnapshot
      : baseSnap;
  const activeHash =
    record.devSlot?.revHash ||
    record.userSlot?.revHash ||
    account.devRevHash ||
    account.userRevHash;
  return exportManagedAccountBackup(account, mergedSnap, activeHash);
}
