import {
  Bot,
  FileArchive,
  Film,
  History,
  Layers,
  Radio,
  Skull,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import {
  EXPERIMENTAL_BOT_PACK_PRESET,
  EXPERIMENTAL_MULTI_BOTS_PRESET,
  REPLAY_TO_RCS_IMPORTER_PRESET,
  SUBSYSTEM_ISOLATION_LAB_PRESET,
} from '../../stores/devFloatingPresets';
import type { PresetConfig } from '../../stores/floatingPresets';
import { getDiscoveredFloatingSurfacesByMenuGroup as getDiscoveredSurfacesByMenuGroup } from '../../manifest/floatingSurfaceRegistry';
import type { DevTestLabTab as IsolationDevTestLabTab } from '../../stores/subsystemIsolationLabStore';
import {
  discoveredSurfaceToLauncherSpec,
  type DevIconComponent,
} from './devHubSurfaceCatalog';

export type DevTestLabTab =
  | IsolationDevTestLabTab
  | 'exp-multi-bots'
  | 'exp-botpack-9700488'
  | 'tem-pack-converter'
  | 'replay-to-rcs-importer';

export type LayerDevTestLabTab = DevTestLabTab;

export interface DevSandboxBenchSpec {
  id: DevTestLabTab;
  title: string;
  summary: string;
  details: string;
  icon: DevIconComponent;
  iconColor: string;
  preset?: PresetConfig;
}

export const SANDBOX_BENCH_SPECS: DevSandboxBenchSpec[] = [
  {
    id: 'probes',
    title: 'Physics & Hover Probes',
    summary:
      'Verify isolated angular torque (0G QE) and 1G vertical PID hover control.',
    details:
      'Physics & Hover Probes (0G QE · 1G Z-Hover): Isolates vehicle rigid-body attitude control and PID thrust stabilization before full arena flight tests.',
    icon: Radio,
    iconColor: 'text-amber-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'multi-ghost',
    title: 'Multi-World Ghost Isolation',
    summary:
      'Run 2 to 4 independent RocketSim physics worlds rendered simultaneously as ghosts.',
    details:
      'Multi-World Ghost Isolation (2..4 Parallel Worlds): Verifies multi-instance WASM memory isolation, independent tick stepping, and ghost vehicle visual synchronization.',
    icon: Layers,
    iconColor: 'text-sky-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'state-replay',
    title: 'State Replay & TAS Rewinder',
    summary:
      'Record 120Hz physics snapshots, scrub backward/forward, import/export & resume.',
    details:
      'State Replay & TAS Rewinder (RingBuffer · Scrubbing): Verifies deterministic RocketSim snapshot serialization, timeline scrubbing ([ / ]), and countdown takeover.',
    icon: History,
    iconColor: 'text-emerald-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: '90s-match',
    title: '90s Match & Overtime MVP',
    summary:
      'Verify regulation clock countdown, 0:00 airborne ball hold, and Overtime sudden death.',
    details:
      '90s Match & Overtime MVP (MatchController · OT): Isolates match state machine transitions, kickoff countdown freezes, and sudden-death victory triggers.',
    icon: Zap,
    iconColor: 'text-purple-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'goal-replay',
    title: 'Goal Incident Replay & Podium',
    summary:
      'Test goal explosion delay, focal director replay with touch slow-mo, and MVP podium.',
    details:
      'Goal Incident Replay & Podium (Director Cam · Slow-Mo): Verifies ReplayTimelineController camera lookahead on scoring touches, speed ramps, and post-match celebration.',
    icon: Film,
    iconColor: 'text-rose-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'kickoff-duel',
    title: '4-Model Kickoff Duel Bench',
    summary:
      'Benchmark Nexto, Necto, Kickoff PPO & Speedflip across all 5 kickoff spawn slots.',
    details:
      '4-Model Kickoff Duel Bench (10 Pairings × 5 Slots): Verifies SafeTensors model inference, kickoff spawn mirroring, and per-tick action diagnostics.',
    icon: Swords,
    iconColor: 'text-orange-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'demolish-respawn',
    title: 'Demolish & Respawn Ghost Bench',
    summary:
      'Simulate demolish countdown, Left (A) / Right (D) slot selection, and ghost wheel placement.',
    details:
      'Demolish & Respawn Ghost Bench (Left/Right · Ghost Wheels): Isolates left-handed coordinate spawn slot mapping (0..3), RespawnGhostPreview wheel suspension height, and conflict fallback.',
    icon: Skull,
    iconColor: 'text-red-400',
    preset: SUBSYSTEM_ISOLATION_LAB_PRESET,
  },
  {
    id: 'exp-multi-bots',
    title: 'Experimental Multiple Bots Mode',
    summary:
      'Configure Blue & Orange rosters up to 3v3 with Native SafeTensors Nexto & Necto bots.',
    details:
      'Experimental Multiple Bots Mode (Up to 3v3 · Native SafeTensors): Multi-agent Nexto & Necto bot rosters, team & time config, and live POV switching (Keys 1–6).',
    icon: Bot,
    iconColor: 'text-emerald-400',
    preset: EXPERIMENTAL_MULTI_BOTS_PRESET,
  },
  {
    id: 'exp-botpack-9700488',
    title: 'Experimental Bot Pack #9700488',
    summary:
      'Spectate all 8 RLBot #9700488 models (Chronos v2.1, Dice, Ducky, Fury, Galactus v2, Kira, Rain, Ripple v1.1) at max format.',
    details:
      'Experimental Bot Pack #9700488 (8 Native SafeTensors Models · Max-Format All-Bots Spectate): Launches 3v3/2v2/1v1 self-play spectate for Chronos v2.1, Dice, Ducky, Fury, Galactus v2, Kira, Rain, and Ripple v1.1.',
    icon: Sparkles,
    iconColor: 'text-teal-400',
    preset: EXPERIMENTAL_BOT_PACK_PRESET,
  },
  {
    id: 'tem-pack-converter',
    title: 'Static Training Packs (Dev Mode)',
    summary:
      'Batch import/export .Tem / .RCSPack / .RCSPackE / .zip, inspect .RLRCSPack metadata, and configure Training Variations (F3–F12).',
    details:
      'Static Training Packs (Dev Mode): Unified pack browser with .Tem -> .RLRCSPack importer, Original Description inspector, EditorFreeCam (.RCSPackE) support, Folder/Rank filtering, and Kevpert BakkesMod Training Variations.',
    icon: FileArchive,
    iconColor: 'text-cyan-400',
  },
  {
    id: 'replay-to-rcs-importer',
    title: 'Replay to RCS Replay Importer',
    summary:
      'Import raw Rocket League .replay files, upsample 30Hz to 120Hz, intervene (Disappear/Trajectory/Nexto/Necto), and save as .rcreplay.gz.',
    details:
      'Replay to RCS Replay Importer (UE3 Bitstream Decoder · 30Hz->120Hz SLERP/Hermite · Track Delta): Parses raw .replay files into 120Hz RocketCompanion tracks, preserves native UE3 telemetry in Track Delta, and exports RCS Replay Packs.',
    icon: FileArchive,
    iconColor: 'text-cyan-400',
    preset: REPLAY_TO_RCS_IMPORTER_PRESET,
  },
];

/**
 * Merges the canonical `SANDBOX_BENCH_SPECS` with any newly discovered `menuGroup: 'sandboxes'`
 * surfaces from `surfaceRegistry.ts`.
 */
export function resolveSandboxBenchSpecs(): DevSandboxBenchSpec[] {
  const discovered = getDiscoveredSurfacesByMenuGroup('sandboxes');
  const seenIds = new Set<string>(
    SANDBOX_BENCH_SPECS.map((b) => b.preset?.id || b.id)
  );
  const extras: DevSandboxBenchSpec[] = [];

  for (const entry of discovered) {
    if (seenIds.has(entry.meta.id)) continue;
    const launcher = discoveredSurfaceToLauncherSpec(entry);
    extras.push({
      id: entry.meta.id as DevTestLabTab,
      title: entry.meta.title,
      summary: entry.meta.description || entry.meta.subtitle || entry.meta.title,
      details: entry.meta.description || entry.meta.title,
      icon: launcher.icon,
      iconColor: 'text-cyan-400',
      preset: launcher.preset,
    });
    seenIds.add(entry.meta.id);
  }

  return [...SANDBOX_BENCH_SPECS, ...extras];
}
