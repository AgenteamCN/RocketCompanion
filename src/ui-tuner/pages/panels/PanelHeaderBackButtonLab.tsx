import React from 'react';
import { Sparkles } from 'lucide-react';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import {
  resolvePanelHeaderBackBtnGeometry,
  type PanelHeaderBackBtnIdleTone,
  type PanelHeaderBackBtnRadiusMode,
  type PanelHeaderBackBtnStyle,
  type PanelHeaderRightBtnTransform,
} from '../../../ui-core/tokens/menuLayoutTokens';
import { PanelHeaderCornerRadiusSliders } from './PanelHeaderCornerRadiusSliders';

export interface PanelHeaderBackButtonLabProps {
  isLight: boolean;
  onTemplateTokenChange?: () => void;
}

export const PanelHeaderBackButtonLab: React.FC<PanelHeaderBackButtonLabProps> = React.memo(
  ({ isLight, onTemplateTokenChange }) => {
    const {
      panelHeaderPaddingX,
      panelHeaderPaddingY,
      panelHeaderBackBtnWidth,
      panelHeaderBackBtnHeight,
      panelHeaderBackBtnIdleTone,
      panelHeaderBackBtnStyle,
      panelHeaderBackBtnRadiusMode,
      panelHeaderBackBtnRadius,
      panelHeaderBackBtnInnerRadius,
      panelHeaderBackBtnRadiusTL,
      panelHeaderBackBtnRadiusTR,
      panelHeaderBackBtnRadiusBR,
      panelHeaderBackBtnRadiusBL,
      panelHeaderShowRightBtn,
      panelHeaderRightBtnTransform,
      panelHeaderRightBtnExpandOnHover,
      panelOuterRadius,
      setToken,
      updateTokens,
    } = useMenuLayoutStore();

    const btnGeom = resolvePanelHeaderBackBtnGeometry({
      panelHeaderPaddingX,
      panelHeaderPaddingY,
      panelHeaderBackBtnWidth,
      panelHeaderBackBtnHeight,
      panelHeaderBackBtnRadiusMode,
      panelHeaderBackBtnRadius,
      panelHeaderBackBtnInnerRadius,
      panelHeaderBackBtnRadiusTL,
      panelHeaderBackBtnRadiusTR,
      panelHeaderBackBtnRadiusBR,
      panelHeaderBackBtnRadiusBL,
      panelOuterRadius,
    });

    const applyBackBtnPreset = (
      preset:
        | 'flush-divider'
        | 'asymmetric-rect'
        | 'apple-compact-rect'
        | 'concentric-square'
        | 'subtle-ghost'
    ) => {
      if (preset === 'flush-divider') {
        updateTokens({
          lockPanelHeaderBackBtnAspect: false,
          panelHeaderPaddingX: 0,
          panelHeaderPaddingY: 0,
          panelHeaderBackBtnWidth: 42,
          panelHeaderBackBtnHeight: 32,
          panelHeaderGap: 10,
          panelHeaderBackBtnRadiusMode: 'asymmetric-tl',
          panelHeaderBackBtnInnerRadius: 0,
          panelHeaderBackBtnStyle: 'surface',
        });
      } else if (preset === 'asymmetric-rect') {
        updateTokens({
          lockPanelHeaderBackBtnAspect: false,
          panelHeaderPaddingX: 6,
          panelHeaderPaddingY: 6,
          panelHeaderBackBtnWidth: 30,
          panelHeaderBackBtnHeight: 26,
          panelHeaderGap: 6,
          panelHeaderBackBtnRadiusMode: 'asymmetric-tl',
          panelHeaderBackBtnInnerRadius: 6,
          panelHeaderBackBtnStyle: 'surface',
        });
      } else if (preset === 'apple-compact-rect') {
        updateTokens({
          lockPanelHeaderBackBtnAspect: false,
          panelHeaderPaddingX: 6,
          panelHeaderPaddingY: 6,
          panelHeaderBackBtnWidth: 30,
          panelHeaderBackBtnHeight: 24,
          panelHeaderGap: 6,
          panelHeaderBackBtnRadiusMode: 'custom',
          panelHeaderBackBtnRadius: 7,
          panelHeaderBackBtnStyle: 'surface',
        });
      } else if (preset === 'concentric-square') {
        updateTokens({
          lockPanelHeaderBackBtnAspect: true,
          panelHeaderPaddingX: 6,
          panelHeaderPaddingY: 6,
          panelHeaderBackBtnWidth: 26,
          panelHeaderBackBtnHeight: 26,
          panelHeaderGap: 6,
          panelHeaderBackBtnRadiusMode: 'auto',
          panelHeaderBackBtnStyle: 'surface',
        });
      } else if (preset === 'subtle-ghost') {
        updateTokens({
          lockPanelHeaderBackBtnAspect: false,
          panelHeaderPaddingX: 6,
          panelHeaderPaddingY: 6,
          panelHeaderBackBtnWidth: 28,
          panelHeaderBackBtnHeight: 24,
          panelHeaderGap: 6,
          panelHeaderBackBtnRadiusMode: 'asymmetric-tl',
          panelHeaderBackBtnInnerRadius: 6,
          panelHeaderBackBtnStyle: 'subtle',
        });
      }
      onTemplateTokenChange?.();
    };

    return (
      <div
        className={`p-4 rounded-xl border flex flex-col gap-3.5 ${
          isLight
            ? 'bg-neutral-50/80 border-neutral-200/80'
            : 'bg-neutral-950/40 border-neutral-800/80'
        }`}
      >
        {/* Row 1: Semantic Idle Tone + Border/Surface Style Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold">
              Default background color and border texture for top bar buttons (Idle Tone &amp; Border
              Style)
            </span>
            <span className={`text-[11px] font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              L: <strong className="text-amber-500">{btnGeom.borderRadiusCss}</strong> · R:{' '}
              <strong className="text-sky-500">{btnGeom.rightBorderRadiusCss}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedSwitch
              size="sm"
              isLight={isLight}
              value={panelHeaderBackBtnIdleTone}
              onValueChange={(val) => {
                setToken('panelHeaderBackBtnIdleTone', val as PanelHeaderBackBtnIdleTone);
                onTemplateTokenChange?.();
              }}
              options={[
                { value: 'match-header', label: 'Match top bar color (Match Header)' },
                { value: 'muted-gray', label: 'Default dark gray (Muted Gray)' },
                { value: 'elevated', label: 'Raised light background (Elevated)' },
              ]}
            />
            <SegmentedSwitch
              size="sm"
              isLight={isLight}
              value={panelHeaderBackBtnStyle}
              onValueChange={(val) => {
                setToken('panelHeaderBackBtnStyle', val as PanelHeaderBackBtnStyle);
                onTemplateTokenChange?.();
              }}
              options={[
                { value: 'surface', label: 'Surface Border' },
                { value: 'subtle', label: 'Subtle Borderless' },
                { value: 'ghost', label: 'Ghost Floating' },
              ]}
            />
          </div>
        </div>

        {/* Row 1.5: Top-Right Minimize-2 Action Button Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <div className="flex items-center gap-3 flex-wrap">
            <ToggleSwitch
              checked={panelHeaderShowRightBtn}
              onCheckedChange={(v) => {
                setToken('panelHeaderShowRightBtn', v);
                onTemplateTokenChange?.();
              }}
              label="Enable top-right icon button (Minimize-2 / Custom Icon)"
              variant="neutral"
              isLight={isLight}
            />
            <ToggleSwitch
              checked={panelHeaderRightBtnExpandOnHover}
              onCheckedChange={(v) => {
                setToken('panelHeaderRightBtnExpandOnHover', v);
                onTemplateTokenChange?.();
              }}
              label="Hover expand Live Preview Text"
              variant="neutral"
              isLight={isLight}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-400">Top-right icon orientation:</span>
            <SegmentedSwitch
              size="sm"
              isLight={isLight}
              value={panelHeaderRightBtnTransform}
              onValueChange={(val) => {
                setToken('panelHeaderRightBtnTransform', val as PanelHeaderRightBtnTransform);
                onTemplateTokenChange?.();
              }}
              options={[
                { value: 'flip-x', label: 'Flip Horizontal (Flip X)' },
                { value: 'rotate-90', label: 'Rotate 90° (Rotate 90°)' },
                { value: 'none', label: 'Original Orientation (None)' },
              ]}
            />
          </div>
        </div>

        {/* Row 2: 4-Mode Corner Strategy Switcher + Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <SegmentedSwitch
            size="sm"
            isLight={isLight}
            value={panelHeaderBackBtnRadiusMode}
            onValueChange={(val) => {
              setToken('panelHeaderBackBtnRadiusMode', val as PanelHeaderBackBtnRadiusMode);
              onTemplateTokenChange?.();
            }}
            options={[
              {
                value: 'asymmetric-tl',
                label: `concentric outer corner+Tri-Corner Convergence (${btnGeom.concentricRadius}/${btnGeom.innerRadius}px)`,
              },
              {
                value: 'auto',
                label: `Quad-Corner Concentric (${btnGeom.concentricRadius}px)`,
              },
              {
                value: 'custom',
                label: `Uniform manual corners (${panelHeaderBackBtnRadius}px)`,
              },
              {
                value: 'per-corner',
                label: 'Four corners fully independent (TL/TR/BR/BL)',
              },
            ]}
          />

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Recommended Preset:
            </span>
            <button
              type="button"
              onClick={() => applyBackBtnPreset('flush-divider')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="0×0 Full Height Edge + 42×32px Keep only inner single divider + concentric outer corner 16/0/0/0"
            >
              1. Edge Divider (42×32 · Pad 0 · 16/0/0/0)
            </button>
            <button
              type="button"
              onClick={() => applyBackBtnPreset('asymmetric-rect')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="30×26px Wide Rect + Outer corner adaptive concentric(10px) + Remaining Three Corners 6px Small Radius"
            >
              2. Outer corner concentric wide (30×26 · 10/6/6/6)
            </button>
            <button
              type="button"
              onClick={() => applyBackBtnPreset('apple-compact-rect')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Apple macOS Toolbar Style: 30×24px Compact Wide Rectangle + 7px Uniform Corner Radius"
            >
              3. macOS Compact Wide Rectangle (30×24 · R=7)
            </button>
            <button
              type="button"
              onClick={() => applyBackBtnPreset('subtle-ghost')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Borderless translucent base + Outer corner concentric inset, Reduce expansion effect of rounded corners on static borders"
            >
              4. Translucent Frameless Inset (28×24 · Subtle)
            </button>
          </div>
        </div>

        {/* Row 3: Dynamic Radius Sliders based on active mode */}
        <PanelHeaderCornerRadiusSliders
          isLight={isLight}
          onTemplateTokenChange={onTemplateTokenChange}
        />
      </div>
    );
  }
);

PanelHeaderBackButtonLab.displayName = 'PanelHeaderBackButtonLab';
