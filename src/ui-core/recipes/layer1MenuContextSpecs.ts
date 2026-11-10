import type { SurfaceVariantMeta } from '../manifest/surfaceMetaTypes';
import {
  normalizeMainMenuContextMode,
  type MainMenuIconColorValue,
} from '../stores/mainMenuStyleStore';

export type CanonicalLayer1ContextVariation =
  | 'freeplay'
  | 'replay-viewer'
  | 'exhibition'
  | 'match-lobby-host'
  | 'match-lobby-client'
  | 'online-match-host'
  | 'online-match-client'
  | 'online-warmup-host'
  | 'online-warmup-client'
  | 'kickoff-training'
  | 'static-training-play'
  | 'static-training-edit'
  | 'dev-test-lab'
  | 'exp-multi-bots';

/**
 * Includes legacy context variation IDs ('match', 'custom-match-host', 'custom-match-client')
 * so existing callers and URL params remain 100% backwards-compatible.
 */
export type Layer1ContextVariation =
  | CanonicalLayer1ContextVariation
  | 'match'
  | 'custom-match-host'
  | 'custom-match-client';

export type Layer1MenuContextMode = Layer1ContextVariation;

export type Layer1ContextGroupId =
  | 'base'
  | 'singleplayer'
  | 'online-match'
  | 'online-warmup'
  | 'training'
  | 'developer';

export type Layer1CustomRowIconType =
  | 'gamepad-2'
  | 'house-cog'
  | 'user-round-cog'
  | 'info'
  | 'bot';

export interface Layer1ContextCustomRowSpec {
  slotId: 'play' | 'configure';
  title: string;
  subtitle: string;
  iconType: Layer1CustomRowIconType;
  /** Semantic color token override (e.g. 'sky' for Host blue, 'amber' for Client orange) */
  iconColorToken?: MainMenuIconColorValue;
  /** Tailwind text color class for default icon rendering */
  iconColorClass?: string;
  actionType: 'play' | 'manage-room' | 'exp-multi-bots';
}

export interface Layer1ContextBottomRowSpec {
  slotId: 'leave';
  title: string;
  subtitle: string;
  iconColorClass: string;
  variant: 'secondary' | 'danger';
  actionType: 'return-freeplay' | 'leave-room' | 'exit-edit-mode';
}

export interface Layer1ContextMeta {
  id: CanonicalLayer1ContextVariation;
  label: string;
  shortLabel: string;
  tier: 'user' | 'developer';
  headerTitle: string;
  groupId: Layer1ContextGroupId;
  groupLabel: string;
  role?: 'host' | 'client';
  stage?: 'lobby' | 'match';
  description?: string;
  /** Optional custom action row rendered immediately after Resume */
  customActionRow?: Layer1ContextCustomRowSpec;
  /** Whether Garage row is available in this context (false during active Online Match) */
  showGarage: boolean;
  /** Whether Settings row is available in this context */
  showSettings: boolean;
  /** Whether Restart Match row is available in this context */
  showRestartMatch: boolean;
  /** Optional bottom Leave / Exit row */
  bottomActionRow?: Layer1ContextBottomRowSpec;
}

export interface Layer1ContextGroupMeta {
  id: Layer1ContextGroupId;
  label: string;
  tier: 'user' | 'developer';
}

export const LAYER1_CONTEXT_GROUPS: Layer1ContextGroupMeta[] = [
  { id: 'base', label: 'Base · Free Play', tier: 'user' },
  { id: 'singleplayer', label: 'Singleplayer · Exhibition', tier: 'user' },
  { id: 'online-match', label: 'Online Match · Lobby & Match', tier: 'user' },
  { id: 'online-warmup', label: 'Online Warmup · Host & Client', tier: 'user' },
  { id: 'training', label: 'Training · Variants', tier: 'user' },
  { id: 'developer', label: 'Developer · Sandboxes', tier: 'developer' },
];

/**
 * Decoupled, self-contained specification table for every Layer 1 Main Menu context variation.
 * Each variation defines its own header, rows, icons, and actions independently so modifying
 * one context never causes side effects on any other context.
 */
export const LAYER1_CONTEXT_VARIATIONS: Layer1ContextMeta[] = [
  // ── 1. Base: Free Play ──
  {
    id: 'freeplay',
    label: 'Free Play (MENU)',
    shortLabel: 'Free Play',
    tier: 'user',
    headerTitle: 'MENU',
    groupId: 'base',
    groupLabel: 'Base',
    description: 'Base Free Play menu: Resume, Play, Garage, Settings',
    customActionRow: {
      slotId: 'play',
      title: 'Play',
      subtitle: 'Single player bot & multiplayer matches',
      iconType: 'gamepad-2',
      actionType: 'play',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
  },

  // ── 2. Singleplayer: Exhibition (Unified Singleplayer Match) ──
  {
    id: 'exhibition',
    label: 'Exhibition (EXHIBITION)',
    shortLabel: 'Exhibition',
    tier: 'user',
    headerTitle: 'EXHIBITION',
    groupId: 'singleplayer',
    groupLabel: 'Singleplayer',
    description: 'Singleplayer Exhibition match: Resume, Garage, Settings, Exit to Free Play',
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Leave Exhibition match and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },

  // ── 3. Online Match — Lobby Stage (Host & Client) ──
  {
    id: 'match-lobby-host',
    label: 'Match Lobby — Host (MATCH LOBBY)',
    shortLabel: 'Match Lobby (Host)',
    tier: 'user',
    headerTitle: 'MATCH LOBBY',
    groupId: 'online-match',
    groupLabel: 'Online Match',
    role: 'host',
    stage: 'lobby',
    description: 'Match Lobby (Host): Resume, Configure Room (house-cog, blue), Garage, Settings, Leave Room',
    customActionRow: {
      slotId: 'configure',
      title: 'Configure Room',
      subtitle: 'Configure lobby ruleset, bot policies & connected players',
      iconType: 'house-cog',
      iconColorToken: 'sky',
      iconColorClass: 'text-sky-400',
      actionType: 'manage-room',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Room',
      subtitle: 'Disconnect session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },
  {
    id: 'match-lobby-client',
    label: 'Match Lobby — Client (MATCH LOBBY)',
    shortLabel: 'Match Lobby (Client)',
    tier: 'user',
    headerTitle: 'MATCH LOBBY',
    groupId: 'online-match',
    groupLabel: 'Online Match',
    role: 'client',
    stage: 'lobby',
    description: 'Match Lobby (Client): Resume, Room Info (info, orange), Garage, Settings, Leave Room',
    customActionRow: {
      slotId: 'configure',
      title: 'Room Info',
      subtitle: 'Inspect lobby session, team roster & player status',
      iconType: 'info',
      iconColorToken: 'amber',
      iconColorClass: 'text-amber-400',
      actionType: 'manage-room',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Room',
      subtitle: 'Disconnect session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },

  // ── 4. Online Match — Match Stage (Host & Client · No Garage) ──
  {
    id: 'online-match-host',
    label: 'Online Match — Host (ONLINE MATCH)',
    shortLabel: 'Online Match (Host)',
    tier: 'user',
    headerTitle: 'ONLINE MATCH',
    groupId: 'online-match',
    groupLabel: 'Online Match',
    role: 'host',
    stage: 'match',
    description: 'Online Match (Host): Resume, Match Admin (house-cog, blue), Settings, Leave Match (No Garage)',
    customActionRow: {
      slotId: 'configure',
      title: 'Match Admin',
      subtitle: 'Active match administration, bot policies & connected players',
      iconType: 'house-cog',
      iconColorToken: 'sky',
      iconColorClass: 'text-sky-400',
      actionType: 'manage-room',
    },
    showGarage: false,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Match',
      subtitle: 'Abandon match session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },
  {
    id: 'online-match-client',
    label: 'Online Match — Client (ONLINE MATCH)',
    shortLabel: 'Online Match (Client)',
    tier: 'user',
    headerTitle: 'ONLINE MATCH',
    groupId: 'online-match',
    groupLabel: 'Online Match',
    role: 'client',
    stage: 'match',
    description: 'Online Match (Client): Resume, Room Info (info, orange), Settings, Leave Match (No Garage)',
    customActionRow: {
      slotId: 'configure',
      title: 'Room Info',
      subtitle: 'Inspect match settings, ping & connected players',
      iconType: 'info',
      iconColorToken: 'amber',
      iconColorClass: 'text-amber-400',
      actionType: 'manage-room',
    },
    showGarage: false,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Match',
      subtitle: 'Abandon match session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },

  // ── 5. Online Warmup (Host = Match Lobby Host; Client = Online Match Client + Garage) ──
  {
    id: 'online-warmup-host',
    label: 'Online Warmup — Host (ONLINE WARMUP)',
    shortLabel: 'Warmup (Host)',
    tier: 'user',
    headerTitle: 'ONLINE WARMUP',
    groupId: 'online-warmup',
    groupLabel: 'Online Warmup',
    role: 'host',
    description: 'Online Warmup (Host): Resume, Configure Room (house-cog, blue), Garage, Settings, Leave Room',
    customActionRow: {
      slotId: 'configure',
      title: 'Configure Room',
      subtitle: 'Room configuration panel & connected players',
      iconType: 'house-cog',
      iconColorToken: 'sky',
      iconColorClass: 'text-sky-400',
      actionType: 'manage-room',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Room',
      subtitle: 'Disconnect session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },
  {
    id: 'online-warmup-client',
    label: 'Online Warmup — Client (ONLINE WARMUP)',
    shortLabel: 'Warmup (Client)',
    tier: 'user',
    headerTitle: 'ONLINE WARMUP',
    groupId: 'online-warmup',
    groupLabel: 'Online Warmup',
    role: 'client',
    description: 'Online Warmup (Client): Resume, Room Info (info, orange), Garage, Settings, Leave Room',
    customActionRow: {
      slotId: 'configure',
      title: 'Room Info',
      subtitle: 'Inspect room details & connection status',
      iconType: 'info',
      iconColorToken: 'amber',
      iconColorClass: 'text-amber-400',
      actionType: 'manage-room',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Leave Room',
      subtitle: 'Disconnect session and return to Free Play',
      iconColorClass: 'text-rose-400',
      variant: 'secondary',
      actionType: 'leave-room',
    },
  },

  // ── 6. Solo Training Variants (Kickoff Training / Play Static Training / Edit Training Pack) ──
  {
    id: 'kickoff-training',
    label: 'Kickoff Training (KICKOFF TRAINING)',
    shortLabel: 'Kickoff Training',
    tier: 'user',
    headerTitle: 'KICKOFF TRAINING',
    groupId: 'training',
    groupLabel: 'Training',
    description: 'Kickoff Training: Resume, Garage, Settings, Exit to Free Play (No Play row)',
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Leave Kickoff Training and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },
  {
    id: 'static-training-play',
    label: 'Play Static Training (PLAY STATIC TRAINING)',
    shortLabel: 'Play Static Training',
    tier: 'user',
    headerTitle: 'PLAY STATIC TRAINING',
    groupId: 'training',
    groupLabel: 'Training',
    description: 'Play Static Training: Resume, Garage, Settings, Exit to Free Play',
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Leave Play Static Training and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },
  {
    id: 'static-training-edit',
    label: 'Edit Training Pack (EDIT TRAINING PACK)',
    shortLabel: 'Edit Training Pack',
    tier: 'user',
    headerTitle: 'EDIT TRAINING PACK',
    groupId: 'training',
    groupLabel: 'Training',
    description: 'Edit Training Pack: Resume, Garage, Settings, Exit Edit Mode',
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit Edit Mode',
      subtitle: 'Close Shot Inspector and return to Pack Browser',
      iconColorClass: 'text-rose-400',
      variant: 'danger',
      actionType: 'exit-edit-mode',
    },
  },
  {
    id: 'replay-viewer',
    label: 'Replay Viewer (REPLAY VIEWER)',
    shortLabel: 'Replay Viewer',
    tier: 'user',
    headerTitle: 'REPLAY VIEWER',
    groupId: 'training',
    groupLabel: 'Training',
    description: 'Replay Viewer: Resume, Garage, Settings, Exit to Free Play',
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Leave Replay Viewer and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },

  // ── 7. Developer-Only Variations ──
  {
    id: 'dev-test-lab',
    label: 'Subsystem Isolation Lab (DEVELOPER TEST LAB)',
    shortLabel: 'Dev Test Lab',
    tier: 'developer',
    headerTitle: 'DEVELOPER TEST LAB',
    groupId: 'developer',
    groupLabel: 'Developer',
    customActionRow: {
      slotId: 'play',
      title: 'Play',
      subtitle: 'Single player bot & multiplayer matches',
      iconType: 'gamepad-2',
      actionType: 'play',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: false,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Close Developer Test Lab and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },
  {
    id: 'exp-multi-bots',
    label: 'Experimental Multiple Bots (EXPERIMENTAL MULTI BOTS)',
    shortLabel: 'Exp Multi-Bots',
    tier: 'developer',
    headerTitle: 'EXPERIMENTAL MULTI BOTS',
    groupId: 'developer',
    groupLabel: 'Developer',
    customActionRow: {
      slotId: 'configure',
      title: 'Configure Match',
      subtitle: 'Reconfigure team rosters, bot policies, match duration & restart',
      iconType: 'bot',
      iconColorToken: 'emerald',
      iconColorClass: 'text-emerald-400',
      actionType: 'exp-multi-bots',
    },
    showGarage: true,
    showSettings: true,
    showRestartMatch: true,
    bottomActionRow: {
      slotId: 'leave',
      title: 'Exit to Free Play',
      subtitle: 'Close Experimental Multiple Bots and return to Free Play',
      iconColorClass: 'text-amber-400',
      variant: 'secondary',
      actionType: 'return-freeplay',
    },
  },
];

export const LAYER1_SURFACE_VARIANTS: SurfaceVariantMeta[] =
  LAYER1_CONTEXT_VARIATIONS.map((meta) => ({
    variantId: meta.id,
    label: meta.label,
    description: meta.description ?? meta.label,
    storeOverrides: {
      mainMenuStyleStore: {
        previewContextMode: meta.id,
      },
    },
  }));

export const resolveLayer1ContextSpec = (
  rawCtx?: string | null
): Layer1ContextMeta => {
  const normalized = normalizeMainMenuContextMode(rawCtx);
  return (
    LAYER1_CONTEXT_VARIATIONS.find((item) => item.id === normalized) ??
    LAYER1_CONTEXT_VARIATIONS[0]
  );
};
