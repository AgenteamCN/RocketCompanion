import React, { useMemo, useState } from 'react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore, useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { HostMatchTeamFormat } from './online/OnlineRoomConfigSummaryCard';
import {
  ManageRoomRosterAndActionsSection,
  type OnlineRoomControlStateOverride,
  type OnlineSessionContextId,
  type OnlineSessionContextSpec,
  type RoomStateMode,
} from './layer-sections/ManageRoomRosterAndActionsSection';

export type {
  OnlineRoomControlStateOverride,
  OnlineSessionContextId,
  OnlineSessionContextSpec,
  RoomStateMode,
};

export const FORMAT_TO_GAME_MODE: Record<HostMatchTeamFormat, '1v1' | '2v2' | '3v3'> = {
  duel: '1v1', doubles: '2v2', standard: '3v3',
};
export const GAME_MODE_TO_FORMAT: Record<string, HostMatchTeamFormat> = {
  '1v1': 'duel', '2v2': 'doubles', '3v3': 'standard',
};

export interface Layer2ManageRoomRecipeProps extends StandardSurfaceProps {
  developerMode?: boolean;
  topSlot?: React.ReactNode;
  sessionContext?: OnlineSessionContextId;
  onSessionContextChange?: (ctx: OnlineSessionContextId) => void;
  onCloseRoom?: () => void | Promise<void>;
  className?: string;
  stateOverride?: OnlineRoomControlStateOverride;
}

export const ONLINE_SESSION_CONTEXT_SPECS: OnlineSessionContextSpec[] = [
  {
    id: 'match-lobby-host',
    shortLabel: 'Match Lobby (Host)',
    stageLabel: 'Match Lobby · Host',
    role: 'host',
    stage: 'lobby',
    resolveHeaderTitle: () => 'CONFIGURE ROOM',
    footerDefaultDesc:
      'Configure Room (Match Lobby · Host): Copy room code, inspect Blue/Neutral/Orange teams & pre-assigned bots, switch team, start match, or edit rules.',
  },
  {
    id: 'match-lobby-client',
    shortLabel: 'Match Lobby (Client)',
    stageLabel: 'Match Lobby · Client',
    role: 'client',
    stage: 'lobby',
    resolveHeaderTitle: () => 'ROOM INFO',
    footerDefaultDesc:
      'Room Info (Match Lobby · Client): View Room Code & Pair ID, manage Daisy Chain Spectating relay, select team (Blue / Auto / Orange), and join match.',
  },
  {
    id: 'online-match-host',
    shortLabel: 'During Match (Host)',
    stageLabel: 'During Match · Host',
    role: 'host',
    stage: 'during-match',
    resolveHeaderTitle: (code) => `ONLINE MATCH · #${code}`,
    footerDefaultDesc:
      'During Match (Host): Inspect Blue/Orange players in match, diagnose spectator routes (from player vs Direct Host), request pause, or double-confirm server shutdown.',
  },
  {
    id: 'online-match-client',
    shortLabel: 'During Match (Client)',
    stageLabel: 'During Match · Client',
    role: 'client',
    stage: 'during-match',
    resolveHeaderTitle: (code) => `ONLINE MATCH · #${code}`,
    footerDefaultDesc:
      'During Match (Client): View Blue/Orange players in match, select team or replace a No Input player to join match, manage spectators relaying via you, ask to pause, or leave room.',
  },
  {
    id: 'online-warmup-host',
    shortLabel: 'Online Warmup (Host)',
    stageLabel: 'Online Warmup · Host',
    role: 'host',
    stage: 'warmup',
    resolveHeaderTitle: () => 'CONFIGURE ROOM',
    footerDefaultDesc:
      'Online Warmup (Host): Manage up to 6 players in room (no teams), inspect spectators, open Advanced Management, or shutdown server.',
  },
  {
    id: 'online-warmup-client',
    shortLabel: 'Online Warmup (Client)',
    stageLabel: 'Online Warmup · Client',
    role: 'client',
    stage: 'warmup',
    resolveHeaderTitle: () => 'ROOM INFO',
    footerDefaultDesc:
      'Online Warmup (Client): View online players and spectators via you, toggle client-only Ghost Mode, request modification, or leave room.',
  },
];

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer2ManageRoomRecipe',
  title: 'Online Room Control Hub',
  subtitle: '6-state online session control for Match Lobby, During Match, and Online Warmup (Host & Client)',
  icon: 'Radio',
  layer: 'layer2',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 680,
    height: 620,
    minHeight: 420,
    maxHeight: 740,
    mode: 'adaptive',
  },
  variants: ONLINE_SESSION_CONTEXT_SPECS.map((spec) => ({
    variantId: spec.id,
    label: spec.shortLabel,
    description: spec.footerDefaultDesc,
    entryFile:
      spec.stage === 'lobby'
        ? 'recipes/online/MatchLobbyRoomRecipe.tsx'
        : spec.stage === 'during-match'
        ? 'recipes/online/DuringMatchRoomRecipe.tsx'
        : 'recipes/online/OnlineWarmupRoomRecipe.tsx',
    storeOverrides: {
      onlineRoomStore: { sessionContext: spec.id },
    },
  })),
};

export const resolveOnlineSessionContextId = (
  rawCtx?: string | null
): OnlineSessionContextId => {
  switch (rawCtx) {
    case 'match-lobby-host':
    case 'match-lobby-client':
    case 'online-match-host':
    case 'online-match-client':
    case 'online-warmup-host':
    case 'online-warmup-client':
      return rawCtx;
    default:
      return 'match-lobby-host';
  }
};

/**
 * [Recipe] Layer 2 Online Session Manage Room (`Layer2ManageRoomRecipe`)
 */
export const Layer2ManageRoomRecipe: React.FC<Layer2ManageRoomRecipeProps> = React.memo(({
  isLight = true,
  activeTab,
  onTabChange,
  onBack: propOnBack,
  onCloseRoom: propOnCloseRoom,
  topSlot,
  sessionContext: propSessionContext,
  onSessionContextChange,
  className = '',
  stateOverride,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const scopedRoom = useStoreSnapshotOverride<OnlineRoomControlStateOverride>('onlineRoomStore');
  const overrides: OnlineRoomControlStateOverride = {
    ...scopedRoom,
    ...stateOverride,
  };

  const { onlineSession, matchMode, goBack: storeGoBack } = appState;

  const derivedContext: OnlineSessionContextId = useMemo(() => {
    const isHost = Boolean(onlineSession?.isHosting);
    if (onlineSession?.roomType === 'warmup') {
      return isHost ? 'online-warmup-host' : 'online-warmup-client';
    }
    if (matchMode === 'match') {
      return isHost ? 'online-match-host' : 'online-match-client';
    }
    return isHost ? 'match-lobby-host' : 'match-lobby-client';
  }, [onlineSession?.isHosting, onlineSession?.roomType, matchMode]);

  const activeContextId = resolveOnlineSessionContextId(
    propSessionContext ?? activeTab ?? overrides.sessionContext ?? derivedContext
  );
  const activeSpec =
    ONLINE_SESSION_CONTEXT_SPECS.find((s) => s.id === activeContextId) ??
    ONLINE_SESSION_CONTEXT_SPECS[0];

  const onBack = propOnBack ?? storeGoBack;
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  void onSessionContextChange;

  const sizing = useMenuLayoutStore(
    (s) => s.panels?.['layer2-manage-room'] ?? DEFAULT_PANEL_SIZING['layer2-manage-room']
  );

  const rawRoomCode = overrides.roomCode ?? (onlineSession?.roomId || 'RL-8924');
  const resolvedRoomCode =
    activeSpec.stage === 'warmup' && rawRoomCode === 'RL-8924' ? 'TRN-409' : rawRoomCode;

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className={`w-full select-none ${className}`}
    >
      <PanelHeader
        isLight={isLight}
        title={activeSpec.resolveHeaderTitle(resolvedRoomCode)}
        onBack={onBack}
      />

      <PanelContent scrollable={true} className="flex flex-col gap-3">
        {topSlot}

        <ManageRoomRosterAndActionsSection
          activeSpec={activeSpec}
          resolvedRoomCode={resolvedRoomCode}
          overrides={overrides}
          onTabChange={onTabChange}
          propOnCloseRoom={propOnCloseRoom}
          onHoverDesc={setHoveredDesc}
          isLight={isLight}
        />
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription={activeSpec.footerDefaultDesc}
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer2ManageRoomRecipe.displayName = 'Layer2ManageRoomRecipe';
