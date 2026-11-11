import React from 'react';
import { Sparkles } from 'lucide-react';
import { CameraSwivelSimulatorCard } from '../../../ui-core/compounds/CameraSwivelSimulatorCard';
import { KickoffDuelMatrixCard } from '../../../ui-core/compounds/KickoffDuelMatrixCard';
import { PhaseVariationMatrix } from '../../../ui-core/compounds/PhaseVariationMatrix';
import { TeamRosterCard } from '../../../ui-core/compounds/TeamRosterCard';
import { TelemetryConfigCard } from '../../../ui-core/compounds/TelemetryConfigCard';
import { Badge } from '../../../ui-core/primitives/Badge';
import { useDomainAgnosticCompoundsState } from './useComposableNestingSyncedState';

export interface DomainAgnosticCompoundsSectionProps {
  isLight: boolean;
}

export const DomainAgnosticCompoundsSection: React.FC<
  DomainAgnosticCompoundsSectionProps
> = ({ isLight }) => {
  const {
    telemetryConfig,
    setTelemetryConfig,
    swivelPreset,
    setSwivelPreset,
    swivelStrength,
    setSwivelStrength,
    swivelAxes,
    setSwivelAxes,
    duelCell,
    setDuelCell,
  } = useDomainAgnosticCompoundsState();

  return (
    <section className="space-y-5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            4. [L3.7 ~ L3.12] RocketCompanion Decoupled Composite Cards (L3 Domain-Agnostic Compounds · Light/Dark Compatible)
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Audio stage pool matrix, telemetry strategy card, Multi-Bot team roster card, camera
            swivel simulator, and kickoff duel matrix refactored into 100% pure Props-driven composite
            components supporting <code>isLight=&#123;isLight&#125;</code>.
          </p>
        </div>
        <Badge variant="amber" isLight={isLight}>
          Zero Store Coupling · Light/Dark Ready
        </Badge>
      </div>

      <div
        id="l3-7-phase-telemetry"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start scroll-mt-24"
      >
        <PhaseVariationMatrix isLight={isLight} />
        <TelemetryConfigCard
          isLight={isLight}
          telemetry={telemetryConfig}
          onUpdateTelemetry={(patch) => setTelemetryConfig((prev) => ({ ...prev, ...patch }))}
        />
      </div>

      <div
        id="l3-9-roster-cards"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start scroll-mt-24"
      >
        <TeamRosterCard team={0} isLight={isLight} />
        <TeamRosterCard team={1} isLight={isLight} />
      </div>

      <div
        id="l3-11-swivel-kickoff-duel"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start scroll-mt-24"
      >
        <CameraSwivelSimulatorCard
          isLight={isLight}
          preset={swivelPreset}
          strength={swivelStrength}
          lookX={swivelAxes[0]}
          lookY={swivelAxes[1]}
          onChangePreset={setSwivelPreset}
          onChangeStrength={setSwivelStrength}
          onChangeAxes={(x, y) => setSwivelAxes([x, y])}
        />
        <KickoffDuelMatrixCard
          isLight={isLight}
          selectedBlueModel={duelCell.blue}
          selectedOrangeModel={duelCell.orange}
          selectedSlotIndex={duelCell.slot}
          onSelectCell={(b, o, s) => setDuelCell({ blue: b, orange: o, slot: s })}
        />
      </div>
    </section>
  );
};
