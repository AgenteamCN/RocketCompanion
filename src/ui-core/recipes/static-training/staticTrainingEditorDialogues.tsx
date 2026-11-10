import React from 'react';
import { dialogue } from '../../compounds/dialogue/dialogueStore';
import { KeycapBadge } from '../../primitives/KeycapBadge';
import type { StaticTrainingShotItem } from './staticTrainingTypes';

export const StaticTrainingCollapseDrawerBtn: React.FC<{
  isLight: boolean;
  onCollapseDrawer: () => void;
  onHoverDesc: (desc: string | null) => void;
}> = ({ isLight, onCollapseDrawer, onHoverDesc }) => (
  <button
    type="button"
    data-header-button="collapse-tab"
    onClick={onCollapseDrawer}
    onMouseEnter={() =>
      onHoverDesc(
        'Press TAB or click to collapse Edge Inspector Drawer to the side pill without darkening the 3D arena.'
      )
    }
    onMouseLeave={() => onHoverDesc(null)}
    className={`h-7 flex items-center gap-1.5 pl-2.5 pr-[3px] py-[3px] rounded-lg border text-xs transition-colors cursor-pointer select-none active:scale-95 ${
      isLight
        ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 shadow-2xs'
        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 shadow-2xs'
    }`}
  >
    <span
      className={`text-[11px] font-sans font-medium leading-none ${
        isLight ? 'text-neutral-700' : 'text-neutral-300'
      }`}
    >
      Collapse
    </span>
    <KeycapBadge
      shortcut="TAB"
      size="sm"
      isLight={isLight}
      className="h-5 !min-h-[20px] !py-0 !px-1.5 !rounded-[5px]"
    />
  </button>
);

/**
 * Spawns the Static Training Pack 3D Editor keyboard & camera shortcuts help modal.
 */
export function openStaticTrainingEditorHelpDialogue(): void {
  dialogue.show({
    id: 'static-training-editor-help',
    title: 'HELP',
    tone: 'info',
    icon: 'circle-help',
    maxWidth: 620,
    content: (
      <div className="flex flex-col gap-2.5 text-left text-xs leading-relaxed">
        <div className="font-semibold text-amber-500">
          Static Training Pack 3D Editor Controls &amp; Shortcuts
        </div>
        <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px]">
          <div>
            <span className="font-bold text-sky-500">[TAB]</span> : Collapse / Expand Edge Inspector Drawer to manipulate the 3D scene directly.
          </div>
          <div>
            <span className="font-bold text-sky-500">[ESC]</span> : Open / Close in-game Main Menu (select <span className="text-rose-400">Exit Edit Mode</span> inside the menu to save or discard session edits).
          </div>
          <div>
            <span className="font-bold text-sky-500">[9] / [0] or Right-Click</span> : Cycle between the Edit Sub-Modes (Car Heading, Car Speed, Ball Speed, Free Camera).
          </div>
          <div>
            <span className="font-bold text-sky-500">[W / A / S / D]</span> : Move the active target horizontally (Car in Car modes, Ball in Ball mode, Camera in Free Cam).
          </div>
          <div>
            <span className="font-bold text-sky-500">[Space] / [V]</span> : Move Up / Move Down. Pressing [V] at ground level snaps the car to ground (60-frame suspension settle).
          </div>
          <div>
            <span className="font-bold text-sky-500">[Mouse Drag]</span> : Aim 3D direction (Car Nose Heading + Pitch, Car Velocity Yaw + Pitch, Ball Velocity Yaw + Pitch, or Free Cam Look).
          </div>
          <div>
            <span className="font-bold text-sky-500">[Q] / [E]</span> : Adjust Car Air Roll angle in Car Heading mode.
          </div>
          <div>
            <span className="font-bold text-sky-500">[O] / [P]</span> : Decrease / Increase Car Boost amount (press [P] at 100 to enable Unlimited Boost INF).
          </div>
          <div>
            <span className="font-bold text-sky-500">[[] / []]</span> : Decrease / Increase launch speed. Pressing [[] at 0 Ball Speed toggles Kickoff Freeze.
          </div>
          <div>
            <span className="font-bold text-sky-500">[F]</span> : Switch relative ball camera horizontal lateral offset side (flips between right +offset and left -offset).
          </div>
          <div>
            <span className="font-bold text-emerald-500">[T]</span> : Toggle trajectory preview test in any Edit sub-mode (launches Car &amp; Ball while keeping the camera at its unlaunched viewpoint).
          </div>
          <div>
            <span className="font-bold text-emerald-500">[G]</span> : Test Single Shot in playable 3D arena (press [G] again to return to editor).
          </div>
        </div>
      </div>
    ),
    buttons: [
      {
        label: 'Got It',
        variant: 'primary',
      },
    ],
  });
}

export function cloneShotWithUpdate(
  currentShot: StaticTrainingShotItem,
  updater: (draft: StaticTrainingShotItem) => void
): StaticTrainingShotItem {
  const cloned: StaticTrainingShotItem = {
    ...currentShot,
    car: {
      ...currentShot.car,
      location: [...currentShot.car.location] as [number, number, number],
    },
    ball: {
      ...currentShot.ball,
      location: [...currentShot.ball.location] as [number, number, number],
      angularVelocity: [...currentShot.ball.angularVelocity] as [number, number, number],
    },
  };
  updater(cloned);
  return cloned;
}

export function duplicateShotInArray(
  items: StaticTrainingShotItem[],
  idx: number,
  fallbackShot: StaticTrainingShotItem | null
): StaticTrainingShotItem[] | null {
  const source = items[idx] || fallbackShot;
  if (!source) return null;
  const copy: StaticTrainingShotItem = {
    ...source,
    id: `shot-${Date.now()}-${idx + 1}`,
    name: `${source.name} (Copy)`,
    car: {
      ...source.car,
      location: [...source.car.location] as [number, number, number],
    },
    ball: {
      ...source.ball,
      location: [...source.ball.location] as [number, number, number],
      angularVelocity: [...source.ball.angularVelocity] as [number, number, number],
    },
  };
  return [...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)].map((it, i) => ({
    ...it,
    index: i,
  }));
}
