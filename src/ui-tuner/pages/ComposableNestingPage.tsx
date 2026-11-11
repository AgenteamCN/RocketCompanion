import React from 'react';
import { Badge } from '../../ui-core/primitives/Badge';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { ComposableContainersSection } from './composable-nesting/ComposableContainersSection';
import { DecoupledTunerPrimitivesSection } from './composable-nesting/DecoupledTunerPrimitivesSection';
import { DomainAgnosticCompoundsSection } from './composable-nesting/DomainAgnosticCompoundsSection';
import { useComposableNestingExporter } from './composable-nesting/useComposableNestingSyncedState';

export interface ComposableNestingPageProps {
  isLight: boolean;
}

const L3_DIRECTORY_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l3-1-composable-dropdown',
    code: 'L3.1',
    name: 'DropdownMenu (Composable)',
    label: 'Dropdown menu with embedded bidirectional slider + 120Hz TelemetrySparklineChart',
  },
  {
    id: 'l3-2-composable-button',
    code: 'L3.2',
    name: 'Button (composable)',
    label: 'Giant nestable button container (Embedded dead-zone slider + Bezier curve editor)',
  },
  {
    id: 'l3-3-uv-color-tuner',
    code: 'L3.3 & L3.4',
    name: 'UVTransformControl & ColorSwatchInput',
    label: 'Decal UV Scale offset matrix + Shader Hex Palette input row',
  },
  {
    id: 'l3-5-priority-event-matrix',
    code: 'L3.5 & L3.6',
    name: 'PriorityQueueList & EventFilterMatrix',
    label: 'Garage livery priority queue + 0x01..0x08 Hexadecimal event filtering matrix',
  },
  {
    id: 'l3-7-phase-telemetry',
    code: 'L3.7 & L3.8',
    name: 'PhaseVariationMatrix & TelemetryConfigCard',
    label: 'audio 3 Stage mixing matrix + 5 Metric telemetry strategy card',
  },
  {
    id: 'l3-9-roster-cards',
    code: 'L3.9 & L3.10',
    name: 'TeamRosterCard (Blue & Orange Rosters)',
    label: 'Multi-Bot & Room Team Roster Cards (`compounds/TeamRosterCard`)',
  },
  {
    id: 'l3-11-swivel-kickoff-duel',
    code: 'L3.11 & L3.12',
    name: 'CameraSwivelSimulatorCard & KickoffDuelMatrixCard',
    label: 'View rotation simulator + Kickoff AI Matchup 5 Origin anchor matrix',
  },
];

export const ComposableNestingPage: React.FC<ComposableNestingPageProps> = ({ isLight }) => {
  const { buildExportCode, handleResetDefaults } = useComposableNestingExporter();

  return (
    <div className="max-w-5xl space-y-10 pb-16">
      <PageJumpDirectory
        layerTag="Layer 3 · Domain-Agnostic Composable Compounds"
        title="L3 Universal nested containers and decoupled composite component directory"
        subtitle="all L3 Composite cards zeroed Store Coupling, React.memo Isolation, and respond fully Light/Dark Mode Switch."
        items={L3_DIRECTORY_ITEMS}
        isLight={isLight}
      />

      <div className="space-y-2 border-b pb-6 border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Badge variant="amber" dot isLight={isLight}>
            Universal Nesting &amp; Modular Tuner
          </Badge>
          <Badge variant="neutral" isLight={isLight}>
            Zero Coupling · point and act
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Universal Composable Nesting &amp; Decoupled Tuner Primitives
        </h1>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          This page displays two core design pillars: 1. <strong>Universal Composable Nesting</strong>
          --Whether <code>&lt;DropdownMenu&gt;</code> is enabled <code>composable</code> of{' '}
          <code>&lt;Button&gt;</code>, Internal nesting of sliders supported, Stepper, even real-time
          Canvas Telemetry charts and full sub-pages, Strict event bubbling isolation, Zero-layout
          truncation; 2. <strong>Decoupled Domain Tuner &amp; Garage Controls</strong>--Refactored into
          pure presentation-layer composite components with light/dark mode support.
        </p>
      </div>

      <TunerConfigExporterBar
        badge="L3-EXPORT"
        title="L3 Composable Compounds & Tuner Primitives One-Click Config Exporter"
        subtitle="Exports named L3 parameters (Dropdown inspector, Composable Button Bezier curve, UV matrix, Shader hex swatches, Priority queues, Event filter, Swivel & Kickoff duel)"
        copyLabel="Copy L3 Compounds Config (Export Snapshot)"
        codeTitle="Current L3 Composable Nesting Parameter Snapshot (Paste directly into DEFAULT_L3_COMPOSABLE_NESTING_SNAPSHOT)"
        actionId="export-l3-composable-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      <ComposableContainersSection isLight={isLight} />
      <DecoupledTunerPrimitivesSection isLight={isLight} />
      <DomainAgnosticCompoundsSection isLight={isLight} />
    </div>
  );
};
export default ComposableNestingPage;
