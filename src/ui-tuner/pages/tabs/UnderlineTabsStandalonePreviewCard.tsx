import React, { useState } from 'react';
import {
  Sparkles,
  Gamepad2,
  Volume2,
  Monitor,
  Sliders,
  Terminal,
  Car,
  Palette,
  Music,
  CloudSync,
} from 'lucide-react';
import { UnderlineTabs, TabItem } from '../../../ui-core/primitives/UnderlineTabs';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  useUnderlineTabsStore,
  type UnderlineTabsFontFamily,
  type UnderlineTabsFontWeight,
} from '../../../ui-core/stores/underlineTabsStore';

export interface UnderlineTabsPresetAndTypographyBarProps {
  isLight: boolean;
}

const FONT_WEIGHT_OPTIONS: { value: UnderlineTabsFontWeight; label: string }[] = [
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'SemiBold (600)' },
  { value: '700', label: 'Bold (700)' },
];

export const UnderlineTabsPresetAndTypographyBar: React.FC<
  UnderlineTabsPresetAndTypographyBarProps
> = ({ isLight }) => {
  const {
    fontSize,
    iconSize,
    showIcons,
    fullWidth,
    fontFamily,
    activeFontWeight,
    setToken,
    updateTokens,
  } = useUnderlineTabsStore();

  const applyPreset = (
    preset: 'standard-balanced' | 'large-18px-match' | 'compact-dense' | 'text-only'
  ) => {
    if (preset === 'standard-balanced') {
      updateTokens({
        fontSize: 14,
        iconSize: 16,
        iconGap: 7,
        paddingX: 12,
        paddingY: 8,
        indicatorHeight: 2,
        showIcons: true,
        fullWidth: true,
        fontFamily: 'sans',
        activeFontWeight: '600',
        inactiveFontWeight: '500',
      });
    } else if (preset === 'large-18px-match') {
      updateTokens({
        fontSize: 16,
        iconSize: 20,
        iconGap: 9,
        paddingX: 12,
        paddingY: 9,
        indicatorHeight: 2,
        showIcons: true,
        fullWidth: true,
        fontFamily: 'sans',
        activeFontWeight: '600',
        inactiveFontWeight: '500',
      });
    } else if (preset === 'compact-dense') {
      updateTokens({
        fontSize: 12,
        iconSize: 14,
        iconGap: 6,
        paddingX: 10,
        paddingY: 6,
        indicatorHeight: 2,
        showIcons: true,
        fullWidth: true,
        fontFamily: 'sans',
        activeFontWeight: '600',
        inactiveFontWeight: '500',
      });
    } else if (preset === 'text-only') {
      updateTokens({
        fontSize: 15,
        iconSize: 16,
        iconGap: 6,
        paddingX: 12,
        paddingY: 8,
        indicatorHeight: 2,
        showIcons: false,
        fullWidth: true,
      });
    }
  };

  return (
    <div
      className={`p-3.5 rounded-xl border flex flex-col gap-3 ${
        isLight
          ? 'bg-neutral-50/80 border-neutral-200/80'
          : 'bg-neutral-950/50 border-neutral-800/80'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-neutral-400 flex items-center gap-1 font-semibold">
            <Sparkles className="h-3 w-3 text-amber-500" /> One-click shape preset:
          </span>
          <button
            type="button"
            onClick={() => applyPreset('standard-balanced')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
              showIcons && fontSize === 14 && iconSize === 16
                ? 'bg-amber-500 text-white border-amber-500'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            1. Standard Balanced (14px font size + 16px icon)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('large-18px-match')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
              showIcons && fontSize >= 16 && iconSize >= 20
                ? 'bg-amber-500 text-white border-amber-500'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            2. Match 18px Large Font Row (16px font size + 20px icon)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('compact-dense')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
              showIcons && fontSize <= 12
                ? 'bg-amber-500 text-white border-amber-500'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            3. Compact High Density (12px font size + 14px icon)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('text-only')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
              !showIcons
                ? 'bg-amber-500 text-white border-amber-500'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            4. Text Only (showIcons=false)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex items-center gap-5 flex-wrap">
          <ToggleSwitch
            checked={showIcons}
            onCheckedChange={(v) => setToken('showIcons', v)}
            label="Show Left of Label SVG icon (showIcons)"
            variant="neutral"
            isLight={isLight}
          />
          <ToggleSwitch
            checked={fullWidth}
            onCheckedChange={(v) => setToken('fullWidth', v)}
            label="Full-width equidistant distribution (fullWidth)"
            variant="neutral"
            isLight={isLight}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-neutral-400">Font Family:</span>
            {(
              [
                { id: 'sans', label: 'Inter Sans' },
                { id: 'mono', label: 'JetBrains Mono' },
              ] as { id: UnderlineTabsFontFamily; label: string }[]
            ).map((f) => {
              const active = fontFamily === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setToken('fontFamily', f.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono border cursor-pointer transition-all ${
                    active
                      ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                      : isLight
                      ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-neutral-400">Active Font Weight:</span>
            {FONT_WEIGHT_OPTIONS.map((w) => {
              const active = activeFontWeight === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setToken('activeFontWeight', w.value)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono border cursor-pointer transition-all ${
                    active
                      ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                      : isLight
                      ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface UnderlineTabsStandalonePreviewCardProps {
  isLight: boolean;
}

const SETTINGS_DEMO_TABS: TabItem[] = [
  { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 className="h-4 w-4" /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 className="h-4 w-4" /> },
  { id: 'display', label: 'Display', icon: <Monitor className="h-4 w-4" /> },
  { id: 'advanced', label: 'Advanced', icon: <Sliders className="h-4 w-4" /> },
  { id: 'developer', label: 'Developer', icon: <Terminal className="h-4 w-4" /> },
];

const GARAGE_DEMO_TABS: TabItem[] = [
  { id: 'car', label: 'Car', icon: <Car className="h-4 w-4" /> },
  { id: 'paint', label: 'Paint', icon: <Palette className="h-4 w-4" /> },
  { id: 'loadout', label: 'Loadout', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'anthem', label: 'Anthem', icon: <Music className="h-4 w-4" /> },
  { id: 'sync', label: 'Sync', icon: <CloudSync className="h-4 w-4" /> },
];

export const UnderlineTabsStandalonePreviewCard: React.FC<
  UnderlineTabsStandalonePreviewCardProps
> = ({ isLight }) => {
  const [previewSettingsTab, setPreviewSettingsTab] = useState('gameplay');
  const [previewGarageTab, setPreviewGarageTab] = useState('car');

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-neutral-100/60 border-neutral-200/80'
          : 'bg-neutral-950/70 border-neutral-800'
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="font-bold text-amber-500">
            live preview A · Settings Panel Header Label (Gameplay / Audio / Display / Advanced / Developer)
          </span>
          <span className="text-neutral-400">active: {previewSettingsTab}</span>
        </div>
        <UnderlineTabs
          items={SETTINGS_DEMO_TABS}
          activeId={previewSettingsTab}
          onChange={setPreviewSettingsTab}
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="font-bold text-sky-400">
            live preview B · Garage Garage Header Label (Car / Colour / Materials / Anthem / Sync)
          </span>
          <span className="text-neutral-400">active: {previewGarageTab}</span>
        </div>
        <UnderlineTabs
          items={GARAGE_DEMO_TABS}
          activeId={previewGarageTab}
          onChange={setPreviewGarageTab}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
