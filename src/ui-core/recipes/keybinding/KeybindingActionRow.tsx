import React from 'react';
import { Plus, X, Sparkles } from 'lucide-react';
import { KeycapBadge } from '../../primitives/KeycapBadge';
import { useSettingActionRowStore } from '../../stores/settingRowStore';

export interface ActionBinding {
  id: string;
  action: string;
  keyboard: string[];
  gamepad: string[];
}

export const INITIAL_BINDINGS: ActionBinding[] = [
  { id: 'throttle', action: 'Throttle / Accelerate', keyboard: ['W'], gamepad: ['RT'] },
  { id: 'brake', action: 'Brake / Reverse', keyboard: ['S'], gamepad: ['LT'] },
  { id: 'steer-left', action: 'Steer Left', keyboard: ['A'], gamepad: ['LS-L'] },
  { id: 'steer-right', action: 'Steer Right', keyboard: ['D'], gamepad: ['LS-R'] },
  { id: 'boost', action: 'Rocket Boost', keyboard: ['SPACE', 'L-CLICK'], gamepad: ['B'] },
  { id: 'jump', action: 'Jump / Dodge', keyboard: ['R-CLICK'], gamepad: ['A'] },
  { id: 'powerslide', action: 'Powerslide / Handbrake', keyboard: ['SHIFT'], gamepad: ['X'] },
  { id: 'air-roll-left', action: 'Air Roll Left', keyboard: ['Q'], gamepad: ['LB'] },
  { id: 'air-roll-right', action: 'Air Roll Right', keyboard: ['E'], gamepad: ['RB'] },
  { id: 'ball-cam', action: 'Toggle Ball Camera', keyboard: ['SPACE'], gamepad: ['Y'] },
  { id: 'rear-cam', action: 'Rear Camera Look', keyboard: ['C'], gamepad: ['RS'] },
  { id: 'skip-replay', action: 'Skip Goal Replay', keyboard: ['ENTER'], gamepad: ['A'] },
  { id: 'pause', action: 'Pause / Game Menu', keyboard: ['ESC'], gamepad: ['START'] },
];

export const GAMEPAD_QUICK_PRESETS = [
  'A', 'B', 'X', 'Y',
  'LB', 'RB', 'LT', 'RT',
  'LS', 'RS', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT',
  'START', 'BACK',
];

export interface ListeningTarget {
  actionId: string;
  kind: 'keyboard' | 'gamepad';
}

export interface RemovableKeycapProps {
  shortcut: string;
  kind: 'keyboard' | 'gamepad';
  isLight: boolean;
  onRemove: () => void;
}

/**
 * RemovableKeycap:
 * Renders standard KeycapBadge with a smooth hover-reveal red cross on the right for unbinding.
 */
export const RemovableKeycap: React.FC<RemovableKeycapProps> = ({
  shortcut,
  kind,
  isLight,
  onRemove,
}) => {
  return (
    <div
      data-element="keycap-wrapper"
      className="group inline-flex items-center shrink-0"
      title={`Key: ${shortcut} (Hover and click X to unbind)`}
    >
      <KeycapBadge
        shortcut={shortcut}
        kind={kind}
        size="sm"
        isLight={isLight}
        className="!p-0 !min-h-[20px] !h-5 inline-flex items-center overflow-hidden transition-all duration-200 cursor-default select-none"
      >
        <span
          data-element="keycap-label"
          className="inline-flex items-center justify-center h-full pl-1.5 pr-1.5 group-hover:pr-0 group-[.is-expanded]:pr-0 text-[10px] font-mono font-semibold leading-none shrink-0 -translate-y-px select-none transition-all duration-200 ease-out"
        >
          {shortcut}
        </span>

        <span
          data-element="unbind-container"
          className="inline-flex items-center justify-center overflow-hidden w-0 opacity-0 group-hover:w-[18px] group-hover:opacity-100 group-[.is-expanded]:w-[18px] group-[.is-expanded]:opacity-100 transition-all duration-200 ease-out pointer-events-none group-hover:pointer-events-auto group-[.is-expanded]:pointer-events-auto shrink-0"
        >
          <button
            type="button"
            data-element="unbind-button"
            aria-label={`Unbind ${shortcut}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-[3px] text-red-500 dark:text-red-400 hover:bg-red-500/15 dark:hover:bg-red-500/25 cursor-pointer transition-colors shrink-0"
            title={`Unbind: ${shortcut}`}
          >
            <X className="h-2.5 w-2.5 stroke-[2.5]" />
          </button>
        </span>
      </KeycapBadge>
    </div>
  );
};

export interface ListeningSlotProps {
  kind: 'keyboard' | 'gamepad';
  isLight: boolean;
  onCancel: () => void;
  onSelectGamepadPreset?: (btn: string) => void;
}

/**
 * ListeningSlot:
 * Displays active pulsing listening indicator prompting player to press a key or gamepad button.
 */
export const ListeningSlot: React.FC<ListeningSlotProps> = ({
  kind,
  isLight,
  onCancel,
  onSelectGamepadPreset,
}) => {
  return (
    <div className="relative inline-flex flex-col gap-1.5 z-20">
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono font-medium animate-pulse shadow-sm ${
          isLight
            ? 'bg-amber-500/15 border-amber-500 text-amber-700'
            : 'bg-amber-500/20 border-amber-400 text-amber-300'
        }`}
      >
        <Sparkles className="h-3 w-3 animate-spin text-amber-500 shrink-0" />
        <span>{kind === 'keyboard' ? 'Press any key...' : 'Press button...'}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="ml-1 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-neutral-500/20 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
          title="Cancel (Esc)"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      {kind === 'gamepad' && onSelectGamepadPreset && (
        <div
          className={`absolute top-full right-0 mt-1 p-2 rounded-xl border shadow-xl flex flex-col gap-1.5 min-w-[200px] z-50 ${
            isLight
              ? 'bg-white border-neutral-200 shadow-neutral-200/50 text-neutral-800'
              : 'bg-neutral-900 border-neutral-700 shadow-black/80 text-neutral-200'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono px-0.5">
            <span>Physical Button / Quick Select:</span>
            <span className="text-amber-500 font-bold">Listening</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {GAMEPAD_QUICK_PRESETS.map((btn) => (
              <button
                key={btn}
                type="button"
                onClick={() => onSelectGamepadPreset(btn)}
                className="cursor-pointer transition-transform active:scale-95"
              >
                <KeycapBadge
                  shortcut={btn}
                  kind="gamepad"
                  size="sm"
                  isLight={isLight}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export interface KeybindingActionRowProps {
  binding: ActionBinding;
  isLight: boolean;
  listeningTarget: ListeningTarget | null;
  onStartListening: (target: ListeningTarget | null) => void;
  onRemoveKey: (actionId: string, kind: 'keyboard' | 'gamepad', keyToRemove: string) => void;
  onSelectGamepadPreset: (btn: string) => void;
  onHover?: (desc: string | null) => void;
  onLeave?: () => void;
}

export const KeybindingActionRow: React.FC<KeybindingActionRowProps> = ({
  binding: b,
  isLight,
  listeningTarget,
  onStartListening,
  onRemoveKey,
  onSelectGamepadPreset,
  onHover,
  onLeave,
}) => {
  const { paddingX, paddingY, borderRadius, titleFontSize } = useSettingActionRowStore();
  const isListeningKeyboard =
    listeningTarget?.actionId === b.id && listeningTarget?.kind === 'keyboard';
  const isListeningGamepad =
    listeningTarget?.actionId === b.id && listeningTarget?.kind === 'gamepad';

  const verticalSpacingStyle: React.CSSProperties =
    paddingY >= 0
      ? {
          paddingTop: `${paddingY}px`,
          paddingBottom: `${paddingY}px`,
        }
      : {
          paddingTop: '0px',
          paddingBottom: '0px',
          marginTop: `${paddingY}px`,
          marginBottom: `${paddingY}px`,
        };

  return (
    <div
      data-row="binding-row"
      data-row-id={b.id}
      style={{
        paddingLeft: `${Math.max(0, paddingX)}px`,
        paddingRight: `${Math.max(0, paddingX)}px`,
        borderRadius: `${Math.max(0, borderRadius)}px`,
        ...verticalSpacingStyle,
      }}
      onMouseEnter={() =>
        onHover?.(`Configure keyboard and controller bindings for ${b.action}.`)
      }
      onMouseLeave={onLeave}
      className={`group/row grid grid-cols-12 items-center border border-transparent bg-transparent transition-colors duration-150 ${
        isLight
          ? 'hover:bg-neutral-900/[0.055] active:bg-neutral-900/[0.085]'
          : 'hover:bg-white/[0.06] active:bg-white/[0.09]'
      }`}
    >
      {/* Col 1: Action Name */}
      <div data-col="action" className="col-span-5 flex items-center pr-2 min-w-0">
        <span
          style={{ fontSize: `${titleFontSize}px` }}
          className={`font-semibold truncate transition-colors ${
            isLight
              ? 'text-neutral-800 group-hover/row:text-neutral-950'
              : 'text-neutral-200 group-hover/row:text-white'
          }`}
        >
          {b.action}
        </span>
      </div>

      {/* Col 2: Keyboard Binds */}
      <div className="col-span-4 flex flex-wrap items-center gap-1 pr-2 transition-all">
        {b.keyboard.map((k) => (
          <RemovableKeycap
            key={k}
            shortcut={k}
            kind="keyboard"
            isLight={isLight}
            onRemove={() => onRemoveKey(b.id, 'keyboard', k)}
          />
        ))}

        {isListeningKeyboard ? (
          <ListeningSlot
            kind="keyboard"
            isLight={isLight}
            onCancel={() => onStartListening(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onStartListening({ actionId: b.id, kind: 'keyboard' })}
            title={`Add keyboard binding for "${b.action}"`}
            className={`inline-flex items-center justify-center h-5 w-5 rounded-md border border-dashed transition-all cursor-pointer ${
              isLight
                ? 'border-neutral-300 hover:border-amber-500 hover:bg-amber-50 text-neutral-400 hover:text-amber-600'
                : 'border-neutral-700 hover:border-amber-400 hover:bg-amber-500/10 text-neutral-500 hover:text-amber-400'
            }`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Col 3: Controller / Gamepad Binds */}
      <div className="col-span-3 flex flex-wrap items-center gap-1 transition-all">
        {b.gamepad.map((padKey) => (
          <RemovableKeycap
            key={padKey}
            shortcut={padKey}
            kind="gamepad"
            isLight={isLight}
            onRemove={() => onRemoveKey(b.id, 'gamepad', padKey)}
          />
        ))}

        {isListeningGamepad ? (
          <ListeningSlot
            kind="gamepad"
            isLight={isLight}
            onCancel={() => onStartListening(null)}
            onSelectGamepadPreset={onSelectGamepadPreset}
          />
        ) : (
          <button
            type="button"
            onClick={() => onStartListening({ actionId: b.id, kind: 'gamepad' })}
            title={`Add controller binding for "${b.action}"`}
            className={`inline-flex items-center justify-center h-5 w-5 rounded-md border border-dashed transition-all cursor-pointer ${
              isLight
                ? 'border-neutral-300 hover:border-emerald-500 hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600'
                : 'border-neutral-700 hover:border-emerald-400 hover:bg-emerald-500/10 text-neutral-500 hover:text-emerald-400'
            }`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
