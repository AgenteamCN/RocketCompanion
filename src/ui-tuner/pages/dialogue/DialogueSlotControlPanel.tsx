import React from 'react';
import { Sliders, Type, Sparkles, CheckCircle2 } from 'lucide-react';
import type {
  DialogueTone,
  DialogueButtonConfig,
  DialogueButtonVariant,
} from '../../../ui-core/compounds/dialogue/dialogueTypes';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  DialogueButtonManagerColumn,
  type DialogueSlotActions,
} from './DialogueButtonManagerColumn';

export type { DialogueSlotActions };

const PRESET_ICONS = [
  'octagon-alert',
  'triangle-alert',
  'flame',
  'info',
  'bell',
  'shield-alert',
  'check-circle',
];

export interface DialogueSlotState {
  title: string;
  setTitle: (val: string) => void;
  tone: DialogueTone;
  setTone: (val: DialogueTone) => void;
  iconName: string;
  setIconName: (val: string) => void;
  content: string;
  setContent: (val: string) => void;
  buttons: DialogueButtonConfig[];
  newButtonLabel: string;
  setNewButtonLabel: (val: string) => void;
  newButtonVariant: DialogueButtonVariant;
  setNewButtonVariant: (val: DialogueButtonVariant) => void;
  newButtonDisabled: boolean;
  setNewButtonDisabled: (val: boolean) => void;
}

export interface DialogueSlotControlPanelProps {
  isLight: boolean;
  slotState: DialogueSlotState;
  slotActions: DialogueSlotActions;
}

export const DialogueSlotControlPanel: React.FC<DialogueSlotControlPanelProps> = React.memo(
  ({ isLight, slotState, slotActions }) => {
    const {
      title,
      setTitle,
      tone,
      setTone,
      iconName,
      setIconName,
      content,
      setContent,
      buttons,
      newButtonLabel,
      setNewButtonLabel,
      newButtonVariant,
      setNewButtonVariant,
      newButtonDisabled,
      setNewButtonDisabled,
    } = slotState;

    return (
      <div
        className={`p-6 rounded-2xl border flex flex-col gap-6 shadow-sm ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200/90 text-neutral-900'
            : 'bg-neutral-900/60 border-neutral-800 text-neutral-100'
        }`}
      >
        <div className="flex items-center justify-between border-b pb-3 border-neutral-200/70 dark:border-neutral-800/70">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-amber-500" />
            <span className="font-bold text-sm tracking-tight">
              Dialogue standard Slots Parameter input
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral" size="sm" isLight={isLight}>
              Plain 46px · Zero Mask · Stackable
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Title & Tone */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <Type className="h-3.5 w-3.5" />
              <span>Title & Tone</span>
            </div>

            {/* Title Text Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Title (Headline text)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ALERT"
                style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace" }}
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 focus:border-amber-500 text-neutral-900'
                    : 'bg-neutral-950 border-neutral-700/80 focus:border-amber-500 text-neutral-100'
                }`}
              />
            </div>

            {/* Tone Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">
                Color Level (4Level tonality: Gray Yellow Orange Red)
              </label>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
                {(
                  [
                    { key: 'error', label: 'Error (red)', dot: 'bg-red-500' },
                    { key: 'warning', label: 'Warn (Yellow)', dot: 'bg-yellow-400' },
                    { key: 'orange', label: 'Alert (Orange)', dot: 'bg-orange-500' },
                    { key: 'info', label: 'Info (Gray)', dot: 'bg-neutral-400' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTone(item.key)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-[10px] font-medium transition-all cursor-pointer ${
                      tone === item.key
                        ? isLight
                          ? 'bg-white border-neutral-900 shadow-xs text-neutral-900 font-bold'
                          : 'bg-neutral-800 border-white shadow-xs text-white font-bold'
                        : isLight
                        ? 'bg-white/70 hover:bg-white border-neutral-200 text-neutral-600'
                        : 'bg-neutral-950/70 hover:bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Solidified Specification Badge Card */}
            <div
              className={`p-3 rounded-xl border text-[11px] font-mono flex flex-col gap-1.5 ${
                isLight
                  ? 'bg-white border-neutral-200 text-neutral-600'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Standardized Specs (Standardized)</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] leading-relaxed">
                <div>
                  • Icon Variation: <strong>Plain</strong>
                </div>
                <div>
                  • Icon Size: <strong>46px</strong>
                </div>
                <div>
                  • Title Size: <strong>32px</strong>
                </div>
                <div>
                  • Letter Spacing: <strong>10px</strong>
                </div>
                <div>
                  • Title Weight: <strong>Regular 400</strong>
                </div>
                <div>
                  • Title Color: <strong>Content Sync</strong>
                </div>
                <div>
                  • Padding: <strong>10×16×32px</strong>
                </div>
                <div>
                  • Background Mask: <strong>None (0% Dim)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Icon Name & Content */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Icon (46px Plain) & Content</span>
            </div>

            {/* Icon Name Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold flex items-center justify-between">
                <span>Lucide Icon Name (Pass icon name directly)</span>
                <span className="text-[10px] font-mono text-neutral-400">{iconName} (46px)</span>
              </label>
              <input
                type="text"
                value={iconName}
                onChange={(e) => setIconName(e.target.value)}
                placeholder="octagon-alert"
                style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace" }}
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 focus:border-amber-500 text-neutral-900'
                    : 'bg-neutral-950 border-neutral-700/80 focus:border-amber-500 text-neutral-100'
                }`}
              />
              {/* Quick Pick Icon Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_ICONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setIconName(preset)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                      iconName === preset
                        ? isLight
                          ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                          : 'bg-white text-neutral-900 border-white font-bold'
                        : isLight
                        ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                        : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Content (Body content)</label>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type informative English content..."
                style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace" }}
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition-colors resize-none leading-relaxed ${
                  isLight
                    ? 'bg-white border-neutral-300 focus:border-amber-500 text-neutral-900'
                    : 'bg-neutral-950 border-neutral-700/80 focus:border-amber-500 text-neutral-100'
                }`}
              />
            </div>
          </div>

          {/* Column 3: Button Manager with Disabled Support */}
          <DialogueButtonManagerColumn
            isLight={isLight}
            buttons={buttons}
            newButtonLabel={newButtonLabel}
            setNewButtonLabel={setNewButtonLabel}
            newButtonVariant={newButtonVariant}
            setNewButtonVariant={setNewButtonVariant}
            newButtonDisabled={newButtonDisabled}
            setNewButtonDisabled={setNewButtonDisabled}
            slotActions={slotActions}
          />
        </div>
      </div>
    );
  }
);

DialogueSlotControlPanel.displayName = 'DialogueSlotControlPanel';
