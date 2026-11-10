import React, { useState } from 'react';
import { Plus, Trash2, Eye, UserCheck } from 'lucide-react';
import { KeycapBadge } from '../primitives/KeycapBadge';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import {
  EXP_BOT_POLICY_METAS,
  BOTPACK_9700488_POLICY_METAS,
  getExpBotPolicyMeta,
  type ExpBotPolicyId,
} from '../stores/experimentalMultiBotsRosterUtils';

export const ALPHA_COMPONENT_ID = 'Alpha:TeamRosterCard' as const;

export type BotPolicyId = ExpBotPolicyId;

export interface CarColorSwatch {
  id: string;
  name: string;
  hex: string;
}

export const DEFAULT_CAR_COLOR_PALETTE: CarColorSwatch[] = [
  { id: 'sky', name: 'Sky Blue', hex: '#38bdf8' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3b82f6' },
  { id: 'emerald', name: 'Emerald', hex: '#10b981' },
  { id: 'amber', name: 'Warm Amber', hex: '#f59e0b' },
  { id: 'crimson', name: 'Crimson', hex: '#f43f5e' },
  { id: 'violet', name: 'Violet', hex: '#a855f7' },
];

export interface TeamRosterSlotConfig {
  id: string;
  team: 0 | 1;
  isPlayer?: boolean;
  botType: BotPolicyId;
  colorSlot: string;
}

export const DEFAULT_BLUE_TEAM_SLOTS: TeamRosterSlotConfig[] = [
  { id: 'blue-1', team: 0, isPlayer: true, botType: 'nexto', colorSlot: 'sky' },
  { id: 'blue-2', team: 0, isPlayer: false, botType: 'nexto', colorSlot: 'cobalt' },
  { id: 'blue-3', team: 0, isPlayer: false, botType: 'necto', colorSlot: 'emerald' },
];

export const DEFAULT_ORANGE_TEAM_SLOTS: TeamRosterSlotConfig[] = [
  { id: 'orange-1', team: 1, isPlayer: false, botType: 'nexto', colorSlot: 'amber' },
  { id: 'orange-2', team: 1, isPlayer: false, botType: 'nexto', colorSlot: 'crimson' },
  { id: 'orange-3', team: 1, isPlayer: false, botType: 'heuristic', colorSlot: 'violet' },
];

export interface TeamRosterCardProps {
  team?: 0 | 1;
  slots?: TeamRosterSlotConfig[];
  globalOffset?: number;
  activeCameraCarIndex?: number;
  totalCars?: number;
  maxTeamSlots?: number;
  maxTotalCars?: number;
  allowBotpackPolicies?: boolean;
  colorPalette?: CarColorSwatch[];
  onAddBot?: (team: 0 | 1, botType: BotPolicyId) => void;
  onSelectCameraCar?: (carIdx: number) => void;
  onSetSlotBotType?: (team: 0 | 1, slotIndex: number, botType: BotPolicyId) => void;
  onRemoveSlot?: (team: 0 | 1, slotIndex: number) => void;
  onSetSlotColor?: (team: 0 | 1, slotIndex: number, colorId: string) => void;
  isLight?: boolean;
  className?: string;
}

const LEGACY_BOT_POLICIES = EXP_BOT_POLICY_METAS.filter((m) => m.category === 'legacy');

/**
 * [L3 Compound] TeamRosterCard (`L3.9`)
 * Pure props-driven Multi-Bot Team Roster Card with AI policy pills, 6-swatch color picker, and POV camera selector.
 * Supports both controlled and uncontrolled standalone usage.
 */
export const TeamRosterCard: React.FC<TeamRosterCardProps> = React.memo(
  ({
    team = 0,
    slots: controlledSlots,
    globalOffset = 0,
    activeCameraCarIndex = 0,
    totalCars = 6,
    maxTeamSlots = 5,
    maxTotalCars = 6,
    allowBotpackPolicies = false,
    colorPalette = DEFAULT_CAR_COLOR_PALETTE,
    onAddBot,
    onSelectCameraCar,
    onSetSlotBotType,
    onRemoveSlot,
    onSetSlotColor,
    isLight = true,
    className = '',
  }) => {
    const [internalSlots, setInternalSlots] = useState<TeamRosterSlotConfig[]>(
      team === 0 ? DEFAULT_BLUE_TEAM_SLOTS : DEFAULT_ORANGE_TEAM_SLOTS
    );

    const slots = controlledSlots ?? internalSlots;
    const isBlue = team === 0;
    const teamLabel = isBlue ? 'BLUE TEAM' : 'ORANGE TEAM';
    const teamShort = isBlue ? 'Blue' : 'Orange';
    const dotClass = isBlue ? 'bg-sky-400' : 'bg-amber-500';
    const titleColor = isBlue ? 'text-sky-500' : 'text-amber-500';
    const canAddBot = slots.length < maxTeamSlots && (controlledSlots ? totalCars < maxTotalCars : slots.length < maxTeamSlots);

    const handleAddBot = () => {
      if (onAddBot) {
        onAddBot(team, 'nexto');
        return;
      }
      setInternalSlots((prev) => {
        if (prev.length >= maxTeamSlots) return prev;
        return [
          ...prev,
          {
            id: `${team}-${Date.now()}`,
            team,
            isPlayer: false,
            botType: 'nexto',
            colorSlot: isBlue ? 'sky' : 'amber',
          },
        ];
      });
    };

    const handleSetBotType = (slotTeam: 0 | 1, idx: number, botType: BotPolicyId) => {
      if (onSetSlotBotType) {
        onSetSlotBotType(slotTeam, idx, botType);
        return;
      }
      setInternalSlots((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, botType } : s))
      );
    };

    const handleSetColor = (slotTeam: 0 | 1, idx: number, colorId: string) => {
      if (onSetSlotColor) {
        onSetSlotColor(slotTeam, idx, colorId);
        return;
      }
      setInternalSlots((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, colorSlot: colorId } : s))
      );
    };

    const handleRemove = (slotTeam: 0 | 1, idx: number) => {
      if (onRemoveSlot) {
        onRemoveSlot(slotTeam, idx);
        return;
      }
      setInternalSlots((prev) => prev.filter((_, i) => i !== idx));
    };

    return (
      <div
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-ui-element="compound-team-roster-card"
        className={`p-3 ${UI_RADIUS.card} border flex flex-col gap-2 select-none ${
          isLight
            ? `bg-neutral-50 ${UI_THEME.light.border} ${UI_THEME.light.textPrimary}`
            : `bg-neutral-900/70 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
        } ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <span className={`font-bold text-xs ${titleColor}`}>
              {teamLabel} ({slots.length} / {maxTeamSlots})
            </span>
          </div>
          <button
            type="button"
            disabled={!canAddBot}
            onClick={handleAddBot}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-colors ${
              !canAddBot
                ? 'opacity-40 cursor-not-allowed border-neutral-700 text-neutral-500'
                : isBlue
                ? isLight
                  ? 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/50 text-sky-700 cursor-pointer'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-400 cursor-pointer'
                : isLight
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 text-amber-700 cursor-pointer'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-400 cursor-pointer'
            }`}
          >
            <Plus className="h-3 w-3" />
            <span>Add Bot</span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {slots.length === 0 ? (
            <div
              className={`p-2.5 rounded-lg border text-center text-[11px] ${
                isLight
                  ? 'bg-white border-neutral-200 text-neutral-500'
                  : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'
              }`}
            >
              No cars on {teamShort} Team. Click &ldquo;+ Add Bot&rdquo; to spawn a car.
            </div>
          ) : (
            slots.map((slot, idx) => {
              const globalCarIdx = globalOffset + idx;
              const keyNum = globalCarIdx + 1;
              const isCamActive = activeCameraCarIndex === globalCarIdx;
              const swatch =
                colorPalette.find((c) => c.id === slot.colorSlot) ?? colorPalette[0];

              return (
                <div
                  key={slot.id}
                  className={`p-2 rounded-lg border flex flex-col gap-1.5 transition-colors ${
                    isCamActive
                      ? 'bg-amber-500/10 border-amber-500/45'
                      : isLight
                      ? 'bg-white border-neutral-200'
                      : 'bg-neutral-950/60 border-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectCameraCar?.(globalCarIdx)}
                        className="flex items-center gap-1 cursor-pointer"
                      >
                        <KeycapBadge shortcut={String(keyNum)} size="sm" isLight={isLight} />
                      </button>
                      <span
                        className="h-3 w-3 rounded-full shrink-0 border border-black/20"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      {slot.isPlayer ? (
                        <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1 truncate">
                          <UserCheck className="h-3 w-3 shrink-0" />
                          <span>HUMAN PLAYER</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 min-w-0">
                          <select
                            aria-label={`Slot #${keyNum} Bot Policy`}
                            value={slot.botType}
                            onChange={(e) =>
                              handleSetBotType(slot.team, idx, e.target.value as BotPolicyId)
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer outline-none ${
                              getExpBotPolicyMeta(slot.botType).category === 'botpack_9700488'
                                ? isLight
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800'
                                  : 'bg-emerald-500/20 border-emerald-500/70 text-emerald-300'
                                : isLight
                                ? 'bg-amber-500/15 border-amber-500 text-amber-800'
                                : 'bg-amber-500/20 border-amber-500/70 text-amber-300'
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
                                  {LEGACY_BOT_POLICIES.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.label}
                                    </option>
                                  ))}
                                </optgroup>
                              </>
                            ) : (
                              LEGACY_BOT_POLICIES.map((m) => (
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
                            {getExpBotPolicyMeta(slot.botType).formatBadge}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectCameraCar?.(globalCarIdx)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border flex items-center gap-1 cursor-pointer transition-colors ${
                          isCamActive
                            ? isLight
                              ? 'bg-amber-500/20 border-amber-500 text-amber-800'
                              : 'bg-amber-500/20 border-amber-500 text-amber-400'
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
                        onClick={() => handleRemove(slot.team, idx)}
                        className={`p-1 rounded border transition-colors ${
                          totalCars <= 1
                            ? 'opacity-30 cursor-not-allowed border-transparent text-neutral-500'
                            : 'hover:bg-rose-500/20 border-transparent hover:border-rose-500/40 text-rose-400 cursor-pointer'
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* 6-Color Swatch Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-500/15">
                    <span className="text-[10px] font-mono opacity-80">
                      Swatch: <strong style={{ color: swatch.hex }}>{swatch.name}</strong>
                    </span>
                    <div className="flex items-center gap-1">
                      {colorPalette.map((c) => {
                        const isSelected = slot.colorSlot === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSetColor(slot.team, idx, c.id)}
                            className={`h-3.5 w-3.5 rounded-full transition-transform cursor-pointer ${
                              isSelected
                                ? isLight
                                  ? 'scale-125 ring-2 ring-neutral-900 shadow-xs'
                                  : 'scale-125 ring-2 ring-white shadow-xs'
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
            })
          )}
        </div>
      </div>
    );
  }
);

TeamRosterCard.displayName = 'TeamRosterCard';
