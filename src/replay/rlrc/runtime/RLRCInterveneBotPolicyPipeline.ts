/**
 * RLRCInterveneBotPolicyPipeline.ts
 * Pure bot policy decision port and control normalizer for non-POV vehicles during RLRC replay intervention.
 */

import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../../ai/experimental/ExperimentalBotAgent.ts';
import type { BallPredictionEnginePort } from '../../../ai/experimental/botpack9700488ObsExtendedPipeline.ts';
import type { BoostPadDescriptor } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { useReplayToRcsImporterStore } from '../../../game/runtimeUiPort.ts';
import type { ReplayScoreboardRuntimePort } from '../../ReplayScoreboardSynchronizer.ts';
import { STANDARD_BOOST_PADS_34 } from '../catalog/RLRCBoostPadLocationsTable.ts';
import type { RLRCConvertedReplaySession } from '../RLReplayToRLRCConverter.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import { DEFAULT_NEUTRAL_CAR_CONTROLS } from './RLRCInterveneFrameStateBuilder.ts';
import type { RLRCInterveneBotDecisionPort } from './RLRCInterveneNonPovSyncPipeline.ts';

export interface RLRCBridgeInputDevicePort {
  readonly controls?: Partial<RLRCSynthesizedCarControls>;
  readonly active?: () => boolean;
  readonly read?: () => Partial<RLRCSynthesizedCarControls> | null | undefined;
  readonly getControls?: (
    carIdx?: number
  ) => Partial<RLRCSynthesizedCarControls> | null | undefined;
}

export interface RLRCBridgeBotCoordinatorPort {
  readonly runtime?: { readonly bot?: { readonly id?: string } | null } | null;
  readonly resetBotState?: () => void;
  readonly resetAllBots?: () => void;
  readonly decideControlsForSlot?: (
    slotIndex: number,
    team: RLRCTeamIndex,
    state: Float32Array,
    dt: number
  ) => Partial<RLRCSynthesizedCarControls> | null | undefined;
}

export interface RLRCBridgeRuntimePort {
  readonly playerControls?: Partial<RLRCSynthesizedCarControls> | null;
  readonly keyboard?: RLRCBridgeInputDevicePort | null;
  readonly gamepad?: RLRCBridgeInputDevicePort | null;
  readonly botCoordinator?: RLRCBridgeBotCoordinatorPort | null;
  readonly physics?: {
    readonly isCarSlotActive?: (slotIndex: number) => boolean;
    readonly getPads?: () => ReadonlyArray<BoostPadDescriptor>;
  } | null;
}

const _botPadDescriptors: ReadonlyArray<BoostPadDescriptor> = STANDARD_BOOST_PADS_34.map((p) => ({
  pos: [p.position.x, p.position.y, p.position.z],
  isBig: p.isBigPad,
}));

export function normalizeSynthesizedControls(
  raw: Partial<RLRCSynthesizedCarControls> | null | undefined
): RLRCSynthesizedCarControls {
  if (!raw) return DEFAULT_NEUTRAL_CAR_CONTROLS;
  return {
    throttle: Number(raw.throttle) || 0,
    steer: Number(raw.steer) || 0,
    pitch: Number(raw.pitch) || 0,
    yaw: Number(raw.yaw) || 0,
    roll: Number(raw.roll) || 0,
    jump: Boolean(raw.jump),
    boost: Boolean(raw.boost),
    handbrake: Boolean(raw.handbrake),
  };
}

export function isNonNeutralControls(
  raw: Partial<RLRCSynthesizedCarControls> | null | undefined
): boolean {
  return Boolean(
    raw &&
    (Number(raw.throttle) ||
      Number(raw.steer) ||
      Number(raw.pitch) ||
      Number(raw.yaw) ||
      Number(raw.roll) ||
      raw.jump ||
      raw.boost ||
      raw.handbrake)
  );
}

function resolveSelectedBotPolicyId(
  botCoordinator: RLRCBridgeBotCoordinatorPort | null | undefined
): 'nexto' | 'necto' {
  const uiMode = useReplayToRcsImporterStore.getState().nonPovInterventionMode;
  if (uiMode === 'necto' || uiMode === 'nexto') return uiMode;
  return botCoordinator?.runtime?.bot?.id === 'necto' ? 'necto' : 'nexto';
}

export function createRLRCInterveneBotDecisionPort(host: {
  getSession: () => RLRCConvertedReplaySession | null;
  getRuntime: () => ReplayScoreboardRuntimePort | null;
}): RLRCInterveneBotDecisionPort {
  const slotBotAgents = new Map<number, ExperimentalBotAgent>();

  return {
    resetAllBots: () => {
      const bridgeRuntime = host.getRuntime() as unknown as RLRCBridgeRuntimePort | null;
      const botCoord = bridgeRuntime?.botCoordinator;
      const policyId = resolveSelectedBotPolicyId(botCoord);
      void ensureExperimentalEngine(policyId);
      botCoord?.resetAllBots?.();
      botCoord?.resetBotState?.();
      for (const agent of slotBotAgents.values()) {
        agent.setBotType(policyId);
        agent.reset();
      }
    },
    decideControlsForSlot: (slotIndex, team, state, dt) => {
      const bridgeRuntime = host.getRuntime() as unknown as RLRCBridgeRuntimePort | null;
      const botCoord = bridgeRuntime?.botCoordinator;
      const customDecision = botCoord?.decideControlsForSlot?.(slotIndex, team, state, dt);
      if (customDecision) return normalizeSynthesizedControls(customDecision);

      const policyId = resolveSelectedBotPolicyId(botCoord);
      let agent = slotBotAgents.get(slotIndex);
      if (!agent || agent.team !== team) {
        agent = new ExperimentalBotAgent(policyId, slotIndex, team);
        slotBotAgents.set(slotIndex, agent);
      } else if (agent.botType !== policyId) {
        agent.setBotType(policyId);
      }

      if (agent.tickSkipCounter <= 0) {
        const roster = host.getSession()?.roster ?? [];
        const sim = bridgeRuntime?.physics;
        const activeCars: Array<{ carIndex: number; team: number }> = [];
        for (let c = 0; c < RLRC_MAX_PLAYER_SLOTS; c++) {
          const isActive =
            c === slotIndex ||
            (typeof sim?.isCarSlotActive === 'function'
              ? sim.isCarSlotActive(c)
              : roster.some((r) => r.slotIndex === c));
          if (!isActive) continue;
          const slotMeta = roster.find((r) => r.slotIndex === c);
          activeCars.push({
            carIndex: c,
            team: c === slotIndex ? team : (slotMeta?.team ?? (c < 3 ? 0 : 1)),
          });
        }
        const pads = sim?.getPads?.() ?? _botPadDescriptors;
        const decided = agent.decideSync(
          state,
          pads,
          activeCars,
          sim as unknown as BallPredictionEnginePort
        );
        agent.tickSkipCounter = agent._staggered
          ? agent.tickSkip - 1
          : (slotIndex % agent.tickSkip) + 1;
        agent._staggered = true;
        return normalizeSynthesizedControls(decided);
      }

      agent.tickSkipCounter--;
      return normalizeSynthesizedControls(agent.action);
    },
  };
}
