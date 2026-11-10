import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { CodeBlock } from '../../CodeBlock';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';

export interface PanelShellStageThreeFooterSectionProps {
  isLight: boolean;
  showCode: boolean;
  onTemplateTokenChange?: () => void;
}

export const PanelShellStageThreeFooterSection: React.FC<PanelShellStageThreeFooterSectionProps> = ({
  isLight,
  showCode,
  onTemplateTokenChange,
}) => {
  const {
    panelBodyPaddingX,
    panelBodyPaddingY,
    panelFooterPaddingX,
    panelFooterPaddingY,
    panelFooterFontSize,
    panelFooterSplitRight,
    panelFooterRightDivider,
    panelFooterRightPaddingX,
    setToken,
    updateTokens,
    exportPanelShellConfigCode,
  } = useMenuLayoutStore();

  return (
    <>
      {/* Stage 2: Menu Content Container */}
      <div className="flex flex-col gap-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/80">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
          Variant A · Stage 2 Content Container Middle Content Area &amp; Tabs Padding
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SliderControl
            label="Content horizontal padding (bodyPadX)"
            value={panelBodyPaddingX}
            min={0}
            max={36}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => {
              setToken('panelBodyPaddingX', v);
              onTemplateTokenChange?.();
            }}
            isLight={isLight}
          />
          <SliderControl
            label="Content vertical padding (bodyPadY)"
            value={panelBodyPaddingY}
            min={0}
            max={32}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => {
              setToken('panelBodyPaddingY', v);
              onTemplateTokenChange?.();
            }}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Stage 3: Split Footer */}
      <div className="flex flex-col gap-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500">
              Stage 3 · Footer Bottom bar and content padding (Left Description + Right Ability Slot)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  updateTokens({
                    panelFooterPaddingX: panelBodyPaddingX,
                    panelFooterPaddingY: 6,
                  })
                }
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
                title="Move Footer Left/right padding alignment Content Body Margin, And Use 6px Compact Vertical Padding"
              >
                Align Body ({panelBodyPaddingX}×6px)
              </button>
              <button
                type="button"
                onClick={() =>
                  updateTokens({
                    panelFooterPaddingX: 12,
                    panelFooterPaddingY: 4,
                  })
                }
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
                title="Compact bottom bar liner (12×4px)"
              >
                Compact Bottom Bar (12×4px)
              </button>
              <button
                type="button"
                onClick={() =>
                  updateTokens({
                    panelFooterPaddingX: 0,
                    panelFooterPaddingY: 0,
                  })
                }
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
                title="Fully edge-aligned zero (0×0px)"
              >
                Edge Zero (0×0px)
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <ToggleSwitch
              checked={panelFooterSplitRight}
              onCheckedChange={(v) => setToken('panelFooterSplitRight', v)}
              label="Split Right Slot (Split Right)"
              variant="neutral"
              isLight={isLight}
            />
            <ToggleSwitch
              checked={panelFooterRightDivider}
              onCheckedChange={(v) => setToken('panelFooterRightDivider', v)}
              label="Right Divider (Divider)"
              variant="neutral"
              isLight={isLight}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SliderControl
            label="Footer font size (footerFontSize)"
            value={panelFooterFontSize}
            min={8}
            max={18}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('panelFooterFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer Content horizontal padding (footerPadX)"
            value={panelFooterPaddingX}
            min={0}
            max={36}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => setToken('panelFooterPaddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer Bottom Bar Vertical Padding (footerPadY)"
            value={panelFooterPaddingY}
            min={0}
            max={24}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => setToken('panelFooterPaddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Right slot horizontal padding (footerRightPadX)"
            value={panelFooterRightPaddingX}
            min={0}
            max={32}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => setToken('panelFooterRightPaddingX', v)}
            isLight={isLight}
          />
        </div>
      </div>

      {showCode && (
        <CodeBlock
          isLight={isLight}
          title="src/ui-core/stores/menuLayoutStore.ts (DEFAULT_PANEL_SHELL_TOKENS)"
          code={exportPanelShellConfigCode()}
        />
      )}
    </>
  );
};
