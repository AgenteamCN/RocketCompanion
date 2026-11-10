import { create } from 'zustand';
import {
  INITIAL_SOLO_RESULTS,
  PRECOMPUTED_MATRIX_RESULTS,
} from '../config/kickoffDuelConfig';
import { updateReplayDirectorConfig } from '../config/replayDirectorConfig';
import { audioConfig } from '../config/audioConfig';

import {
  type KickoffDuelModelId,
  type KickoffDuelChannelMode,
  type KickoffDuelSoloResult,
  type KickoffDuelSlotResult,
  type KickoffDuelPairResult,
  type KickoffDuelActionStepTrace,
  type DevTestLabTab,
  type IncidentOpponentMode,
  type IncidentControlledCar,
  type IncidentSpeedMultiplier,
  type SubsystemIsolationLabState,
} from './subsystemIsolationLabTypes';

export {
  type KickoffDuelModelId,
  type KickoffDuelChannelMode,
  type KickoffDuelSoloResult,
  type KickoffDuelSlotResult,
  type KickoffDuelPairResult,
  type KickoffDuelActionStepTrace,
  type DevTestLabTab,
  type IncidentOpponentMode,
  type IncidentControlledCar,
  type IncidentSpeedMultiplier,
  type SubsystemIsolationLabState,
};

export const useSubsystemIsolationLabStore = create<SubsystemIsolationLabState>((set, get) => ({
  activeTab: 'probes',
  selectedTab: 'probes',

  probesEnabled: true,
  probeOffsetX: 0,
  probeOffsetY: 0,
  probeOffsetZ: 0,
  probeBaseAltitudeZ: 500,
  probePeakAltitudeZ: 600,
  probeHoldTolerance: 10,
  probeHoldDurationTicks: 120,
  probeBoostZ: 500,
  probeBoostVz: 0,
  probeBoostPhase: 'CLIMB_TO_PEAK',
  probeBoostHoldTicks: 0,
  probeRollDir: 1,
  probeCameraTarget: 'player',

  dualWorldEnabled: false,
  activeWorldIndex: 0,
  ghostWorldCount: 2,
  ghostCarsPerWorld: 1,
  ghostOpacity: 0.45,
  syncOtherWorldBall: true,

  incidentMatchActive: false,
  incidentOpponentMode: 'stationary',
  incidentControlledCar: 0,
  incidentSpeedMultiplier: 100,
  incidentMatchDurationSec: 90,
  incidentDisableGoalReplay: true,
  incidentKickoffTimeoutSec: 5,
  incidentKickoffCountdownSec: 0,
  incidentClockStarted: false,
  incidentTicksSinceKickoff: 0,
  incidentPhase: 'playing',
  incidentBlueScore: 0,
  incidentOrangeScore: 0,
  incidentRemainingSec: 90,
  incidentOvertime: false,
  incidentPossessionTeam: 0,
  incidentPossessionBluePts: 0,
  incidentPossessionOrangePts: 0,

  goalReplayLookbackSec: 5.0,
  goalReplayPostGoalSec: 3.0,
  goalReplayMuteSignalAudio: true,
  goalReplayPhase: 'live',
  goalReplayCurrentFrameId: 0,
  goalReplayLastKickoffFrameId: 0,
  goalReplayIncidentFrameId: 0,
  goalReplayRequestedStartFrameId: 0,
  goalReplayEffectiveStartFrameId: 0,
  goalReplayEffectiveEndFrameId: 0,
  goalReplayClampedByKickoff: false,
  goalReplayPlaybackCursor: 0,
  goalReplayPlaybackTotal: 0,
  goalReplayPaused: false,
  goalReplaySpeed: 1.0,
  goalReplayRecordedBufferCount: 0,
  podiumActive: false,
  podiumWinningTeam: 0,

  kickoffDuelBlueModel: 'ko_v2',
  kickoffDuelOrangeModel: 'ko_v1',
  kickoffDuelSlotIndex: 0,
  kickoffDuelCutoffDelaySec: 0.5,
  kickoffDuelAutoCycle: true,
  kickoffDuelAutoCycleAllPairs: false,
  kickoffDuelSpeedMultiplier: 100,
  kickoffDuelKoV2UseOpponentObs: false,
  kickoffDuelNextoScripted: false,
  kickoffDuelChannelMode: 'keyboard_coupled',
  kickoffDuelPhase: 'approaching',
  kickoffDuelCurrentTick: 0,
  kickoffDuelTouchTick: -1,
  kickoffDuelTouchWinner: 'NONE',
  kickoffDuelInputsCutOff: false,
  kickoffDuelBlueDist: 3200,
  kickoffDuelOrangeDist: 3200,
  kickoffDuelBallPos: [0, 0, 93],
  kickoffDuelBallVel: [0, 0, 0],
  kickoffDuelBallSpeed: 0,
  kickoffDuelBallOutcome: 'Approaching Ball...',
  kickoffDuelBenchmarkRunning: false,
  kickoffDuelSoloResults: INITIAL_SOLO_RESULTS as KickoffDuelSoloResult[],
  kickoffDuelMatrixResults: PRECOMPUTED_MATRIX_RESULTS as KickoffDuelPairResult[],
  kickoffDuelLiveBlueSteps: [],
  kickoffDuelLiveOrangeSteps: [],
  kickoffDuelDiagnosticRunning: false,
  kickoffDuelDiagnosticSummary: '',

  demolishRespawnTeam: 0,
  demolishRespawnVisualId: 'octane',
  demolishRespawnFreezeTimer: true,
  demolishRespawnAutoHoldDemo: true,
  demolishRespawnTimerDurationSec: 3.0,
  demolishRespawnSelectedSlot: -1,
  demolishRespawnObstacleEnabled: false,
  demolishRespawnObstacleSlot: 0,
  demolishRespawnIsDemolished: false,
  demolishRespawnRemainingSec: 0,
  demolishRespawnPreviewSlotLabel: 'Random (Preview: Far Left)',
  demolishRespawnPreviewCoords: [2688, -4608, 17.01],
  demolishRespawnPreviewYawDeg: 90,
  demolishRespawnCarActualPos: [2304, -4608, 17.01],
  demolishRespawnWheelLocalY: [],
  demolishRespawnLastInputEdge: 'None (Default -1)',

  runtimeHandlers: new Proxy({} as SubsystemIsolationLabState['runtimeHandlers'], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          console.warn(
            `[subsystemIsolationLabStore] Runtime handler "${prop}" was invoked before SubsystemIsolationLabMode registered it.`
          );
        };
      }
      return val;
    },
  }),
  setRuntimeHandlers: (handlers) =>
    set((s) => {
      const merged = { ...s.runtimeHandlers, ...handlers };
      return {
        runtimeHandlers: new Proxy(merged, {
          get(target, prop, receiver) {
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
              return val;
            }
            if (typeof prop === 'string' && prop.startsWith('on')) {
              return (..._args: unknown[]) => {
                console.warn(
                  `[subsystemIsolationLabStore] Runtime handler "${prop}" is not registered in the current mode.`
                );
              };
            }
            return val;
          },
        }),
      };
    }),

  setSelectedTab: (selectedTab) => {
    set({ selectedTab });
  },

  applyAndRestartLab: (targetTab) => {
    const activeTab = targetTab ?? get().selectedTab;
    set({
      activeTab,
      selectedTab: activeTab,
      probesEnabled: activeTab === 'probes',
      dualWorldEnabled: activeTab === 'multi-ghost',
      activeWorldIndex: 0,
      incidentMatchActive: activeTab === '90s-match',
      probeCameraTarget: 'player',
      podiumActive: false,
      goalReplayPhase: 'live',
      goalReplayPaused: false,
    });
    get().runtimeHandlers.onTabChange?.(activeTab);
  },

  setActiveTab: (activeTab) => {
    get().applyAndRestartLab(activeTab);
  },

  setProbesEnabled: (probesEnabled) => {
    set({ probesEnabled });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeOffsets: (probeOffsetX, probeOffsetY, probeOffsetZ) => {
    set({ probeOffsetX, probeOffsetY, probeOffsetZ });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeOffsetX: (probeOffsetX) => {
    set({ probeOffsetX });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeOffsetY: (probeOffsetY) => {
    set({ probeOffsetY });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeOffsetZ: (probeOffsetZ) => {
    set({ probeOffsetZ });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeAltitudes: (probeBaseAltitudeZ, probePeakAltitudeZ) => {
    set({ probeBaseAltitudeZ, probePeakAltitudeZ });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeBaseAltitudeZ: (probeBaseAltitudeZ) => {
    set({ probeBaseAltitudeZ });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbePeakAltitudeZ: (probePeakAltitudeZ) => {
    set({ probePeakAltitudeZ });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  resetProbeParameters: () => {
    set({
      probeOffsetX: 0,
      probeOffsetY: 0,
      probeOffsetZ: 0,
      probeBaseAltitudeZ: 500,
      probePeakAltitudeZ: 600,
    });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbesConfigChange?.();
    }
  },
  setProbeCameraTarget: (probeCameraTarget) => {
    set({ probeCameraTarget });
    if (get().activeTab === 'probes') {
      get().runtimeHandlers.onProbeCameraChange?.(probeCameraTarget);
    }
  },

  setDualWorldEnabled: (dualWorldEnabled) => {
    set({ dualWorldEnabled });
    if (get().activeTab === 'multi-ghost') {
      get().runtimeHandlers.onDualWorldConfigChange?.();
    }
  },
  switchActiveWorld: () => {
    const count = get().ghostWorldCount || 2;
    const next = (get().activeWorldIndex + 1) % count;
    set({ activeWorldIndex: next });
    get().runtimeHandlers.onSwitchWorld?.(next);
  },
  setActiveWorldIndex: (activeWorldIndex) => {
    set({ activeWorldIndex });
    get().runtimeHandlers.onSwitchWorld?.(activeWorldIndex);
  },
  setGhostWorldCount: (ghostWorldCount) => {
    const clampedCount = (ghostWorldCount === 3 || ghostWorldCount === 4) ? ghostWorldCount : 2;
    const nextActive = get().activeWorldIndex >= clampedCount ? 0 : get().activeWorldIndex;
    set({ ghostWorldCount: clampedCount, activeWorldIndex: nextActive });
    if (get().activeTab === 'multi-ghost') {
      get().runtimeHandlers.onDualWorldConfigChange?.();
    }
  },
  setGhostCarsPerWorld: (carsCount) => {
    const clampedCars = Math.max(1, Math.min(8, Math.round(carsCount)));
    set({ ghostCarsPerWorld: clampedCars });
    if (get().activeTab === 'multi-ghost') {
      get().runtimeHandlers.onDualWorldConfigChange?.();
    }
  },
  setGhostOpacity: (ghostOpacity) => {
    const clamped = Math.max(0.1, Math.min(0.95, Number(ghostOpacity.toFixed(2))));
    set({ ghostOpacity: clamped });
    if (get().activeTab === 'multi-ghost') {
      get().runtimeHandlers.onDualWorldConfigChange?.();
    }
  },

  setIncidentOpponentMode: (incidentOpponentMode) => {
    set({ incidentOpponentMode });
    if (get().activeTab === '90s-match') {
      const h = get().runtimeHandlers;
      if (h.onIncidentControlModeChange) {
        h.onIncidentControlModeChange(incidentOpponentMode);
      } else {
        h.onStartIncidentMatch?.(incidentOpponentMode);
      }
    }
  },
  setIncidentControlledCar: (incidentControlledCar) => {
    set({ incidentControlledCar });
    if (get().activeTab === '90s-match') {
      get().runtimeHandlers.onIncidentControlledCarChange?.(incidentControlledCar);
    }
  },
  switchIncidentControlledCar: () => {
    const next: IncidentControlledCar = get().incidentControlledCar === 0 ? 1 : 0;
    set({ incidentControlledCar: next });
    if (get().activeTab === '90s-match') {
      get().runtimeHandlers.onIncidentControlledCarChange?.(next);
    }
  },
  setIncidentSpeedMultiplier: (incidentSpeedMultiplier) => {
    set({ incidentSpeedMultiplier });
    if (get().activeTab === '90s-match') {
      get().runtimeHandlers.onIncidentSpeedMultiplierChange?.(incidentSpeedMultiplier);
    }
  },
  setIncidentDisableGoalReplay: (incidentDisableGoalReplay) => {
    set({ incidentDisableGoalReplay });
  },

  setGoalReplayLookbackSec: (goalReplayLookbackSec) => {
    set({ goalReplayLookbackSec });
  },
  setGoalReplayPostGoalSec: (goalReplayPostGoalSec) => {
    set({ goalReplayPostGoalSec });
  },
  setGoalReplayMuteSignalAudio: (goalReplayMuteSignalAudio) => {
    const next = Boolean(goalReplayMuteSignalAudio);
    set({ goalReplayMuteSignalAudio: next });
    try {
      updateReplayDirectorConfig({ muteSignalAudioInGoalReplay: next });
      audioConfig.set('muteSignalAudioInGoalReplay', next);
    } catch {
      // Ignore if config is unavailable
    }
  },

  setKickoffDuelModels: (kickoffDuelBlueModel, kickoffDuelOrangeModel) => {
    set({ kickoffDuelBlueModel, kickoffDuelOrangeModel });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelRestart?.(get().kickoffDuelSlotIndex);
    }
  },
  setKickoffDuelSlotIndex: (slotIndex) => {
    const clamped = ((slotIndex % 5) + 5) % 5;
    set({ kickoffDuelSlotIndex: clamped });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelRestart?.(clamped);
    }
  },
  setKickoffDuelCutoffDelaySec: (kickoffDuelCutoffDelaySec) => {
    set({ kickoffDuelCutoffDelaySec });
  },
  setKickoffDuelAutoCycle: (kickoffDuelAutoCycle) => {
    set({ kickoffDuelAutoCycle });
  },
  setKickoffDuelAutoCycleAllPairs: (kickoffDuelAutoCycleAllPairs) => {
    set({ kickoffDuelAutoCycleAllPairs });
  },
  setKickoffDuelSpeedMultiplier: (kickoffDuelSpeedMultiplier) => {
    set({ kickoffDuelSpeedMultiplier });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelSpeedChange?.(kickoffDuelSpeedMultiplier);
    }
  },
  setKickoffDuelKoV2UseOpponentObs: (kickoffDuelKoV2UseOpponentObs) => {
    set({ kickoffDuelKoV2UseOpponentObs });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelRestart?.(get().kickoffDuelSlotIndex);
    }
  },
  setKickoffDuelNextoScripted: (kickoffDuelNextoScripted) => {
    set({ kickoffDuelNextoScripted });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelRestart?.(get().kickoffDuelSlotIndex);
    }
  },
  setKickoffDuelChannelMode: (kickoffDuelChannelMode) => {
    set({ kickoffDuelChannelMode });
    if (get().activeTab === 'kickoff-duel') {
      get().runtimeHandlers.onKickoffDuelRestart?.(get().kickoffDuelSlotIndex);
    }
  },
  restartKickoffDuel: () => {
    get().runtimeHandlers.onKickoffDuelRestart?.(get().kickoffDuelSlotIndex);
  },
  runKickoffDuelBenchmark: () => {
    get().runtimeHandlers.onKickoffDuelRunBenchmark?.();
  },
  exportKickoffDuelDiagnostics: (format, scope) => {
    get().runtimeHandlers.onKickoffDuelExportDiagnostics?.(format, scope);
  },

  setDemolishRespawnTeam: (demolishRespawnTeam) => {
    set({ demolishRespawnTeam });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  setDemolishRespawnVisualId: (demolishRespawnVisualId) => {
    set({ demolishRespawnVisualId });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  setDemolishRespawnFreezeTimer: (demolishRespawnFreezeTimer) => {
    set({ demolishRespawnFreezeTimer });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  setDemolishRespawnAutoHoldDemo: (demolishRespawnAutoHoldDemo) => {
    set({ demolishRespawnAutoHoldDemo });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  setDemolishRespawnTimerDurationSec: (demolishRespawnTimerDurationSec) => {
    set({ demolishRespawnTimerDurationSec });
  },
  setDemolishRespawnObstacleEnabled: (demolishRespawnObstacleEnabled) => {
    set({ demolishRespawnObstacleEnabled });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  setDemolishRespawnObstacleSlot: (demolishRespawnObstacleSlot) => {
    set({ demolishRespawnObstacleSlot });
    if (get().activeTab === 'demolish-respawn') {
      get().runtimeHandlers.onDemolishRespawnConfigChange?.();
    }
  },
  triggerDemolishNow: () => {
    get().runtimeHandlers.onDemolishRespawnTriggerDemo?.();
  },
  forceRespawnNow: () => {
    get().runtimeHandlers.onDemolishRespawnForceRespawn?.();
  },
  simulateDemolishSteerEdge: (direction) => {
    get().runtimeHandlers.onDemolishRespawnSimulateSteer?.(direction);
  },
  selectDemolishRespawnSlot: (slotIndex) => {
    get().runtimeHandlers.onDemolishRespawnSelectSlot?.(slotIndex);
  },

  updateLiveTelemetry: (patch) => set((s) => ({ ...s, ...patch })),
}));
