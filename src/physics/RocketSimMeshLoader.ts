/**
 * RocketSimMeshLoader.ts
 * Arena collision mesh loader and vehicle hitbox preset helpers for RocketSim WASM.
 */

import { validateAssetResponse, resolveAssetPath } from '../utils/AssetResponseValidator.ts';
import { resolveHitboxIndex } from '../ui-core/config/vehicleConstants.ts';

export const PLAYER_CAR_INDEX = 0;
export const BOT_CAR_INDEX = 1;
export const ARENA_MESH_MANIFEST_PATH = '/arenamesh/manifest.json';
export const THROWBACK_MESH_BASE_DIR = '/arenamesh/throwback_stadium';
export const THROWBACK_MESH_MANIFEST_PATH = '/arenamesh/throwback_stadium/manifest.json';

export interface TeamAssignment {
  playerTeam: 0 | 1;
  opponentTeam: 0 | 1;
  botTeam: 0 | 1;
}

export function getTeamAssignment(isOrangeTeam = false): TeamAssignment {
  const playerTeam: 0 | 1 = isOrangeTeam ? 1 : 0;
  const opponentTeam: 0 | 1 = playerTeam === 0 ? 1 : 0;
  return { playerTeam, opponentTeam, botTeam: opponentTeam };
}

export function getHitboxIndex(hitboxType?: string | number) {
  return resolveHitboxIndex(hitboxType);
}

export async function fetchArenaCollisionManifest(
  manifestPath = ARENA_MESH_MANIFEST_PATH
): Promise<string[]> {
  const manifestUrl = resolveAssetPath(manifestPath);
  const manifestRes = await fetch(manifestUrl);
  const manifestCheck = validateAssetResponse(manifestRes, manifestUrl, 'json');
  if (!manifestCheck.ok) throw manifestCheck.error;
  return manifestRes.json();
}

export interface ArenaCollisionMeshOptions {
  fetchBuffer?: ((url: string) => Promise<ArrayBuffer>) | null;
  onChunkLoaded?: ((completed: number, total: number, chunkFile: string) => void) | null;
  baseDir?: string;
  manifestPath?: string;
}

export interface RocketSimCollisionWasmModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _malloc(byteLength: number): number;
  _free(bytePtr: number): void;
  _physics_init(dataPtr: number, sizesPtr: number, count: number): number;
}

export async function fetchArenaCollisionChunks(
  chunkFilenames: string[],
  options: ArenaCollisionMeshOptions = {}
): Promise<Uint8Array[]> {
  const { fetchBuffer = null, onChunkLoaded = null, baseDir = '/arenamesh' } = options;
  const total = chunkFilenames.length;
  let completed = 0;

  return Promise.all(
    chunkFilenames.map(async (chunkFile) => {
      const chunkPath = resolveAssetPath(`${baseDir}/${chunkFile}`);
      let arrayBuffer: ArrayBuffer;
      if (typeof fetchBuffer === 'function') {
        arrayBuffer = await fetchBuffer(chunkPath);
      } else {
        const chunkRes = await fetch(chunkPath);
        const chunkCheck = validateAssetResponse(chunkRes, chunkPath, 'cmf');
        if (!chunkCheck.ok) throw chunkCheck.error;
        arrayBuffer = await chunkRes.arrayBuffer();
      }
      completed++;
      if (typeof onChunkLoaded === 'function') {
        onChunkLoaded(completed, total, chunkFile);
      }
      return new Uint8Array(arrayBuffer);
    })
  );
}

const collisionMeshCacheByManifest = new Map<string, Uint8Array[]>();
const collisionMeshPendingByManifest = new Map<string, Promise<Uint8Array[]>>();

export async function fetchArenaCollisionMeshes(
  cachedCollisionData: Uint8Array[] | null = null,
  options: ArenaCollisionMeshOptions = {}
): Promise<Uint8Array[]> {
  const manifestPath = options.manifestPath || ARENA_MESH_MANIFEST_PATH;
  if (cachedCollisionData) {
    if (Array.isArray(cachedCollisionData) && cachedCollisionData.length > 0) {
      collisionMeshCacheByManifest.set(manifestPath, cachedCollisionData);
    }
    return cachedCollisionData;
  }
  const cachedForManifest = collisionMeshCacheByManifest.get(manifestPath);
  if (cachedForManifest) {
    return cachedForManifest;
  }
  const pendingForManifest = collisionMeshPendingByManifest.get(manifestPath);
  if (pendingForManifest) {
    return pendingForManifest;
  }
  const baseDir = options.baseDir || manifestPath.replace(/\/[^/]+$/, '') || '/arenamesh';
  const promise = (async () => {
    try {
      const chunkFilenames = await fetchArenaCollisionManifest(manifestPath);
      const chunks = await fetchArenaCollisionChunks(chunkFilenames, { ...options, baseDir });
      collisionMeshCacheByManifest.set(manifestPath, chunks);
      return chunks;
    } finally {
      collisionMeshPendingByManifest.delete(manifestPath);
    }
  })();
  collisionMeshPendingByManifest.set(manifestPath, promise);
  return promise;
}

export async function preloadThrowbackCollisionMeshes(): Promise<Uint8Array[]> {
  return fetchArenaCollisionMeshes(null, {
    manifestPath: THROWBACK_MESH_MANIFEST_PATH,
    baseDir: THROWBACK_MESH_BASE_DIR,
  });
}

export function initWasmCollisionMeshes(
  module: RocketSimCollisionWasmModule,
  collisionData: Uint8Array[]
): void {
  const totalBytes = collisionData.reduce((acc, chunk) => acc + chunk.length, 0);
  const dataPtr = module._malloc(totalBytes);
  const sizesPtr = module._malloc(collisionData.length * 4);

  let byteOffset = 0;
  collisionData.forEach((chunk, idx) => {
    module.HEAPU8.set(chunk, dataPtr + byteOffset);
    module.HEAP32[sizesPtr / 4 + idx] = chunk.length;
    byteOffset += chunk.length;
  });

  const initResult = module._physics_init(dataPtr, sizesPtr, collisionData.length);
  module._free(dataPtr);
  module._free(sizesPtr);

  if (initResult !== 1) {
    throw new Error('Physics initialization failed — check collision meshes');
  }
}
