export interface RosterTeamEntry {
  carIndex: number;
  name: string;
  isSelf: boolean;
  isBot?: boolean;
}

export interface ResolvedModeRosterEntries {
  blueEntries: RosterTeamEntry[];
  orangeEntries: RosterTeamEntry[];
  isSpectatingNoHuman: boolean;
  detectedLocalTeam: number | null;
}

export interface ReplayViewerRosterEntryInput {
  carIndex: number;
  name?: string;
  isSelf?: boolean;
  team?: number;
}

export interface ExpSpawnedCarRosterInput {
  carIndex: number;
  isPlayer?: boolean;
  botType?: string;
  keyNumber?: number;
  name?: string;
  team?: number;
}

export interface RawRosterPlayerInput {
  carIndex?: number;
  entityId?: number;
  team?: number | string;
  role?: string;
  isLocal?: boolean;
  isLocalPlayer?: boolean;
  peerId?: string;
  sessionId?: string;
  isBot?: boolean;
  botType?: string;
  username?: string;
  name?: string;
  playerName?: string;
}

export interface ConnectedPeerRosterInput {
  id?: string;
  carIndex?: number;
  entityId?: number;
  team?: number | string;
  role?: string;
  isSelf?: boolean;
  name?: string;
  username?: string;
  isBot?: boolean;
  botType?: string;
}

export interface HudRosterSourceContext {
  matchMode: string;
  isReplayViewerLoaded: boolean;
  replayViewerState?: string;
  replayViewerActivePovTeam?: number;
  replayViewerLocalTeam?: number;
  replayViewerActivePovCarIndex?: number;
  replayViewerResolvedRoster?: ReadonlyArray<ReplayViewerRosterEntryInput>;
  expPlayerParticipation?: string;
  expSpawnedCars?: ReadonlyArray<ExpSpawnedCarRosterInput>;
  rawRosterSnapshot?:
    ReadonlyArray<RawRosterPlayerInput> | { players?: ReadonlyArray<RawRosterPlayerInput> } | null;
  replayTimelineCarEntries?: ReadonlyArray<RawRosterPlayerInput>;
  connectedPeers?: ReadonlyArray<ConnectedPeerRosterInput>;
  localPeerId?: string | null;
  localCarIdx?: number;
  participantTeams?: ReadonlyMap<number, number> | null;
  arenaCarTeams?: ArrayLike<number> | null;
  localPlayerName?: string;
  carNamesByIndex?: ReadonlyMap<number, string> | null;
  activeBotName?: string;
  numCars?: number;
}

export interface ResolvedModeRosterBuffer extends ResolvedModeRosterEntries {
  readonly _bluePool: RosterTeamEntry[];
  readonly _orangePool: RosterTeamEntry[];
  readonly _sameBotCounts: Record<string, number>;
  readonly _combinedPool: Array<RosterTeamEntry & { team: number; active: boolean }>;
  readonly _sortedRawScratch: RawRosterPlayerInput[];
}

export function createResolvedModeRosterBuffer(maxTeamSlots = 8): ResolvedModeRosterBuffer {
  const _bluePool: RosterTeamEntry[] = [];
  const _orangePool: RosterTeamEntry[] = [];
  const _combinedPool: Array<RosterTeamEntry & { team: number; active: boolean }> = [];
  for (let i = 0; i < maxTeamSlots; i++) {
    _bluePool.push({ carIndex: 0, name: '', isSelf: false, isBot: false });
    _orangePool.push({ carIndex: 0, name: '', isSelf: false, isBot: false });
    _combinedPool.push({
      carIndex: i,
      name: '',
      team: 0,
      isSelf: false,
      isBot: false,
      active: false,
    });
  }
  return {
    blueEntries: [],
    orangeEntries: [],
    isSpectatingNoHuman: false,
    detectedLocalTeam: null,
    _bluePool,
    _orangePool,
    _sameBotCounts: {},
    _combinedPool,
    _sortedRawScratch: [],
  };
}

function pushToTeamPool(
  list: RosterTeamEntry[],
  pool: RosterTeamEntry[],
  carIndex: number,
  name: string,
  isSelf: boolean,
  isBot?: boolean
): void {
  const idx = list.length;
  let slot = pool[idx];
  if (!slot) {
    slot = { carIndex, name, isSelf, isBot };
    pool[idx] = slot;
  } else {
    slot.carIndex = carIndex;
    slot.name = name;
    slot.isSelf = isSelf;
    slot.isBot = isBot;
  }
  list.push(slot);
}

function compareRawRosterByCarIndex(a: RawRosterPlayerInput, b: RawRosterPlayerInput): number {
  const ca = typeof a?.carIndex === 'number' ? a.carIndex : (a?.entityId ?? 0);
  const cb = typeof b?.carIndex === 'number' ? b.carIndex : (b?.entityId ?? 0);
  return ca - cb;
}

const _defaultRosterBuffer = createResolvedModeRosterBuffer();

export function resolveModeRosterEntries(
  source: HudRosterSourceContext,
  targetBuffer: ResolvedModeRosterBuffer = _defaultRosterBuffer
): ResolvedModeRosterEntries {
  const {
    blueEntries,
    orangeEntries,
    _bluePool,
    _orangePool,
    _sameBotCounts,
    _combinedPool,
    _sortedRawScratch,
  } = targetBuffer;
  blueEntries.length = 0;
  orangeEntries.length = 0;

  let isSpectatingNoHuman = false;
  let detectedLocalTeam: number | null = null;

  const pushEntry = (
    isOrange: boolean,
    carIndex: number,
    name: string,
    isSelf: boolean,
    isBot?: boolean
  ) => {
    pushToTeamPool(
      isOrange ? orangeEntries : blueEntries,
      isOrange ? _orangePool : _bluePool,
      carIndex,
      name,
      isSelf,
      isBot
    );
  };

  if (source.isReplayViewerLoaded) {
    const viewerState = source.replayViewerState;
    const isReplayViewerIntervening =
      viewerState === 'preroll-countdown' || viewerState === 'intervening';
    isSpectatingNoHuman = !isReplayViewerIntervening;
    detectedLocalTeam = isReplayViewerIntervening
      ? (source.replayViewerActivePovTeam ?? source.replayViewerLocalTeam ?? 0)
      : (source.replayViewerLocalTeam ?? 0);
    const roster = Array.isArray(source.replayViewerResolvedRoster)
      ? source.replayViewerResolvedRoster
      : [];
    for (let i = 0; i < roster.length; i++) {
      const c = roster[i];
      pushEntry(
        c.team === 1,
        c.carIndex,
        c.name || `Car ${c.carIndex + 1}`,
        isReplayViewerIntervening
          ? c.carIndex === source.replayViewerActivePovCarIndex
          : Boolean(c.isSelf)
      );
    }
  } else if (source.matchMode === 'exp-multi-bots') {
    const rawCars = source.expSpawnedCars || [];
    isSpectatingNoHuman = source.expPlayerParticipation === 'none';
    if (source.expPlayerParticipation === 'orange') detectedLocalTeam = 1;
    else if (source.expPlayerParticipation === 'blue') detectedLocalTeam = 0;

    for (const k in _sameBotCounts) {
      _sameBotCounts[k] = 0;
    }
    for (let i = 0; i < rawCars.length; i++) {
      const c = rawCars[i];
      if (!c.isPlayer) {
        const bt = String(c.botType || 'necto').toLowerCase();
        _sameBotCounts[bt] = (_sameBotCounts[bt] || 0) + 1;
      }
    }

    for (let i = 0; i < rawCars.length; i++) {
      const c = rawCars[i];
      const bt = String(c.botType || 'necto');
      const btLower = bt.toLowerCase();
      const capBot = bt.charAt(0).toUpperCase() + btLower.slice(1);
      const defaultName = c.isPlayer
        ? 'Player'
        : (_sameBotCounts[btLower] || 0) > 1
          ? `${capBot} #${c.keyNumber || c.carIndex + 1}`
          : capBot;
      const isSelf = Boolean(c.isPlayer);
      if (isSelf) detectedLocalTeam = c.team === 1 ? 1 : 0;
      pushEntry(c.team === 1, c.carIndex, c.name || defaultName, isSelf, !c.isPlayer);
    }
  } else if (source.matchMode === 'match' || source.matchMode === 'online-warmup') {
    const rawRoster = source.rawRosterSnapshot;
    const rawPlayers =
      rawRoster && !Array.isArray(rawRoster) && 'players' in rawRoster
        ? rawRoster.players
        : undefined;
    const rosterSnap: ReadonlyArray<RawRosterPlayerInput> = Array.isArray(rawPlayers)
      ? rawPlayers
      : Array.isArray(rawRoster)
        ? rawRoster
        : Array.isArray(source.replayTimelineCarEntries)
          ? source.replayTimelineCarEntries
          : [];
    const peers = source.connectedPeers || [];
    const localPeerId = source.localPeerId;
    const localCarIdx = source.localCarIdx ?? 0;

    if (rosterSnap.length > 0) {
      _sortedRawScratch.length = rosterSnap.length;
      for (let i = 0; i < rosterSnap.length; i++) {
        _sortedRawScratch[i] = rosterSnap[i];
      }
      _sortedRawScratch.sort(compareRawRosterByCarIndex);

      for (let i = 0; i < _sortedRawScratch.length; i++) {
        const p = _sortedRawScratch[i];
        const cIdx =
          typeof p?.carIndex === 'number'
            ? p.carIndex
            : typeof p?.entityId === 'number'
              ? p.entityId
              : -1;
        if (p.team === 'spectator' || p.role === 'spectator' || cIdx < 0) continue;
        const isOrange = p.team === 1 || p.team === 'orange';
        const isSelf = Boolean(
          p.isLocal ||
          p.isLocalPlayer ||
          (localPeerId && (p.peerId === localPeerId || p.sessionId === localPeerId)) ||
          cIdx === localCarIdx
        );
        if (isSelf) detectedLocalTeam = isOrange ? 1 : 0;
        const peerRef = p.peerId || p.sessionId;
        const isBot = Boolean(
          p.isBot || p.botType || (typeof peerRef === 'string' && peerRef.startsWith('bot'))
        );
        pushEntry(
          isOrange,
          cIdx,
          p.username || p.name || p.playerName || `Player ${cIdx + 1}`,
          isSelf,
          isBot
        );
      }
    } else if (
      peers.length > 0 ||
      (source.participantTeams instanceof Map && source.participantTeams.size > 0)
    ) {
      for (let i = 0; i < _combinedPool.length; i++) {
        _combinedPool[i].active = false;
      }
      const setCombinedSlot = (
        cIdx: number,
        name: string,
        team: number,
        isSelf: boolean,
        isBot: boolean
      ) => {
        if (cIdx < 0) return;
        let slot = _combinedPool[cIdx];
        if (!slot) {
          slot = { carIndex: cIdx, name, team, isSelf, isBot, active: true };
          _combinedPool[cIdx] = slot;
        } else {
          slot.carIndex = cIdx;
          slot.name = name;
          slot.team = team;
          slot.isSelf = isSelf;
          slot.isBot = isBot;
          slot.active = true;
        }
      };

      const selfTeam =
        source.participantTeams?.get?.(localCarIdx) ??
        source.arenaCarTeams?.[localCarIdx] ??
        localCarIdx % 2;
      const selfName =
        source.localPlayerName ||
        source.carNamesByIndex?.get?.(localCarIdx) ||
        `Player ${localCarIdx + 1}`;
      setCombinedSlot(
        localCarIdx,
        selfName,
        selfTeam === 1 || (selfTeam as unknown) === 'orange' ? 1 : 0,
        true,
        false
      );

      let fallbackIdx = 0;
      for (let i = 0; i < peers.length; i++) {
        const p = peers[i];
        if (p.team === 'spectator' || p.role === 'spectator') continue;
        const cIdx =
          typeof p.carIndex === 'number'
            ? p.carIndex
            : typeof p.entityId === 'number'
              ? p.entityId
              : fallbackIdx++;
        const isSelf = Boolean(
          p.isSelf || (localPeerId && p.id === localPeerId) || cIdx === localCarIdx
        );
        const isOrange =
          p.team === 1 ||
          p.team === 'orange' ||
          (p.team === undefined && (source.participantTeams?.get?.(cIdx) ?? cIdx % 2) === 1);
        setCombinedSlot(
          cIdx,
          p.name || p.username || source.carNamesByIndex?.get?.(cIdx) || `Player ${cIdx + 1}`,
          isOrange ? 1 : 0,
          isSelf,
          Boolean(p.isBot || p.botType)
        );
      }

      if (source.participantTeams instanceof Map) {
        for (const [cIdx, tVal] of source.participantTeams.entries()) {
          if (typeof cIdx === 'number' && cIdx >= 0 && cIdx < 8 && !_combinedPool[cIdx]?.active) {
            const cName = source.carNamesByIndex?.get?.(cIdx) || `Player ${cIdx + 1}`;
            setCombinedSlot(
              cIdx,
              cName,
              tVal === 1 ? 1 : 0,
              cIdx === localCarIdx,
              /^(necto|nexto|bot\b)/i.test(String(cName))
            );
          }
        }
      }

      for (let i = 0; i < _combinedPool.length; i++) {
        const entry = _combinedPool[i];
        if (!entry || !entry.active) continue;
        if (entry.isSelf) detectedLocalTeam = entry.team === 1 ? 1 : 0;
        pushEntry(entry.team === 1, entry.carIndex, entry.name, entry.isSelf, Boolean(entry.isBot));
      }
    } else {
      const botNameRaw = String(source.activeBotName || 'Necto');
      const botDisplay = botNameRaw.charAt(0).toUpperCase() + botNameRaw.slice(1);
      const selfName = source.localPlayerName || 'Player';
      pushEntry(false, 0, selfName, true, false);
      detectedLocalTeam = 0;
      if ((source.numCars ?? 2) >= 2) {
        pushEntry(true, 1, botDisplay, false, true);
      }
    }
  } else if (source.matchMode === 'dev-test-lab') {
    const numCars = source.numCars ?? 1;
    pushEntry(false, 0, 'Player', true, false);
    detectedLocalTeam = 0;
    if (numCars >= 2) {
      pushEntry(true, 1, 'Bot', false, true);
    }
  }

  targetBuffer.isSpectatingNoHuman = isSpectatingNoHuman;
  targetBuffer.detectedLocalTeam = detectedLocalTeam;
  return targetBuffer;
}
