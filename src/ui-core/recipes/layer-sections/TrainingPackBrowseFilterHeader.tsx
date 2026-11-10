import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useStaticTrainingPackStore } from '../../stores/staticTrainingPackStore';
import type {
  StaticPackDownCounterOption,
  StaticTrainingPackSummary,
} from '../static-training/StaticTrainingPackFolderList';
import { StaticTrainingPackToolbar } from '../static-training/StaticTrainingPackToolbar';
import { StaticTrainingPackMetadataInspector } from '../static-training/StaticTrainingPackMetadataInspector';
import type {
  KevpertPresetKey,
  StaticTrainingQuickVariationToggles,
  StaticTrainingVariationConfig,
} from '../../config/staticTrainingVariationTypes';
import {
  generatePackUUID,
  normalizePackSummary,
  parseStandaloneImportedPackFile,
} from '../static-training/staticTrainingPackFilterLogic';

export interface Layer4StaticTrainingPackBrowseStateOverride {
  defaultSelectedId?: string;
  defaultUseDownCounter?: boolean;
  packs?: StaticTrainingPackSummary[];
  selectedPackUuid?: string | null;
  onSelectPack?: (uuid: string) => void;
  downCounterEnabled?: boolean;
  onDownCounterEnabledChange?: (enabled: boolean) => void;
  downCounterValue?: StaticPackDownCounterOption;
  onDownCounterValueChange?: (val: StaticPackDownCounterOption) => void;
  variationToggles?: StaticTrainingQuickVariationToggles;
  onUpdateVariationToggles?: (patch: Partial<StaticTrainingQuickVariationToggles>) => void;
  customVariation?: StaticTrainingVariationConfig;
  onUpdateCustomVariation?: (patch: Partial<StaticTrainingVariationConfig>) => void;
  onSelectKevpertPreset?: (key: KevpertPresetKey) => void;
  onCreatePack?: (title: string, description: string) => void | Promise<unknown>;
  onSavePackMetadata?: (uuid: string, title: string, description: string) => void | Promise<void>;
  onUpdatePackTags?: (uuid: string, nextTags: string[]) => void | Promise<void>;
  onDeletePack?: (uuid: string) => void | Promise<void>;
  onImportPackFile?: (file: File) => void | Promise<unknown>;
  onImportBatchPackFiles?: (files: FileList | File[]) => void | Promise<number | void>;
  onExportBatchPacksZip?: (
    uuids: string[],
    bundleName: string,
    editable: boolean,
    formatOverride?: 'RCSPack' | 'RCSPackE' | 'RLRCSPack'
  ) => void | Promise<string | null | void>;
  onStartPlaySession?: (uuid: string) => void;
  onStartEditSession?: (uuid: string) => void | Promise<void>;
  onPlayPack?: (pack: StaticTrainingPackSummary, useDownCounter: boolean) => void;
  onEditPack?: (pack: StaticTrainingPackSummary) => void;
  onImportPack?: () => void;
  onExportPack?: (pack: StaticTrainingPackSummary, editable?: boolean) => void | Promise<void>;
}

export interface TrainingPackBrowseFilterHeaderProps {
  isLight: boolean;
  isDevMode: boolean;
  targetScope: 'dev' | 'normal';
  hasScopedPacks: boolean;
  selectedMeta: StaticTrainingPackSummary | null;
  downCounter: {
    downCounterEnabled: boolean;
    setDownCounterEnabled: (enabled: boolean) => void;
    downCounterValue: StaticPackDownCounterOption;
    setDownCounterValue: (val: StaticPackDownCounterOption) => void;
  };
  kevpertBind: {
    applyNewKevpertBind: boolean;
    onToggleApplyNewKevpertBind: (val: boolean) => void;
  };
  ov: Layer4StaticTrainingPackBrowseStateOverride;
  internalState: {
    setInternalPacks: React.Dispatch<React.SetStateAction<StaticTrainingPackSummary[]>>;
    setInternalSelectedUuid: React.Dispatch<React.SetStateAction<string | null>>;
  };
  onHoverDesc: (desc: string | null) => void;
}

export const TrainingPackBrowseFilterHeader: React.FC<
  TrainingPackBrowseFilterHeaderProps
> = ({
  isLight,
  isDevMode,
  targetScope,
  hasScopedPacks,
  selectedMeta,
  downCounter,
  kevpertBind,
  ov,
  internalState,
  onHoverDesc,
}) => {
  const { setInternalPacks, setInternalSelectedUuid } = internalState;
  const store = useStaticTrainingPackStore();
  const closeMenu = useAppStore((s) => s.closeMenu);
  const setMatchMode = useAppStore((s) => s.setMatchMode);
  const bridge = useAppStore((s) => s.bridge);

  const [isCreatingPack, setIsCreatingPack] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirmDeleteUuid, setConfirmDeleteUuid] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedMeta) {
      setEditTitle(selectedMeta.title);
      setEditDescription(selectedMeta.description);
    }
    setConfirmDeleteUuid(null);
  }, [selectedMeta?.uuid, selectedMeta?.title, selectedMeta?.description]);

  const isMetadataDirty = Boolean(
    selectedMeta &&
      ((editTitle.trim() || 'Untitled Training Pack') !== selectedMeta.title ||
        editDescription.trim() !== (selectedMeta.description || ''))
  );

  const handleCreateSubmit = async () => {
    const title = newTitle.trim() || 'Custom Training Pack';
    const desc = newDescription.trim();
    if (ov.onCreatePack) {
      await ov.onCreatePack(title, desc);
    } else if (hasScopedPacks) {
      await store.createPack(title, desc, targetScope);
    } else {
      const now = Date.now();
      const created = normalizePackSummary({
        uuid: generatePackUUID(),
        title,
        description: desc,
        itemCount: 1,
        tags: ['Native'],
        sourcePackType: 'RCSPackE',
        createdAt: now,
        updatedAt: now,
      });
      setInternalPacks((prev) => [created, ...prev]);
      setInternalSelectedUuid(created.uuid);
    }
    setNewTitle('');
    setNewDescription('');
    setIsCreatingPack(false);
    onHoverDesc(`Created new training pack "${title}"`);
  };

  const handleSaveMetadata = async () => {
    if (!selectedMeta || !isMetadataDirty) return;
    const trimmedTitle = editTitle.trim() || 'Untitled Training Pack';
    const trimmedDesc = editDescription.trim();
    if (ov.onSavePackMetadata) {
      await ov.onSavePackMetadata(selectedMeta.uuid, trimmedTitle, trimmedDesc);
    } else if (hasScopedPacks) {
      await store.updatePackInfo(selectedMeta.uuid, trimmedTitle, trimmedDesc, targetScope);
    } else {
      setInternalPacks((prev) =>
        prev.map((p) =>
          p.uuid === selectedMeta.uuid
            ? normalizePackSummary({
                ...p,
                title: trimmedTitle,
                name: trimmedTitle,
                description: trimmedDesc,
                updatedAt: Date.now(),
              })
            : p
        )
      );
    }
    onHoverDesc(`Saved global metadata for "${trimmedTitle}"`);
  };

  const handleUpdatePackTags = async (uuid: string, nextTags: string[]) => {
    if (ov.onUpdatePackTags) {
      await ov.onUpdatePackTags(uuid, nextTags);
    } else if (hasScopedPacks) {
      await store.updatePackTags(uuid, nextTags, targetScope);
    } else {
      setInternalPacks((prev) =>
        prev.map((p) =>
          p.uuid === uuid
            ? normalizePackSummary({ ...p, tags: nextTags, updatedAt: Date.now() })
            : p
        )
      );
    }
  };

  const handleDeletePack = async (uuid: string) => {
    if (ov.onDeletePack) {
      await ov.onDeletePack(uuid);
    } else if (hasScopedPacks) {
      await store.deletePack(uuid, targetScope);
    } else {
      setInternalPacks((prev) => {
        const next = prev.filter((p) => p.uuid !== uuid);
        setInternalSelectedUuid((cur) => (cur === uuid ? next[0]?.uuid ?? null : cur));
        return next;
      });
    }
    setConfirmDeleteUuid(null);
  };

  const handleExportPack = async (pack: StaticTrainingPackSummary, editable = false) => {
    if (ov.onExportPack) {
      await ov.onExportPack(pack, editable);
    } else {
      await store.exportPackRCS(pack.uuid, { editable }, targetScope);
    }
    const safeTitle =
      (pack.title || 'TrainingPack')
        .trim()
        .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'TrainingPack';
    const ext = editable ? 'RCSPackE' : 'RCSPack';
    onHoverDesc(`Exported ${safeTitle}_${pack.uuid}.${ext}`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      if (fileList.length > 1 || /\.zip$/i.test(fileList[0].name)) {
        if (ov.onImportBatchPackFiles) {
          const count = await ov.onImportBatchPackFiles(fileList);
          onHoverDesc(`Batch imported ${count || fileList.length} training pack(s) into VFS.`);
        } else {
          const importedList = await store.importBatchPacks(fileList, targetScope);
          onHoverDesc(`Batch imported ${importedList.length || fileList.length} training pack(s) into VFS.`);
        }
      } else if (ov.onImportPackFile) {
        await ov.onImportPackFile(fileList[0]);
        onHoverDesc(`Imported pack from ${fileList[0].name}`);
      } else if (hasScopedPacks) {
        await store.importPackRCS(fileList[0], targetScope);
        onHoverDesc(`Imported pack from ${fileList[0].name}`);
      } else {
        const file = fileList[0];
        const imported = await parseStandaloneImportedPackFile(file, isDevMode);
        setInternalPacks((prev) => [
          imported,
          ...prev.filter((p) => p.uuid !== imported.uuid),
        ]);
        setInternalSelectedUuid(imported.uuid);
        onHoverDesc(`Imported pack from ${file.name}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid training pack file';
      onHoverDesc(`Import failed: ${message}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="col-span-6 flex flex-col gap-2.5 min-h-0 overflow-hidden">
      <StaticTrainingPackToolbar
        isLight={isLight}
        isDevMode={isDevMode}
        fileInputRef={fileInputRef}
        createDraft={{
          isCreatingPack,
          setIsCreatingPack,
          newTitle,
          setNewTitle,
          newDescription,
          setNewDescription,
          onCreateSubmit: () => void handleCreateSubmit(),
        }}
        onImportClick={() => {
          ov.onImportPack?.();
          fileInputRef.current?.click();
        }}
        onImportFileChange={(e) => void handleImportFile(e)}
        onHoverDesc={onHoverDesc}
      />

      <StaticTrainingPackMetadataInspector
        isLight={isLight}
        isDevMode={isDevMode}
        selectedMeta={selectedMeta}
        draft={{
          editTitle,
          setEditTitle,
          editDescription,
          setEditDescription,
          isMetadataDirty,
          onSaveMetadata: () => void handleSaveMetadata(),
        }}
        downCounter={downCounter}
        actions={{
          confirmDeleteUuid,
          setConfirmDeleteUuid,
          onPlayPack: (meta) => {
            if (ov.onStartPlaySession) {
              ov.onStartPlaySession(meta.uuid);
            } else {
              void store.selectPack(meta.uuid, targetScope).then(() => {
                store.setSessionMode('play');
                setMatchMode('static-training-pack');
                bridge.onStartStaticTrainingPack?.('play');
                closeMenu();
              });
            }
            ov.onPlayPack?.(meta, downCounter.downCounterEnabled);
          },
          onEditPack: (meta) => {
            if (ov.onStartEditSession) {
              void ov.onStartEditSession(meta.uuid);
            } else {
              void store.beginEditSession(meta.uuid, targetScope).then(() => {
                setMatchMode('static-training-pack');
                bridge.onStartStaticTrainingPack?.('edit');
                closeMenu();
              });
            }
            ov.onEditPack?.(meta);
          },
          onExportPack: (meta, editable) => void handleExportPack(meta, editable),
          onDeletePack: (uuid) => void handleDeletePack(uuid),
        }}
        applyNewKevpertBind={kevpertBind.applyNewKevpertBind}
        onToggleApplyNewKevpertBind={kevpertBind.onToggleApplyNewKevpertBind}
        onUpdatePackTags={(uuid, nextTags) => void handleUpdatePackTags(uuid, nextTags)}
        onHoverDesc={onHoverDesc}
      />
    </div>
  );
};
