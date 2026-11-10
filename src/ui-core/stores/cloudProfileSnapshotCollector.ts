/**
 * cloudProfileSnapshotCollector.ts
 * Collects and applies the Unified Flat Key-Value Map (`Record<string, unknown>`) across:
 *   - Garage loadout (selectedCar, color-preferences, visual-materials, player-anthem)
 *   - Settings parameters (camera, trajectory, graphics, audio/EQ/spatial, gameplay, telemetry,
 *     clock pacing, input buffer, keybindings/controller, boostPadTuner, driftwoodsTuner, etc.)
 *   - Floating Windows activation state (`floating.windows: Array<{ id, isMinimized }>` + `floating.opacity`,
 *     deliberately excluding window pixel position, width, and height)
 *   - Strictly excludes local-only credentials (.rctbnspib), custom relay URLs, and active online room state.
 */

import {
  flattenNestedConfigObject,
  unflattenConfigPrefix,
} from '../config/cloudProfileMergePipeline';
import { type ProfileFlatSnapshot } from '../config/cloudProfileSyncTypes';
import { ALLOWED_CLOCK_PACING_PRIORITIES } from '../config/clockPacingPresets';
import { type ClockPacingPriority } from '../config/clockPacingConfig';
import { loadStoredBotsLoadoutConfig } from '../config/botsLoadoutConfig';
import { loadInputBindings } from '../config/inputBindings';
import { spatialAttenuationProfiles } from '../config/spatialAttenuationProfiles';
import { STORAGE_KEYS, safeStorage } from '../config/storageHelpers';
import { getInitialKickoffWsOffset } from '../config/trainingDefaults';
import {
  loadStoredColorPrefs,
  loadStoredPlayerName,
  saveStoredPlayerName,
} from '../config/vehiclePresets';
import { useSettingsPacingStore } from './settingsPacingStore';
import { useAppStore } from './appStore';
import { useBotsLoadoutStore } from './botsLoadoutStore';
import { PRESET_WINDOWS } from './devFloatingPresets';
import { floatingStore } from './floatingStore';
import { useKickoffTrainingStore } from './kickoffTrainingStore';
import {
  getNameTagConfig,
  subscribeNameTagConfig,
  updateNameTagConfig,
} from './nameTagTunerStore';
import { useSpatialAudioStore } from './spatialAudioStore';
import { useStaticTrainingBallCamTunerStore } from './staticTrainingBallCamTunerStore';
import { viewportStore } from './viewportStore';

export const SYNCABLE_EXTRA_STORAGE_KEYS: ReadonlyArray<string> = [
  STORAGE_KEYS.UI_SCALE,
  STORAGE_KEYS.SAFE_AREA_MARGIN,
  STORAGE_KEYS.SAFE_AREA_VISIBLE,
  STORAGE_KEYS.INPUT_BINDINGS,
  STORAGE_KEYS.CONTROLLER_SELECTION,
  STORAGE_KEYS.KICKOFF_WS_OFFSET_PCT,
  STORAGE_KEYS.PLAYER_ANTHEM_RANDOM_PREFS,
  STORAGE_KEYS.BGM_PREFS,
  STORAGE_KEYS.SPATIAL_AUDIO_TUNER,
  STORAGE_KEYS.SPATIAL_ATTENUATION_PROFILES,
  STORAGE_KEYS.BOTS_LOADOUT_CONFIG,
  STORAGE_KEYS.STATIC_TRAINING_BALL_CAM_TUNER,
  'rc_ui_action_bindings_v1',
];

export interface SyncedFloatingWindowDescriptor {
  id: string;
  isMinimized: boolean;
}

export function collectUnifiedProfileSnapshot(): ProfileFlatSnapshot {
  const snapshot: ProfileFlatSnapshot = {};
  const app = useAppStore.getState();
  const spatial = useSpatialAudioStore.getState();
  const colorPrefs = app.colorPrefs ?? loadStoredColorPrefs();

  // 1. Garage Loadout & User Multiplayer Display Name
  snapshot['garage.displayName'] = app.onlineSession?.playerName || loadStoredPlayerName();
  snapshot['garage.selectedCar'] = app.activeCar;
  snapshot['garage.primaryTeam'] = colorPrefs.primaryTeam;
  snapshot['garage.blueOrder'] = [...colorPrefs.blueOrder];
  snapshot['garage.orangeOrder'] = [...colorPrefs.orangeOrder];
  snapshot['garage.selectedAnthem'] = spatial.selectedAnthem;
  flattenNestedConfigObject('garage.materials', app.materials, snapshot);

  // 2. Core Settings & Developer Tuners
  snapshot['settings.theme'] = app.theme;
  snapshot['settings.developerMode'] = app.developerMode;
  flattenNestedConfigObject('camera', app.camera, snapshot);
  flattenNestedConfigObject('trajectory', app.trajectory, snapshot);
  flattenNestedConfigObject('graphics', app.graphics, snapshot);
  flattenNestedConfigObject('audio', app.audio, snapshot);
  flattenNestedConfigObject('gameplay', app.gameplay, snapshot);
  flattenNestedConfigObject('telemetry', app.telemetry, snapshot);

  snapshot['pacing.mode'] = app.clockPacingMode;
  snapshot['pacing.priority'] = app.clockPacingPriority;
  snapshot['pacing.inputBufferTarget'] = app.inputBufferTarget;
  snapshot['pacing.inputBufferThreshold'] = [...app.inputBufferThreshold];
  flattenNestedConfigObject('pacing.custom', app.customClockPacingParams, snapshot);

  flattenNestedConfigObject('boostPad', app.boostPadTuner, snapshot);
  flattenNestedConfigObject(
    'driftwoods',
    app.driftwoodsTuner as unknown as Record<string, unknown>,
    snapshot
  );
  flattenNestedConfigObject(
    'nameTag',
    getNameTagConfig() as unknown as Record<string, unknown>,
    snapshot
  );

  // 3. Floating Windows (ONLY id & isMinimized + global opacity; never position/width/height)
  const floatSnap = floatingStore.getSnapshot();
  const windowsList: SyncedFloatingWindowDescriptor[] = floatSnap.windows.map((w) => ({
    id: w.id,
    isMinimized: Boolean(w.isMinimized),
  }));
  snapshot['floating.windows'] = windowsList;
  snapshot['floating.opacity'] = floatSnap.opacity;

  // 4. Extended LocalStorage-backed configs (keybindings, spatial audio tuner, etc.)
  for (const storageKey of SYNCABLE_EXTRA_STORAGE_KEYS) {
    const raw = safeStorage.get(storageKey);
    if (raw !== null) {
      snapshot[`storage.${storageKey}`] = raw;
    }
  }

  return snapshot;
}

export function applyUnifiedProfileSnapshot(snapshot: ProfileFlatSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object') return;
  const app = useAppStore.getState();

  // 1. Restore Extended LocalStorage keys first so dependent stores can read them
  for (const storageKey of SYNCABLE_EXTRA_STORAGE_KEYS) {
    const val = snapshot[`storage.${storageKey}`];
    if (typeof val === 'string') {
      safeStorage.set(storageKey, val);
    }
  }

  if (typeof snapshot[`storage.${STORAGE_KEYS.INPUT_BINDINGS}`] === 'string') {
    app.bridge.onBindingsChange?.(loadInputBindings());
  }

  // Hydrate stores backed by SYNCABLE_EXTRA_STORAGE_KEYS so UI & runtime update immediately
  useSpatialAudioStore.getState().hydrateFromStorage();
  if (typeof snapshot[`storage.${STORAGE_KEYS.SPATIAL_ATTENUATION_PROFILES}`] === 'string') {
    spatialAttenuationProfiles.load();
    spatialAttenuationProfiles.notify();
  }
  if (typeof snapshot[`storage.${STORAGE_KEYS.BOTS_LOADOUT_CONFIG}`] === 'string') {
    useBotsLoadoutStore.getState().updateConfig(loadStoredBotsLoadoutConfig());
  }
  const rawBallCamTuner = snapshot[`storage.${STORAGE_KEYS.STATIC_TRAINING_BALL_CAM_TUNER}`];
  if (typeof rawBallCamTuner === 'string') {
    try {
      const parsedTuner = JSON.parse(rawBallCamTuner);
      if (parsedTuner && typeof parsedTuner === 'object') {
        useStaticTrainingBallCamTunerStore.getState().updateConfig(parsedTuner);
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (typeof snapshot[`storage.${STORAGE_KEYS.KICKOFF_WS_OFFSET_PCT}`] === 'string') {
    useKickoffTrainingStore.getState().setWsVerticalOffsetPct(getInitialKickoffWsOffset());
  }

  // Update viewport scale/margin if present
  const rawUiScale = snapshot[`storage.${STORAGE_KEYS.UI_SCALE}`];
  if (typeof rawUiScale === 'string') {
    const parsedScale = parseInt(rawUiScale, 10);
    if (Number.isFinite(parsedScale)) {
      viewportStore.setRenderScale?.(parsedScale);
    }
  }
  const rawSafeMargin = snapshot[`storage.${STORAGE_KEYS.SAFE_AREA_MARGIN}`];
  if (typeof rawSafeMargin === 'string') {
    const parsedMargin = parseInt(rawSafeMargin, 10);
    if (Number.isFinite(parsedMargin)) {
      viewportStore.setSafeAreaMargin?.(parsedMargin);
    }
  }
  const rawSafeVisible = snapshot[`storage.${STORAGE_KEYS.SAFE_AREA_VISIBLE}`];
  if (typeof rawSafeVisible === 'string') {
    viewportStore.setShowSafeAreaHud?.(rawSafeVisible === 'true');
  }

  // 2. Apply Garage Loadout & User Multiplayer Display Name
  if (typeof snapshot['garage.displayName'] === 'string' && snapshot['garage.displayName'].trim()) {
    const cleanDisplayName = snapshot['garage.displayName'].trim().slice(0, 24);
    saveStoredPlayerName(cleanDisplayName);
    app.setOnlineSession({ playerName: cleanDisplayName });
  }

  if (typeof snapshot['garage.selectedCar'] === 'string' && snapshot['garage.selectedCar']) {
    app.setActiveCar(snapshot['garage.selectedCar']);
  }

  const currentColors = app.colorPrefs ?? loadStoredColorPrefs();
  const nextPrimaryTeam =
    snapshot['garage.primaryTeam'] === 'orange' || snapshot['garage.primaryTeam'] === 'blue'
      ? snapshot['garage.primaryTeam']
      : currentColors.primaryTeam;
  const nextBlueOrder = Array.isArray(snapshot['garage.blueOrder'])
    ? (snapshot['garage.blueOrder'] as number[])
    : currentColors.blueOrder;
  const nextOrangeOrder = Array.isArray(snapshot['garage.orangeOrder'])
    ? (snapshot['garage.orangeOrder'] as number[])
    : currentColors.orangeOrder;
  app.setColorPrefs({
    primaryTeam: nextPrimaryTeam,
    blueOrder: nextBlueOrder,
    orangeOrder: nextOrangeOrder,
  });

  if (typeof snapshot['garage.selectedAnthem'] === 'string') {
    useSpatialAudioStore.getState().setSelectedAnthem(snapshot['garage.selectedAnthem']);
  }

  const nextMaterials = unflattenConfigPrefix(snapshot, 'garage.materials', app.materials);
  app.updateMaterials(nextMaterials);

  // 3. Apply Settings & Developer Tuners
  if (snapshot['settings.theme'] === 'light' || snapshot['settings.theme'] === 'dark') {
    app.setTheme(snapshot['settings.theme']);
  }

  const nextCamera = unflattenConfigPrefix(snapshot, 'camera', app.camera);
  app.updateCamera(nextCamera);

  const nextTrajectory = unflattenConfigPrefix(snapshot, 'trajectory', app.trajectory);
  app.updateTrajectory(nextTrajectory);

  const nextGraphics = unflattenConfigPrefix(snapshot, 'graphics', app.graphics);
  app.updateGraphics(nextGraphics);

  const nextAudio = unflattenConfigPrefix(snapshot, 'audio', app.audio);
  app.updateAudio(nextAudio);

  const nextGameplay = unflattenConfigPrefix(snapshot, 'gameplay', app.gameplay);
  app.updateGameplay(nextGameplay);

  const nextTelemetry = unflattenConfigPrefix(snapshot, 'telemetry', app.telemetry);
  app.updateTelemetry(nextTelemetry);

  const rawPacingPriority = snapshot['pacing.priority'];
  if (
    typeof rawPacingPriority === 'string' &&
    (ALLOWED_CLOCK_PACING_PRIORITIES as readonly string[]).includes(rawPacingPriority)
  ) {
    app.setClockPacingPriority(rawPacingPriority as ClockPacingPriority);
  }
  if (typeof snapshot['pacing.inputBufferTarget'] === 'number') {
    app.setInputBufferTarget(snapshot['pacing.inputBufferTarget']);
  }
  if (
    Array.isArray(snapshot['pacing.inputBufferThreshold']) &&
    snapshot['pacing.inputBufferThreshold'].length === 2
  ) {
    const pair = snapshot['pacing.inputBufferThreshold'] as [number, number];
    app.setInputBufferThreshold([Number(pair[0]) || -2, Number(pair[1]) || 2]);
  }
  const nextCustomPacing = unflattenConfigPrefix(
    snapshot,
    'pacing.custom',
    app.customClockPacingParams
  );
  app.updateCustomClockPacingParams(nextCustomPacing);
  if (
    snapshot['pacing.mode'] === 'legacy' ||
    snapshot['pacing.mode'] === 'sts' ||
    snapshot['pacing.mode'] === 'csts' ||
    snapshot['pacing.mode'] === 'custom'
  ) {
    app.setClockPacingMode(snapshot['pacing.mode']);
  }
  useSettingsPacingStore.getState().hydrateFromAppStore();

  const nextBoostPad = unflattenConfigPrefix(snapshot, 'boostPad', app.boostPadTuner);
  app.updateBoostPadTuner(nextBoostPad);

  const nextDriftwoods = unflattenConfigPrefix(
    snapshot,
    'driftwoods',
    app.driftwoodsTuner as unknown as Record<string, unknown>
  );
  app.updateDriftwoodsTuner(nextDriftwoods);

  const nextNameTag = unflattenConfigPrefix(
    snapshot,
    'nameTag',
    getNameTagConfig() as unknown as Record<string, unknown>
  );
  updateNameTagConfig(nextNameTag, { fromCloudSync: true });

  // 4. Apply Floating Windows (spawn/minimize/restore matching preset IDs without overriding pixel positions)
  if (typeof snapshot['floating.opacity'] === 'number') {
    floatingStore.setOpacity(snapshot['floating.opacity']);
  }

  if (Array.isArray(snapshot['floating.windows'])) {
    const targetList = snapshot['floating.windows'] as SyncedFloatingWindowDescriptor[];
    const targetMap = new Map<string, boolean>();
    for (const item of targetList) {
      if (item && typeof item.id === 'string') {
        targetMap.set(item.id, Boolean(item.isMinimized));
      }
    }

    const currentWindows = floatingStore.getSnapshot().windows;
    // Close any window not in targetMap
    for (const win of currentWindows) {
      if (!targetMap.has(win.id)) {
        floatingStore.closeWindow(win.id);
      }
    }

    // Spawn or update minimization state for windows in targetMap
    for (const [winId, shouldMinimize] of targetMap.entries()) {
      const preset = PRESET_WINDOWS.find((p) => p.id === winId);
      if (!preset) continue;
      floatingStore.spawnWindow({
        ...preset,
        startMinimized: shouldMinimize,
      });
    }
  }
}

const SYNCABLE_EXTRA_STORAGE_KEY_SET = new Set<string>(SYNCABLE_EXTRA_STORAGE_KEYS);

export function attachUnifiedProfileChangeSubscription(listener: () => void): void {
  useAppStore.subscribe(listener);
  floatingStore.subscribe(listener);
  useSpatialAudioStore.subscribe(listener);
  viewportStore.subscribe(listener);
  useSettingsPacingStore.subscribe(listener);
  useBotsLoadoutStore.subscribe(listener);
  useKickoffTrainingStore.subscribe(listener);
  useStaticTrainingBallCamTunerStore.subscribe(listener);
  subscribeNameTagConfig(listener);
  spatialAttenuationProfiles.subscribe(listener);
  safeStorage.subscribe((key) => {
    if (SYNCABLE_EXTRA_STORAGE_KEY_SET.has(key)) {
      listener();
    }
  });
}
