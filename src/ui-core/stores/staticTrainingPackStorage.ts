/**
 * StaticTrainingPackStorage.ts
 * Path-keyed IndexedDB Virtual Filesystem (VFS) for Static Training Packs,
 * with strict storage space isolation between Standard Training Packs (`normal` scope in `rc-virtual-fs-db`)
 * and Developer `.RLRCSPack` Training Packs (`dev` scope in `rc-dev-virtual-fs-db`),
 * plus a dedicated Edit-Mode IndexedDB (`rc-static-pack-edit-db`).
 */

import { type EditSubMode, type StaticTrainingCarConfig, type StaticTrainingBallConfig, type StaticTrainingShotItem, type StaticTrainingPackMetadata, type RCSPackArchive, MAX_SHOTS_PER_PACK, cloneShotItem, createStarterShots } from '../config/staticTrainingPackTypes';
import { decodeRCSPackFilePayload, decodeMultiOrZipPackFiles, type ExportRCSPackOptions } from '../config/staticTrainingPackCodec';
import {
  type VfsNodeRecord,
  type StaticTrainingPackStorageScope,
  EDIT_VFS_STORE_NAME,
  memoryEditVfsFallback,
  resolveScopeCategory,
  buildMetaPath,
  buildItemPath,
  buildEditMetaPath,
  buildEditItemPath,
  openEditVfsDb,
  vfsPutNodes,
  vfsGetAllByCategory,
  vfsGetByUuid,
  vfsDeleteByUuid,
  editVfsPutNodes,
  editVfsGetByUuid,
} from './staticTrainingPackVfsDriver';

export type { EditSubMode, StaticTrainingCarConfig, StaticTrainingBallConfig, StaticTrainingShotItem, StaticTrainingPackMetadata, RCSPackArchive, ExportRCSPackOptions, StaticTrainingPackStorageScope };

/**
 * Determines whether a training pack metadata record belongs strictly to the Developer `.RLRCSPack` catalog
 * rather than the normal user Static Training Pack library (`.RCSPack` / `.RCSPackE`).
 */
export function isDevRlRcsPackMetadata(
  meta: Partial<StaticTrainingPackMetadata> | null | undefined
): boolean {
  if (!meta) return false;
  return Boolean(meta.isBuiltInDevPack) || meta.sourcePackType === 'RLRCSPack';
}

export async function clearEditWorkspaceByUuid(
  uuid: string,
  scope?: StaticTrainingPackStorageScope
): Promise<void> {
  const targetCategory = scope ? resolveScopeCategory(scope) : null;
  for (const [k, v] of memoryEditVfsFallback.entries()) {
    if (v.uuid === uuid && (!targetCategory || v.category === targetCategory)) {
      memoryEditVfsFallback.delete(k);
    }
  }
  const db = await openEditVfsDb();
  if (!db) return;
  const records = await editVfsGetByUuid(uuid, scope);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(EDIT_VFS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(EDIT_VFS_STORE_NAME);
      for (const rec of records) {
        store.delete(rec.path);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function saveEditWorkspacePackFull(
  metadata: StaticTrainingPackMetadata,
  items: StaticTrainingShotItem[],
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<void> {
  await clearEditWorkspaceByUuid(metadata.uuid, scope);
  const now = Date.now();
  const category = resolveScopeCategory(scope);
  const cappedItems = items.slice(0, MAX_SHOTS_PER_PACK);
  const normalizedItems = cappedItems.map((item, idx) => {
    const cloned = cloneShotItem(item, idx);
    cloned.index = idx;
    return cloned;
  });

  const updatedMeta: StaticTrainingPackMetadata = {
    ...metadata,
    itemCount: normalizedItems.length,
    updatedAt: now,
  };

  const nodes: VfsNodeRecord[] = [
    {
      path: buildEditMetaPath(updatedMeta.uuid, scope),
      category,
      uuid: updatedMeta.uuid,
      nodeType: 'metadata',
      updatedAt: now,
      data: updatedMeta as unknown as Record<string, unknown>,
    },
    ...normalizedItems.map((it, idx) => ({
      path: buildEditItemPath(updatedMeta.uuid, idx, scope),
      category,
      uuid: updatedMeta.uuid,
      nodeType: 'item' as const,
      index: idx,
      updatedAt: now,
      data: it as unknown as Record<string, unknown>,
    })),
  ];

  await editVfsPutNodes(nodes);
}

export async function saveSingleEditWorkspaceShotItem(
  uuid: string,
  index: number,
  item: StaticTrainingShotItem,
  metadata?: StaticTrainingPackMetadata | null,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<void> {
  const now = Date.now();
  const category = resolveScopeCategory(scope);
  const cloned = cloneShotItem(item, index);
  const nodes: VfsNodeRecord[] = [
    {
      path: buildEditItemPath(uuid, index, scope),
      category,
      uuid,
      nodeType: 'item',
      index,
      updatedAt: now,
      data: cloned as unknown as Record<string, unknown>,
    },
  ];

  if (metadata) {
    const updatedMeta: StaticTrainingPackMetadata = {
      ...metadata,
      updatedAt: now,
    };
    nodes.push({
      path: buildEditMetaPath(uuid, scope),
      category,
      uuid,
      nodeType: 'metadata',
      updatedAt: now,
      data: updatedMeta as unknown as Record<string, unknown>,
    });
  }

  await editVfsPutNodes(nodes);
}

export async function loadEditWorkspacePackByUuid(
  uuid: string,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<{
  metadata: StaticTrainingPackMetadata | null;
  items: StaticTrainingShotItem[];
}> {
  const records = await editVfsGetByUuid(uuid, scope);
  let metadata: StaticTrainingPackMetadata | null = null;
  const items: StaticTrainingShotItem[] = [];

  for (const rec of records) {
    if (rec.nodeType === 'metadata' && rec.data) {
      metadata = rec.data as unknown as StaticTrainingPackMetadata;
    } else if (rec.nodeType === 'item' && rec.data) {
      const rawItem = rec.data as unknown as StaticTrainingShotItem;
      items.push(cloneShotItem(rawItem, rec.index ?? rawItem.index ?? 0));
    }
  }

  items.sort((a, b) => a.index - b.index);
  items.forEach((it, idx) => {
    it.index = idx;
  });

  return { metadata, items: items.slice(0, MAX_SHOTS_PER_PACK) };
}

/* ============================================================================
 * Main Committed VFS Operations (`rc-virtual-fs-db` vs `rc-dev-virtual-fs-db`)
 * ========================================================================== */

/**
 * Lists Static Training Pack metadata records for the requested storage scope (`normal` or `dev`),
 * sorted by updatedAt descending.
 * Automatically purges any legacy Developer `.RLRCSPack` records that were previously written into
 * the normal user database (`rc-virtual-fs-db`), and seeds the default starter pack if `normal` is empty.
 */
export async function listStaticTrainingPacks(
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<StaticTrainingPackMetadata[]> {
  const category = resolveScopeCategory(scope);
  const records = await vfsGetAllByCategory(category, scope);
  const rawMetas = records
    .filter((r) => r.nodeType === 'metadata' && r.data && typeof r.data.uuid === 'string')
    .map((r) => r.data as unknown as StaticTrainingPackMetadata);

  if (scope === 'normal') {
    const leakedDevUuids: string[] = [];
    const cleanNormalMetas: StaticTrainingPackMetadata[] = [];
    for (const meta of rawMetas) {
      if (isDevRlRcsPackMetadata(meta)) {
        leakedDevUuids.push(meta.uuid);
      } else {
        cleanNormalMetas.push(meta);
      }
    }
    if (leakedDevUuids.length > 0) {
      for (const devUuid of leakedDevUuids) {
        await vfsDeleteByUuid(devUuid, 'normal');
      }
    }
    cleanNormalMetas.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (cleanNormalMetas.length > 0) {
      return cleanNormalMetas;
    }
    const starter = await seedDefaultStarterPack('normal');
    return [starter];
  }

  return rawMetas.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function seedDefaultStarterPack(
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<StaticTrainingPackMetadata> {
  const uuid = 'starter-aerial-striker-pack';
  const now = Date.now();
  const shots = createStarterShots(uuid);
  const meta: StaticTrainingPackMetadata = {
    uuid,
    title: 'Fundamentals: Striker & Aerials',
    description:
      'Starter static training pack featuring a midfield volley, a suspended kickoff-state aerial, and a backboard read.',
    createdAt: now,
    updatedAt: now,
    itemCount: shots.length,
    sourcePackType: 'RCSPackE',
    tags: ['Native'],
  };

  await saveStaticTrainingPackFull(meta, shots, scope);
  return meta;
}

export async function loadStaticTrainingPackByUuid(
  uuid: string,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<{
  metadata: StaticTrainingPackMetadata | null;
  items: StaticTrainingShotItem[];
}> {
  let records = await vfsGetByUuid(uuid, scope);
  if (records.length === 0) {
    const fallbackScope: StaticTrainingPackStorageScope = scope === 'dev' ? 'normal' : 'dev';
    records = await vfsGetByUuid(uuid, fallbackScope);
  }
  let metadata: StaticTrainingPackMetadata | null = null;
  const items: StaticTrainingShotItem[] = [];

  for (const rec of records) {
    if (rec.nodeType === 'metadata' && rec.data) {
      metadata = rec.data as unknown as StaticTrainingPackMetadata;
    } else if (rec.nodeType === 'item' && rec.data) {
      const rawItem = rec.data as unknown as StaticTrainingShotItem;
      items.push(cloneShotItem(rawItem, rec.index ?? rawItem.index ?? 0));
    }
  }

  items.sort((a, b) => a.index - b.index);
  const capped = items.slice(0, MAX_SHOTS_PER_PACK);
  capped.forEach((it, idx) => {
    it.index = idx;
  });

  return { metadata, items: capped };
}

/**
 * Saves an entire Static Training Pack (metadata + all items, capped at 99) into the scoped IndexedDB VFS.
 */
export async function saveStaticTrainingPackFull(
  metadata: StaticTrainingPackMetadata,
  items: StaticTrainingShotItem[],
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<void> {
  await vfsDeleteByUuid(metadata.uuid, scope);
  const now = Date.now();
  const category = resolveScopeCategory(scope);
  const cappedItems = items.slice(0, MAX_SHOTS_PER_PACK);
  const normalizedItems = cappedItems.map((item, idx) => {
    const cloned = cloneShotItem(item, idx);
    cloned.index = idx;
    return cloned;
  });

  const updatedMeta: StaticTrainingPackMetadata = {
    ...metadata,
    itemCount: normalizedItems.length,
    updatedAt: now,
  };

  const nodes: VfsNodeRecord[] = [
    {
      path: buildMetaPath(updatedMeta.uuid, scope),
      category,
      uuid: updatedMeta.uuid,
      nodeType: 'metadata',
      updatedAt: now,
      data: updatedMeta as unknown as Record<string, unknown>,
    },
    ...normalizedItems.map((it, idx) => ({
      path: buildItemPath(updatedMeta.uuid, idx, scope),
      category,
      uuid: updatedMeta.uuid,
      nodeType: 'item' as const,
      index: idx,
      updatedAt: now,
      data: it as unknown as Record<string, unknown>,
    })),
  ];

  await vfsPutNodes(nodes, scope);
}

/**
 * Commits a single edited shot item to the scoped IndexedDB VFS.
 */
export async function saveSingleStaticTrainingShotItem(
  uuid: string,
  index: number,
  item: StaticTrainingShotItem,
  metadata?: StaticTrainingPackMetadata | null,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<void> {
  const now = Date.now();
  const category = resolveScopeCategory(scope);
  const cloned = cloneShotItem(item, index);
  const nodes: VfsNodeRecord[] = [
    {
      path: buildItemPath(uuid, index, scope),
      category,
      uuid,
      nodeType: 'item',
      index,
      updatedAt: now,
      data: cloned as unknown as Record<string, unknown>,
    },
  ];

  if (metadata) {
    const updatedMeta: StaticTrainingPackMetadata = {
      ...metadata,
      updatedAt: now,
    };
    nodes.push({
      path: buildMetaPath(uuid, scope),
      category,
      uuid,
      nodeType: 'metadata',
      updatedAt: now,
      data: updatedMeta as unknown as Record<string, unknown>,
    });
  }

  await vfsPutNodes(nodes, scope);
}

export async function deleteStaticTrainingPackByUuid(
  uuid: string,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<void> {
  await clearEditWorkspaceByUuid(uuid, scope);
  await vfsDeleteByUuid(uuid, scope);
}

/**
 * Imports a `.RCSPack`, `.RCSPackE`, `.RLRCSPack` (Dev Mode only), or `.Tem` (Dev Mode only) file
 * and persists it into the scoped VFS.
 */
export async function importStaticTrainingPackFromFile(
  file: File,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<{ metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }> {
  const { metadata, items } = await decodeRCSPackFilePayload(file, {
    allowDevFormats: scope === 'dev',
  });
  const capped = items.slice(0, MAX_SHOTS_PER_PACK);
  await saveStaticTrainingPackFull(metadata, capped, scope);
  return { metadata: { ...metadata, itemCount: capped.length }, items: capped };
}

/**
 * Batch imports multiple `.Tem` / `.RCSPack` / `.RCSPackE` / `.RLRCSPack` files or `.zip` archives into the scoped VFS.
 */
export async function importBatchStaticTrainingPacksFromFiles(
  files: File[] | FileList,
  scope: StaticTrainingPackStorageScope = 'normal'
): Promise<StaticTrainingPackMetadata[]> {
  const decodedList = await decodeMultiOrZipPackFiles(files, {
    allowDevFormats: scope === 'dev',
  });
  const importedMetas: StaticTrainingPackMetadata[] = [];
  for (const entry of decodedList) {
    const capped = entry.items.slice(0, MAX_SHOTS_PER_PACK);
    await saveStaticTrainingPackFull(entry.metadata, capped, scope);
    importedMetas.push({ ...entry.metadata, itemCount: capped.length });
  }
  return importedMetas;
}

/**
 * Ensures the Developer Mode (`dev` scope in `rc-dev-virtual-fs-db`) is initialized.
 * Note: The embedded Base64 `.RLRCSPack` catalog was exported to `AllPacks_144_RCSPackE.zip`
 * and removed from the source bundle; packs can be imported on-demand via `.zip` / `.RCSPackE` / `.Tem`.
 */
export async function ensureBuiltInDevPacksSeeded(_forceReseed = false): Promise<number> {
  return 0;
}
