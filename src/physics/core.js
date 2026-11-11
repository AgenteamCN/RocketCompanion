// Pure WebAssembly loader for RocketSim v3-rust (wasm32-unknown-unknown)
// Replaces legacy Emscripten glue while preserving 100% compatibility with RocketSimWasm.ts.

async function loadDirectRocketSimWasm(moduleArg = {}) {
  const Module = { ...moduleArg };
  const isNode =
    Boolean(globalThis.process?.versions?.node) &&
    globalThis.process?.type !== 'renderer';

  const scriptUrl = import.meta.url;
  const scriptDir = scriptUrl.slice(0, scriptUrl.lastIndexOf('/') + 1);

  function locateFile(path) {
    if (typeof Module.locateFile === 'function') {
      return Module.locateFile(path, scriptDir);
    }
    return scriptDir + path;
  }

  let wasmBytes = Module.wasmBinary;
  if (!wasmBytes) {
    const wasmFileUrl = locateFile('core.wasm');
    if (isNode && (wasmFileUrl.startsWith('file://') || !wasmFileUrl.includes('://'))) {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const filePath = wasmFileUrl.startsWith('file://')
        ? fileURLToPath(wasmFileUrl)
        : wasmFileUrl;
      wasmBytes = await readFile(filePath);
    } else {
      const response = await fetch(wasmFileUrl, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM binary at ${wasmFileUrl}: ${response.status}`);
      }
      wasmBytes = await response.arrayBuffer();
    }
  }

  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const wasmExports = instance.exports;
  const wasmMemory = wasmExports.memory;

  let cachedBuffer = null;
  let heap8 = null;
  let heapU8 = null;
  let heap16 = null;
  let heapU16 = null;
  let heap32 = null;
  let heapU32 = null;
  let heapF32 = null;
  let heapF64 = null;

  function ensureHeapViews() {
    const buf = wasmMemory.buffer;
    if (buf !== cachedBuffer) {
      cachedBuffer = buf;
      heap8 = new Int8Array(buf);
      heapU8 = new Uint8Array(buf);
      heap16 = new Int16Array(buf);
      heapU16 = new Uint16Array(buf);
      heap32 = new Int32Array(buf);
      heapU32 = new Uint32Array(buf);
      heapF32 = new Float32Array(buf);
      heapF64 = new Float64Array(buf);
    }
  }

  ensureHeapViews();

  Object.defineProperties(Module, {
    wasmMemory: { get: () => wasmMemory, enumerable: true },
    HEAP8: { get: () => (ensureHeapViews(), heap8), enumerable: true },
    HEAPU8: { get: () => (ensureHeapViews(), heapU8), enumerable: true },
    HEAP16: { get: () => (ensureHeapViews(), heap16), enumerable: true },
    HEAPU16: { get: () => (ensureHeapViews(), heapU16), enumerable: true },
    HEAP32: { get: () => (ensureHeapViews(), heap32), enumerable: true },
    HEAPU32: { get: () => (ensureHeapViews(), heapU32), enumerable: true },
    HEAPF32: { get: () => (ensureHeapViews(), heapF32), enumerable: true },
    HEAPF64: { get: () => (ensureHeapViews(), heapF64), enumerable: true },
  });

  Module['_malloc'] = wasmExports._malloc;
  Module['_free'] = wasmExports._free;

  Module['_physics_init'] = wasmExports._physics_init;
  Module['_physics_createArena'] = wasmExports._physics_createArena;
  Module['_physics_step'] = wasmExports._physics_step;
  Module['_physics_stepSilent'] = wasmExports._physics_stepSilent;
  Module['_physics_saveState'] = wasmExports._physics_saveState;
  Module['_physics_restoreState'] = wasmExports._physics_restoreState;
  Module['_physics_saveStateSlot'] = wasmExports._physics_saveStateSlot;
  Module['_physics_restoreStateSlot'] = wasmExports._physics_restoreStateSlot;
  Module['_physics_getStateSnapshotSize'] = wasmExports._physics_getStateSnapshotSize;
  Module['_physics_restoreCompactState'] = wasmExports._physics_restoreCompactState;
  Module['_physics_resetKickoff'] = wasmExports._physics_resetKickoff;
  Module['_physics_resetGoalLatch'] = wasmExports._physics_resetGoalLatch;
  Module['_physics_setImpactThresholds'] = wasmExports._physics_setImpactThresholds;
  Module['_physics_setSurfaceTaxonomyThresholds'] = wasmExports._physics_setSurfaceTaxonomyThresholds;
  Module['_physics_setDirectionDotThreshold'] = wasmExports._physics_setDirectionDotThreshold;
  Module['_physics_getDirectionDotThreshold'] = wasmExports._physics_getDirectionDotThreshold;
  Module['_physics_updateBallPrediction'] = wasmExports._physics_updateBallPrediction;
  Module['_physics_updateBallPredictionIncremental'] = wasmExports._physics_updateBallPredictionIncremental;
  Module['_physics_updateBallPredictionManual'] = wasmExports._physics_updateBallPredictionManual;
  Module['_physics_getBallStateForTime'] = wasmExports._physics_getBallStateForTime;
  Module['_physics_getBallPredictionStride'] = wasmExports._physics_getBallPredictionStride;
  Module['_physics_getBallPredictionPtr'] = wasmExports._physics_getBallPredictionPtr;
  Module['_physics_getBallPredictionCount'] = wasmExports._physics_getBallPredictionCount;
  Module['_physics_isBallSleeping'] = wasmExports._physics_isBallSleeping;
  Module['_physics_setSimulationFrozen'] = wasmExports._physics_setSimulationFrozen;
  Module['_physics_setPossessionReportingEnabled'] = wasmExports._physics_setPossessionReportingEnabled;
  Module['_physics_getPossessionStats'] = wasmExports._physics_getPossessionStats;
  Module['_physics_pushSignalEvent'] = wasmExports._physics_pushSignalEvent;
  Module['_physics_initReplayBuffer'] = wasmExports._physics_initReplayBuffer;
  Module['_physics_clearReplayBuffer'] = wasmExports._physics_clearReplayBuffer;
  Module['_physics_getReplayBufferPtr'] = wasmExports._physics_getReplayBufferPtr;
  Module['_physics_getReplayBufferSize'] = wasmExports._physics_getReplayBufferSize;
  Module['_physics_recordReplayFrame'] = wasmExports._physics_recordReplayFrame;
  Module['_physics_getEventBufferPtr'] = wasmExports._physics_getEventBufferPtr;
  Module['_physics_getEventBufferSize'] = wasmExports._physics_getEventBufferSize;
  Module['_physics_clearEvents'] = wasmExports._physics_clearEvents;
  Module['_physics_getStatePtr'] = wasmExports._physics_getStatePtr;
  Module['_physics_getStateSize'] = wasmExports._physics_getStateSize;
  Module['_physics_getControlsPtr'] = wasmExports._physics_getControlsPtr;
  Module['_physics_getPadInfoPtr'] = wasmExports._physics_getPadInfoPtr;
  Module['_physics_addCarAtSlot'] = wasmExports._physics_addCarAtSlot;
  Module['_physics_addCar'] = wasmExports._physics_addCar;
  Module['_physics_removeCar'] = wasmExports._physics_removeCar;
  Module['_physics_getActiveCarMask'] = wasmExports._physics_getActiveCarMask;
  Module['_physics_isCarSlotActive'] = wasmExports._physics_isCarSlotActive;
  Module['_physics_getActiveCarCount'] = wasmExports._physics_getActiveCarCount;
  Module['_physics_setCarHitbox'] = wasmExports._physics_setCarHitbox;
  Module['_physics_setCarTeam'] = wasmExports._physics_setCarTeam;
  Module['_physics_demolishCar'] = wasmExports._physics_demolishCar;
  Module['_physics_respawnCar'] = wasmExports._physics_respawnCar;
  Module['_physics_getCarCount'] = wasmExports._physics_getCarCount;
  Module['_physics_getCarConfig'] = wasmExports._physics_getCarConfig;
  Module['_physics_setCarState'] = wasmExports._physics_setCarState;
  Module['_physics_setBallState'] = wasmExports._physics_setBallState;
  Module['_physics_setUnlimitedBoost'] = wasmExports._physics_setUnlimitedBoost;
  Module['_physics_getUnlimitedBoost'] = wasmExports._physics_getUnlimitedBoost;
  Module['_physics_setCarUnlimitedBoost'] = wasmExports._physics_setCarUnlimitedBoost;
  Module['_physics_getCarUnlimitedBoost'] = wasmExports._physics_getCarUnlimitedBoost;
  Module['_physics_setCarBoostCollectable'] = wasmExports._physics_setCarBoostCollectable;
  Module['_physics_getCarBoostCollectable'] = wasmExports._physics_getCarBoostCollectable;
  Module['_physics_setCarBoostRecharge'] = wasmExports._physics_setCarBoostRecharge;
  Module['_physics_getCarBoostRechargeEnabled'] = wasmExports._physics_getCarBoostRechargeEnabled;
  Module['_physics_getCarBoostRechargePerSecond'] = wasmExports._physics_getCarBoostRechargePerSecond;
  Module['_physics_getCarBoostRechargeDelay'] = wasmExports._physics_getCarBoostRechargeDelay;
  Module['_physics_getBallOnGround'] = wasmExports._physics_getBallOnGround;
  Module['_physics_getBallRadius'] = wasmExports._physics_getBallRadius;
  Module['_physics_clearGoalFlag'] = wasmExports._physics_clearGoalFlag;
  Module['_physics_initBallPrediction'] = wasmExports._physics_initBallPrediction;
  Module['_physics_setSimControlFlags'] = wasmExports._physics_setSimControlFlags;
  Module['_physics_getSimControlFlags'] = wasmExports._physics_getSimControlFlags;
  Module['_physics_getBallMotionState'] = wasmExports._physics_getBallMotionState;
  Module['_physics_setPossessionEventEnabled'] = wasmExports._physics_setPossessionEventEnabled;
  Module['_physics_getPossessionEventEnabled'] = wasmExports._physics_getPossessionEventEnabled;
  Module['_physics_getCurrentPossessionCar'] = wasmExports._physics_getCurrentPossessionCar;
  Module['_physics_getCurrentPossessionTeam'] = wasmExports._physics_getCurrentPossessionTeam;
  Module['_physics_getCarIsJumping'] = wasmExports._physics_getCarIsJumping;
  Module['_physics_getCarAirTime'] = wasmExports._physics_getCarAirTime;
  Module['_physics_getCarJumpTime'] = wasmExports._physics_getCarJumpTime;
  Module['_physics_getCarAirTimeSinceJump'] = wasmExports._physics_getCarAirTimeSinceJump;
  Module['_physics_resetKickoffAtSpawn'] = wasmExports._physics_resetKickoffAtSpawn;
  Module['_physics_setCarLinearFactorAndGravity'] = wasmExports._physics_setCarLinearFactorAndGravity;
  Module['_physics_setCarCollisionMask'] = wasmExports._physics_setCarCollisionMask;
  Module['_physics_setArenaMutators'] = wasmExports._physics_setArenaMutators;
  Module['_physics_getMutatorConfigSize'] = wasmExports._physics_getMutatorConfigSize;
  Module['_physics_getMutatorConfig'] = wasmExports._physics_getMutatorConfig;
  Module['_physics_setMutatorConfig'] = wasmExports._physics_setMutatorConfig;
  Module['_physics_resetMutatorConfig'] = wasmExports._physics_resetMutatorConfig;
  Module['_physics_getReplayFrameCount'] = wasmExports._physics_getReplayFrameCount;
  Module['_physics_getReplayFramePtrByOffset'] = wasmExports._physics_getReplayFramePtrByOffset;
  Module['_physics_getReplayFramePtrByIndex'] = wasmExports._physics_getReplayFramePtrByIndex;
  Module['_physics_getReplayControlsPtrByIndex'] = wasmExports._physics_getReplayControlsPtrByIndex;
  Module['_physics_getReplayStateTrackPtr'] = wasmExports._physics_getReplayStateTrackPtr;
  Module['_physics_getReplayStateStride'] = wasmExports._physics_getReplayStateStride;
  Module['_physics_getReplayIncidentTrackPtr'] = wasmExports._physics_getReplayIncidentTrackPtr;
  Module['_physics_getReplayIncidentCount'] = wasmExports._physics_getReplayIncidentCount;
  Module['_physics_getReplaySignalTrackPtr'] = wasmExports._physics_getReplaySignalTrackPtr;
  Module['_physics_getReplaySignalCount'] = wasmExports._physics_getReplaySignalCount;
  Module['_physics_setReplayRecordingActive'] = wasmExports._physics_setReplayRecordingActive;
  Module['_physics_getReplayRecordingActive'] = wasmExports._physics_getReplayRecordingActive;
  Module['_physics_setCarThreeWheels'] = wasmExports._physics_setCarThreeWheels;
  Module['_physics_getCarThreeWheels'] = wasmExports._physics_getCarThreeWheels;
  Module['_physics_setArenaPreset'] = wasmExports._physics_setArenaPreset;
  Module['_physics_getArenaPreset'] = wasmExports._physics_getArenaPreset;
  Module['_physics_setGoalVolumeBox'] = wasmExports._physics_setGoalVolumeBox;
  Module['_physics_setCarMaxFlipCount'] = wasmExports._physics_setCarMaxFlipCount;
  Module['_physics_getCarMaxFlipCount'] = wasmExports._physics_getCarMaxFlipCount;
  Module['_physics_setCarFlipTimerMode'] = wasmExports._physics_setCarFlipTimerMode;
  Module['_physics_getCarFlipTimerMode'] = wasmExports._physics_getCarFlipTimerMode;
  Module['_physics_setCarDemoSpawnSelection'] = wasmExports._physics_setCarDemoSpawnSelection;
  Module['_physics_getCarDemoSpawnSelection'] = wasmExports._physics_getCarDemoSpawnSelection;
  Module['_physics_getCarDemoRespawnTimer'] = wasmExports._physics_getCarDemoRespawnTimer;
  Module['_physics_getCarFlipsRemaining'] = wasmExports._physics_getCarFlipsRemaining;
  Module['_physics_getCarFlipWindowTimer'] = wasmExports._physics_getCarFlipWindowTimer;
  Module['_physics_loadBotWeights'] = wasmExports._physics_loadBotWeights;
  Module['_physics_isBotPolicyLoaded'] = wasmExports._physics_isBotPolicyLoaded;
  Module['_physics_configureBotSlot'] = wasmExports._physics_configureBotSlot;
  Module['_physics_resetBotDirector'] = wasmExports._physics_resetBotDirector;
  Module['_physics_overrideBotControls'] = wasmExports._physics_overrideBotControls;
  Module['_physics_stepBotInferenceMask'] = wasmExports._physics_stepBotInferenceMask;
  Module['_physics_getBotBatchOutputPtr'] = wasmExports._physics_getBotBatchOutputPtr;
  Module['_physics_getBotBatchOutputSize'] = wasmExports._physics_getBotBatchOutputSize;
  Module['_physics_precomputeBotKickoffTimeline'] = wasmExports._physics_precomputeBotKickoffTimeline;
  Module['_physics_getBotKickoffTimelinePtr'] = wasmExports._physics_getBotKickoffTimelinePtr;
  Module['_physics_botSimdMatVecBias'] = wasmExports._physics_botSimdMatVecBias;


  for (const [key, val] of Object.entries(wasmExports)) {
    if (typeof val === 'function' && key.startsWith('_physics_')) {
      Module[key.slice(1)] = val;
    }
  }

  if (typeof Module.onRuntimeInitialized === 'function') {
    Module.onRuntimeInitialized();
  }

  return Module;
}

export default loadDirectRocketSimWasm;
