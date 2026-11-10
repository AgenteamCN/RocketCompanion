/**
 * CloudProfileSyncClient.ts
 * High-level Cloud Profile Sync and Developer Remote Profile Tuning client.
 * Completely isolated from WebRTC room signaling by connecting to the dedicated
 * configSync broker and operating strictly under its configured topicNamespace.
 */

import { normalizeCloudUsername } from '../../ui-core/config/cloudProfileMergePipeline.ts';
import { CloudProfileMqttTransport } from './CloudProfileMqttTransport.ts';
import {
  buildDeterministicTargetUserId,
  createCompleteRecordCollector,
  createWatchedDevSlotPacketListener,
} from './cloudProfileRecordCollector.ts';
import {
  buildDevSlotAndIndexPayloads,
  buildUpsertedAccountIndexEntry,
  buildUserSlotAndIndexPayloads,
  normalizeAccountIndexEntry,
  sanitizeCloudUserId,
  type CloudAccountIndexEntry,
  type CloudDevSlotPayload,
  type CloudUserCompleteRecord,
  type CloudUserSlotPayload,
} from './cloudProfileRecordPipeline.ts';
import type { DecodedMqttPublishPayload } from './mqttPacketCodec.ts';

export class CloudProfileSyncClient {
  private readonly transport: CloudProfileMqttTransport;
  private reconnectWatchTimer: ReturnType<typeof setTimeout> | null = null;
  private userSlotWatchUnsub: (() => void) | null = null;
  private activeWatchRequest: {
    userId: string;
    username?: string;
    role: 'client' | 'dev';
    onDevSlotUpdate: (
      devSlot: CloudDevSlotPayload,
      indexEntry: CloudAccountIndexEntry | null
    ) => void;
  } | null = null;

  constructor() {
    this.transport = new CloudProfileMqttTransport(() => {
      if (this.activeWatchRequest) {
        this.scheduleWatchReconnect();
      }
    });
  }

  getAvailability(): { available: boolean; canManageAccounts: boolean; source: string } {
    return this.transport.getAvailability();
  }

  async ensureConnected(
    preferredRole: 'client' | 'dev' = 'client',
    timeoutMs = 5000
  ): Promise<string> {
    return this.transport.ensureConnected(preferredRole, timeoutMs);
  }

  private scheduleWatchReconnect(): void {
    if (this.reconnectWatchTimer || !this.activeWatchRequest) return;
    this.reconnectWatchTimer = setTimeout(() => {
      this.reconnectWatchTimer = null;
      const req = this.activeWatchRequest;
      if (!req) return;
      void this.watchUserDevSlot(req.userId, req.role, req.onDevSlotUpdate, req.username).catch(
        () => {
          this.scheduleWatchReconnect();
        }
      );
    }, 1500);
  }

  async publishRetained(topic: string, payload: unknown | null, timeoutMs = 3000): Promise<void> {
    await this.transport.publishRetained(topic, payload, timeoutMs);
  }

  async fetchAccountDirectory(settleMs = 320): Promise<CloudAccountIndexEntry[]> {
    const ns = await this.ensureConnected('dev');
    const indexPattern = `${ns}/index/+`;
    const entriesById = new Map<string, CloudAccountIndexEntry>();

    const onMessage = (msg: DecodedMqttPublishPayload) => {
      const prefix = `${ns}/index/`;
      if (!msg.topic.startsWith(prefix)) return;
      const topicUserId = sanitizeCloudUserId(msg.topic.slice(prefix.length));
      if (!topicUserId) return;
      if (!msg.rawText || !msg.parsedJson) {
        entriesById.delete(topicUserId);
        return;
      }
      const entry = normalizeAccountIndexEntry(
        topicUserId,
        msg.parsedJson as Partial<CloudAccountIndexEntry>
      );
      entriesById.set(entry.userId, entry);
    };

    this.transport.topicListeners.add(onMessage);
    try {
      await this.transport.subscribeTopic(indexPattern);
      await new Promise((r) => setTimeout(r, settleMs));
    } finally {
      this.transport.topicListeners.delete(onMessage);
      this.transport.unsubscribeTopic(indexPattern);
    }

    return Array.from(entriesById.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async fetchUserCompleteRecord(
    rawUserIdOrUsername: string,
    role: 'client' | 'dev' = 'client',
    settleMs = 280
  ): Promise<CloudUserCompleteRecord> {
    const cleanTarget = sanitizeCloudUserId(rawUserIdOrUsername);
    const cleanUsername = normalizeCloudUsername(rawUserIdOrUsername);
    if (!cleanTarget) throw new Error('Invalid username or account ID.');

    const deterministicId = buildDeterministicTargetUserId(cleanUsername);

    const ns = await this.ensureConnected(role);
    const indexWildcard = `${ns}/index/+`;
    const directUserTopic = `${ns}/users/${cleanTarget}/user`;
    const directDevTopic = `${ns}/users/${cleanTarget}/dev`;
    const deterministicUserTopic =
      deterministicId && deterministicId !== cleanTarget
        ? `${ns}/users/${deterministicId}/user`
        : null;
    const deterministicDevTopic =
      deterministicId && deterministicId !== cleanTarget
        ? `${ns}/users/${deterministicId}/dev`
        : null;

    const collector = createCompleteRecordCollector({
      ns,
      cleanTarget,
      cleanUsername,
      deterministicId,
      directUserTopic,
      directDevTopic,
      deterministicUserTopic,
      deterministicDevTopic,
    });

    const firstPassTopics = [
      indexWildcard,
      directUserTopic,
      directDevTopic,
      ...(deterministicUserTopic ? [deterministicUserTopic] : []),
      ...(deterministicDevTopic ? [deterministicDevTopic] : []),
    ];

    this.transport.topicListeners.add(collector.onFirstPass);
    try {
      await Promise.all(firstPassTopics.map((t) => this.transport.subscribeTopic(t)));
      await new Promise((r) => setTimeout(r, settleMs));
    } finally {
      this.transport.topicListeners.delete(collector.onFirstPass);
      for (const t of firstPassTopics) {
        this.transport.unsubscribeTopic(t);
      }
    }

    const { matchedIndex } = collector.getState();
    if (
      matchedIndex &&
      matchedIndex.userId !== cleanTarget &&
      matchedIndex.userId !== deterministicId
    ) {
      const resolvedUserTopic = `${ns}/users/${matchedIndex.userId}/user`;
      const resolvedDevTopic = `${ns}/users/${matchedIndex.userId}/dev`;
      const onSecondPass = (msg: DecodedMqttPublishPayload) => {
        if (msg.topic === resolvedUserTopic) {
          collector.setUserSlot(
            msg.parsedJson ? (msg.parsedJson as unknown as CloudUserSlotPayload) : null
          );
        } else if (msg.topic === resolvedDevTopic) {
          collector.setDevSlot(
            msg.parsedJson ? (msg.parsedJson as unknown as CloudDevSlotPayload) : null
          );
        }
      };
      this.transport.topicListeners.add(onSecondPass);
      try {
        await Promise.all([
          this.transport.subscribeTopic(resolvedUserTopic),
          this.transport.subscribeTopic(resolvedDevTopic),
        ]);
        await new Promise((r) => setTimeout(r, settleMs));
      } finally {
        this.transport.topicListeners.delete(onSecondPass);
        this.transport.unsubscribeTopic(resolvedUserTopic);
        this.transport.unsubscribeTopic(resolvedDevTopic);
      }
    }

    const finalState = collector.getState();
    return {
      index: finalState.matchedIndex,
      userSlot: finalState.userSlot,
      devSlot: finalState.devSlot,
    };
  }

  async pushUserSlot(params: {
    userId: string;
    username?: string;
    password: string;
    alias?: string;
    displayName?: string;
    snapshot: Record<string, unknown>;
    existingIndex?: Partial<CloudAccountIndexEntry> | null;
    ackDevRev?: number;
    ackDevRevHash?: string;
  }): Promise<{ index: CloudAccountIndexEntry; userSlot: CloudUserSlotPayload }> {
    const ns = await this.ensureConnected('client');
    const { userId, userSlot, indexEntry } = buildUserSlotAndIndexPayloads(params);
    await this.publishRetained(`${ns}/users/${userId}/user`, userSlot);
    await this.publishRetained(`${ns}/index/${userId}`, indexEntry);
    return { index: indexEntry, userSlot };
  }

  async pushDevSlot(params: {
    userId: string;
    username?: string;
    password?: string;
    alias?: string;
    displayName?: string;
    snapshot: Record<string, unknown>;
    baseSnapshot: Record<string, unknown>;
    existingIndex?: Partial<CloudAccountIndexEntry> | null;
  }): Promise<{ index: CloudAccountIndexEntry; devSlot: CloudDevSlotPayload }> {
    const ns = await this.ensureConnected('dev');
    const { userId, devSlot, indexEntry } = buildDevSlotAndIndexPayloads(params);
    await this.publishRetained(`${ns}/users/${userId}/dev`, devSlot);
    await this.publishRetained(`${ns}/index/${userId}`, indexEntry);
    return { index: indexEntry, devSlot };
  }

  async upsertAccountIndex(params: {
    userId?: string;
    username: string;
    password: string;
    alias: string;
    displayName?: string;
    existingIndex?: Partial<CloudAccountIndexEntry> | null;
  }): Promise<CloudAccountIndexEntry> {
    const ns = await this.ensureConnected('dev');
    const entry = buildUpsertedAccountIndexEntry(params);
    await this.publishRetained(`${ns}/index/${entry.userId}`, entry);
    return entry;
  }

  async deleteAccount(rawUserId: string): Promise<void> {
    const userId = sanitizeCloudUserId(rawUserId);
    if (!userId) return;
    const ns = await this.ensureConnected('dev');
    await Promise.all([
      this.publishRetained(`${ns}/index/${userId}`, null),
      this.publishRetained(`${ns}/users/${userId}/user`, null),
      this.publishRetained(`${ns}/users/${userId}/dev`, null),
    ]);
  }

  async watchUserDevSlot(
    rawUserId: string,
    role: 'client' | 'dev',
    onDevSlotUpdate: (
      devSlot: CloudDevSlotPayload,
      indexEntry: CloudAccountIndexEntry | null
    ) => void,
    rawUsername?: string
  ): Promise<() => void> {
    if (this.userSlotWatchUnsub) {
      this.userSlotWatchUnsub();
      this.userSlotWatchUnsub = null;
    }
    const userId = sanitizeCloudUserId(rawUserId);
    const cleanUsername = normalizeCloudUsername(rawUsername || rawUserId);
    const deterministicId = buildDeterministicTargetUserId(cleanUsername);
    if (!userId) return () => {};

    this.activeWatchRequest = { userId, username: cleanUsername, role, onDevSlotUpdate };
    const ns = await this.ensureConnected(role);

    const { topicsToWatch, listener } = createWatchedDevSlotPacketListener({
      ns,
      userId,
      cleanUsername,
      deterministicId,
      onDevSlotUpdate,
    });

    for (const t of topicsToWatch) {
      this.transport.watchedTopics.add(t);
    }

    this.transport.topicListeners.add(listener);
    await Promise.allSettled(topicsToWatch.map((t) => this.transport.subscribeTopic(t)));

    const cleanup = () => {
      if (this.reconnectWatchTimer) {
        clearTimeout(this.reconnectWatchTimer);
        this.reconnectWatchTimer = null;
      }
      this.activeWatchRequest = null;
      this.transport.topicListeners.delete(listener);
      for (const t of topicsToWatch) {
        this.transport.watchedTopics.delete(t);
        this.transport.unsubscribeTopic(t);
      }
      if (this.userSlotWatchUnsub === cleanup) {
        this.userSlotWatchUnsub = null;
      }
    };
    this.userSlotWatchUnsub = cleanup;
    return cleanup;
  }

  stopWatchingUserDevSlot(): void {
    if (this.reconnectWatchTimer) {
      clearTimeout(this.reconnectWatchTimer);
      this.reconnectWatchTimer = null;
    }
    this.activeWatchRequest = null;
    if (this.userSlotWatchUnsub) {
      this.userSlotWatchUnsub();
      this.userSlotWatchUnsub = null;
    }
  }

  disconnect(): void {
    this.stopWatchingUserDevSlot();
    this.transport.closeSocketOnly();
  }
}

export const cloudProfileSyncClient = new CloudProfileSyncClient();
