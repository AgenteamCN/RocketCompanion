import React from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { ThumbsDown, MinusCircle, Ban, Hand, Plus, X } from 'lucide-react';
import type {
  QuickNotificationButtonConfig,
  QuickNotificationButtonVariant,
  QuickNotificationButtonFormat,
} from '../../../ui-core/compounds/QuickNotification';

const useState = createScopedSyncedState('page:quick-notification-btn-builder');

const BUTTON_COLOR_SWATCHES: {
  key: QuickNotificationButtonVariant;
  label: string;
  dotClass: string;
}[] = [
  { key: 'green', label: 'green (Accept)', dotClass: 'bg-emerald-500' },
  { key: 'red', label: 'red (Reject)', dotClass: 'bg-red-500' },
  { key: 'amber', label: 'Amber (Retry)', dotClass: 'bg-amber-500' },
  { key: 'neutral', label: 'Neutral Monochrome', dotClass: 'bg-neutral-900 dark:bg-neutral-100' },
  { key: 'sky', label: 'Classic Blue', dotClass: 'bg-sky-500' },
  { key: 'purple', label: 'Special Purple', dotClass: 'bg-purple-500' },
];

const REJECT_ICON_OPTIONS = [
  { key: 'thumbs-down', label: 'Thumbs Down (recommended)', icon: <ThumbsDown className="h-3 w-3" /> },
  { key: 'minus-circle', label: 'Minus Circle', icon: <MinusCircle className="h-3 w-3" /> },
  { key: 'ban', label: 'Ban Circle', icon: <Ban className="h-3 w-3" /> },
  { key: 'hand', label: 'Hand Stop', icon: <Hand className="h-3 w-3" /> },
];

export interface QuickNotificationButtonsBuilderSectionProps {
  isLight: boolean;
  buttons: QuickNotificationButtonConfig[];
  setButtons: React.Dispatch<React.SetStateAction<QuickNotificationButtonConfig[]>>;
}

export const QuickNotificationButtonsBuilderSection: React.FC<
  QuickNotificationButtonsBuilderSectionProps
> = ({ isLight, buttons, setButtons }) => {
  const [newBtnLabel, setNewBtnLabel] = useState<string>('Retry', 'newBtnLabel');
  const [newBtnIcon, setNewBtnIcon] = useState<string>('rotate-ccw', 'newBtnIcon');
  const [newBtnFormat, setNewBtnFormat] = useState<QuickNotificationButtonFormat>('icon-text', 'newBtnFormat');
  const [newBtnColor, setNewBtnColor] = useState<QuickNotificationButtonVariant>('amber', 'newBtnColor');

  const handleAddButton = () => {
    const trimmed = newBtnLabel.trim();
    const btn: QuickNotificationButtonConfig = {
      key: `btn-${Date.now()}`,
      label: trimmed || undefined,
      icon: newBtnIcon.trim() || undefined,
      format: newBtnFormat,
      color: newBtnColor,
    };
    setButtons((prev) => [...prev, btn]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
      <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
        <span>5. Action button (Business Buttons Slot)</span>
        <span className="text-[11px] text-neutral-400 lowercase font-normal">
          {buttons.length} Configurations · Exclude from unread count after trigger
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-neutral-500">Quick Presets:</span>
        <button
          type="button"
          onClick={() =>
            setButtons([
              { key: 'accept', label: 'Accept', icon: 'check', format: 'icon-text', color: 'green' },
              { key: 'reject', label: 'Reject', icon: 'thumbs-down', format: 'icon-only', color: 'red' },
            ])
          }
          className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/60 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
        >
          Accept(green) + Reject(red ThumbsDown)
        </button>
        <button
          type="button"
          onClick={() =>
            setButtons([
              { key: 'accept', label: 'Accept', icon: 'check', format: 'icon-text', color: 'green' },
            ])
          }
          className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/60 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
        >
          Single Button: Accept
        </button>
        <button
          type="button"
          onClick={() =>
            setButtons([
              { key: 'retry', label: 'Retry', icon: 'rotate-ccw', format: 'icon-text', color: 'amber' },
            ])
          }
          className="px-2 py-0.5 rounded text-[11px] bg-neutral-200/60 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
        >
          Retry(Orange RotateCcw)
        </button>
        <button
          type="button"
          onClick={() => setButtons([])}
          className="px-2 py-0.5 rounded text-[11px] text-red-500 bg-red-100/40 dark:bg-red-950/40 hover:bg-red-100 cursor-pointer"
        >
          Clear Button
        </button>
      </div>

      {buttons.length > 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40">
          {buttons.map((b, idx) => (
            <div
              key={b.key || idx}
              className="flex items-center justify-between gap-2 p-2 rounded-lg border border-neutral-200 dark:border-neutral-750 bg-white dark:bg-neutral-850"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    BUTTON_COLOR_SWATCHES.find((c) => c.key === b.color)?.dotClass || 'bg-neutral-400'
                  }`}
                />
                <span className="font-bold text-xs">{b.label || '(No Text)'}</span>
                <span className="text-[10px] text-neutral-400 font-mono">[{b.format}]</span>
                <span className="text-[10px] text-neutral-500 font-mono">{b.icon}</span>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveButton(idx)}
                title="Delete Button"
                className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 flex flex-col gap-2.5 bg-neutral-50/30 dark:bg-neutral-900/20">
        <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400">
          <span>Add new business button</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 w-12">text:</span>
            <input
              type="text"
              value={newBtnLabel}
              onChange={(e) => setNewBtnLabel(e.target.value)}
              placeholder="Button Label"
              className="flex-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 w-12">Icon name:</span>
            <input
              type="text"
              value={newBtnIcon}
              onChange={(e) => setNewBtnIcon(e.target.value)}
              placeholder="check, thumbs-down..."
              className="flex-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400 w-12">Display Mode:</span>
          <div className="flex items-center gap-1.5 flex-1">
            {(['icon-text', 'icon-only', 'text-only'] as QuickNotificationButtonFormat[]).map(
              (fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setNewBtnFormat(fmt)}
                  className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                    newBtnFormat === fmt
                      ? isLight
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-950 border-white'
                      : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {fmt === 'icon-text' ? 'icon+text' : fmt === 'icon-only' ? 'Icon Only' : 'Text Only'}
                </button>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400 w-12">Color Palette:</span>
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {BUTTON_COLOR_SWATCHES.map((sw) => (
              <button
                key={sw.key}
                type="button"
                onClick={() => setNewBtnColor(sw.key)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border cursor-pointer transition-all ${
                  newBtnColor === sw.key
                    ? 'border-neutral-900 dark:border-white font-bold ring-1 ring-neutral-400'
                    : 'border-neutral-300 dark:border-neutral-700 opacity-70 hover:opacity-100'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${sw.dotClass}`} />
                <span>{sw.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 text-[10px] text-neutral-400">
          <span>Recommended Reject Icon:</span>
          {REJECT_ICON_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setNewBtnIcon(opt.key);
                setNewBtnLabel('Reject');
                setNewBtnColor('red');
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-200/50 dark:bg-neutral-800 hover:bg-neutral-300 cursor-pointer"
            >
              {opt.icon}
              <span>{opt.key}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleAddButton}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add to Notifications</span>
          </button>
        </div>
      </div>
    </div>
  );
};
