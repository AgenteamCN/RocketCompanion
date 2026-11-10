import { useAppStore } from '../runtimeUiPort.ts';
import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../ai/experimental/ExperimentalBotAgent.ts';
import { NEUTRAL_CAR_CONTROLS } from '../../network/client/PredictionHistoryBuffer.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { CarControlsInput } from '../../network/protocol/GlobalPayloadCodec.ts';

export interface ActiveCarTeamSlot {
  carIndex: number;
  team: number;
}

export interface ActiveModeCarListPort {
  id?: string;
  activeCarsList?: ActiveCarTeamSlot[];
  rosterController?: {
    activeCarsList?: ActiveCarTeamSlot[];
  } | null;
}

export interface TouchAgentWorldContext {
  readonly modeManager: { getActiveMode(): ActiveModeCarListPort | null } | null;
  readonly physics: RocketSimPhysicsEngine | null;
  readonly arena?: {
    readonly vehicleRegistry?: { readonly carTeams?: ArrayLike<number> };
    readonly carTeams?: ArrayLike<number>;
  } | null;
  readonly networkManager?: {
    readonly rosterSyncCoordinator?: {
      readonly participantTeams?: ReadonlyMap<number, number>;
    };
  } | null;
  readonly teamAssignment?: { playerTeam: number; opponentTeam: number } | null;
  readonly botCoordinator?: {
    readonly isBotMatch?: boolean;
  } | null;
  readonly playerCarIndex: number;
}

function normalizeTeamBit(rawTeam: unknown): 0 | 1 | null {
  if (rawTeam === 1 || rawTeam === 'orange') return 1;
  if (rawTeam === 0 || rawTeam === 'blue') return 0;
  return null;
}

function resolveFallbackCarTeam(
  worldCtx: TouchAgentWorldContext,
  cIdx: number,
  localCarIndex: number,
  onlineLocalTeam: 0 | 1 | null
): 0 | 1 {
  const fromParticipantMap = normalizeTeamBit(
    worldCtx.networkManager?.rosterSyncCoordinator?.participantTeams?.get(cIdx)
  );
  if (fromParticipantMap !== null) return fromParticipantMap;

  if (cIdx === localCarIndex && onlineLocalTeam !== null) {
    return onlineLocalTeam;
  }

  const fromPhysicsSpec = normalizeTeamBit(worldCtx.physics?._carSpecs?.[cIdx]?.team);
  if (fromPhysicsSpec !== null) return fromPhysicsSpec;

  const fromArena = normalizeTeamBit(
    (worldCtx.arena?.vehicleRegistry?.carTeams ?? worldCtx.arena?.carTeams)?.[cIdx]
  );
  if (fromArena !== null) return fromArena;

  if (worldCtx.teamAssignment) {
    if (cIdx === localCarIndex) {
      const pt = normalizeTeamBit(worldCtx.teamAssignment.playerTeam);
      if (pt !== null) return pt;
    } else if (cIdx === 1 && worldCtx.botCoordinator?.isBotMatch) {
      const ot = normalizeTeamBit(worldCtx.teamAssignment.opponentTeam);
      if (ot !== null) return ot;
    }
  }

  return cIdx % 2 === 1 ? 1 : 0;
}

export function resolveTouchActiveCarsAndTeam(
  worldCtx: TouchAgentWorldContext,
  carIndex: number
): { team: number; activeCars: ActiveCarTeamSlot[] | null } {
  const activeCarsList = worldCtx.modeManager?.getActiveMode?.()?.rosterController?.activeCarsList;
  if (activeCarsList && activeCarsList.length > 0) {
    const found = activeCarsList.find((c) => c.carIndex === carIndex);
    const team = found ? (found.team === 1 ? 1 : 0) : carIndex % 2;
    return { team, activeCars: activeCarsList };
  }

  const appState = useAppStore ? useAppStore.getState() : null;
  const onlineSession = appState?.onlineSession;
  const onlineLocalTeam = normalizeTeamBit(onlineSession?.localTeam);
  const peers = onlineSession?.connectedPeers ?? appState?.connectedPeers;
  const participantTeams = worldCtx.networkManager?.rosterSyncCoordinator?.participantTeams;

  const byCar = new Map<number, 0 | 1>();

  if (participantTeams instanceof Map && participantTeams.size > 0) {
    for (const [cIdx, rawTeam] of participantTeams.entries()) {
      if (typeof cIdx !== 'number' || cIdx < 0 || cIdx >= 6) continue;
      const norm = normalizeTeamBit(rawTeam);
      if (norm !== null) {
        byCar.set(cIdx, norm);
      }
    }
  }

  if (Array.isArray(peers) && peers.length > 0) {
    for (let i = 0; i < peers.length; i++) {
      const p = peers[i] as Record<string, unknown> | null | undefined;
      if (!p || p.isSpectator || p.role === 'spectator' || p.team === 'spectator' || p.team === 2) {
        continue;
      }
      const cIdx =
        typeof p.entityId === 'number'
          ? p.entityId
          : typeof p.carIndex === 'number'
            ? p.carIndex
            : -1;
      if (cIdx < 0 || cIdx >= 6) continue;
      const peerTeam =
        normalizeTeamBit(p.team) ??
        resolveFallbackCarTeam(worldCtx, cIdx, carIndex, onlineLocalTeam);
      byCar.set(cIdx, peerTeam);
    }
  }

  const resolvedSelfTeam =
    byCar.get(carIndex) ?? resolveFallbackCarTeam(worldCtx, carIndex, carIndex, onlineLocalTeam);

  if (byCar.size > 0) {
    byCar.set(carIndex, resolvedSelfTeam);
    const activeCars: ActiveCarTeamSlot[] = Array.from(byCar.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([cIdx, t]) => ({ carIndex: cIdx, team: t }));
    return { team: resolvedSelfTeam, activeCars };
  }

  const physics = worldCtx.physics;
  if (physics) {
    const activeCars: ActiveCarTeamSlot[] = [];
    const maxCars = Math.min(6, Math.max(physics.numCars || 0, physics._carSpecs?.length || 0));
    for (let c = 0; c < maxCars; c++) {
      const isActive =
        typeof physics.isCarSlotActive === 'function'
          ? physics.isCarSlotActive(c)
          : Boolean(physics._carSpecs?.[c]);
      if (!isActive && c !== carIndex) continue;
      const t =
        c === carIndex
          ? resolvedSelfTeam
          : resolveFallbackCarTeam(worldCtx, c, carIndex, onlineLocalTeam);
      activeCars.push({ carIndex: c, team: t });
    }
    if (activeCars.length > 0) {
      return { team: resolvedSelfTeam, activeCars };
    }
  }

  return { team: resolvedSelfTeam, activeCars: null };
}

export function isClosestTeamCarToKickoff(
  physics: RocketSimPhysicsEngine | null,
  carIndex: number,
  team: number,
  activeCars: ActiveCarTeamSlot[] | null
): boolean {
  if (!Array.isArray(activeCars) || activeCars.length <= 2) return true;
  const myView = physics?.getCarStateView?.(carIndex);
  if (!myView) return true;
  const myDist = Math.hypot(myView.posX, myView.posY);
  for (let i = 0; i < activeCars.length; i++) {
    const entry = activeCars[i];
    if (entry.carIndex === carIndex || entry.team !== team) continue;
    const otherView = physics?.getCarStateView?.(entry.carIndex);
    if (!otherView || otherView.isDemoed) continue;
    const d = Math.hypot(otherView.posX, otherView.posY);
    if (d < myDist - 10 || (Math.abs(d - myDist) <= 10 && entry.carIndex < carIndex)) {
      return false;
    }
  }
  return true;
}

/**
 * Self-contained domain sub-controller owning Touch AI agent instance and kickoff step counter.
 */
export class TouchInputAgentController {
  public agentInstance: ExperimentalBotAgent | null = null;
  public kickoffStep = 0;

  public getCachedActionOrNeutral(): CarControlsInput {
    return (this.agentInstance?.action as CarControlsInput | undefined) || NEUTRAL_CAR_CONTROLS;
  }

  public resolveControls(
    agentType: string,
    isKickoff: boolean,
    worldCtx: TouchAgentWorldContext
  ): CarControlsInput {
    const carIndex = worldCtx.playerCarIndex ?? 0;
    const { team, activeCars } = resolveTouchActiveCarsAndTeam(worldCtx, carIndex);

    if (!this.agentInstance) {
      this.agentInstance = new ExperimentalBotAgent(agentType, carIndex, team);
      ensureExperimentalEngine(agentType);
    } else {
      this.agentInstance.carIndex = carIndex;
      this.agentInstance.team = team;
      if (this.agentInstance.botType !== agentType) {
        this.agentInstance.setBotType(agentType);
      }
    }

    const agent = this.agentInstance;
    if (isKickoff) {
      this.kickoffStep = 0;
      agent.reset();
      return NEUTRAL_CAR_CONTROLS;
    }

    const simState = worldCtx.physics?.state;
    if (!simState) {
      return NEUTRAL_CAR_CONTROLS;
    }

    const stepIndex = this.kickoffStep || 0;
    const isPrimaryKickoff = isClosestTeamCarToKickoff(
      worldCtx.physics,
      carIndex,
      team,
      activeCars
    );
    const ko = agent.getKickoffControls(simState, stepIndex, isPrimaryKickoff) as
      CarControlsInput | null | undefined;
    let decidedControls: CarControlsInput | null | undefined;
    if (ko) {
      decidedControls = ko;
      agent.overrideControls(ko);
    } else if (agent.tickSkipCounter <= 0) {
      const pads = worldCtx.physics?.getPads?.() || [];
      decidedControls = agent.decideSync(simState, pads, activeCars || []) as CarControlsInput;
      agent.tickSkipCounter = agent.tickSkip - 1;
    } else {
      agent.tickSkipCounter--;
      decidedControls = agent.action as CarControlsInput;
    }
    this.kickoffStep = stepIndex + 1;
    return decidedControls || NEUTRAL_CAR_CONTROLS;
  }
}
