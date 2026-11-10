/**
 * src/network/protocol/HostWorkerProtocol.ts
 * Frozen message envelope and command protocol between the Main Thread (UI / Renderer)
 * and the Authoritative Server / Network Web Worker.
 */

export const HOST_WORKER_MSG_TYPES = Object.freeze({
  WORKER_INIT: 'WORKER_INIT',
  WORKER_READY: 'WORKER_READY',
  WORKER_DESTROY: 'WORKER_DESTROY',
  ROOM_CREATE: 'ROOM_CREATE',
  ROOM_JOIN: 'ROOM_JOIN',
  ROOM_LEAVE: 'ROOM_LEAVE',
  ROOM_STATE_SYNC: 'ROOM_STATE_SYNC',

  PHYSICS_SNAPSHOT: 'PHYSICS_SNAPSHOT',
  SIGNAL_EVENT_BATCH: 'SIGNAL_EVENT_BATCH',
  INCIDENT_EVENT_BATCH: 'INCIDENT_EVENT_BATCH',

  LOCAL_INPUT_FRAME: 'LOCAL_INPUT_FRAME',
  RELIABLE_COMMAND: 'RELIABLE_COMMAND',
  SIGNAL_ACK: 'SIGNAL_ACK',

  LOBBY_MODE_SET: 'LOBBY_MODE_SET',
  GHOST_CAR_CONFIG: 'GHOST_CAR_CONFIG',
  MATCH_START_REQUEST: 'MATCH_START_REQUEST',
  PODIUM_ENTER: 'PODIUM_ENTER',

  NET_DIAG_CONFIG: 'NET_DIAG_CONFIG',
  NET_DIAG_METRICS: 'NET_DIAG_METRICS',
  NET_IMPAIRMENT_SET: 'NET_IMPAIRMENT_SET',

  REPLAY_WINDOW_REQUEST: 'REPLAY_WINDOW_REQUEST',
  REPLAY_WINDOW_DATA: 'REPLAY_WINDOW_DATA',
  REPLAY_FULL_EXPORT_REQUEST: 'REPLAY_FULL_EXPORT_REQUEST',
  REPLAY_FULL_EXPORT_DATA: 'REPLAY_FULL_EXPORT_DATA',
});

export type HostWorkerMsgType =
  (typeof HOST_WORKER_MSG_TYPES)[keyof typeof HOST_WORKER_MSG_TYPES] | string;

export interface WorkerEnvelope<TPayload = Record<string, any>> {
  type: HostWorkerMsgType;
  seq: number;
  timestampMs: number;
  payload: TPayload;
}

export function createWorkerEnvelope<TPayload = Record<string, any>>(
  type: HostWorkerMsgType,
  payload: TPayload = {} as TPayload,
  seq = 0
): WorkerEnvelope<TPayload> {
  return {
    type,
    seq: seq >>> 0,
    timestampMs: performance.now(),
    payload,
  };
}
