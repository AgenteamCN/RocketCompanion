/**
 * kickoffEpisodeRuntimePipeline.ts
 * Pure runtime transition helpers for KickoffTrainingMode and KickoffEpisodeSubController:
 * - Pre-tick input evaluation & phase transition (countdown, waiting-for-input, easy-learning)
 * - Countdown tick progression, suspension settle clamping trigger, and audio cue transitions
 * - Live episode physics step orchestration (solid opponent PPO step, ghost sim step, first touch)
 * - Mode entry/leave store handler registration and runtime state restoration
 */

import { KICKOFF_SPAWNS } from '../../ui-core/config/trainingDefaults.ts';
import {
  TICKS_PER_DECISION,
  multiDiscreteToOverlayKeys,
  multiDiscreteToKeyString,
} from '../../ai/kickoffEpisodePrimitives.ts';
import {
  KickoffV2SafeTensorsAgent,
  KICKOFF_V1_SETTLE_TICKS,
} from '../../ai/KickoffV2SafeTensorsAgent.ts';
import {
  clampKickoffSettledPlayerAndPartnerCars,
  evaluateKickoffPreTickInput,
  stepKickoffAgentControls,
  stepKickoffGhostSimTick,
  detectKickoffPlayerFirstTouch,
  type KickoffGhostPlacement,
  type KickoffCarControls,
  type KickoffPhysicsPort,
} from './kickoffGhostPrecomputePipeline.ts';
import { hudStore, useKickoffTrainingStore } from '../runtimeUiPort.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';

export type KickoffSubMode = 'instant' | 'realistic' | 'easy-learning';
export type KickoffEpisodePhase = 'waiting-for-input' | 'countdown' | 'running' | 'paused-mismatch';

export interface KickoffGhostVisualsPort {
  setGhostPlacement(placement: KickoffGhostPlacement): void;
  setEntityVisibility(showCar: boolean, showBall: boolean): void;
  setVisible(visible: boolean): void;
  resetTrail(): void;
  recordBallTrajectoryPoint(ballView: unknown): void;
  update(
    prevState: Float32Array,
    currState: Float32Array,
    alpha: number,
    dt: number,
    controls: KickoffCarControls
  ): void;
}

export const NEUTRAL_KICKOFF_CONTROLS: KickoffCarControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

export interface KickoffEpisodeState {
  ghostSim: RocketSimPhysicsEngine | null;
  ghostPrevState: Float32Array | null;
  ghostCurrState: Float32Array | null;
  readonly ghostAgent: KickoffV2SafeTensorsAgent;
  readonly solidAgent: KickoffV2SafeTensorsAgent;
  preSettleCar0State: Float32Array | null;
  preSettleCar1State: Float32Array | null;
  spawnIndex: number;
  subMode: KickoffSubMode;
  ghostPlacement: KickoffGhostPlacement;
  ghostModeEnabled: boolean;
  aiTeamSign: 1 | -1;
  phase: KickoffEpisodePhase;
  episodeTick: number;
  countdownTicks: number;
  countdownElapsed: number;
  readonly latchedSec: Set<number>;
  timeline: ReturnType<KickoffV2SafeTensorsAgent['precomputeTimeline']> | null;
  ghostRawCtrl: KickoffCarControls;
  ghostCtrl: KickoffCarControls;
  playerTouchedBall: boolean;
  playerTouchTick: number | null;
  aiTouchTick: number | null;
  goalResetTicks: number;
}

export function createKickoffEpisodeState(): KickoffEpisodeState {
  return {
    ghostSim: null,
    ghostPrevState: null,
    ghostCurrState: null,
    ghostAgent: new KickoffV2SafeTensorsAgent({ channelMode: 'keyboard_coupled' }),
    solidAgent: new KickoffV2SafeTensorsAgent({ channelMode: 'keyboard_coupled' }),
    preSettleCar0State: null,
    preSettleCar1State: null,
    spawnIndex: 0,
    subMode: 'instant',
    ghostPlacement: 'same',
    ghostModeEnabled: true,
    aiTeamSign: 1,
    phase: 'waiting-for-input',
    episodeTick: 0,
    countdownTicks: 0,
    countdownElapsed: 0,
    latchedSec: new Set<number>(),
    timeline: null,
    ghostRawCtrl: { ...NEUTRAL_KICKOFF_CONTROLS },
    ghostCtrl: { ...NEUTRAL_KICKOFF_CONTROLS },
    playerTouchedBall: false,
    playerTouchTick: null,
    aiTouchTick: null,
    goalResetTicks: 0,
  };
}

export interface KickoffSimPorts {
  physics?:
    | (RocketSimPhysicsEngine & {
        setSimulationFrozen?: (frozen: boolean, resumeTick?: number, maskInputs?: boolean) => void;
      })
    | null;
  arena?: { boostPads?: { resetAll?: () => void }; resetBallTrail?: () => void } | null;
  playerCarIndex?: number;
  selectedHitbox?: string;
  playerControls?: KickoffCarControls;
  neutralControls?: KickoffCarControls;
  ballTrajectoryPredictor?: { clear?: () => void } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
  camera?: { resetView?: () => void } | null;
  interpolator?: { sync?: () => void; alpha?: number } | null;
  match?: { state?: { mode?: string; phase?: string; countdown?: number } } | null;
  options?: { gameAudio?: { play?: (cue: string, vol: number) => void } } | null;
}

export function syncKickoffMatchAndHudPhase(
  matchState: { phase?: string; countdown?: number } | null | undefined,
  phase: 'kickoff' | 'playing',
  countdown: number
): void {
  if (matchState) {
    matchState.phase = phase;
    matchState.countdown = countdown;
  }
  hudStore.getState().setMatchState({ matchPhase: phase, kickoffCountdown: countdown });
}

export function syncKickoffEpisodeResetStoreState(state: KickoffEpisodeState): void {
  const reqAct = state.timeline?.steps?.[0]?.action || [2, 1, 1, 0, 1, 0];
  useKickoffTrainingStore.getState().updateLiveState({
    phase: state.phase,
    episodeTick: 0,
    decisionStep: 0,
    countdownRemainingTicks: state.countdownTicks,
    requiredAction: reqAct,
    requiredKeys: multiDiscreteToOverlayKeys(reqAct),
    requiredKeyStr: multiDiscreteToKeyString(reqAct),
    timeline: state.timeline,
    aiTouchTick: state.aiTouchTick,
    playerTouchTick: null,
    lastDeltaTicks: null,
    isInputMatching: true,
  });
}

export function stepKickoffPreTickPhase(
  state: KickoffEpisodeState,
  ports: KickoffSimPorts
): boolean {
  const physics = ports.physics!;
  const playerCarIndex = ports.playerCarIndex ?? 0;
  const playerControls = ports.playerControls || NEUTRAL_KICKOFF_CONTROLS;
  const neutralControls = ports.neutralControls || NEUTRAL_KICKOFF_CONTROLS;
  const evalOut = evaluateKickoffPreTickInput(
    playerControls,
    state.episodeTick,
    TICKS_PER_DECISION,
    state.timeline
  );
  const basePatch = {
    playerAction: evalOut.playerAction,
    playerKeys: evalOut.playerKeys,
    requiredAction: evalOut.requiredAction,
    requiredKeys: evalOut.requiredKeys,
    requiredKeyStr: evalOut.requiredKeyStr,
  };
  const liveStore = useKickoffTrainingStore.getState();

  if (state.phase === 'countdown') {
    physics.setControls(playerCarIndex, neutralControls);
    if (!state.ghostModeEnabled && physics.numCars >= 2) physics.setControls(1, neutralControls);
    liveStore.updateLiveState({
      ...basePatch,
      phase: 'countdown',
      countdownRemainingTicks: state.countdownTicks,
    });
    return true;
  }

  if (state.subMode === 'instant' && state.phase === 'waiting-for-input') {
    if (!evalOut.isAnyKeyPressed) {
      physics.setSimulationFrozen(true, 0, true);
      liveStore.updateLiveState({
        ...basePatch,
        phase: 'waiting-for-input',
        isInputMatching: false,
      });
      return true;
    }
    state.phase = 'running';
    physics.setSimulationFrozen(false, 0, false);
    physics.setControls(playerCarIndex, playerControls);
  }

  if (state.subMode === 'easy-learning') {
    if (
      !state.playerTouchedBall &&
      state.timeline &&
      evalOut.stepIdx < state.timeline.steps.length &&
      !evalOut.isMatching
    ) {
      state.phase = 'paused-mismatch';
      physics.setSimulationFrozen(true, 0, false);
      liveStore.updateLiveState({
        ...basePatch,
        phase: 'paused-mismatch',
        episodeTick: state.episodeTick,
        decisionStep: evalOut.stepIdx,
        isInputMatching: false,
      });
      return false;
    }
    if (state.phase !== 'running') {
      state.phase = 'running';
      physics.setSimulationFrozen(false, 0, false);
    }
  }

  liveStore.updateLiveState({
    ...basePatch,
    phase: state.phase,
    episodeTick: state.episodeTick,
    decisionStep: evalOut.stepIdx,
    isInputMatching: evalOut.isMatching,
  });
  return true;
}

export function stepKickoffCountdownTick(state: KickoffEpisodeState, ports: KickoffSimPorts): void {
  const physics = ports.physics!;
  physics.step(1);
  state.countdownElapsed++;
  const rem = Math.max(0, state.countdownTicks - 1);
  state.countdownTicks = rem;

  if (state.countdownElapsed === KICKOFF_V1_SETTLE_TICKS) {
    clampKickoffSettledPlayerAndPartnerCars(
      physics as KickoffPhysicsPort,
      ports.playerCarIndex ?? 0,
      state.spawnIndex,
      KICKOFF_SPAWNS[state.spawnIndex] || KICKOFF_SPAWNS[0],
      state.ghostModeEnabled,
      state.ghostPlacement,
      state.preSettleCar0State,
      state.preSettleCar1State
    );
    if (rem > 0) physics.setSimulationFrozen(true, 0, true);
  }

  const displaySec = rem > 0 ? Math.min(4, Math.ceil(rem / 120)) : 0;
  const matchState = ports.match?.state;
  if (matchState && matchState.countdown !== displaySec) {
    syncKickoffMatchAndHudPhase(matchState, rem > 0 ? 'kickoff' : 'playing', displaySec);
  }

  const audio = ports.options?.gameAudio || gameAudio;
  const sec = Math.ceil(rem / 120);
  if (rem > 0 && sec <= 3 && !state.latchedSec.has(sec)) {
    state.latchedSec.add(sec);
    audio?.play?.('match_countdown_321', 1.0);
  }

  if (rem <= 0) {
    state.phase = 'running';
    physics.setSimulationFrozen(false, 0, false);
    syncKickoffMatchAndHudPhase(matchState, 'playing', 0);
    audio?.play?.('match_start_go', 1.0);
  }
}

export function stepKickoffRunningTick(
  state: KickoffEpisodeState,
  physics: RocketSimPhysicsEngine,
  ghostVisuals: KickoffGhostVisualsPort | null
): void {
  if (!state.ghostModeEnabled && physics.numCars >= 2) {
    const solidStep = stepKickoffAgentControls(
      state.solidAgent,
      physics,
      1,
      state.aiTeamSign < 0,
      state.episodeTick,
      TICKS_PER_DECISION,
      state.ghostRawCtrl
    );
    state.ghostRawCtrl = solidStep.rawControls;
    state.ghostCtrl = solidStep.sanitizedControls;
  }

  physics.step(1);

  if (
    state.ghostModeEnabled &&
    state.ghostSim?.isInitialized &&
    state.ghostPrevState &&
    state.ghostCurrState
  ) {
    const ghostStep = stepKickoffGhostSimTick(
      state.ghostSim,
      state.ghostAgent,
      state.episodeTick,
      TICKS_PER_DECISION,
      state.ghostRawCtrl,
      state.ghostPrevState,
      state.ghostCurrState
    );
    state.ghostRawCtrl = ghostStep.rawControls;
    state.ghostCtrl = ghostStep.sanitizedControls;
    ghostVisuals?.recordBallTrajectoryPoint(ghostStep.ballView);
  }

  state.episodeTick++;
  if (!state.playerTouchedBall && detectKickoffPlayerFirstTouch(physics, state.ghostModeEnabled)) {
    state.playerTouchedBall = true;
    state.playerTouchTick = state.episodeTick;
    useKickoffTrainingStore.getState().updateLiveState({
      playerTouchTick: state.playerTouchTick,
      lastDeltaTicks: state.aiTouchTick ? state.playerTouchTick - state.aiTouchTick : 0,
    });
  }
}
