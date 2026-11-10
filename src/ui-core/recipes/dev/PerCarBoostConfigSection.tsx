import React from 'react';
import { Play, RotateCcw, Zap } from 'lucide-react';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import { useSettingActionRowStore } from '../../stores/settingRowStore';

export interface PerCarBoostConfig {
  unlimitedBoost: boolean;
  boostCollectable: boolean;
  rechargeBoostEnabled: boolean;
  rechargeBoostPerSecond: number;
  rechargeBoostDelay: number;
}

export const DEFAULT_CAR_BOOST_CFG: PerCarBoostConfig = {
  unlimitedBoost: true,
  boostCollectable: true,
  rechargeBoostEnabled: false,
  rechargeBoostPerSecond: 10.0,
  rechargeBoostDelay: 0.25,
};

export interface PerCarBoostConfigSectionProps {
  selectedCarIdx: number;
  onSelectedCarIdxChange: (idx: number) => void;
  currentCarBoostCfg: PerCarBoostConfig;
  onUpdateCarBoostCfg: (patch: Partial<PerCarBoostConfig>, applyAll?: boolean) => void;
  onHover: (desc: string | null) => void;
  isLight: boolean;
}

export const PerCarBoostConfigSection: React.FC<PerCarBoostConfigSectionProps> = ({
  selectedCarIdx,
  onSelectedCarIdxChange,
  currentCarBoostCfg,
  onUpdateCarBoostCfg,
  onHover,
  isLight,
}) => {
  const { iconSize, iconGap, titleFontSize } = useSettingActionRowStore();

  return (
    <div
      className={`flex flex-col gap-2.5 w-full p-3.5 mt-1.5 rounded-xl border transition-colors select-none ${
        isLight
          ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
          : 'bg-neutral-900/70 border-neutral-800 text-neutral-100'
      }`}
      onMouseEnter={() =>
        onHover(
          'Per-Car Boost Adjustment: Configure unlimited boost (locked at 100, pad collection active, HUD "--"), pad collectability toggle, and RocketSim built-in auto-recharge delay & rate per car (0..7).'
        )
      }
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="flex items-center min-w-0"
        style={{ gap: `${iconGap}px` }}
      >
        <Zap
          className="shrink-0 text-amber-400"
          style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
        />
        <span
          style={{ fontSize: `${titleFontSize}px` }}
          className={`font-semibold truncate ${
            isLight ? 'text-neutral-800' : 'text-neutral-200'
          }`}
        >
          Per-Car Boost Adjustment
        </span>
      </div>

      {/* Car Slot Selector (0..7) */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-500/15">
        <span
          style={{ fontSize: `${titleFontSize}px` }}
          className={`font-semibold ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}
        >
          Target Vehicle Slot (0..7)
        </span>
        <div className="w-72 shrink-0">
          <SegmentedSwitch
            value={String(selectedCarIdx)}
            onValueChange={(v) => onSelectedCarIdxChange(Math.max(0, Math.min(7, Number(v) || 0)))}
            options={[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => ({
              value: String(idx),
              label: `#${idx}`,
            }))}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>
      </div>

      {/* Per-Car Unlimited Boost & Boost Collectable Toggles */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-500/15">
        <div
          onClick={() =>
            onUpdateCarBoostCfg({
              unlimitedBoost: !currentCarBoostCfg.unlimitedBoost,
            })
          }
          onMouseEnter={() =>
            onHover(
              `Unlimited Boost (Car #${selectedCarIdx}): Locks boost tank at 100 while keeping pad collection active; HUD displays "--".`
            )
          }
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-neutral-500/15 cursor-pointer hover:bg-white/[0.04]"
        >
          <span
            style={{ fontSize: `${titleFontSize}px` }}
            className={`font-semibold truncate ${
              isLight ? 'text-neutral-800' : 'text-neutral-200'
            }`}
          >
            Unlimited Boost (Car #{selectedCarIdx})
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <ToggleSwitch
              checked={Boolean(currentCarBoostCfg.unlimitedBoost)}
              onCheckedChange={(v) => onUpdateCarBoostCfg({ unlimitedBoost: v })}
              isLight={isLight}
            />
          </div>
        </div>

        <div
          onClick={() =>
            onUpdateCarBoostCfg({
              boostCollectable: !currentCarBoostCfg.boostCollectable,
            })
          }
          onMouseEnter={() =>
            onHover(
              `Boost Collectable (Car #${selectedCarIdx}): Controls whether Car #${selectedCarIdx} can pick up field boost pads.`
            )
          }
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-neutral-500/15 cursor-pointer hover:bg-white/[0.04]"
        >
          <span
            style={{ fontSize: `${titleFontSize}px` }}
            className={`font-semibold truncate ${
              isLight ? 'text-neutral-800' : 'text-neutral-200'
            }`}
          >
            Boost Collectable (Car #{selectedCarIdx})
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <ToggleSwitch
              checked={Boolean(currentCarBoostCfg.boostCollectable)}
              onCheckedChange={(v) => onUpdateCarBoostCfg({ boostCollectable: v })}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* Per-Car Auto-Recharge Toggle & Developer-Editable Sliders */}
      <div className="flex flex-col gap-1 pt-2 border-t border-neutral-500/15">
        <div
          onClick={() =>
            onUpdateCarBoostCfg({
              rechargeBoostEnabled: !currentCarBoostCfg.rechargeBoostEnabled,
            })
          }
          onMouseEnter={() =>
            onHover(
              `Auto-Recharge Boost (Car #${selectedCarIdx}): Automatically refills boost in Limited mode after non-boosting delay.`
            )
          }
          className="flex items-center justify-between py-1.5 cursor-pointer"
        >
          <span
            style={{ fontSize: `${titleFontSize}px` }}
            className={`font-semibold ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}
          >
            Auto-Recharge Boost (Car #{selectedCarIdx})
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <ToggleSwitch
              checked={Boolean(currentCarBoostCfg.rechargeBoostEnabled)}
              onCheckedChange={(v) => onUpdateCarBoostCfg({ rechargeBoostEnabled: v })}
              isLight={isLight}
            />
          </div>
        </div>

        <SettingSliderRow
          label="Recharge Per Second"
          title="Recharge Per Second"
          value={currentCarBoostCfg.rechargeBoostPerSecond}
          min={1}
          max={100}
          step={1}
          unit=" /s"
          developerMode={true}
          editable={true}
          layout="inline"
          bordered={false}
          showDescription={false}
          paddingX={0}
          onChange={(val) => onUpdateCarBoostCfg({ rechargeBoostPerSecond: val })}
          hoverDescription="Boost auto-recharge rate per second (1 to 100 /s). Type a number and press Enter to confirm."
          onHover={(desc) => desc && onHover(desc)}
          onLeave={() => onHover(null)}
          isLight={isLight}
        />

        <SettingSliderRow
          label="Recharge Delay"
          title="Recharge Delay"
          value={currentCarBoostCfg.rechargeBoostDelay}
          min={0}
          max={5}
          step={0.05}
          unit=" s"
          developerMode={true}
          editable={true}
          layout="inline"
          bordered={false}
          showDescription={false}
          paddingX={0}
          onChange={(val) => onUpdateCarBoostCfg({ rechargeBoostDelay: val })}
          hoverDescription="Non-boosting cooldown delay before auto-recharge begins (0.00 to 5.00 s). Type a number and press Enter to confirm."
          onHover={(desc) => desc && onHover(desc)}
          onLeave={() => onHover(null)}
          isLight={isLight}
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-neutral-500/15 text-[11px]">
        <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
          Rate: {Number(currentCarBoostCfg.rechargeBoostPerSecond).toFixed(1)}/s · Delay: {Number(currentCarBoostCfg.rechargeBoostDelay).toFixed(2)}s · Collectable: {currentCarBoostCfg.boostCollectable ? 'ON' : 'OFF'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdateCarBoostCfg(DEFAULT_CAR_BOOST_CFG, false)}
            className={`py-1 px-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
              isLight ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800' : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Car #{selectedCarIdx}</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateCarBoostCfg(currentCarBoostCfg, true)}
            className={`py-1 px-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
              isLight ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-white' : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
            }`}
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Apply to All Cars (0..7)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
