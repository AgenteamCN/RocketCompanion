import { hudStore, useRewinderStore, useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type { DemolishRespawnLabTab } from './DemolishRespawnLabTab.ts';
import type { GoalReplayLabTab } from './GoalReplayLabTab.ts';
import type { GoalReplayBenchScenario } from './goalReplayScenariosPipeline.ts';
import type { KickoffDuelLabTab } from './KickoffDuelLabTab.ts';
import type { IsolationLabTabId, LabRuntimePort } from './LabTabTypes.ts';
import type { MultiGhostLabTab } from './MultiGhostLabTab.ts';
import type {
  IncidentOpponentMode,
  IncidentSandboxAction,
  NinetySecMatchLabTab,
} from './NinetySecMatchLabTab.ts';
import { resetSinglePlayerLabBaseline } from './probeArenaSetupPipeline.ts';
import type { ProbeCameraTarget, ProbesLabTab } from './ProbesLabTab.ts';
import type { StateReplayLabTab } from './StateReplayLabTab.ts';

export interface IsolationLabStoreBindingDeps {
  readonly probesTab: ProbesLabTab;
  readonly multiGhostTab: MultiGhostLabTab;
  readonly stateReplayTab: StateReplayLabTab;
  readonly ninetySecMatchTab: NinetySecMatchLabTab;
  readonly goalReplayTab: GoalReplayLabTab;
  readonly kickoffDuelTab: KickoffDuelLabTab;
  readonly demolishRespawnTab: DemolishRespawnLabTab;
  switchTab(tab: IsolationLabTabId): void;
  ensureTabActive(tab: IsolationLabTabId): boolean;
}

export function resetIsolationLabRuntimeBaseline(runtime: LabRuntimePort | null | undefined): void {
  if (!runtime) return;
  const { keyboard, match, interpolator, camera } = runtime;
  runtime.isBotMatch = false;
  runtime.releaseGoalReplayCameraOverride();
  if (keyboard) {
    keyboard.ballControlEnabled = true;
  }
  if (match?.state) {
    match.state.phase = 'playing';
    match.state.paused = false;
    match.state.countdown = 0;
  }

  interpolator?.setTrainingPhysicsRate?.(120);
  runtime.audioSubsystem?.resetAudio?.();
  resetSinglePlayerLabBaseline(runtime, true);
  camera?.resetView();
}

export function resetIsolationLabTelemetryAndHud(): void {
  useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
    probeCameraTarget: 'player',
    rewinderState: 'idle',
    rewinderRecordedFrames: 0,
    rewinderCursorFrame: 0,
    rewinderTargetFrame: 0,
    rewinderPrerollRemainingSec: 0,
    podiumActive: false,
    goalReplayPhase: 'live',
    goalReplayPaused: false,
  });

  hudStore.getState().setMatchState({
    matchPhase: 'playing',
    kickoffCountdown: 0,
    isOvertime: false,
    overtimeSeconds: 0,
    winner: null,
    replayScorerName: null,
    replayScorerTeam: null,
    replayBallSpeedKph: null,
    replayAssistName: null,
  });
  hudStore.getState().setReplayState({
    replayPaused: false,
    replayPersistent: false,
  });
}

export function bindIsolationLabStoreHandlers(deps: IsolationLabStoreBindingDeps): void {
  const {
    probesTab,
    multiGhostTab,
    stateReplayTab,
    ninetySecMatchTab,
    goalReplayTab,
    kickoffDuelTab,
    demolishRespawnTab,
  } = deps;

  const rewinderHandlers = {
    onRewinderStartRecording() {
      stateReplayTab.startRecording();
    },
    onRewinderStopRecording() {
      stateReplayTab.pauseRecording();
    },
    onRewinderPushBackwardStart() {
      stateReplayTab.beginScrub('rewinding');
    },
    onRewinderPushBackwardStop() {
      stateReplayTab.pauseScrub();
    },
    onRewinderPushForwardStart() {
      stateReplayTab.beginScrub('forwarding');
    },
    onRewinderPushForwardStop() {
      stateReplayTab.pauseScrub();
    },
    onRewinderResumeFromHere() {
      stateReplayTab.resumeFromCursor();
    },
    onRewinderClearBuffer() {
      stateReplayTab.clearBuffer();
    },
    onRewinderCancelToFreeplay() {
      stateReplayTab.clearBuffer();
    },
    onRewinderExportReplay() {
      stateReplayTab.exportReplay();
    },
    onRewinderImportReplay(file: File | Blob | ArrayBuffer | Uint8Array) {
      return stateReplayTab.importReplay(file);
    },
    onRewinderSeekFrame(idx: number) {
      stateReplayTab.seekFrame(idx);
    },
  };

  useRewinderStore.getState().setRuntimeHandlers(rewinderHandlers);

  useSubsystemIsolationLabStore.getState().setRuntimeHandlers({
    ...rewinderHandlers,
    onTabChange(tab: IsolationLabTabId) {
      deps.switchTab(tab);
    },
    onProbesConfigChange() {
      probesTab.syncConfiguration(false);
    },
    onProbeCameraChange(target: ProbeCameraTarget) {
      if (useSubsystemIsolationLabStore.getState().activeTab === 'probes') {
        probesTab.applyCameraTarget(target);
      }
    },
    onDualWorldConfigChange() {
      multiGhostTab.syncDualWorldConfiguration(false);
    },
    onSwitchWorld() {
      deps.ensureTabActive('multi-ghost');
      multiGhostTab.handleSwitchWorld();
    },
    onStartIncidentMatch(oppMode: IncidentOpponentMode) {
      if (!deps.ensureTabActive('90s-match')) {
        void ninetySecMatchTab.startMatchSession(oppMode);
      }
    },
    onIncidentControlModeChange(oppMode: IncidentOpponentMode) {
      ninetySecMatchTab.handleControlModeSwitch(oppMode);
    },
    onIncidentControlledCarChange(carIdx: number) {
      ninetySecMatchTab.applyControlledCar(carIdx);
    },
    onIncidentSpeedMultiplierChange(mult: number) {
      ninetySecMatchTab.applySpeedMultiplier(mult);
    },
    onTriggerIncidentAction(action: IncidentSandboxAction) {
      deps.ensureTabActive('90s-match');
      ninetySecMatchTab.triggerSandboxAction(action);
    },
    onGoalReplayTriggerScenario(scenario: GoalReplayBenchScenario) {
      deps.ensureTabActive('goal-replay');
      goalReplayTab.triggerScenario(scenario);
    },
    onGoalReplayTogglePause() {
      goalReplayTab.togglePause();
    },
    onGoalReplayCycleSpeed() {
      goalReplayTab.cycleSpeed();
    },
    onGoalReplaySeekNormalized(progress01: number) {
      goalReplayTab.seekNormalized(progress01);
    },
    onEnterPodiumTest(winningTeam: number) {
      deps.ensureTabActive('goal-replay');
      goalReplayTab.enterPodiumShowcase(winningTeam);
    },
    onExitPodiumTest() {
      goalReplayTab.exitPodiumShowcase();
    },
    onKickoffDuelRestart(slotIdx?: number) {
      if (!deps.ensureTabActive('kickoff-duel')) {
        kickoffDuelTab.startEpisode(slotIdx ?? null);
      }
    },
    onKickoffDuelSpeedChange(mult: number) {
      if (useSubsystemIsolationLabStore.getState().activeTab === 'kickoff-duel') {
        kickoffDuelTab.applySpeedMultiplier(mult);
      }
    },
    onKickoffDuelRunBenchmark() {
      kickoffDuelTab.runMatrixBenchmark();
    },
    onKickoffDuelExportDiagnostics(format: string, scope: string) {
      kickoffDuelTab.exportDiagnostics(format, scope);
    },
    onDemolishRespawnTriggerDemo() {
      deps.ensureTabActive('demolish-respawn');
      demolishRespawnTab.triggerDemolish();
    },
    onDemolishRespawnForceRespawn() {
      deps.ensureTabActive('demolish-respawn');
      demolishRespawnTab.forceRespawnNow();
    },
    onDemolishRespawnSimulateSteer(direction: string) {
      deps.ensureTabActive('demolish-respawn');
      demolishRespawnTab.simulateSteerEdge(direction);
    },
    onDemolishRespawnSelectSlot(slotIndex: number) {
      deps.ensureTabActive('demolish-respawn');
      demolishRespawnTab.selectSlotDirect(slotIndex);
    },
    onDemolishRespawnConfigChange() {
      if (useSubsystemIsolationLabStore.getState().activeTab === 'demolish-respawn') {
        demolishRespawnTab.applyConfigChange();
      }
    },
  });
}
