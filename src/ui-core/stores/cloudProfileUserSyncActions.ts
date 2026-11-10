/**
 * cloudProfileUserSyncActions.ts
 * User Cloud Profile authentication, LocalStorage persistence, 3-Way Merge on login,
 * conflict resolution, and user slot push operations.
 */

import {
  buildEffectiveDevMergeBase,
  computeProfileThreeWayMerge,
  formatCloudCommitHash,
  generateCloudUserId,
  normalizeCloudUsername,
} from '../config/cloudProfileMergePipeline';
import {
  type CloudDevSlotRecord,
  type CloudFetchedUserCompleteRecord,
  type CloudProfileSyncBridgeCallbacks,
  type LoggedInCloudUser,
  type ProfileFlatSnapshot,
  type ProfileMergeConflictItem,
} from '../config/cloudProfileSyncTypes';
import { safeStorage } from '../config/storageHelpers';
import { loadStoredPlayerName } from '../config/vehiclePresets';

const CLOUD_AUTH_STORAGE_KEY = 'rc_cloud_profile_auth_v1';
const ALLOW_REMOTE_DEPLOY_STORAGE_KEY = 'rc_allow_remote_profile_deployment_v1';
const CLOUD_DEV_ACK_STORAGE_KEY = 'rc_cloud_profile_dev_ack_v1';

export interface StoredDevAckState {
  devRev: number;
  devRevHash: string;
  appliedDevSnapshot: ProfileFlatSnapshot | null;
}

export function loadStoredDevAckState(userId: string): StoredDevAckState | null {
  if (!userId) return null;
  try {
    const raw = safeStorage.get(`${CLOUD_DEV_ACK_STORAGE_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      devRev: typeof parsed.devRev === 'number' ? parsed.devRev : 0,
      devRevHash: typeof parsed.devRevHash === 'string' ? parsed.devRevHash : 'none',
      appliedDevSnapshot:
        parsed.appliedDevSnapshot && typeof parsed.appliedDevSnapshot === 'object'
          ? (parsed.appliedDevSnapshot as ProfileFlatSnapshot)
          : null,
    };
  } catch {
    return null;
  }
}

export function saveStoredDevAckState(
  userId: string,
  state: StoredDevAckState | null
): void {
  if (!userId) return;
  const key = `${CLOUD_DEV_ACK_STORAGE_KEY}:${userId}`;
  if (!state) {
    safeStorage.remove(key);
  } else {
    safeStorage.set(key, JSON.stringify(state));
  }
}

export function loadSavedCloudUser(): LoggedInCloudUser | null {
  try {
    const raw = safeStorage.get(CLOUD_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === 'string' && typeof parsed.password === 'string') {
      const username =
        typeof parsed.username === 'string' && parsed.username
          ? normalizeCloudUsername(parsed.username)
          : normalizeCloudUsername(parsed.userId);
      const alias =
        typeof parsed.alias === 'string' && parsed.alias.trim()
          ? parsed.alias.trim()
          : username;
      const displayName =
        typeof parsed.displayName === 'string' && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : loadStoredPlayerName();
      return {
        userId: parsed.userId,
        username,
        alias,
        displayName,
        password: parsed.password,
      };
    }
  } catch {
    // Ignore malformed saved auth
  }
  return null;
}

export function saveCloudUser(user: LoggedInCloudUser | null): void {
  if (!user) {
    safeStorage.remove(CLOUD_AUTH_STORAGE_KEY);
  } else {
    safeStorage.set(CLOUD_AUTH_STORAGE_KEY, JSON.stringify(user));
  }
}

export function loadAllowRemoteProfileDeployment(): boolean {
  const raw = safeStorage.get(ALLOW_REMOTE_DEPLOY_STORAGE_KEY);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return true;
}

export function saveAllowRemoteProfileDeployment(enabled: boolean): void {
  safeStorage.set(ALLOW_REMOTE_DEPLOY_STORAGE_KEY, enabled ? 'true' : 'false');
}

export interface EvaluatedCloudLoginMerge {
  userObj: LoggedInCloudUser;
  targetSnap: ProfileFlatSnapshot;
  conflicts: ProfileMergeConflictItem[];
  autoAppliedCount: number;
  userRev: number;
  userRevHash: string;
  devRev: number;
  devRevHash: string;
  appliedDevSnapshot: ProfileFlatSnapshot | null;
}

export function evaluateRecordMergeOnLogin(params: {
  usernameInput: string;
  trimmedPassword: string;
  record: CloudFetchedUserCompleteRecord;
  currentLocalSnapshot: ProfileFlatSnapshot;
  allowRemoteDeployment: boolean;
  previousAppliedDevSnapshot?: ProfileFlatSnapshot | null;
}): EvaluatedCloudLoginMerge {
  const {
    usernameInput,
    trimmedPassword,
    record,
    currentLocalSnapshot,
    allowRemoteDeployment,
    previousAppliedDevSnapshot,
  } = params;

  const normalizedUsername = normalizeCloudUsername(usernameInput);
  const resolvedUserId =
    record.index?.userId ||
    (normalizedUsername.startsWith('u_') ? normalizedUsername : generateCloudUserId(normalizedUsername));
  const resolvedUsername = record.index?.username ? normalizeCloudUsername(record.index.username) : normalizedUsername;
  const resolvedAlias = record.index?.alias?.trim() || resolvedUsername;

  const baselineUserSnap = record.userSlot?.snapshot ?? currentLocalSnapshot;
  let targetSnap: ProfileFlatSnapshot = { ...baselineUserSnap };
  let conflicts: ProfileMergeConflictItem[] = [];
  let autoAppliedCount = 0;

  const devRev = record.devSlot?.rev ?? record.index?.devRev ?? 0;
  const devRevHash = formatCloudCommitHash(record.devSlot?.revHash ?? record.index?.devRevHash, devRev);

  const storedAck = loadStoredDevAckState(resolvedUserId);
  const ackRev = record.userSlot?.ackDevRev ?? storedAck?.devRev ?? 0;
  const ackHash = record.userSlot?.ackDevRevHash ?? storedAck?.devRevHash ?? 'none';
  const isDevSlotAlreadyAcknowledged =
    devRev > 0 && ackRev >= devRev && (ackHash === devRevHash || devRevHash === 'none');

  let appliedDevSnapshot: ProfileFlatSnapshot | null =
    previousAppliedDevSnapshot ?? storedAck?.appliedDevSnapshot ?? null;

  if (
    allowRemoteDeployment &&
    !isDevSlotAlreadyAcknowledged &&
    record.devSlot?.snapshot &&
    Object.keys(record.devSlot.snapshot).length > 0
  ) {
    const effectiveBase = buildEffectiveDevMergeBase(
      record.devSlot.baseSnapshot,
      appliedDevSnapshot,
      baselineUserSnap
    );
    const mergeResult = computeProfileThreeWayMerge(effectiveBase, baselineUserSnap, record.devSlot.snapshot);
    targetSnap = mergeResult.mergedSnapshot;
    conflicts = mergeResult.conflicts;
    autoAppliedCount = mergeResult.autoAppliedDevKeys.length;
    appliedDevSnapshot = record.devSlot.snapshot;
  } else if (record.devSlot?.snapshot && Object.keys(record.devSlot.snapshot).length > 0) {
    appliedDevSnapshot = record.devSlot.snapshot;
  }

  const snapshotDisplayName =
    typeof targetSnap['garage.displayName'] === 'string' && targetSnap['garage.displayName'].trim()
      ? targetSnap['garage.displayName'].trim()
      : '';
  const resolvedDisplayName =
    snapshotDisplayName || record.index?.displayName?.trim() || loadStoredPlayerName();

  targetSnap['garage.displayName'] = resolvedDisplayName;

  const userRev = record.userSlot?.rev ?? record.index?.userRev ?? 0;
  const userRevHash = formatCloudCommitHash(record.userSlot?.revHash ?? record.index?.userRevHash, userRev);

  const userObj: LoggedInCloudUser = {
    userId: resolvedUserId,
    username: resolvedUsername,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    password: trimmedPassword,
  };

  return {
    userObj,
    targetSnap,
    conflicts,
    autoAppliedCount,
    userRev,
    userRevHash,
    devRev,
    devRevHash,
    appliedDevSnapshot,
  };
}

export function shouldApplyIncomingDevSlot(
  devPayload: CloudDevSlotRecord,
  currentDevRev: number,
  currentDevRevHash: string,
  userId?: string
): boolean {
  const incomingHash = formatCloudCommitHash(devPayload.revHash, devPayload.rev);
  if (userId) {
    const storedAck = loadStoredDevAckState(userId);
    if (storedAck && storedAck.devRev === devPayload.rev && storedAck.devRevHash === incomingHash && incomingHash !== 'none') {
      return false;
    }
  }
  if (devPayload.rev > currentDevRev) return true;
  if (incomingHash !== currentDevRevHash && incomingHash !== 'none') return true;
  return false;
}

export function evaluateIncomingDevSlotMerge(params: {
  devPayload: CloudDevSlotRecord;
  previousAppliedDevSnapshot: ProfileFlatSnapshot | null;
  currentLocalSnapshot: ProfileFlatSnapshot;
}) {
  const { devPayload, previousAppliedDevSnapshot, currentLocalSnapshot } = params;
  const effectiveBase = buildEffectiveDevMergeBase(
    devPayload.baseSnapshot,
    previousAppliedDevSnapshot,
    currentLocalSnapshot
  );
  return computeProfileThreeWayMerge(effectiveBase, currentLocalSnapshot, devPayload.snapshot);
}

export function buildResolvedConflictsSnapshot(
  currentSnapshot: ProfileFlatSnapshot,
  conflicts: ProfileMergeConflictItem[],
  mode: 'selected' | 'all-local' | 'all-dev'
): ProfileFlatSnapshot {
  const resolvedSnap: ProfileFlatSnapshot = { ...currentSnapshot };
  for (const conflict of conflicts) {
    const pick = mode === 'all-local' ? 'local' : mode === 'all-dev' ? 'dev' : conflict.selectedSource;
    const chosenValue = pick === 'local' ? conflict.localValue : conflict.devValue;
    if (chosenValue === undefined) {
      delete resolvedSnap[conflict.key];
    } else {
      resolvedSnap[conflict.key] = chosenValue;
    }
  }
  return resolvedSnap;
}

export async function executeUserCloudLoginAndMerge(params: {
  bridge: CloudProfileSyncBridgeCallbacks;
  normalizedInput: string;
  trimmedPassword: string;
  currentLocalSnapshot: ProfileFlatSnapshot;
  allowRemoteDeployment: boolean;
  previousAppliedDevSnapshot: ProfileFlatSnapshot | null;
  applySnapshotSafely: (snapshot: ProfileFlatSnapshot) => void;
}): Promise<
  | { ok: false; errorMessage: string }
  | { ok: true; evaluated: EvaluatedCloudLoginMerge; nextUserRev: number; nextUserRevHash: string; statusMessage: string }
> {
  const {
    bridge,
    normalizedInput,
    trimmedPassword,
    currentLocalSnapshot,
    allowRemoteDeployment,
    previousAppliedDevSnapshot,
    applySnapshotSafely,
  } = params;

  const record = await bridge.fetchUserCompleteRecord(normalizedInput, 'client');
  const resolvedUserId = record.index?.userId || normalizedInput;
  const [hashByUserId, hashByUsername] = await Promise.all([
    bridge.computePassphraseHash(resolvedUserId, trimmedPassword),
    bridge.computePassphraseHash(normalizedInput, trimmedPassword),
  ]);

  const expectedHash = record.index?.passphraseHash || record.userSlot?.passphraseHash || '';
  const expectedPlainPassword = record.index?.password || '';
  if (
    expectedHash &&
    expectedHash !== hashByUserId &&
    expectedHash !== hashByUsername &&
    (!expectedPlainPassword || expectedPlainPassword !== trimmedPassword)
  ) {
    return { ok: false, errorMessage: 'Incorrect password for this cloud account.' };
  }

  const evaluated = evaluateRecordMergeOnLogin({
    usernameInput: normalizedInput,
    trimmedPassword,
    record,
    currentLocalSnapshot,
    allowRemoteDeployment,
    previousAppliedDevSnapshot,
  });

  saveCloudUser(evaluated.userObj);
  applySnapshotSafely(evaluated.targetSnap);

  if (evaluated.conflicts.length === 0 && evaluated.devRev > 0) {
    saveStoredDevAckState(evaluated.userObj.userId, {
      devRev: evaluated.devRev,
      devRevHash: evaluated.devRevHash,
      appliedDevSnapshot: evaluated.appliedDevSnapshot,
    });
  }

  let nextUserRev = evaluated.userRev;
  let nextUserRevHash = evaluated.userRevHash;

  if (!record.userSlot || evaluated.autoAppliedCount > 0) {
    const pub = await bridge.publishUserProfileSlot({
      userId: evaluated.userObj.userId,
      username: evaluated.userObj.username,
      alias: evaluated.userObj.alias,
      displayName: evaluated.userObj.displayName,
      password: trimmedPassword,
      snapshot: evaluated.targetSnap,
      prevIndex: record.index,
      ackDevRev: evaluated.conflicts.length === 0 ? evaluated.devRev : undefined,
      ackDevRevHash: evaluated.conflicts.length === 0 ? evaluated.devRevHash : undefined,
    });
    nextUserRev = pub.rev;
    nextUserRevHash = pub.revHash;
  }

  const statusMessage =
    evaluated.conflicts.length > 0
      ? `Synced with ${evaluated.conflicts.length} conflict(s) requiring resolution.`
      : evaluated.autoAppliedCount > 0
        ? `Merged ${evaluated.autoAppliedCount} developer setting(s) (commit #${nextUserRevHash}).`
        : `Synced @${evaluated.userObj.username} (commit #${nextUserRevHash}).`;

  return { ok: true, evaluated, nextUserRev, nextUserRevHash, statusMessage };
}

export async function executeUserCloudProfilePush(params: {
  bridge: CloudProfileSyncBridgeCallbacks;
  loggedInUser: LoggedInCloudUser;
  snapshot: ProfileFlatSnapshot;
  devRev: number;
  devRevHash: string;
}): Promise<{ updatedUser: LoggedInCloudUser; rev: number; revHash: string }> {
  const { bridge, loggedInUser, snapshot, devRev, devRevHash } = params;
  const snapName = snapshot['garage.displayName'];
  const liveDisplayName =
    typeof snapName === 'string' && snapName.trim() ? snapName.trim() : loggedInUser.displayName;
  const record = await bridge.fetchUserCompleteRecord(loggedInUser.userId, 'client');
  const pub = await bridge.publishUserProfileSlot({
    userId: loggedInUser.userId,
    username: loggedInUser.username,
    alias: record.index?.alias || loggedInUser.alias,
    displayName: liveDisplayName,
    password: loggedInUser.password,
    snapshot,
    prevIndex: record.index,
    ackDevRev: devRev > 0 ? devRev : undefined,
    ackDevRevHash: devRevHash !== 'none' ? devRevHash : undefined,
  });
  const updatedUser: LoggedInCloudUser = {
    ...loggedInUser,
    displayName: liveDisplayName,
    alias: record.index?.alias || loggedInUser.alias,
  };
  saveCloudUser(updatedUser);
  return { updatedUser, rev: pub.rev, revHash: pub.revHash };
}
