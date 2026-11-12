/**
 * RLRCClassNetCacheBuilder.ts
 * Pure functional pipeline that resolves per-replay UE3 object inheritance chains,
 * initial spawn trajectories, and deterministic ClassNetCache streamId-to-property maps.
 */

import {
  normalizeRLRCObjectName,
  resolveRLRCParentClassName,
  type RLRCSpawnTrajectory,
  UE3_SPAWN_TRAJECTORY_BY_CLASS,
} from './RLRCClassHierarchyCatalog.ts';
import type { RLRCParsedReplayHeaderAndBookmarks } from './RLRCReplayHeaderAndBookmarkParser.ts';

export interface RLRCResolvedClassNetCacheNode {
  readonly objectInd: number;
  readonly parentId: number;
  readonly cacheId: number;
  readonly props: Map<number, number>;
  readonly maxStreamId: number;
  readonly propIdBits: number;
}

export function buildRLRCObjectHierarchyIds(
  startName: string,
  nameToObjectId: ReadonlyMap<string, number>,
  lowerNameToObjectId: ReadonlyMap<string, number>
): number[] {
  const chain: number[] = [];
  const visited = new Set<string>();
  let current: string | undefined = startName;
  while (current && !visited.has(current)) {
    visited.add(current);
    const id = nameToObjectId.get(current) ?? lowerNameToObjectId.get(current.toLowerCase());
    if (id !== undefined) chain.push(id);
    current = resolveRLRCParentClassName(current);
  }
  return chain;
}

function indexObjectsByName(objects: readonly string[]) {
  const nameToId = new Map<string, number>();
  const lowerToId = new Map<string, number>();
  for (let i = 0; i < objects.length; i++) {
    const name = objects[i];
    if (!nameToId.has(name)) nameToId.set(name, i);
    const low = name.toLowerCase();
    if (!lowerToId.has(low)) lowerToId.set(low, i);
  }
  return { nameToId, lowerToId };
}

export function buildRLRCSpawnTrajectoryLookup(
  objects: readonly string[]
): readonly RLRCSpawnTrajectory[] {
  const { nameToId, lowerToId } = indexObjectsByName(objects);
  const spawns: RLRCSpawnTrajectory[] = new Array(objects.length).fill('None');
  for (let i = 0; i < objects.length; i++) {
    const chain = buildRLRCObjectHierarchyIds(objects[i], nameToId, lowerToId);
    for (const ancestorId of chain) {
      const ancestorName = normalizeRLRCObjectName(objects[ancestorId] || '');
      const trajectory = UE3_SPAWN_TRAJECTORY_BY_CLASS[ancestorName];
      if (trajectory !== undefined) {
        spawns[i] = trajectory;
        break;
      }
    }
  }
  return spawns;
}

export function buildRLRCClassNetCacheLookup(
  container: Pick<RLRCParsedReplayHeaderAndBookmarks, 'netCache' | 'objects'>
): Map<number, RLRCResolvedClassNetCacheNode> {
  const { objects, netCache } = container;
  const { nameToId, lowerToId } = indexObjectsByName(objects);
  const directNetProps = new Map<number, readonly { streamId: number; objectInd: number }[]>();
  const rawNodeMeta = new Map<number, { parentId: number; cacheId: number }>();

  for (const nc of netCache) {
    const existing = directNetProps.get(nc.objectInd);
    directNetProps.set(nc.objectInd, existing ? [...existing, ...nc.properties] : nc.properties);
    rawNodeMeta.set(nc.objectInd, { parentId: nc.parentId, cacheId: nc.cacheId });
  }

  const objToNode = new Map<number, RLRCResolvedClassNetCacheNode>();
  for (let oid = 0; oid < objects.length; oid++) {
    const chain = buildRLRCObjectHierarchyIds(objects[oid], nameToId, lowerToId);
    const props = new Map<number, number>();
    for (let c = chain.length - 1; c >= 0; c--) {
      const ancestorProps = directNetProps.get(chain[c]);
      if (ancestorProps) {
        for (const p of ancestorProps) props.set(p.streamId, p.objectInd);
      }
    }
    if (props.size === 0 && !rawNodeMeta.has(oid)) continue;

    let maxKey = 2;
    let hasKeys = false;
    for (const sid of props.keys()) {
      if (!hasKeys || sid > maxKey) {
        maxKey = sid;
        hasKeys = true;
      }
    }
    const maxStreamId = (hasKeys ? maxKey : 2) + 1;
    const propIdBits = Math.max(32 - Math.clz32(maxStreamId >>> 0), 1) - 1;
    const meta = rawNodeMeta.get(oid) ?? { parentId: 0, cacheId: maxStreamId };
    objToNode.set(oid, {
      objectInd: oid,
      parentId: meta.parentId,
      cacheId: meta.cacheId,
      props,
      maxStreamId,
      propIdBits,
    });
  }
  return objToNode;
}
