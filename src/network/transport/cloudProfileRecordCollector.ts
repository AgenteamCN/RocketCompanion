import {
  formatCloudCommitHash,
  generateCloudUserId,
  normalizeCloudUsername,
} from '../../ui-core/config/cloudProfileMergePipeline.ts';
import {
  normalizeAccountIndexEntry,
  sanitizeCloudUserId,
  type CloudAccountIndexEntry,
  type CloudDevSlotPayload,
  type CloudUserSlotPayload,
} from './cloudProfileRecordPipeline.ts';

export function matchesCloudAccountIdentity(params: {
  candidateUserId?: string | null;
  candidateUsername?: string | null;
  targetUserId: string;
  targetUsername: string;
  deterministicUserId: string;
}): boolean {
  const candId = sanitizeCloudUserId(params.candidateUserId || '');
  const candUser = normalizeCloudUsername(params.candidateUsername || '');
  if (
    candId &&
    (candId === params.targetUserId ||
      (params.deterministicUserId && candId === params.deterministicUserId) ||
      (params.targetUsername && candId === params.targetUsername))
  ) {
    return true;
  }
  if (params.targetUsername && candUser && candUser === params.targetUsername) {
    return true;
  }
  return false;
}

export function buildDeterministicTargetUserId(username: string): string {
  const clean = normalizeCloudUsername(username);
  return clean && !clean.startsWith('u_') ? generateCloudUserId(clean) : '';
}

export function normalizeWatchedDevSlotPayload(
  rawDev: CloudDevSlotPayload,
  fallbackUserId: string
): CloudDevSlotPayload {
  return {
    ...rawDev,
    userId: sanitizeCloudUserId(rawDev.userId || fallbackUserId),
    revHash: formatCloudCommitHash(rawDev.revHash, rawDev.rev),
  };
}

export function createWatchedDevSlotPacketListener(params: {
  ns: string;
  userId: string;
  cleanUsername: string;
  deterministicId: string;
  onDevSlotUpdate: (
    devSlot: CloudDevSlotPayload,
    indexEntry: CloudAccountIndexEntry | null
  ) => void;
}): {
  topicsToWatch: string[];
  listener: (msg: { topic: string; parsedJson: unknown }) => void;
} {
  const { ns, userId, cleanUsername, deterministicId, onDevSlotUpdate } = params;
  const directDevTopic = `${ns}/users/${userId}/dev`;
  const directIndexTopic = `${ns}/index/${userId}`;
  const wildcardDevTopic = `${ns}/users/+/dev`;
  const wildcardIndexTopic = `${ns}/index/+`;
  const indexPrefix = `${ns}/index/`;
  const userPrefix = `${ns}/users/`;

  let latestIndex: CloudAccountIndexEntry | null = null;

  const listener = (msg: { topic: string; parsedJson: unknown }) => {
    if (msg.topic.startsWith(indexPrefix) && msg.parsedJson) {
      const topicId = sanitizeCloudUserId(msg.topic.slice(indexPrefix.length));
      const normalized = normalizeAccountIndexEntry(
        topicId,
        msg.parsedJson as Partial<CloudAccountIndexEntry>
      );
      if (
        matchesCloudAccountIdentity({
          candidateUserId: normalized.userId,
          candidateUsername: normalized.username,
          targetUserId: userId,
          targetUsername: cleanUsername,
          deterministicUserId: deterministicId,
        })
      ) {
        latestIndex = normalized;
      }
    } else if (msg.topic.startsWith(userPrefix) && msg.topic.endsWith('/dev') && msg.parsedJson) {
      const topicUserId = sanitizeCloudUserId(
        msg.topic.slice(userPrefix.length, msg.topic.length - '/dev'.length)
      );
      const rawDev = msg.parsedJson as CloudDevSlotPayload;
      const matchesUser =
        matchesCloudAccountIdentity({
          candidateUserId: rawDev.userId || topicUserId,
          candidateUsername: rawDev.username,
          targetUserId: userId,
          targetUsername: cleanUsername,
          deterministicUserId: deterministicId,
        }) || Boolean(latestIndex && topicUserId === latestIndex.userId);
      if (!matchesUser) return;

      onDevSlotUpdate(normalizeWatchedDevSlotPayload(rawDev, topicUserId || userId), latestIndex);
    }
  };

  return {
    topicsToWatch: [directIndexTopic, directDevTopic, wildcardIndexTopic, wildcardDevTopic],
    listener,
  };
}

export function createCompleteRecordCollector(params: {
  ns: string;
  cleanTarget: string;
  cleanUsername: string;
  deterministicId: string;
  directUserTopic: string;
  directDevTopic: string;
  deterministicUserTopic: string | null;
  deterministicDevTopic: string | null;
}) {
  let matchedIndex: CloudAccountIndexEntry | null = null;
  let userSlot: CloudUserSlotPayload | null = null;
  let devSlot: CloudDevSlotPayload | null = null;

  const indexPrefix = `${params.ns}/index/`;

  const onFirstPass = (msg: { topic: string; parsedJson: unknown }) => {
    if (msg.topic.startsWith(indexPrefix) && msg.parsedJson) {
      const topicId = sanitizeCloudUserId(msg.topic.slice(indexPrefix.length));
      const normalized = normalizeAccountIndexEntry(
        topicId,
        msg.parsedJson as Partial<CloudAccountIndexEntry>
      );
      if (
        matchesCloudAccountIdentity({
          candidateUserId: normalized.userId,
          candidateUsername: normalized.username,
          targetUserId: params.cleanTarget,
          targetUsername: params.cleanUsername,
          deterministicUserId: params.deterministicId,
        })
      ) {
        if (!matchedIndex || (normalized.updatedAt ?? 0) >= (matchedIndex.updatedAt ?? 0)) {
          matchedIndex = normalized;
        }
      }
    } else if (
      msg.topic === params.directUserTopic ||
      (params.deterministicUserTopic && msg.topic === params.deterministicUserTopic)
    ) {
      if (msg.parsedJson) {
        const candidate = msg.parsedJson as CloudUserSlotPayload;
        if (!userSlot || (candidate.updatedAt ?? 0) >= (userSlot.updatedAt ?? 0)) {
          userSlot = candidate;
        }
      }
    } else if (
      msg.topic === params.directDevTopic ||
      (params.deterministicDevTopic && msg.topic === params.deterministicDevTopic)
    ) {
      if (msg.parsedJson) {
        const candidate = msg.parsedJson as CloudDevSlotPayload;
        if (
          !devSlot ||
          (candidate.rev ?? 0) > (devSlot.rev ?? 0) ||
          (candidate.updatedAt ?? 0) >= (devSlot.updatedAt ?? 0)
        ) {
          devSlot = candidate;
        }
      }
    }
  };

  return {
    onFirstPass,
    getState: () => ({ matchedIndex, userSlot, devSlot }),
    setUserSlot: (slot: CloudUserSlotPayload | null) => {
      userSlot = slot;
    },
    setDevSlot: (slot: CloudDevSlotPayload | null) => {
      devSlot = slot;
    },
  };
}
