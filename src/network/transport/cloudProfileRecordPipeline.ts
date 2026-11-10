/**
 * cloudProfileRecordPipeline.ts
 * Pure types, normalization, immutable `userId` generation, commit hash helpers,
 * and slot/index payload builders for `CloudProfileSyncClient`.
 */

import {
  computeCommitHashSync,
  formatCloudCommitHash,
  generateCloudUserId,
  normalizeCloudUsername,
} from '../../ui-core/config/cloudProfileMergePipeline.ts';
import { computeShortConfigHashSync } from './credentialBundleCryptoPipeline.ts';

export interface CloudAccountIndexEntry {
  userId: string;
  username: string;
  alias: string;
  displayName: string;
  password?: string;
  passphraseHash: string;
  updatedAt: number;
  userRev: number;
  userRevHash: string;
  devRev: number;
  devRevHash: string;
}

export interface CloudUserSlotPayload {
  userId: string;
  username?: string;
  alias?: string;
  displayName?: string;
  passphraseHash: string;
  rev: number;
  revHash: string;
  updatedAt: number;
  snapshot: Record<string, unknown>;
  ackDevRev?: number;
  ackDevRevHash?: string;
}

export interface CloudDevSlotPayload {
  userId: string;
  username?: string;
  alias?: string;
  displayName?: string;
  rev: number;
  revHash: string;
  updatedAt: number;
  snapshot: Record<string, unknown>;
  baseSnapshot: Record<string, unknown>;
}

export interface CloudUserCompleteRecord {
  index: CloudAccountIndexEntry | null;
  userSlot: CloudUserSlotPayload | null;
  devSlot: CloudDevSlotPayload | null;
}

export function sanitizeCloudUserId(rawId: string): string {
  return String(rawId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
}

export function computePassphraseHash(userIdOrUsername: string, password: string): string {
  const cleanUser = sanitizeCloudUserId(userIdOrUsername);
  return computeShortConfigHashSync(`rc_cfg_pass_v1|${cleanUser}|${String(password || '')}`);
}

export function normalizeAccountIndexEntry(
  topicUserId: string,
  raw: Partial<CloudAccountIndexEntry> | null | undefined
): CloudAccountIndexEntry {
  const userId = sanitizeCloudUserId(raw?.userId || topicUserId);
  const username = normalizeCloudUsername(raw?.username || userId) || userId;
  const alias = typeof raw?.alias === 'string' && raw.alias.trim() ? raw.alias.trim() : username;
  const displayName =
    typeof raw?.displayName === 'string' && raw.displayName.trim() ? raw.displayName.trim() : alias;
  const userRev = typeof raw?.userRev === 'number' ? raw.userRev : 0;
  const devRev = typeof raw?.devRev === 'number' ? raw.devRev : 0;
  const userRevHash = formatCloudCommitHash(raw?.userRevHash, userRev);
  const devRevHash = formatCloudCommitHash(raw?.devRevHash, devRev);

  return {
    userId,
    username,
    alias,
    displayName,
    password: typeof raw?.password === 'string' ? raw.password : '',
    passphraseHash: typeof raw?.passphraseHash === 'string' ? raw.passphraseHash : '',
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    userRev,
    userRevHash,
    devRev,
    devRevHash,
  };
}

export function buildUserSlotAndIndexPayloads(params: {
  userId: string;
  username?: string;
  password: string;
  alias?: string;
  displayName?: string;
  snapshot: Record<string, unknown>;
  existingIndex?: Partial<CloudAccountIndexEntry> | null;
  ackDevRev?: number;
  ackDevRevHash?: string;
}): { userId: string; userSlot: CloudUserSlotPayload; indexEntry: CloudAccountIndexEntry } {
  const userId = sanitizeCloudUserId(params.userId || params.existingIndex?.userId || '');
  if (!userId) throw new Error('Account ID is required.');
  const username =
    normalizeCloudUsername(params.username || params.existingIndex?.username || userId) || userId;
  const now = Date.now();
  const passphraseHash = computePassphraseHash(userId, params.password);
  const nextUserRev = (params.existingIndex?.userRev ?? 0) + 1;
  const revHash = computeCommitHashSync(params.snapshot, nextUserRev, userId);
  const resolvedAlias = params.alias?.trim() || params.existingIndex?.alias?.trim() || username;
  const resolvedDisplayName =
    params.displayName?.trim() ||
    (typeof params.snapshot['garage.displayName'] === 'string'
      ? String(params.snapshot['garage.displayName']).trim()
      : '') ||
    params.existingIndex?.displayName?.trim() ||
    resolvedAlias;
  const devRev = params.existingIndex?.devRev ?? 0;
  const devRevHash = formatCloudCommitHash(params.existingIndex?.devRevHash, devRev);

  const userSlot: CloudUserSlotPayload = {
    userId,
    username,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    passphraseHash,
    rev: nextUserRev,
    revHash,
    updatedAt: now,
    snapshot: params.snapshot,
    ...(typeof params.ackDevRev === 'number' ? { ackDevRev: params.ackDevRev } : {}),
    ...(typeof params.ackDevRevHash === 'string' ? { ackDevRevHash: params.ackDevRevHash } : {}),
  };

  const indexEntry: CloudAccountIndexEntry = {
    userId,
    username,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    password: params.password,
    passphraseHash,
    updatedAt: now,
    userRev: nextUserRev,
    userRevHash: revHash,
    devRev,
    devRevHash,
  };

  return { userId, userSlot, indexEntry };
}

export function buildDevSlotAndIndexPayloads(params: {
  userId: string;
  username?: string;
  password?: string;
  alias?: string;
  displayName?: string;
  snapshot: Record<string, unknown>;
  baseSnapshot: Record<string, unknown>;
  existingIndex?: Partial<CloudAccountIndexEntry> | null;
}): { userId: string; devSlot: CloudDevSlotPayload; indexEntry: CloudAccountIndexEntry } {
  const userId = sanitizeCloudUserId(params.userId || params.existingIndex?.userId || '');
  if (!userId) throw new Error('Target account ID is required.');
  const username =
    normalizeCloudUsername(params.username || params.existingIndex?.username || userId) || userId;
  const now = Date.now();
  const nextDevRev = (params.existingIndex?.devRev ?? 0) + 1;
  const revHash = computeCommitHashSync(params.snapshot, nextDevRev, `${userId}:dev`);
  const resolvedAlias = params.alias?.trim() || params.existingIndex?.alias?.trim() || username;
  const resolvedDisplayName =
    params.displayName?.trim() ||
    (typeof params.snapshot['garage.displayName'] === 'string'
      ? String(params.snapshot['garage.displayName']).trim()
      : '') ||
    params.existingIndex?.displayName?.trim() ||
    resolvedAlias;
  const resolvedPassword =
    params.password !== undefined ? params.password : params.existingIndex?.password || '';
  const passphraseHash = resolvedPassword
    ? computePassphraseHash(userId, resolvedPassword)
    : params.existingIndex?.passphraseHash || '';
  const userRev = params.existingIndex?.userRev ?? 0;
  const userRevHash = formatCloudCommitHash(params.existingIndex?.userRevHash, userRev);

  const devSlot: CloudDevSlotPayload = {
    userId,
    username,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    rev: nextDevRev,
    revHash,
    updatedAt: now,
    snapshot: params.snapshot,
    baseSnapshot: params.baseSnapshot,
  };

  const indexEntry: CloudAccountIndexEntry = {
    userId,
    username,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    password: resolvedPassword,
    passphraseHash,
    updatedAt: now,
    userRev,
    userRevHash,
    devRev: nextDevRev,
    devRevHash: revHash,
  };

  return { userId, devSlot, indexEntry };
}

export function buildUpsertedAccountIndexEntry(params: {
  userId?: string;
  username: string;
  password: string;
  alias: string;
  displayName?: string;
  existingIndex?: Partial<CloudAccountIndexEntry> | null;
}): CloudAccountIndexEntry {
  const cleanUsername = normalizeCloudUsername(params.username);
  if (!cleanUsername) throw new Error('Username is required.');
  const resolvedUserId = sanitizeCloudUserId(
    params.userId || params.existingIndex?.userId || generateCloudUserId(cleanUsername)
  );
  const now = Date.now();
  const passphraseHash = computePassphraseHash(resolvedUserId, params.password);
  const resolvedAlias = params.alias.trim() || cleanUsername;
  const resolvedDisplayName =
    params.displayName?.trim() || params.existingIndex?.displayName?.trim() || resolvedAlias;
  const userRev = params.existingIndex?.userRev ?? 0;
  const devRev = params.existingIndex?.devRev ?? 0;

  return {
    userId: resolvedUserId,
    username: cleanUsername,
    alias: resolvedAlias,
    displayName: resolvedDisplayName,
    password: params.password,
    passphraseHash,
    updatedAt: now,
    userRev,
    userRevHash: formatCloudCommitHash(params.existingIndex?.userRevHash, userRev),
    devRev,
    devRevHash: formatCloudCommitHash(params.existingIndex?.devRevHash, devRev),
  };
}
