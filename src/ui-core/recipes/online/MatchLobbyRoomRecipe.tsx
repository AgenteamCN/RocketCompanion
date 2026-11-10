import React, { useState } from 'react';
import {
  ClientRoomTopBars,
  OnlineRoomTopStatusBar,
  type SignalingHealthState,
} from './OnlineRoomTopStatusBar';
import {
  OnlineRoomConfigSummaryCard,
  type HostMatchBotPolicy,
  type HostMatchDurationPreset,
  type HostMatchTeamFormat,
} from './OnlineRoomConfigSummaryCard';
import {
  MatchLobbyTeamRosterSection,
  type LobbyPlayerSlot,
  type LobbyTeamAssignment,
} from './MatchLobbyTeamRosterSection';
import {
  MatchLobbyFooterControls,
  MatchLobbyPrimaryActionRow,
  type MatchLobbyUtilitiesState,
} from './MatchLobbyActionAndUtilityStrip';

export type { MatchLobbyUtilitiesState } from './MatchLobbyActionAndUtilityStrip';

export interface MatchLobbyRoomConfigState {
  roomCode?: string;
  pairId?: string;
  defaultTeamFormat?: HostMatchTeamFormat;
  defaultBotPolicy?: HostMatchBotPolicy;
  defaultDurationPreset?: HostMatchDurationPreset;
  defaultCustomDurationSeconds?: number;
  teamFormat?: HostMatchTeamFormat;
  onChangeTeamFormat?: (format: HostMatchTeamFormat) => void;
  botPolicy?: HostMatchBotPolicy;
  onChangeBotPolicy?: (policy: HostMatchBotPolicy) => void;
  durationPreset?: HostMatchDurationPreset;
  onChangeDurationPreset?: (preset: HostMatchDurationPreset) => void;
  customDurationSeconds?: number;
  onChangeCustomDurationSeconds?: (seconds: number) => void;
}

export interface MatchLobbyActions {
  onRefreshSignaling?: () => void | Promise<void>;
  onKickPeer?: (peerId: string) => void;
  onStartMatch?: () => void;
  onEnterMatch?: () => void;
  onNavigateAdvancedSettings?: () => void;
  onStopOrLeave?: () => void;
}

export interface MatchLobbyRoomRecipeProps {
  role: 'host' | 'client';
  signalingState?: SignalingHealthState;
  localTeam?: LobbyTeamAssignment;
  onSwitchTeam?: (team: LobbyTeamAssignment) => void;
  peers?: LobbyPlayerSlot[];
  roomConfig?: MatchLobbyRoomConfigState;
  utilities?: MatchLobbyUtilitiesState;
  actions?: MatchLobbyActions;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

const INITIAL_PEERS: LobbyPlayerSlot[] = [
  { id: 'peer-1', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
  { id: 'peer-2', name: 'Aerial_Vortex', pingMs: 36, pairId: '4D1E', team: 'blue' },
];

const TEAM_SLOTS_PER_SIDE: Record<HostMatchTeamFormat, number> = {
  duel: 1,
  doubles: 2,
  standard: 3,
};

/**
 * Decoupled Match Lobby Content (`match-lobby-host` & `match-lobby-client`).
 */
export const MatchLobbyRoomRecipe: React.FC<MatchLobbyRoomRecipeProps> = React.memo(({
  role,
  signalingState: controlledSignaling,
  localTeam: controlledLocalTeam,
  onSwitchTeam,
  peers: controlledPeers,
  roomConfig,
  utilities,
  actions,
  onHoverDesc,
  isLight = false,
}) => {
  const {
    onRefreshSignaling,
    onKickPeer,
    onStartMatch,
    onEnterMatch,
    onNavigateAdvancedSettings,
    onStopOrLeave,
  } = actions ?? {};
  const {
    roomCode = 'RL-8924',
    pairId = '7F3A',
    defaultTeamFormat = 'doubles',
    defaultBotPolicy = 'auto-fill',
    defaultDurationPreset = '300',
    defaultCustomDurationSeconds = 180,
    teamFormat: controlledTeamFormat,
    onChangeTeamFormat,
    botPolicy: controlledBotPolicy,
    onChangeBotPolicy,
    durationPreset: controlledDurationPreset,
    onChangeDurationPreset,
    customDurationSeconds: controlledCustomDurationSeconds,
    onChangeCustomDurationSeconds,
  } = roomConfig ?? {};
  const isHost = role === 'host';
  const [internalSignaling, setInternalSignaling] = useState<SignalingHealthState>('green');
  const [internalLocalTeam, setInternalLocalTeam] = useState<LobbyTeamAssignment>('neutral');
  const [internalPeers, setInternalPeers] = useState<LobbyPlayerSlot[]>(INITIAL_PEERS);
  const [rosterLayout] = useState<'stacked' | 'columns'>('columns');

  const signalingState = controlledSignaling ?? internalSignaling;
  const setSignalingState = setInternalSignaling;
  const localTeam = controlledLocalTeam ?? internalLocalTeam;
  const setLocalTeam = (team: LobbyTeamAssignment) => {
    setInternalLocalTeam(team);
    onSwitchTeam?.(team);
  };
  const peers = controlledPeers ?? internalPeers;

  const [internalTeamFormat, setInternalTeamFormat] = useState<HostMatchTeamFormat>(defaultTeamFormat);
  const [internalBotPolicy, setInternalBotPolicy] = useState<HostMatchBotPolicy>(defaultBotPolicy);
  const [internalDurationPreset, setInternalDurationPreset] = useState<HostMatchDurationPreset>(
    defaultDurationPreset
  );
  const [internalCustomDurationSeconds, setInternalCustomDurationSeconds] = useState<number>(
    defaultCustomDurationSeconds
  );
  const teamFormat = controlledTeamFormat ?? internalTeamFormat;
  const setTeamFormat = (fmt: HostMatchTeamFormat) => {
    setInternalTeamFormat(fmt);
    onChangeTeamFormat?.(fmt);
  };
  const botPolicy = controlledBotPolicy ?? internalBotPolicy;
  const setBotPolicy = (pol: HostMatchBotPolicy) => {
    setInternalBotPolicy(pol);
    onChangeBotPolicy?.(pol);
  };
  const durationPreset = controlledDurationPreset ?? internalDurationPreset;
  const setDurationPreset = (preset: HostMatchDurationPreset) => {
    setInternalDurationPreset(preset);
    onChangeDurationPreset?.(preset);
  };
  const customDurationSeconds = controlledCustomDurationSeconds ?? internalCustomDurationSeconds;
  const setCustomDurationSeconds = (secs: number) => {
    setInternalCustomDurationSeconds(secs);
    onChangeCustomDurationSeconds?.(secs);
  };
  const [isEditingConfig, setIsEditingConfig] = useState<boolean>(false);

  const slotsPerSide = TEAM_SLOTS_PER_SIDE[teamFormat];
  const maxPlayers = slotsPerSide * 2;

  const selfEntry: LobbyPlayerSlot = {
    id: 'self',
    name: isHost ? 'Player_01 (You · Host)' : 'Player_01 (You)',
    pingMs: isHost ? 0 : 18,
    pairId,
    team: localTeam,
    isHost,
    isSelf: true,
  };

  const hostEntryForClient: LobbyPlayerSlot[] =
    isHost || controlledPeers !== undefined
      ? []
      : [
          {
            id: 'host-peer',
            name: 'Striker_Host',
            pingMs: 18,
            pairId: '1A0F',
            team: 'blue',
            isHost: true,
          },
        ];

  const allHumans: LobbyPlayerSlot[] = [selfEntry, ...hostEntryForClient, ...peers];

  const humanBlue = allHumans.filter((p) => p.team === 'blue');
  const humanNeutral = allHumans.filter((p) => p.team === 'neutral');
  const humanOrange = allHumans.filter((p) => p.team === 'orange');

  const botFillingActive = botPolicy !== 'none';
  const blueBotsNeeded = botFillingActive ? Math.max(0, slotsPerSide - humanBlue.length) : 0;
  const orangeBotsNeeded = botFillingActive ? Math.max(0, slotsPerSide - humanOrange.length) : 0;

  const blueBotSlots: LobbyPlayerSlot[] = Array.from({ length: blueBotsNeeded }, (_, i) => ({
    id: `bot-blue-${i}`,
    name: `Nexto_Bot_${i + 1}`,
    pingMs: 0,
    team: 'blue',
    isBot: true,
    botLabel: botPolicy === 'vs-ai' ? 'AI · Pre-assigned' : 'Bot · Auto-Fill',
  }));

  const orangeBotSlots: LobbyPlayerSlot[] = Array.from({ length: orangeBotsNeeded }, (_, i) => ({
    id: `bot-orange-${i}`,
    name: `Necto_Bot_${i + 1}`,
    pingMs: 0,
    team: 'orange',
    isBot: true,
    botLabel: botPolicy === 'vs-ai' ? 'AI · Pre-assigned' : 'Bot · Auto-Fill',
  }));

  const blueRoster = [...humanBlue, ...blueBotSlots];
  const neutralRoster = humanNeutral;
  const orangeRoster = [...humanOrange, ...orangeBotSlots];

  const handleRemovePeer = (peerId: string) => {
    if (onKickPeer) {
      onKickPeer(peerId);
    } else {
      setInternalPeers((prev) => prev.filter((p) => p.id !== peerId));
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full select-none">
      {/* 1. Top Status Bar (Host vs Client) */}
      {isHost ? (
        <OnlineRoomTopStatusBar
          roomCode={roomCode}
          signalingState={signalingState}
          onChangeSignalingState={setSignalingState}
          onRefreshSignaling={onRefreshSignaling}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      ) : (
        <ClientRoomTopBars
          roomCode={roomCode}
          pairId={pairId}
          daisyChainSignaling={signalingState}
          onChangeDaisyChainSignaling={setSignalingState}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}

      {/* 2 & 3. Players in Room + 3-Way Team Switcher */}
      <MatchLobbyTeamRosterSection
        isLight={isLight}
        isHost={isHost}
        localTeam={localTeam}
        setLocalTeam={setLocalTeam}
        rosterLayout={rosterLayout}
        roster={{
          slotsPerSide,
          maxPlayers,
          humanCount: allHumans.length,
          blueRoster,
          neutralRoster,
          orangeRoster,
        }}
        onRemovePeer={handleRemovePeer}
        onHoverDesc={onHoverDesc}
      />

      {/* 4. Primary Action Row: 3-Col Balanced Actions (Host) / Join Match (Client) */}
      <MatchLobbyPrimaryActionRow
        isHost={isHost}
        isEditingConfig={isEditingConfig}
        onToggleEditingConfig={() => setIsEditingConfig((prev) => !prev)}
        onStartMatch={onStartMatch}
        onEnterMatch={onEnterMatch}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />

      {/* 5. Information Card */}
      <OnlineRoomConfigSummaryCard
        title="Current Configuration"
        teamFormat={teamFormat}
        botPolicy={botPolicy}
        durationPreset={durationPreset}
        customDurationSeconds={customDurationSeconds}
        handlers={{
          onChangeTeamFormat: setTeamFormat,
          onChangeBotPolicy: setBotPolicy,
          onChangeDurationPreset: setDurationPreset,
          onChangeCustomDurationSeconds: setCustomDurationSeconds,
        }}
        editor={{
          editable: isHost,
          isEditing: isHost && isEditingConfig,
          onToggleEditing: isHost ? () => setIsEditingConfig((p) => !p) : undefined,
          onNavigateAdvancedSettings: isHost ? onNavigateAdvancedSettings : undefined,
        }}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />

      {/* 6 & 7. Host 4-Button Utility Strip & Server / Leave Action */}
      <MatchLobbyFooterControls
        isHost={isHost}
        utilities={utilities}
        onStopOrLeave={onStopOrLeave}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />
    </div>
  );
});

MatchLobbyRoomRecipe.displayName = 'MatchLobbyRoomRecipe';
