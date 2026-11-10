/**
 * runtimeDiagnosticReportBuilder.ts
 * Pure diagnostic report builder for 1-click performance and runtime state exports
 * from PerformanceMonitorFloatingWindow or window.exportRuntimeDiagnosticReport().
 */

import { useAppStore, useReplayViewerStore } from '../../runtimeUiPort.ts';

interface ParticleSystemStateLike {
  driveParticlesActive?: boolean;
  trailParticlesActive?: boolean;
  drive?: { mesh?: { visible?: boolean } };
  trail?: { mesh?: { visible?: boolean } };
}

interface BoostEmitterLike {
  physics?: ParticleSystemStateLike;
  goldRush?: ParticleSystemStateLike;
}

interface ArenaCarMeshLike {
  visible?: boolean;
}

interface EngineSynthEntryLike {
  dormant?: boolean;
}

export interface DiagnosticRuntimeTarget {
  profiler?: {
    snapshot?: (bins?: number, seconds?: number) => unknown;
    getSnapshot?: (windowFrames?: number) => unknown;
  } | null;
  match?: {
    state?: {
      mode?: string;
      phase?: string;
    };
  } | null;
  isPowerSavingActive?: boolean;
  isWindowFocused?: boolean;
  playerCarIndex?: number;
  physics?: {
    numCars?: number;
  } | null;
  arena?: {
    cars?: Array<ArenaCarMeshLike | null>;
    carBoosts?: BoostEmitterLike[][];
  } | null;
  audioSubsystem?: {
    engineSynths?: Array<EngineSynthEntryLike | null>;
  } | null;
  modeManager?: {
    modes?: Map<
      string,
      {
        standaloneReplayViewer?: {
          hasLoadedReplay?: boolean;
          isActive?: boolean;
          isIntervening?: boolean;
          frames?: ArrayLike<unknown>;
          rosterSubController?: {
            resolvedRoster?: ArrayLike<unknown>;
            activePovCarIndex?: number;
            activePovSlotKey?: number;
          };
        } | null;
      }
    >;
  } | null;
}

export function buildRuntimeDiagnosticReport(
  runtime: DiagnosticRuntimeTarget | null | undefined
): Record<string, unknown> {
  const r = runtime;
  const appState = useAppStore?.getState?.();
  const rvStore = useReplayViewerStore?.getState?.();
  const freeplayMode = r?.modeManager?.modes?.get?.('freeplay') || null;
  const viewer = freeplayMode?.standaloneReplayViewer || null;
  const arenaCars = Array.isArray(r?.arena?.cars) ? r.arena.cars : [];
  const carBoosts = Array.isArray(r?.arena?.carBoosts) ? r.arena.carBoosts : [];

  let activeBoostParticleSystems = 0;
  let visibleBoostMeshes = 0;
  for (const emitters of carBoosts) {
    for (const em of emitters || []) {
      if (em?.physics?.driveParticlesActive || em?.physics?.trailParticlesActive) {
        activeBoostParticleSystems++;
      }
      if (em?.goldRush?.driveParticlesActive || em?.goldRush?.trailParticlesActive) {
        activeBoostParticleSystems++;
      }
      if (em?.physics?.drive?.mesh?.visible || em?.physics?.trail?.mesh?.visible) {
        visibleBoostMeshes++;
      }
      if (em?.goldRush?.drive?.mesh?.visible || em?.goldRush?.trail?.mesh?.visible) {
        visibleBoostMeshes++;
      }
    }
  }

  const engineSynths = Array.isArray(r?.audioSubsystem?.engineSynths)
    ? r.audioSubsystem.engineSynths
    : [];

  return {
    capturedAt: new Date().toISOString(),
    telemetry: r?.profiler?.snapshot?.(60, 10) ?? r?.profiler?.getSnapshot?.(240) ?? null,
    runtimeState: {
      matchMode: r?.match?.state?.mode || appState?.matchMode || 'freeplay',
      matchPhase: r?.match?.state?.phase || 'playing',
      menuOpen: Boolean(appState?.menuOpen),
      menuPowerSave: appState?.telemetry?.menuPowerSave ?? 'match-half',
      isPowerSavingActive: Boolean(r?.isPowerSavingActive),
      isWindowFocused: Boolean(r?.isWindowFocused),
      playerCarIndex: r?.playerCarIndex ?? 0,
      physicsNumCars: r?.physics?.numCars ?? 0,
      arenaCarSlotCount: arenaCars.length,
      visibleArenaCarIndices: arenaCars
        .map((c, idx) => (c?.visible ? idx : -1))
        .filter((idx) => idx >= 0),
      activeBoostParticleSystems,
      visibleBoostMeshes,
      engineSynthCount: engineSynths.length,
      nonDormantEngineSynthIndices: engineSynths
        .map((e, idx) => (e && !e.dormant ? idx : -1))
        .filter((idx) => idx >= 0),
    },
    replayViewerState: {
      hasLoadedReplay: Boolean(viewer?.hasLoadedReplay),
      isActive: Boolean(viewer?.isActive),
      isIntervening: Boolean(viewer?.isIntervening),
      viewerState: rvStore?.viewerState ?? 'idle',
      cursorFrame: rvStore?.cursorFrame ?? 0,
      totalFrames: viewer?.frames?.length ?? 0,
      resolvedRosterLength: viewer?.rosterSubController?.resolvedRoster?.length ?? 0,
      activePovCarIndex: viewer?.rosterSubController?.activePovCarIndex ?? 0,
      activePovSlotKey: viewer?.rosterSubController?.activePovSlotKey ?? 1,
    },
  };
}
