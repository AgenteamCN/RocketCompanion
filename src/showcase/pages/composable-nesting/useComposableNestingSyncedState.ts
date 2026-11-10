import { useCallback } from 'react';
import type { CubicBezierValue } from '../../../ui-core/charts/CubicBezierCurveEditor';
import type { TelemetryConfigState } from '../../../ui-core/compounds/TelemetryConfigCard';
import type { EventCatalogEntry } from '../../../ui-core/compounds/tuner/EventFilterMatrix';
import type { PriorityQueueItem } from '../../../ui-core/compounds/tuner/PriorityQueueList';
import type { UVTransformState } from '../../components/tuner/UVTransformControl';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';

export const DEFAULT_EVENT_CATALOG: EventCatalogEntry[] = [
  { hex: '0x01', id: 'CAR_WORLD_COLLISION', name: 'Chassis / Bumper World Impact' },
  { hex: '0x02', id: 'BALL_WORLD_BOUNCE', name: 'Ball Bounce on Arena Geometry' },
  { hex: '0x03', id: 'CAR_BALL_STRIKE', name: 'Direct Kinetic Car-Ball Strike' },
  { hex: '0x04', id: 'WHEEL_LANDING', name: 'Suspension 4-Wheel Touchdown' },
  { hex: '0x05', id: 'SUSPENSION_BOTTOM_OUT', name: 'Hard Chassis Bottom-Out' },
  { hex: '0x06', id: 'BOOST_IGNITION', name: 'Rocket Thruster Ignition Burst' },
  { hex: '0x07', id: 'SUPERSONIC_BOOM', name: '2200 uu/s Supersonic Transition' },
  { hex: '0x08', id: 'GOAL_HORN_BLAST', name: 'Goal Explosion & Stadium Horn' },
];

export const DEFAULT_BLUE_QUEUE: PriorityQueueItem[] = [
  { id: 'sky-cobalt', name: 'Cobalt Metallic', hex: '#0284c7' },
  { id: 'teal-cyber', name: 'Cyber Teal', hex: '#0d9488' },
  { id: 'indigo-deep', name: 'Deep Night Indigo', hex: '#4f46e5' },
];

export const DEFAULT_ORANGE_QUEUE: PriorityQueueItem[] = [
  { id: 'amber-solar', name: 'Solar Amber', hex: '#f59e0b' },
  { id: 'crimson-blaze', name: 'Crimson Blaze', hex: '#e11d48' },
  { id: 'gold-anodized', name: 'Anodized Gold', hex: '#ca8a04' },
];

export function buildDefaultSelectedEventsMap(): Record<string, boolean> {
  const initial: Record<string, boolean> = {};
  for (const item of DEFAULT_EVENT_CATALOG) {
    initial[item.hex.toLowerCase()] = true;
  }
  return initial;
}

export function useComposableContainersState() {
  const [presetMode, setPresetMode] = useSyncedState<string>(
    'page:composable-nesting:presetMode',
    'pro-esports'
  );
  const [dropdownPrecision, setDropdownPrecision] = useSyncedState<number>(
    'page:composable-nesting:dropdownPrecision',
    0.01
  );
  const [dropdownBias, setDropdownBias] = useSyncedState<number>(
    'page:composable-nesting:dropdownBias',
    12.5
  );
  const [dropdownLiveHud, setDropdownLiveHud] = useSyncedState<boolean>(
    'page:composable-nesting:dropdownLiveHud',
    true
  );

  const [buttonClicks, setButtonClicks] = useSyncedState<number>(
    'page:composable-nesting:buttonClicks',
    0
  );
  const [nestedPitchBias, setNestedPitchBias] = useSyncedState<number>(
    'page:composable-nesting:nestedPitchBias',
    -14.5
  );
  const [nestedDeadband, setNestedDeadband] = useSyncedState<[number, number]>(
    'page:composable-nesting:nestedDeadband',
    [-8, 12]
  );
  const [nestedCurve, setNestedCurve] = useSyncedState<CubicBezierValue>(
    'page:composable-nesting:nestedCurve',
    { p1x: 0.22, p1y: 1.0, p2x: 0.36, p2y: 1.0 }
  );
  const [nestedMode, setNestedMode] = useSyncedState<string>(
    'page:composable-nesting:nestedMode',
    'agile'
  );

  return {
    presetMode,
    setPresetMode,
    dropdownPrecision,
    setDropdownPrecision,
    dropdownBias,
    setDropdownBias,
    dropdownLiveHud,
    setDropdownLiveHud,
    buttonClicks,
    setButtonClicks,
    nestedPitchBias,
    setNestedPitchBias,
    nestedDeadband,
    setNestedDeadband,
    nestedCurve,
    setNestedCurve,
    nestedMode,
    setNestedMode,
  };
}

export function useDecoupledTunerPrimitivesState() {
  const [globalStep, setGlobalStep] = useSyncedState<number>(
    'page:composable-nesting:globalStep',
    0.01
  );
  const [uvTransform, setUvTransform] = useSyncedState<UVTransformState>(
    'page:composable-nesting:uvTransform',
    {
      scaleX: 1.0,
      scaleY: 1.0,
      offsetX: 0.0,
      offsetY: 0.0,
      linkScale: true,
    }
  );
  const [primaryPaint, setPrimaryPaint] = useSyncedState<string>(
    'page:composable-nesting:primaryPaint',
    '#F59E0B'
  );
  const [accentFinish, setAccentFinish] = useSyncedState<string>(
    'page:composable-nesting:accentFinish',
    '#10B981'
  );
  const [emissiveGlow, setEmissiveGlow] = useSyncedState<string>(
    'page:composable-nesting:emissiveGlow',
    '#38BDF8'
  );
  const [blueQueue, setBlueQueue] = useSyncedState<PriorityQueueItem[]>(
    'page:composable-nesting:blueQueue',
    DEFAULT_BLUE_QUEUE
  );
  const [orangeQueue, setOrangeQueue] = useSyncedState<PriorityQueueItem[]>(
    'page:composable-nesting:orangeQueue',
    DEFAULT_ORANGE_QUEUE
  );
  const [selectedEventsMap, setSelectedEventsMap] = useSyncedState<Record<string, boolean>>(
    'page:composable-nesting:selectedEventsMap',
    buildDefaultSelectedEventsMap
  );

  return {
    globalStep,
    setGlobalStep,
    uvTransform,
    setUvTransform,
    primaryPaint,
    setPrimaryPaint,
    accentFinish,
    setAccentFinish,
    emissiveGlow,
    setEmissiveGlow,
    blueQueue,
    setBlueQueue,
    orangeQueue,
    setOrangeQueue,
    selectedEventsMap,
    setSelectedEventsMap,
  };
}

export function useDomainAgnosticCompoundsState() {
  const [telemetryConfig, setTelemetryConfig] = useSyncedState<TelemetryConfigState>(
    'page:composable-nesting:telemetryConfig',
    {
      alwaysShow: true,
      fpsMode: 'always',
      refreshRateMode: 'always',
      renderScaleMode: 'always',
      physicsRateMode: 'always',
      latencyMode: 'always',
    }
  );
  const [swivelPreset, setSwivelPreset] = useSyncedState<
    'none' | 'left' | 'right' | 'up' | 'down' | 'rearView'
  >('page:composable-nesting:swivelPreset', 'none');
  const [swivelStrength, setSwivelStrength] = useSyncedState<number>(
    'page:composable-nesting:swivelStrength',
    0.95
  );
  const [swivelAxes, setSwivelAxes] = useSyncedState<[number, number]>(
    'page:composable-nesting:swivelAxes',
    [0, 0]
  );
  const [duelCell, setDuelCell] = useSyncedState<{
    blue: string;
    orange: string;
    slot: number;
  }>('page:composable-nesting:duelCell', {
    blue: 'nexto',
    orange: 'necto',
    slot: 0,
  });

  return {
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
  };
}

export function useComposableNestingExporter() {
  const containers = useComposableContainersState();
  const primitives = useDecoupledTunerPrimitivesState();
  const compounds = useDomainAgnosticCompoundsState();

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:composable-nesting:' });
  }, []);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      dropdownInspector: {
        presetMode: containers.presetMode,
        precisionStep: containers.dropdownPrecision,
        pitchBiasDeg: containers.dropdownBias,
        embedLive120HzSparkline: containers.dropdownLiveHud,
      },
      composableButton: {
        nestedMode: containers.nestedMode,
        pitchTorqueNm: containers.nestedPitchBias,
        steeringDeadbandDeg: containers.nestedDeadband,
        responseCurve: containers.nestedCurve,
      },
      decalUvAndShader: {
        globalPrecisionStep: primitives.globalStep,
        uvTransform: primitives.uvTransform,
        shaderPalette: {
          primaryPaint: primitives.primaryPaint,
          accentFinish: primitives.accentFinish,
          emissiveGlow: primitives.emissiveGlow,
        },
      },
      paintPriorityQueues: {
        blueTeamOrder: primitives.blueQueue.map((item) => item.id),
        orangeTeamOrder: primitives.orangeQueue.map((item) => item.id),
      },
      enabledEventCatalogHex: Object.entries(primitives.selectedEventsMap)
        .filter(([, enabled]) => enabled)
        .map(([hex]) => hex),
      telemetryStrategy: compounds.telemetryConfig,
      cameraSwivel: {
        preset: compounds.swivelPreset,
        strength: compounds.swivelStrength,
        axes: compounds.swivelAxes,
      },
      kickoffDuel: compounds.duelCell,
    };
    return `// L3 Composable Nesting & Decoupled Tuner Compounds Default Snapshot\nexport const DEFAULT_L3_COMPOSABLE_NESTING_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [containers, primitives, compounds]);

  return {
    buildExportCode,
    handleResetDefaults,
  };
}
