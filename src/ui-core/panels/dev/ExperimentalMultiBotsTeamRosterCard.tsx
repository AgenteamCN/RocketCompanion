import React from 'react';
import { Plus, Trash2, Eye, UserCheck } from 'lucide-react';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import {
  EXP_CAR_COLOR_PALETTE,
  EXP_BOT_POLICY_METAS,
  BOTPACK_9700488_POLICY_METAS,
  getExpBotPolicyMeta,
  getExpColorSwatch,
  type ExpBotPolicyId,
  type ExperimentalMultiBotsSlotConfig,
} from '../../stores/experimentalMultiBotsRosterUtils';
import { KeycapBadge } from '../../primitives/KeycapBadge';

export const BOT_POLICY_OPTIONS: { value: ExpBotPolicyId; label: string }[] =
  EXP_BOT_POLICY_METAS.map((m) => ({ value: m.id, label: m.label }));

const LEGACY_POLICY_METAS = EXP_BOT_POLICY_METAS.filter((m) => m.category === 'legacy');

export interface ExperimentalMultiBotsSlotRowProps {
  slot: ExperimentalMultiBotsSlotConfig;
  slotIndex: number;
  globalCarIdx: number;
  allowBotpackPolicies?: boolean;
  isLight: boolean;
  subPanelBg: string;
  mutedText: string;
  onHoverDesc?: (desc: string | null) => void;
}

export const ExperimentalMultiBotsSlotRow: React.FC<ExperimentalMultiBotsSlotRowProps> = ({
  slot,
  slotIndex,
  globalCarIdx,
  allowBotpackPolicies = false,
  isLight,
  subPanelBg,
  mutedText,
  onHoverDesc,
}) => {
  const activeCameraCarIndex = useExperimentalMultiBotsStore(
    (s) => s.activeCameraCarIndex
  );
  const totalCars = useExperimentalMultiBotsStore(
    (s) => s.blueSlots.length + s.orangeSlots.length
  );
  const onSelectCameraCar = useExperimentalMultiBotsStore(
    (s) => s.setActiveCameraCarIndex
  );
  const onSetSlotBotType = useExperimentalMultiBotsStore(
    (s) => s.setSlotBotType
  );
  const onRemoveSlot = useExperimentalMultiBotsStore(
    (s) => s.removeSlotFromTeam
  );
  const onSetSlotColor = useExperimentalMultiBotsStore((s) => s.setSlotColor);

  const keyNum = globalCarIdx + 1;
  const swatch = getExpColorSwatch(slot.colorSlot);
  const isCamActive = activeCameraCarIndex === globalCarIdx;
  const policyMeta = getExpBotPolicyMeta(slot.botType);

  return (
    <div
      className={`p-2 rounded-lg border flex flex-col gap-1.5 transition-colors ${
        isCamActive ? 'bg-sky-500/10 border-sky-500/40' : subPanelBg
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => onSelectCameraCar(globalCarIdx)}
            onMouseEnter={() =>
              onHoverDesc?.(`Switch Camera POV to Car #${keyNum} (Shortcut Key ${keyNum})`)
            }
            onMouseLeave={() => onHoverDesc?.(null)}
            title={`Switch Camera POV to Car #${keyNum} (Shortcut Key ${keyNum})`}
            className="flex items-center gap-1 cursor-pointer"
          >
            <KeycapBadge label={String(keyNum)} size="sm" isLight={isLight} />
          </button>
          <span
            className="h-3 w-3 rounded-full shrink-0 border border-black/20"
            style={{ backgroundColor: swatch.hex }}
            title={`Color: ${swatch.name} (${swatch.hex})`}
          />
          {slot.isPlayer ? (
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 truncate">
              <UserCheck className="h-3 w-3 shrink-0" />
              <span>HUMAN PLAYER</span>
            </span>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <select
                aria-label={`Slot #${keyNum} Bot Policy`}
                value={slot.botType}
                onChange={(e) =>
                  onSetSlotBotType(slot.team, slotIndex, e.target.value as ExpBotPolicyId)
                }
                onMouseEnter={() =>
                  onHoverDesc?.(
                    `Select AI policy for Car #${keyNum} (currently ${policyMeta.label} · ${policyMeta.formatBadge}).`
                  )
                }
                onMouseLeave={() => onHoverDesc?.(null)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer outline-none ${
                  slot.team === 0
                    ? 'bg-sky-500/20 border-sky-400/70 text-sky-300'
                    : 'bg-orange-500/20 border-orange-400/70 text-orange-300'
                }`}
              >
                {allowBotpackPolicies ? (
                  <>
                    <optgroup label="Botpack #9700488 (8 New)">
                      {BOTPACK_9700488_POLICY_METAS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.formatBadge})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Core Policies">
                      {LEGACY_POLICY_METAS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  LEGACY_POLICY_METAS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))
                )}
              </select>
              <span
                className={`px-1 py-0.5 rounded text-[9px] font-mono border shrink-0 ${
                  isLight
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
              >
                {policyMeta.formatBadge}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSelectCameraCar(globalCarIdx)}
            onMouseEnter={() => onHoverDesc?.(`Spectate Car #${keyNum} camera POV.`)}
            onMouseLeave={() => onHoverDesc?.(null)}
            title={`Spectate Car #${keyNum}`}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 cursor-pointer transition-colors ${
              isCamActive
                ? 'bg-sky-500/25 border-sky-400 text-sky-300 font-bold'
                : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-600'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-400'
            }`}
          >
            <Eye className="h-2.5 w-2.5" />
            <span>POV</span>
          </button>
          <button
            type="button"
            disabled={totalCars <= 1}
            onClick={() => onRemoveSlot(slot.team, slotIndex)}
            onMouseEnter={() => onHoverDesc?.('Remove this car slot from the team roster.')}
            onMouseLeave={() => onHoverDesc?.(null)}
            title="Remove slot from team"
            className={`p-1 rounded border transition-colors ${
              totalCars <= 1
                ? 'opacity-30 cursor-not-allowed border-transparent text-neutral-500'
                : 'hover:bg-red-500/20 border-transparent hover:border-red-500/40 text-red-400 cursor-pointer'
            }`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 6-Color Swatch Selector Row */}
      <div className="flex items-center justify-between pt-1 border-t border-neutral-700/25">
        <span className={`text-[10px] font-mono ${mutedText}`}>
          Color Card: <strong style={{ color: swatch.hex }}>{swatch.name}</strong>
        </span>
        <div className="flex items-center gap-1">
          {EXP_CAR_COLOR_PALETTE.map((c) => {
            const isSelected = slot.colorSlot === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSetSlotColor(slot.team, slotIndex, c.id)}
                onMouseEnter={() =>
                  onHoverDesc?.(`Assign ${c.name} (${c.hex}) color swatch to Car #${keyNum}.`)
                }
                onMouseLeave={() => onHoverDesc?.(null)}
                title={`${c.name} (${c.hex})`}
                className={`h-3.5 w-3.5 rounded-full transition-transform cursor-pointer ${
                  isSelected
                    ? 'scale-125 ring-2 ring-white shadow-sm'
                    : 'opacity-70 hover:opacity-100 hover:scale-110'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export interface ExperimentalMultiBotsTeamRosterCardProps {
  team: 0 | 1;
  allowBotpackPolicies?: boolean;
  isLight?: boolean;
  cardBg?: string;
  subPanelBg?: string;
  mutedText?: string;
}

export const ExperimentalMultiBotsTeamRosterCard: React.FC<
  ExperimentalMultiBotsTeamRosterCardProps
> = ({
  team,
  allowBotpackPolicies = false,
  isLight = false,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const blueSlots = useExperimentalMultiBotsStore((s) => s.blueSlots);
  const orangeSlots = useExperimentalMultiBotsStore((s) => s.orangeSlots);
  const onAddBot = useExperimentalMultiBotsStore((s) => s.addBotToTeam);

  const isBlue = team === 0;
  const slots = isBlue ? blueSlots : orangeSlots;
  const globalOffset = isBlue ? 0 : blueSlots.length;
  const totalCars = blueSlots.length + orangeSlots.length;

  const resolvedCardBg =
    cardBg ??
    (isLight
      ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
      : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200');
  const resolvedSubPanelBg =
    subPanelBg ??
    (isLight
      ? 'bg-white border-neutral-200/90 text-neutral-800'
      : 'bg-neutral-950/50 border-neutral-800 text-neutral-200');
  const resolvedMutedText =
    mutedText ?? (isLight ? 'text-neutral-500' : 'text-neutral-400');

  const teamLabel = isBlue ? 'BLUE TEAM' : 'ORANGE TEAM';
  const teamShort = isBlue ? 'Blue' : 'Orange';
  const dotClass = isBlue ? 'bg-sky-400' : 'bg-orange-400';
  const titleColor = isBlue ? 'text-sky-400' : 'text-orange-400';
  const addBtnActiveClass = isBlue
    ? 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/40 text-sky-300 cursor-pointer'
    : 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/40 text-orange-300 cursor-pointer';
  const canAddBot = slots.length < 5 && totalCars < 6;

  return (
    <div
      className={`p-2.5 rounded-xl border flex flex-col gap-2 ${resolvedCardBg}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <span className={`font-bold text-xs ${titleColor}`}>
            {teamLabel} ({slots.length} / 5)
          </span>
        </div>
        <button
          type="button"
          disabled={!canAddBot}
          onClick={() => onAddBot(team, 'nexto')}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-colors ${
            !canAddBot
              ? 'opacity-40 cursor-not-allowed border-neutral-700 text-neutral-500'
              : addBtnActiveClass
          }`}
        >
          <Plus className="h-3 w-3" />
          <span>Add Bot</span>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {slots.length === 0 ? (
          <div
            className={`p-2 rounded-lg border text-center text-[11px] ${resolvedSubPanelBg} ${resolvedMutedText}`}
          >
            No cars on {teamShort} Team. Click &ldquo;+ Add Bot&rdquo; to spawn a{' '}
            {teamShort} car.
          </div>
        ) : (
          slots.map((slot, idx) => (
            <ExperimentalMultiBotsSlotRow
              key={slot.id}
              slot={slot}
              slotIndex={idx}
              globalCarIdx={globalOffset + idx}
              allowBotpackPolicies={allowBotpackPolicies}
              isLight={isLight}
              subPanelBg={resolvedSubPanelBg}
              mutedText={resolvedMutedText}
            />
          ))
        )}
      </div>
    </div>
  );
};
