import React from 'react';
import { Plus, X, Activity } from 'lucide-react';
import { Badge } from '../../../primitives/Badge';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { useFloatingStore, floatingStore } from '../../../stores/floatingStore';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import type { PresetConfig } from '../../../stores/floatingPresets';

export interface DiagnosticWindowPayload {
  id: string;
  title: string;
  category: string;
  width: number;
  height: number;
}

export interface FloatingWindowCardProps {
  preset?: PresetConfig;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconBgClass?: string;
  iconColor?: string;
  badge?: string;
  badgeClass?: string;
  bordered?: boolean;
  showDescription?: boolean;
  description?: string;
  hoverTooltip?: string;
  onSpawnDiagnosticWindow?: (window: DiagnosticWindowPayload) => void;
  onHover: (desc: string) => void;
  onLeave: () => void;
  isLight?: boolean;
}

export const FloatingWindowCard: React.FC<FloatingWindowCardProps> = ({
  preset,
  icon,
  iconColor,
  badge,
  badgeClass = 'bg-sky-500/15 border-sky-500/30 text-sky-400',
  bordered: propBordered,
  showDescription: propShowDescription,
  description,
  hoverTooltip,
  onSpawnDiagnosticWindow,
  onHover,
  onLeave,
  isLight = false,
}) => {
  const { windows } = useFloatingStore();
  const {
    bordered: storeBordered,
    advancedBordered,
    advancedShowBadges,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
  } = useSettingActionRowStore();

  const resolvedBordered = propBordered ?? (storeBordered || advancedBordered);

  if (preset) {
    const existingWindow = windows.find((w) => w.id === preset.id);
    const handleSpawn = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const containerEl =
        (e.currentTarget.closest(
          '#rc-ui-tuner-preview-stage, #game-ui-scale-root, #game-ui-viewport-host'
        ) as HTMLElement | null) ||
        document.getElementById('game-ui-scale-root') ||
        document.getElementById('game-ui-viewport-host') ||
        document.body;
      floatingStore.spawnWithFlight(preset, e.currentTarget, containerEl);
      onSpawnDiagnosticWindow?.({
        id: preset.id,
        title: preset.title,
        category: preset.category,
        width: preset.width,
        height: preset.height,
      });
    };

    return (
      <SettingActionRow
        icon={icon ?? Activity}
        iconColor={iconColor}
        title={preset.title}
        badge={
          badge && advancedShowBadges ? (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold ${badgeClass}`}
            >
              {badge}
            </span>
          ) : undefined
        }
        description={description}
        bordered={resolvedBordered}
        showDescription={propShowDescription}
        hoverDescription={hoverTooltip || description || preset.title}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
        rightSlot={
          existingWindow ? (
            <button
              type="button"
              onClick={() => floatingStore.closeWindow(preset.id)}
              title={`Close "${preset.title}"`}
              style={{
                borderRadius: `${Math.max(0, buttonRadius)}px`,
              }}
              className="h-7 w-7 border flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none bg-red-500/15 hover:bg-red-500/25 border-red-400/40 text-red-500 shrink-0"
            >
              <X className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSpawn}
              title={`Spawn "${preset.title}" into Stack`}
              style={{
                fontSize: `${buttonFontSize}px`,
                paddingLeft: `${buttonPaddingX}px`,
                paddingRight: `${buttonPaddingX}px`,
                paddingTop: `${buttonPaddingY}px`,
                paddingBottom: `${buttonPaddingY}px`,
                borderRadius: `${Math.max(0, buttonRadius)}px`,
              }}
              className={`font-semibold border transition-all duration-150 cursor-pointer flex items-center gap-1.5 leading-tight active:scale-95 shrink-0 ${
                isLight
                  ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
                  : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
              }`}
            >
              <Plus
                style={{
                  width: `${Math.max(12, buttonFontSize + 1)}px`,
                  height: `${Math.max(12, buttonFontSize + 1)}px`,
                }}
                className="stroke-[2.2]"
              />
              <span>Spawn</span>
            </button>
          )
        }
      />
    );
  }

  return (
    <SettingActionRow
      icon={Activity}
      iconColor={iconColor}
      title="F10 Diagnostic Floating Window"
      badge={
        advancedShowBadges ? (
          <Badge variant="primary" size="sm" isLight={isLight}>
            Floating Window
          </Badge>
        ) : undefined
      }
      description="Spawns standalone telemetry overlay. Minimize folds into top-right Stack tray."
      bordered={resolvedBordered}
      showDescription={propShowDescription}
      hoverDescription="Spawns an independent floating diagnostic window docked in the top-right tray."
      onHover={onHover}
      onLeave={onLeave}
      isLight={isLight}
      rightSlot={
        <button
          type="button"
          onClick={() => {
            const titles = [
              'Network Ping & WASM Sub-Tick Diagnostics',
              'Physics Vector & Collision Mesh Profiler',
              'GPU Frame Pacing & Memory Footprint',
              'Ball Angular Velocity & Magnus Vector',
            ];
            const randomTitle = titles[Math.floor(Math.random() * titles.length)];
            onSpawnDiagnosticWindow?.({
              id: `diag-${Date.now()}`,
              title: randomTitle,
              category: 'Diagnostic',
              width: 440,
              height: 260,
            });
            onHover(`Spawned diagnostic window: "${randomTitle}"`);
          }}
          style={{
            fontSize: `${buttonFontSize}px`,
            paddingLeft: `${buttonPaddingX}px`,
            paddingRight: `${buttonPaddingX}px`,
            paddingTop: `${buttonPaddingY}px`,
            paddingBottom: `${buttonPaddingY}px`,
            borderRadius: `${Math.max(0, buttonRadius)}px`,
          }}
          className="flex items-center gap-1.5 font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-xs cursor-pointer transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Spawn Window</span>
        </button>
      }
    />
  );
};

