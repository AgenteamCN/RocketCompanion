import React from 'react';
import {
  Check,
  Download,
  Edit3,
  FileCode2,
  Play,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../../primitives/Button';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import type {
  StaticPackDownCounterOption,
  StaticTrainingPackSummary,
} from './StaticTrainingPackFolderList';

const DOWN_COUNTER_OPTIONS: { label: string; value: string }[] = [
  { label: '1s', value: '1' },
  { label: '2s', value: '2' },
  { label: '3s', value: '3' },
];

export interface StaticTrainingPackDownCounterControl {
  downCounterEnabled: boolean;
  setDownCounterEnabled: (val: boolean) => void;
  downCounterValue: StaticPackDownCounterOption;
  setDownCounterValue: (val: StaticPackDownCounterOption) => void;
}

export interface StaticTrainingPackActionCallbacks {
  confirmDeleteUuid: string | null;
  setConfirmDeleteUuid: (val: string | null) => void;
  onPlayPack: (meta: StaticTrainingPackSummary) => void;
  onEditPack: (meta: StaticTrainingPackSummary) => void;
  onExportPack: (meta: StaticTrainingPackSummary, editable: boolean) => void;
  onDeletePack: (uuid: string) => void;
}

export interface StaticTrainingPackInspectorActionsProps {
  isLight: boolean;
  selectedMeta: StaticTrainingPackSummary & { editable?: boolean };
  downCounter: StaticTrainingPackDownCounterControl;
  actions: StaticTrainingPackActionCallbacks;
  onHoverDesc: (desc: string | null) => void;
}

export const StaticTrainingPackInspectorActions: React.FC<
  StaticTrainingPackInspectorActionsProps
> = React.memo(
  ({
    isLight,
    selectedMeta,
    downCounter: {
      downCounterEnabled,
      setDownCounterEnabled,
      downCounterValue,
      setDownCounterValue,
    },
    actions: {
      confirmDeleteUuid,
      setConfirmDeleteUuid,
      onPlayPack,
      onEditPack,
      onExportPack,
      onDeletePack,
    },
    onHoverDesc,
  }) => {
    const isEditable =
      selectedMeta.editable !== undefined
        ? selectedMeta.editable
        : selectedMeta.sourcePackType !== 'RCSPack';
    return (
      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-neutral-500/20">
        {/* Down Counter Pre-Shot Freeze Toggle */}
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border ${
            isLight
              ? 'bg-neutral-50 border-neutral-200/80'
              : 'bg-neutral-850/60 border-neutral-800'
          }`}
          onMouseEnter={() =>
            onHoverDesc(
              'Down Counter: Freeze ball & car for 1-3s before each shot starts (or press jump/throttle to launch early).'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <div className="flex items-center gap-2">
            <Timer
              className={`h-3.5 w-3.5 ${
                downCounterEnabled ? 'text-amber-500' : 'opacity-50'
              }`}
            />
            <span className="text-[11px] font-bold">Down Counter</span>
            <ToggleSwitch
              checked={downCounterEnabled}
              onChange={(checked) => setDownCounterEnabled(checked)}
              ariaLabel="Toggle Down Counter"
            />
          </div>
          {downCounterEnabled && (
            <div className="w-40">
              <SegmentedSwitch
                options={DOWN_COUNTER_OPTIONS}
                value={String(downCounterValue)}
                onChange={(v: string) =>
                  setDownCounterValue((Number(v) || 1) as StaticPackDownCounterOption)
                }
                ariaLabel="Down Counter Seconds"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => onPlayPack(selectedMeta)}
            onMouseEnter={() =>
              onHoverDesc('Launch 3D arena and practice all shots in this pack.')
            }
            onMouseLeave={() => onHoverDesc(null)}
          >
            Play Pack
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<Edit3 className="h-3.5 w-3.5" />}
            disabled={!isEditable}
            onClick={() => onEditPack(selectedMeta)}
            onMouseEnter={() =>
              onHoverDesc(
                isEditable
                  ? 'Open interactive 3D Editor to customize shots, vectors, and sequence.'
                  : 'This pack is a read-only .RCSPack release and cannot be modified.'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
          >
            {isEditable ? 'Edit Pack' : 'Locked Pack'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onExportPack(selectedMeta, false)}
            onMouseEnter={() =>
              onHoverDesc('Export as read-only .RCSPack release archive.')
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800/80 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <Download className="h-3 w-3" />
            <span>.RCSPack</span>
          </button>

          <button
            type="button"
            disabled={!isEditable}
            onClick={() => onExportPack(selectedMeta, true)}
            onMouseEnter={() =>
              onHoverDesc('Export as editable .RCSPackE creator project.')
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${
              !isEditable
                ? 'opacity-40 cursor-not-allowed border-neutral-500/20'
                : isLight
                  ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800 cursor-pointer'
                  : 'bg-cyan-950/40 hover:bg-cyan-900/50 border-cyan-500/40 text-cyan-300 cursor-pointer'
            }`}
          >
            <FileCode2 className="h-3 w-3" />
            <span>.RCSPackE</span>
          </button>

          {confirmDeleteUuid === selectedMeta.uuid ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDeletePack(selectedMeta.uuid)}
                className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="h-3 w-3" />
                <span>Del</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteUuid(null)}
                className={`px-2 py-1.5 rounded-lg border text-[10px] cursor-pointer ${
                  isLight
                    ? 'bg-neutral-100 border-neutral-300'
                    : 'bg-neutral-800 border-neutral-700'
                }`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteUuid(selectedMeta.uuid)}
              onMouseEnter={() =>
                onHoverDesc('Delete this pack from local IndexedDB storage.')
              }
              onMouseLeave={() => onHoverDesc(null)}
              className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                  : 'bg-rose-950/30 hover:bg-rose-900/50 border-rose-500/30 text-rose-300'
              }`}
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);
StaticTrainingPackInspectorActions.displayName = 'StaticTrainingPackInspectorActions';
