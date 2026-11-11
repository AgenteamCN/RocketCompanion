/**
 * RocketSim WebAssembly Bridge Loader
 * Loads core physics WASM microkernel (core.wasm) located directly in physics module.
 * Automatically binds all Emscripten `_physics_*` C-ABI exports to unprefixed `physics_*` methods.
 */
import loadDirectRocketSimWasm, {
  type RocketSimWasmModule,
  type RocketSimWasmModuleOptions,
} from './core.js';
import { applyCalibratedCarSuspensionConfigsToWasm } from './RocketSimVehicleAndArenaSpecs.ts';

export type { RocketSimWasmModule, RocketSimWasmModuleOptions };

let cachedInstance: RocketSimWasmModule | null = null;

export async function loadRocketSimWasmModule(
  moduleArg: RocketSimWasmModuleOptions = {}
): Promise<RocketSimWasmModule> {
  const isIsolated = moduleArg.freshInstance || moduleArg.isolated;
  if (cachedInstance && !isIsolated) {
    applyCalibratedCarSuspensionConfigsToWasm(cachedInstance);
    return cachedInstance;
  }

  const options: RocketSimWasmModuleOptions = { ...moduleArg };
  const userLocateFile = options.locateFile;
  options.locateFile = (_path: string, scriptDirectory: string) => {
    const target = 'core.wasm';
    if (userLocateFile) {
      return userLocateFile(target, scriptDirectory);
    }
    return new URL('./' + target, import.meta.url).href;
  };

  const Module: RocketSimWasmModule = await loadDirectRocketSimWasm(options);
  applyCalibratedCarSuspensionConfigsToWasm(Module);

  // Dynamically bind every Emscripten `_physics_*` export to its unprefixed `physics_*` alias.
  for (const key of Object.keys(Module)) {
    if (key.startsWith('_physics_') && typeof Module[key] === 'function') {
      const semanticName = key.slice(1);
      if (!Module[semanticName]) {
        Module[semanticName] = Module[key];
      }
    }
  }

  if (!isIsolated) {
    cachedInstance = Module;
  }
  return Module;
}

export default loadRocketSimWasmModule;
