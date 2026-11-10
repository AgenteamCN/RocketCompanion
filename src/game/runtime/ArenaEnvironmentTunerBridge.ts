import {
  useAppStore,
  type PerfTelemetrySamplerPort,
  type RuntimeTunerPort,
  type UnderDevelopmentConfigPort,
} from '../runtimeUiPort.ts';
import { isFreeplayConfigScopeActive } from '../../ui-core/config/trainingDefaults.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { NetworkSessionChannelLike } from './onlineLobbyTransitionPipeline.ts';
import {
  GoalBarrierRuntimeBridge,
  isOnlineSessionOrBotMatchActive,
  resolveActiveGameplayModeId,
  type RuntimeDomainPortOwner,
} from './GoalBarrierRuntimeBridge.ts';
import { createPlayerLoadoutRuntimeBridge } from './PlayerLoadoutRuntimeBridge.ts';
import {
  applyPerCarBoostSpecToSim,
  buildUnderDevelopmentStadiumReloadSpec,
  computeNetworkLatencyBreakdown,
  normalizePerCarBoostSpec,
  type UnderDevelopmentStadiumReloadSpec,
} from './runtimeBridgeSnapshotPipeline.ts';

export type PerfTelemetrySamplerDomainPort = Pick<
  RuntimeDomainPortOwner,
  'profiler' | 'renderer' | 'interpolator' | 'networkManager'
>;

async function reloadPhysicsAndArenaStadiumPreset(
  physics: RocketSimPhysicsEngine | null,
  arena: ArenaWorld | null,
  spec: UnderDevelopmentStadiumReloadSpec,
  unlimitedBoost: boolean,
  threeWheelsPlayerIdx: number | null,
  onResetKickoff: () => void
): Promise<void> {
  if (physics) {
    await physics.reloadMeshes?.(spec.manifestUrl);
    physics.setArenaPreset?.(spec.arenaPresetIndex);
    physics.configureCars?.(spec.hitboxId, spec.hasOpponent, spec.extraBotCount);
    physics.setUnlimitedBoost?.(unlimitedBoost);
    if (threeWheelsPlayerIdx !== null) physics.setCarThreeWheels?.(threeWheelsPlayerIdx, true);
    onResetKickoff();
    if (arena && typeof physics.getPads === 'function') arena.addPads(physics.getPads());
  }
  if (arena) {
    await arena.environment.setThrowbackStadiumActive(spec.isThrowback, spec.showCollisionOverlay);
  }
}

function applyBoostPadVisualTunerToArena(
  arena: ArenaWorld | null,
  boostPadConfig: Record<string, unknown>
): void {
  if (arena?.updateBoostPadTuner) {
    arena.updateBoostPadTuner(boostPadConfig);
  } else if (arena?.boostPadSystem?.updateVisualTuningParams) {
    arena.boostPadSystem.updateVisualTuningParams(boostPadConfig);
  }
}

function simulateArenaBoostPadAction(
  sys: ArenaWorld['boostPadSystem'] | null | undefined,
  action: 'collect' | 'refill',
  padIndex: number | 'all',
  duration?: number
): void {
  if (!sys) return;
  if (action === 'collect') {
    if (padIndex === 'all') sys.simulateCollectAll?.();
    else if (typeof padIndex === 'number') sys.simulateCollect?.(padIndex);
    return;
  }
  if (padIndex === 'all') sys.simulateRefillAll?.(duration);
  else if (typeof padIndex === 'number') sys.simulateRefill?.(padIndex, duration);
}

export function createRuntimePerfTelemetrySampler(
  samplerPort: PerfTelemetrySamplerDomainPort
): PerfTelemetrySamplerPort {
  const { networkManager } = samplerPort;
  return {
    getProfiler: () => samplerPort.profiler,
    getRenderer: () => samplerPort.renderer,
    getInterpolator: () => samplerPort.interpolator,
    getPhysicsRate: () => networkManager.diagnosticsProbe.getPhysicsRate(),
    getNetworkLatencyInfo: () => {
      const { sessionCoordinator } = networkManager;
      const ch = sessionCoordinator.networkChannel as
        (NetworkSessionChannelLike & { isLoopback?: boolean; measuredRttMs?: number }) | null;
      return computeNetworkLatencyBreakdown(ch, sessionCoordinator.networkReconciler);
    },
  };
}

async function applyUnderDevelopmentRuntimeConfig(
  domain: RuntimeDomainPortOwner,
  config: UnderDevelopmentConfigPort,
  patch: Partial<UnderDevelopmentConfigPort>
): Promise<void> {
  const { physics, arena, networkManager } = domain;
  const playerIdx = domain.playerCarIndex ?? 0;

  if (patch.stadiumPreset !== undefined) {
    const spec = buildUnderDevelopmentStadiumReloadSpec(
      config,
      physics?.numCars || 1,
      domain.selectedHitbox
    );
    const unlimitedBoost =
      isFreeplayConfigScopeActive(
        resolveActiveGameplayModeId(domain),
        isOnlineSessionOrBotMatchActive(domain)
      ) && Boolean(useAppStore.getState().gameplay?.unlimitedBoost);
    await reloadPhysicsAndArenaStadiumPreset(
      physics,
      arena,
      spec,
      unlimitedBoost,
      config.threeWheelsEnabled ? playerIdx : null,
      () => domain.resetKickoff()
    );
  }

  if (patch.threeWheelsEnabled !== undefined) {
    const enabled = Boolean(config.threeWheelsEnabled);
    physics?.setCarThreeWheels?.(playerIdx, enabled);
    if (arena?.carWheels?.[playerIdx]) arena.carWheels[playerIdx].threeWheels = enabled;
  }

  if (patch.showThrowbackCollisionOverlay !== undefined && patch.stadiumPreset === undefined) {
    await arena?.environment.setThrowbackCollisionVisible(
      Boolean(config.showThrowbackCollisionOverlay)
    );
  }

  if (patch.perCarBoostConfigs !== undefined || patch.stadiumPreset !== undefined) {
    const carConfigs = config.perCarBoostConfigs || {};
    const serverSim = networkManager.sessionCoordinator.authoritativeServer?.sim;
    for (let idx = 0; idx < 8; idx++) {
      const rawEntry = carConfigs[idx];
      if (!rawEntry) continue;
      const boostSpec = normalizePerCarBoostSpec(rawEntry);
      applyPerCarBoostSpecToSim(physics, idx, boostSpec);
      applyPerCarBoostSpecToSim(serverSim, idx, boostSpec);
    }
  }
}

export function createRuntimeTunerPort(domain: RuntimeDomainPortOwner): RuntimeTunerPort {
  const goalBarrierBridge = new GoalBarrierRuntimeBridge(domain);
  const loadoutSlice = createPlayerLoadoutRuntimeBridge(domain);
  const { domEventManager, networkManager } = domain;
  const getArenaEnv = () => domain.arena?.environment;

  return {
    ...loadoutSlice,
    applyGraphicsSettings: (graphicsConfig) => {
      domEventManager.updateViewport(graphicsConfig);
      getArenaEnv()?.setStadiumVisible(Boolean(graphicsConfig.showStadium));
      domEventManager.syncPausedAndInputState(graphicsConfig);
    },
    applyGameplaySettings: (gameplayConfig) => {
      goalBarrierBridge.applyGameplaySettings(gameplayConfig);
    },
    applyTrajectorySettings: (trajectoryConfig) => {
      domain.ballTrajectoryPredictor?.updateSettings?.(trajectoryConfig);
    },
    applyBoostPadTuner: (boostPadConfig) => {
      applyBoostPadVisualTunerToArena(domain.arena, boostPadConfig);
    },
    applyDriftwoodsTuner: (driftwoodsConfig) => {
      getArenaEnv()?.updateDriftwoodsTuner(driftwoodsConfig);
    },
    applyInputBindings: (bindings) => {
      domain.keyboard?.setBindings?.(bindings);
      domain.gamepad?.setBindings?.(bindings);
      domEventManager.updateCursorHint();
    },
    ensureDeterminismHarness: async () => {
      const { diagnosticsProbe } = networkManager;
      if (!diagnosticsProbe.determinismHarness) {
        await diagnosticsProbe.enableDeterminismHarness(false);
      }
      return diagnosticsProbe.determinismHarness;
    },
    simulateBoostPadCollect: (padIndex) => {
      simulateArenaBoostPadAction(domain.arena?.boostPadSystem, 'collect', padIndex);
    },
    simulateBoostPadRefill: (padIndex, duration) => {
      simulateArenaBoostPadAction(domain.arena?.boostPadSystem, 'refill', padIndex, duration);
    },
    applyExperimentalWallConfig: (wallConfig) => {
      getArenaEnv()?.updateExperimentalWallConfig(wallConfig);
    },
    applyShadowConfig: (shadowConfig) => {
      getArenaEnv()?.updateShadowConfig(shadowConfig, domain.renderer);
    },
    markArenaRenderTreeChanged: () => {
      domain.arena?.markRenderTreeChanged?.();
    },
    applyBoostParticleConfig: (particleConfig) => {
      if (particleConfig && typeof particleConfig.bloomEnabled === 'boolean') {
        domain.bloomEnabled = particleConfig.bloomEnabled;
      }
    },
    applySkyboxConfig: (skyboxConfig) => {
      getArenaEnv()?.updateSkyboxConfig(skyboxConfig);
    },
    applyBallVisualConfig: (ballConfig) => {
      getArenaEnv()?.updateBallVisualConfig(ballConfig);
    },
    applyUnderDevelopmentConfig: async (config, patch) => {
      await applyUnderDevelopmentRuntimeConfig(domain, config, patch);
    },
    syncGoalBarrier: (decomposition, targetGoal, enabled, opacity, chunks, updatePhysicsChunks) => {
      goalBarrierBridge.syncGoalBarrier(
        decomposition,
        targetGoal,
        enabled,
        opacity,
        chunks,
        updatePhysicsChunks
      );
    },
    reconcileTrainingScopeForMode: (modeId) => {
      goalBarrierBridge.reconcileTrainingScopeForMode(modeId);
    },
    createPerfTelemetrySampler: () => createRuntimePerfTelemetrySampler(domain),
  };
}
