import { hudStore } from '../../ui-core/stores/hudStore.ts';
import { determinismStore } from '../../ui-core/stores/determinismStore.ts';
import type { AppState } from '../../ui-core/stores/appStoreTypes.ts';
import type { VisualMaterialsConfig } from '../../ui-core/config/uiConfig.ts';
import type { GameRuntimeUiBridgePort } from '../../game/runtimeUiPort.ts';
import { syncRuntimeNetworkDiagnostics } from './runtimeNetworkDiagnosticsBridge.ts';

export function syncMaterialsToGame(
  runtimePort: GameRuntimeUiBridgePort | null | undefined,
  materialsConfig?: Partial<VisualMaterialsConfig> | null
): void {
  if (!runtimePort) return;
  runtimePort.tunerPort.syncMaterialsConfig(materialsConfig);
}

export function createTunerBridgeHandlers(
  runtimePort: GameRuntimeUiBridgePort
): Partial<AppState['bridge']> {
  const { cameraPort, tunerPort } = runtimePort;
  return {
    onVehicleChange: tunerPort.changePlayerVehicle.bind(tunerPort),
    onColorChange: tunerPort.applyPlayerColorChoice.bind(tunerPort),
    onCameraChange: cameraPort.applyPovSettings.bind(
      cameraPort
    ) as AppState['bridge']['onCameraChange'],
    onGraphicsChange: tunerPort.applyGraphicsSettings.bind(tunerPort),
    onGameplayChange: tunerPort.applyGameplaySettings.bind(tunerPort),
    onTrajectoryChange: tunerPort.applyTrajectorySettings.bind(
      tunerPort
    ) as AppState['bridge']['onTrajectoryChange'],
    onMaterialsChange: tunerPort.syncMaterialsConfig.bind(
      tunerPort
    ) as AppState['bridge']['onMaterialsChange'],
    onBoostPadTunerChange: tunerPort.applyBoostPadTuner.bind(
      tunerPort
    ) as AppState['bridge']['onBoostPadTunerChange'],
    onDriftwoodsTunerChange: tunerPort.applyDriftwoodsTuner.bind(
      tunerPort
    ) as AppState['bridge']['onDriftwoodsTunerChange'],
    onFreeCamToggle: cameraPort.setFreeCam.bind(cameraPort),
    onFreeCamFovChange: cameraPort.setFreeCamFov.bind(cameraPort),
    onResetFreeCam: cameraPort.resetFreeCamOverview.bind(cameraPort),
    onBindingsChange(bindings) {
      tunerPort.applyInputBindings(bindings as unknown as Record<string, unknown>);
      hudStore.getState().syncBindings(bindings);
    },
    async onEnsureDeterminism() {
      const harness = await tunerPort.ensureDeterminismHarness();
      if (harness) {
        determinismStore.setHarness(harness);
      }
    },
    onEnsureNetworkDiagnostics() {
      syncRuntimeNetworkDiagnostics(runtimePort);
    },
    onSimulateBoostPadCollect: tunerPort.simulateBoostPadCollect.bind(tunerPort),
    onSimulateBoostPadRefill: tunerPort.simulateBoostPadRefill.bind(tunerPort),
    onExperimentalWallConfigChange: tunerPort.applyExperimentalWallConfig.bind(
      tunerPort
    ) as AppState['bridge']['onExperimentalWallConfigChange'],
    onShadowConfigChange: tunerPort.applyShadowConfig.bind(
      tunerPort
    ) as AppState['bridge']['onShadowConfigChange'],
    onAnodizedPaintChange: tunerPort.markArenaRenderTreeChanged.bind(tunerPort),
    onBoostParticleConfigChange: tunerPort.applyBoostParticleConfig.bind(
      tunerPort
    ) as AppState['bridge']['onBoostParticleConfigChange'],
    onSkyboxConfigChange: tunerPort.applySkyboxConfig.bind(
      tunerPort
    ) as AppState['bridge']['onSkyboxConfigChange'],
    onBallVisualConfigChange: tunerPort.applyBallVisualConfig.bind(
      tunerPort
    ) as AppState['bridge']['onBallVisualConfigChange'],
    onCustomVehicleTunerChange: tunerPort.applyCustomVehicleTuner.bind(tunerPort),
    onImportCustomVehicleGlb(vehicleId, arrayBuffer, fileName, alignPreset) {
      return Promise.resolve(
        tunerPort.importCustomVehicleGlb?.(vehicleId, arrayBuffer, fileName, alignPreset)
      );
    },
    onApplyVehicleAlignPreset(vehicleId, alignPreset) {
      return Boolean(tunerPort.applyVehicleAlignPreset?.(vehicleId, alignPreset));
    },
    onUnderDevelopmentChange: tunerPort.applyUnderDevelopmentConfig.bind(tunerPort),
  };
}
