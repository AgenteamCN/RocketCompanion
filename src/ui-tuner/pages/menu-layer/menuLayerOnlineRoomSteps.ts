import type { Layer1MenuContextMode } from '../../../ui-core/recipes/layer1MenuContextSpecs';
import type {
  OnlineRoomControlStateOverride,
  OnlineSessionContextId,
} from '../../../ui-core/recipes/Layer2ManageRoomRecipe';
import type { LobbyPlayerSlot } from '../../../ui-core/recipes/online/MatchLobbyTeamRosterSection';
import type { ActiveMatchPlayer } from '../../../ui-core/recipes/online/DuringMatchClientRejoinControls';
import type { WarmupRoomPlayer } from '../../../ui-core/recipes/online/OnlineWarmupRoomRecipe';
import type {
  ActiveMenuRoute,
  Layer3StepProgressStatus,
  LinearPlaylistStep,
} from './menuLayerRouteConfig';

export type OnlineRoomMemberSlotCount = 1 | 3;

export interface OnlineRoomMemberSlotOption {
  slots: OnlineRoomMemberSlotCount;
  suffix: 'slots-1' | 'slots-3';
  shortLabel: string;
  badgeLabel: string;
}

export const ONLINE_ROOM_MEMBER_SLOT_OPTIONS: OnlineRoomMemberSlotOption[] = [
  { slots: 1, suffix: 'slots-1', shortLabel: '1 Slot', badgeLabel: 'Member Slots: 1' },
  { slots: 3, suffix: 'slots-3', shortLabel: '3 Slots', badgeLabel: 'Member Slots: 3' },
];

export interface ManageRoomContextStepSpec {
  id: string;
  ctx: OnlineSessionContextId;
  contextLabel: string;
  memberSlots: OnlineRoomMemberSlotCount;
  slotLabel: string;
  label: string;
  description: string;
}

const BASE_ROOM_CONTROL_CONTEXTS: Array<{
  ctx: OnlineSessionContextId;
  label: string;
  baseDesc: string;
}> = [
  {
    ctx: 'match-lobby-host',
    label: 'Match Lobby (Host)',
    baseDesc: 'Pre-match lobby managed by the room host with team slots, bot fill policy, and Start Match CTA.',
  },
  {
    ctx: 'match-lobby-client',
    label: 'Match Lobby (Client)',
    baseDesc: 'Pre-match lobby viewed by a connected peer with team selection and daisy-chain spectating relay.',
  },
  {
    ctx: 'online-match-host',
    label: 'During Match (Host)',
    baseDesc: 'Live match room control for the host with pause toggle, spectator routing diagnostics, and server shutdown.',
  },
  {
    ctx: 'online-match-client',
    label: 'During Match (Client)',
    baseDesc: 'Live match room info for a connected client with No Input replacement, pause request, and leave room action.',
  },
  {
    ctx: 'online-warmup-host',
    label: 'Online Warmup (Host)',
    baseDesc: 'Teamless warmup session control for the host with active room roster and server shutdown.',
  },
  {
    ctx: 'online-warmup-client',
    label: 'Online Warmup (Client)',
    baseDesc: 'Teamless warmup session info for a peer with client-side Ghost Mode toggle and leave room action.',
  },
];

export const ROOM_CONTROL_CONTEXT_STEPS: ManageRoomContextStepSpec[] =
  BASE_ROOM_CONTROL_CONTEXTS.flatMap((item) =>
    ONLINE_ROOM_MEMBER_SLOT_OPTIONS.map((slotOpt) => ({
      id: `${item.ctx}-${slotOpt.suffix}`,
      ctx: item.ctx,
      contextLabel: item.label,
      memberSlots: slotOpt.slots,
      slotLabel: slotOpt.shortLabel,
      label: `${item.label} · ${slotOpt.shortLabel}`,
      description: `${item.baseDesc} Configured with ${slotOpt.shortLabel.toLowerCase()} occupied per team/room.`,
    }))
  );

export interface OnlineRoomProgressStepSpec {
  suffix: string;
  status: Layer3StepProgressStatus;
  step: number;
  editing?: boolean;
  label: string;
  description: string;
}

/**
 * Streamlined Host Match inspection steps:
 * Removes redundant running intermediate steps and focuses on Idle, Expanded,
 * Probe/Signaling Error (Step 2/5), Room Code Error (Step 3/5), and Completed (Step 5/5).
 */
export const HOST_MATCH_PROGRESS_STEPS: OnlineRoomProgressStepSpec[] = [
  {
    suffix: 'idle',
    status: 'idle',
    step: 1,
    editing: false,
    label: 'Idle (Summary Collapsed)',
    description: 'Default compact host match form showing 3-column configuration summary card.',
  },
  {
    suffix: 'expanded',
    status: 'idle',
    step: 1,
    editing: true,
    label: 'Expanded (Editing Rules)',
    description: 'Expanded configuration editor showing Team Format, Bot Fill Policy, Match Duration, and Advanced Settings.',
  },
  {
    suffix: 'error-signaling',
    status: 'error',
    step: 2,
    editing: false,
    label: 'Probe / Signaling Error (Step 2/5)',
    description: 'Signaling relay probe and WebSocket handshake timeout error state at Step 2/5.',
  },
  {
    suffix: 'error-room',
    status: 'error',
    step: 3,
    editing: false,
    label: 'Room Code Error (Step 3/5)',
    description: 'Room code conflict or relay registration rejection error state at Step 3/5.',
  },
  {
    suffix: 'completed',
    status: 'completed',
    step: 5,
    editing: false,
    label: 'Completed (Step 5/5 Ready)',
    description: 'Completed 5-step host authority initialization ready to enter Match Lobby.',
  },
];

/**
 * Streamlined Host Training inspection steps:
 * Focuses on Idle, Probe/Signaling Error (Step 2/5), Room Code Error (Step 3/5), and Completed (Step 5/5).
 */
export const HOST_TRAINING_PROGRESS_STEPS: OnlineRoomProgressStepSpec[] = [
  {
    suffix: 'idle',
    status: 'idle',
    step: 1,
    label: 'Idle (Default Setup)',
    description: 'Default host training setup with identity fields and Ghost Mode collision policy.',
  },
  {
    suffix: 'error-signaling',
    status: 'error',
    step: 2,
    label: 'Probe / Signaling Error (Step 2/5)',
    description: 'Signaling relay probe and WebSocket handshake timeout error state at Step 2/5.',
  },
  {
    suffix: 'error-room',
    status: 'error',
    step: 3,
    label: 'Room Code Error (Step 3/5)',
    description: 'Training room code registration conflict or relay rejection error state at Step 3/5.',
  },
  {
    suffix: 'completed',
    status: 'completed',
    step: 5,
    label: 'Completed (Step 5/5 Ready)',
    description: 'Shared online training room initialized at Step 5/5 and ready for peers.',
  },
];

/**
 * Streamlined Join Room inspection steps:
 * Focuses on Idle, Probe/Signaling Error (Step 2/5), Join/Room Error (Step 3/5), and Completed (Step 5/5).
 */
export const JOIN_ROOM_PROGRESS_STEPS: OnlineRoomProgressStepSpec[] = [
  {
    suffix: 'idle',
    status: 'idle',
    step: 1,
    label: 'Idle (Enter Room Code)',
    description: 'Initial client join room form with room code, optional key, and spectating relay toggle.',
  },
  {
    suffix: 'error-signaling',
    status: 'error',
    step: 2,
    label: 'Probe / Signaling Error (Step 2/5)',
    description: 'Signaling relay handshake timeout error when probing peer discovery server at Step 2/5.',
  },
  {
    suffix: 'error-join',
    status: 'error',
    step: 3,
    label: 'Join Error · Room Not Found (Step 3/5)',
    description: 'Room session lookup failure or room access key mismatch error at Step 3/5.',
  },
  {
    suffix: 'completed',
    status: 'completed',
    step: 5,
    label: 'Completed (Step 5/5 Joined)',
    description: 'Arena snapshot synchronized and peer lobby connection completed at Step 5/5.',
  },
];

export const MANAGE_ROOM_PLAYLIST_STEPS: LinearPlaylistStep[] =
  ROOM_CONTROL_CONTEXT_STEPS.map((rc) => ({
    id: `user-l2-room-${rc.id}`,
    tier: 'user',
    route: 'manage-room',
    contextMode: rc.ctx,
    memberSlots: rc.memberSlots,
    layer: 2,
    label: `L2 Room Control · ${rc.label}`,
    breadcrumb: `Layer 1 → Room Control → ${rc.label}`,
  }));

export const HOST_MATCH_PLAYLIST_STEPS: LinearPlaylistStep[] =
  HOST_MATCH_PROGRESS_STEPS.map((hm) => ({
    id: `user-l3-host-match-${hm.suffix}`,
    tier: 'user',
    route: 'host-match',
    progressStatus: hm.status,
    currentStep: hm.step,
    defaultEditingConfig: hm.editing,
    layer: 3,
    label: `L3 Host Match · ${hm.label}`,
    breadcrumb: `Play → Host Match → ${hm.label}`,
  }));

export const HOST_TRAINING_PLAYLIST_STEPS: LinearPlaylistStep[] =
  HOST_TRAINING_PROGRESS_STEPS.map((ht) => ({
    id: `user-l3-host-training-${ht.suffix}`,
    tier: 'user',
    route: 'host-training',
    progressStatus: ht.status,
    currentStep: ht.step,
    layer: 3,
    label: `L3 Host Training · ${ht.label}`,
    breadcrumb: `Play → Host Training → ${ht.label}`,
  }));

export const JOIN_ROOM_PLAYLIST_STEPS: LinearPlaylistStep[] =
  JOIN_ROOM_PROGRESS_STEPS.map((jr) => ({
    id: `user-l3-join-room-${jr.suffix}`,
    tier: 'user',
    route: 'join-room',
    progressStatus: jr.status,
    currentStep: jr.step,
    layer: 3,
    label: `L3 Join Room · ${jr.label}`,
    breadcrumb: `Play → Join Room → ${jr.label}`,
  }));

const LOBBY_PEERS_HOST_1_SLOT: LobbyPlayerSlot[] = [
  { id: 'peer-1', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
];

const LOBBY_PEERS_CLIENT_1_SLOT: LobbyPlayerSlot[] = [
  { id: 'host-peer', name: 'Striker_Host', pingMs: 18, pairId: '1A0F', team: 'orange', isHost: true },
];

const LOBBY_PEERS_HOST_3_SLOTS: LobbyPlayerSlot[] = [
  { id: 'peer-1', name: 'Aerial_Vortex', pingMs: 28, pairId: '4D1E', team: 'blue' },
  { id: 'peer-2', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
  { id: 'peer-3', name: 'FlipReset_Pro', pingMs: 36, pairId: '5E7A', team: 'orange' },
  { id: 'peer-4', name: 'CeilingShot_77', pingMs: 31, pairId: '8C3B', team: 'neutral' },
];

const LOBBY_PEERS_CLIENT_3_SLOTS: LobbyPlayerSlot[] = [
  { id: 'host-peer', name: 'Striker_Host', pingMs: 18, pairId: '1A0F', team: 'blue', isHost: true },
  { id: 'peer-1', name: 'Aerial_Vortex', pingMs: 28, pairId: '4D1E', team: 'blue' },
  { id: 'peer-2', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
  { id: 'peer-3', name: 'FlipReset_Pro', pingMs: 36, pairId: '5E7A', team: 'orange' },
];

const MATCH_PLAYERS_1_SLOT: ActiveMatchPlayer[] = [
  { id: 'b-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', team: 'blue', isHost: true },
  { id: 'o-1', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange', noInput: true },
];

const MATCH_PLAYERS_3_SLOTS: ActiveMatchPlayer[] = [
  { id: 'b-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', team: 'blue', isHost: true },
  { id: 'b-2', name: 'Aerial_Vortex', pingMs: 28, pairId: '4D1E', team: 'blue' },
  { id: 'b-3', name: 'Nexto_Bot_1', pingMs: 0, team: 'blue', isBot: true },
  { id: 'o-1', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
  { id: 'o-2', name: 'FlipReset_Pro', pingMs: 0, pairId: '5E7A', team: 'orange', noInput: true },
  { id: 'o-3', name: 'Necto_Bot_2', pingMs: 0, team: 'orange', isBot: true },
];

const WARMUP_PLAYERS_HOST_1_SLOT: WarmupRoomPlayer[] = [
  { id: 'w-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', isHost: true },
];

const WARMUP_PLAYERS_CLIENT_1_SLOT: WarmupRoomPlayer[] = [
  { id: 'w-2', name: 'OctaneMain_99', pingMs: 21, pairId: '9B2C', isSelf: true },
];

const WARMUP_PLAYERS_3_SLOTS: WarmupRoomPlayer[] = [
  { id: 'w-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', isHost: true },
  { id: 'w-2', name: 'OctaneMain_99', pingMs: 21, pairId: '9B2C' },
  { id: 'w-3', name: 'Aerial_Vortex', pingMs: 33, pairId: '4D1E' },
];

export function resolveManageRoomRosterOverride(
  sessionContext: OnlineSessionContextId,
  memberSlots: OnlineRoomMemberSlotCount = 3
): OnlineRoomControlStateOverride {
  const isClient = sessionContext.endsWith('-client');
  if (memberSlots === 1) {
    return {
      sessionContext,
      localTeam: 'blue',
      teamFormat: 'duel',
      botPolicy: 'none',
      lobbyPeers: isClient ? LOBBY_PEERS_CLIENT_1_SLOT : LOBBY_PEERS_HOST_1_SLOT,
      matchPlayers: MATCH_PLAYERS_1_SLOT,
      warmupPlayers: isClient ? WARMUP_PLAYERS_CLIENT_1_SLOT : WARMUP_PLAYERS_HOST_1_SLOT,
    };
  }
  return {
    sessionContext,
    localTeam: 'blue',
    teamFormat: 'standard',
    botPolicy: 'auto-fill',
    lobbyPeers: isClient ? LOBBY_PEERS_CLIENT_3_SLOTS : LOBBY_PEERS_HOST_3_SLOTS,
    matchPlayers: MATCH_PLAYERS_3_SLOTS,
    warmupPlayers: WARMUP_PLAYERS_3_SLOTS,
  };
}

export function matchesOnlineRoomPlaylistStep(
  step: LinearPlaylistStep,
  currentRoute: ActiveMenuRoute,
  normalizedLayer1Ctx: Layer1MenuContextMode,
  layer3Override?: {
    progressStatus?: Layer3StepProgressStatus;
    currentStep?: number;
    defaultEditingConfig?: boolean;
    memberSlots?: OnlineRoomMemberSlotCount;
  }
): boolean {
  if (currentRoute === 'manage-room') {
    if (step.contextMode && step.contextMode !== normalizedLayer1Ctx) {
      return false;
    }
    if (step.memberSlots !== undefined) {
      const targetSlots: OnlineRoomMemberSlotCount = layer3Override?.memberSlots ?? 3;
      return step.memberSlots === targetSlots;
    }
    return true;
  }

  if (
    (currentRoute === 'host-match' ||
      currentRoute === 'host-training' ||
      currentRoute === 'join-room') &&
    step.progressStatus
  ) {
    const targetStatus = layer3Override?.progressStatus ?? 'idle';
    const targetStep = layer3Override?.currentStep ?? 1;
    const targetEdit = Boolean(layer3Override?.defaultEditingConfig);
    if (step.progressStatus !== targetStatus) return false;
    if ((step.currentStep ?? 1) !== targetStep) return false;
    if (
      currentRoute === 'host-match' &&
      Boolean(step.defaultEditingConfig) !== targetEdit
    ) {
      return false;
    }
    return true;
  }

  return true;
}
