import React from 'react';
import { Box, Trash2, Plus } from 'lucide-react';
import type {
  DialogueButtonConfig,
  DialogueButtonVariant,
} from '../../../ui-core/compounds/dialogue/dialogueTypes';
import { Button } from '../../../ui-core/primitives/Button';

export interface DialogueSlotActions {
  handleAddButton: () => void;
  handleRemoveButton: (index: number) => void;
  handleUpdateButtonLabel: (index: number, newLabel: string) => void;
  handleUpdateButtonVariant: (index: number, newVariant: DialogueButtonVariant) => void;
  handleToggleButtonDisabled: (index: number) => void;
}

export interface DialogueButtonManagerColumnProps {
  isLight: boolean;
  buttons: DialogueButtonConfig[];
  newButtonLabel: string;
  setNewButtonLabel: (val: string) => void;
  newButtonVariant: DialogueButtonVariant;
  setNewButtonVariant: (val: DialogueButtonVariant) => void;
  newButtonDisabled: boolean;
  setNewButtonDisabled: (val: boolean) => void;
  slotActions: DialogueSlotActions;
}

export const DialogueButtonManagerColumn: React.FC<DialogueButtonManagerColumnProps> = ({
  isLight,
  buttons,
  newButtonLabel,
  setNewButtonLabel,
  newButtonVariant,
  setNewButtonVariant,
  newButtonDisabled,
  setNewButtonDisabled,
  slotActions,
}) => {
  const {
    handleAddButton,
    handleRemoveButton,
    handleUpdateButtonLabel,
    handleUpdateButtonVariant,
    handleToggleButtonDisabled,
  } = slotActions;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
        <Box className="h-3.5 w-3.5" />
        <span>Button Manager (with disabled support)</span>
      </div>

      {/* Active Buttons List */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>Active Buttons (Compact centered)</span>
          <span className="text-[10px] font-mono text-neutral-400">
            {buttons.length} items
          </span>
        </div>

        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          {buttons.map((btn, index) => (
            <div
              key={btn.key ?? index}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs transition-colors ${
                btn.disabled ? 'opacity-65' : ''
              } ${
                isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950 border-neutral-800'
              }`}
            >
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  isLight ? 'bg-neutral-100 text-neutral-600' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                #{index + 1}
              </span>
              <input
                type="text"
                value={btn.label}
                onChange={(e) => handleUpdateButtonLabel(index, e.target.value)}
                placeholder="Button text"
                style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace" }}
                className={`flex-1 min-w-0 px-2 py-1 rounded-lg border text-xs outline-none ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-300'
                    : 'bg-neutral-900 border-neutral-700'
                }`}
              />
              <select
                value={btn.variant ?? 'outline'}
                onChange={(e) =>
                  handleUpdateButtonVariant(index, e.target.value as DialogueButtonVariant)
                }
                className={`px-1.5 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer shrink-0 ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-200'
                }`}
              >
                <option value="primary">primary</option>
                <option value="outline">outline</option>
                <option value="danger">danger</option>
              </select>
              {/* Disabled Toggle */}
              <button
                type="button"
                onClick={() => handleToggleButtonDisabled(index)}
                className={`px-1.5 py-1 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer shrink-0 ${
                  btn.disabled
                    ? 'bg-rose-500/15 border-rose-500 text-rose-500 font-bold'
                    : isLight
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-500'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
                title={btn.disabled ? 'Button is disabled' : 'Click to disable button'}
              >
                {btn.disabled ? 'Disabled' : 'Enabled'}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveButton(index)}
                className="p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                title="Remove button"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {buttons.length === 0 && (
            <div
              className={`p-4 rounded-xl border border-dashed text-xs text-center ${
                isLight
                  ? 'border-neutral-300 text-neutral-500'
                  : 'border-neutral-700 text-neutral-400'
              }`}
            >
              No buttons. Add one below.
            </div>
          )}
        </div>

        {/* Add Button Input */}
        <div
          className={`flex items-center gap-2 p-2 rounded-xl border border-dashed mt-1 ${
            isLight
              ? 'bg-neutral-100/60 border-neutral-300'
              : 'bg-neutral-950/60 border-neutral-700'
          }`}
        >
          <input
            type="text"
            value={newButtonLabel}
            onChange={(e) => setNewButtonLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddButton();
              }
            }}
            placeholder="Primary"
            style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace" }}
            className={`flex-1 min-w-0 px-2 py-1 rounded-lg border text-xs outline-none ${
              isLight ? 'bg-white border-neutral-300' : 'bg-neutral-900 border-neutral-700'
            }`}
          />
          <select
            value={newButtonVariant}
            onChange={(e) => setNewButtonVariant(e.target.value as DialogueButtonVariant)}
            className={`px-1.5 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer shrink-0 ${
              isLight
                ? 'bg-white border-neutral-300 text-neutral-800'
                : 'bg-neutral-900 border-neutral-700 text-neutral-200'
            }`}
          >
            <option value="primary">primary</option>
            <option value="outline">outline</option>
            <option value="danger">danger</option>
          </select>
          <label className="flex items-center gap-1 text-[10px] font-mono cursor-pointer shrink-0 select-none">
            <input
              type="checkbox"
              checked={newButtonDisabled}
              onChange={(e) => setNewButtonDisabled(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Disabled</span>
          </label>
          <Button
            variant="primary"
            size="sm"
            isLight={isLight}
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={handleAddButton}
            className="shrink-0 cursor-pointer"
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};
