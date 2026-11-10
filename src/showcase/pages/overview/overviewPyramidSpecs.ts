import type { ShowcaseTab } from '../../sidebarNavConfig';

export interface PyramidRow {
  code: string;
  name: string;
  rule: string;
  importPath: string;
  badgeColor: string;
  modules: {
    label: string;
    tab: ShowcaseTab;
    items: string;
  }[];
}

export const PYRAMID_SPEC: PyramidRow[] = [
  {
    code: 'L0. Foundation',
    name: 'Foundations (foundation and variables)',
    rule: 'Pure Static Constants, Type contract and theme Store, No Business Logic JSX, No Upper-level Dependencies (L1~L7) Dependency.',
    importPath: 'src/ui-core/tokens/* | src/ui-core/stores/*',
    badgeColor:
      'bg-neutral-500/15 text-neutral-700 dark:text-neutral-300 border-neutral-400/40',
    modules: [
      {
        label: 'Tokens & Theme Store',
        tab: 'foundations',
        items: 'colors, radius, spacing, easing, themeStore, morphContext, syncBridge',
      },
    ],
  },
  {
    code: 'L1. Primitives',
    name: 'Primitives (Atomic base primitives)',
    rule: 'Minimalist presentation component. No business context, pure Props driver, Zero horizontal coupling, dependency only L0.',
    importPath: 'src/ui-core/primitives/*',
    badgeColor:
      'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40',
    modules: [
      {
        label: 'Badge / Keycap / Button',
        tab: 'badges',
        items: 'Badge, KeycapBadge, Button (includes composable Universal nesting mode)',
      },
      {
        label: 'Tabs / Switch / Slider Step',
        tab: 'tabs',
        items:
          'UnderlineTabs, SegmentedSwitch, ToggleSwitch, SliderControl (includes centered Bidirectional), DualGrabberSlider, PrecisionDigitPicker',
      },
    ],
  },
  {
    code: 'L2. Layout',
    name: 'Layout & Shells (Layout and Skeleton)',
    rule: 'Pure structural space container, Grid Layout Management, Card Encapsulation And 3-Stage Optical padding (px-6 pt-5 pb-4), Contains no complex business state, dependency only L0~L1.',
    importPath: 'src/ui-core/layout/*',
    badgeColor:
      'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/40',
    modules: [
      {
        label: 'Stacks Grid Flow',
        tab: 'stacks',
        items: 'VStack, HStack, GridStack (Zero Coupling, Shared L0 StackGap Contract)',
      },
      {
        label: 'Card Card Container',
        tab: 'cards',
        items: 'Card, CardHeader, CardBody, CardFooter, SelectableCard',
      },
      {
        label: '2B · PlayCard Three mode card styles',
        tab: 'play-cards',
        items:
          'PlayModeCard, MainMenuRow (Style 1 Icon+Badge+Title+Desc · Style 2 Icon+Title+Desc · Style 3 JetBrains Mono + Giant Watermark)',
      },
      {
        label: 'Panel & MenuContainer',
        tab: 'panels',
        items:
          'PanelContainer, PanelHeader, PanelContent, PanelFooter (3-Stage Compound), UniversalThreeStageShell (Menu & Floating)',
      },
    ],
  },
  {
    code: 'L3. Compounds',
    name: 'Compound Controls (Composite interaction control)',
    rule: 'Self-contained universal interactive control assembled from primitives and layouts. With internal micro-states, No specific game business logic locked, dependency only L0~L2.',
    importPath: 'src/ui-core/compounds/*',
    badgeColor:
      'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40',
    modules: [
      {
        label: 'Dropdown & Tuner Composite Control',
        tab: 'composable-nesting',
        items:
          'DropdownMenu, TunerControls, UVTransformControl, ColorSwatchInput, PriorityQueueList, EventFilterMatrix, CollapsibleNumberedRailList, SettingActionRow, MainMenuRow',
      },
      {
        label: 'Dialogue Modaless Popup',
        tab: 'dialogue',
        items: 'Dialogue, DialogueModal, DialogueStackContainer, dialogue.show',
      },
      {
        label: 'Quick Notification Drawer Notification',
        tab: 'quick-notification',
        items:
          'QuickNotificationDrawer (Temporary / Persistent / Ongoing Tri-state Rendering)',
      },
    ],
  },
  {
    code: 'L4. Navigation',
    name: 'Navigation & Transitions (Navigation and motion engine)',
    rule: 'Focus on container geometry deformation, Three-stage state machine and modal focus shell. Any panel can be delegated for deformation, dependency only L0~L3.',
    importPath: 'src/ui-core/navigation/*',
    badgeColor:
      'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/40',
    modules: [
      {
        label: 'MorphContainer & HIG animation',
        tab: 'animation',
        items:
          'MorphContainer, FluidMorphTransition (0.28s), SequencedStepTransition (100+150+100ms), UI_EASING',
      },
      {
        label: 'MorphingShell & Side storage shell',
        tab: 'navigation',
        items:
          'MorphingShell, MorphingStageShell, LivePreviewDock, EdgeInspectorDrawer (TAB Zero-mask side drawer)',
      },
    ],
  },
  {
    code: 'L5. Specials',
    name: 'Game Specials (Game and telemetry exclusive)',
    rule: 'Professional visualization with strong domain semantics/Telemetry Unit. 5A/5B/5C/5D/5E/5F Six sub-domains are fully orthogonal, Independent, Keep Pure Props driver.',
    importPath:
      'src/ui-core/hud/* | src/ui-core/charts/* | src/ui-core/viewport/* | src/ui-core/loading/*',
    badgeColor:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    modules: [
      {
        label: '5A · Match HUD Independent Gauge',
        tab: 'hud-elements',
        items:
          'StepperScoreboardHUD, EdgePlayerHudStrip, BallCameraIndicator, VelocityProgressBar, CircularBoostGauge, CompactTelemetryBarHUD, FlipIndicatorPillHUD, KickoffRhythmOverlayHUD, StaticTrainingPackHUD',
      },
      {
        label: '5B · High-Clarity Telemetry Chart',
        tab: 'charts-curves',
        items:
          'TelemetrySparklineChart, EventImpulseScatterChart, ParametricTrajectoryChart, CubicBezierCurveEditor (0 External Dependency)',
      },
      {
        label: '5C · Viewport & Safe Area',
        tab: 'viewport-safe-area',
        items:
          'GameViewport (18:9 Pillarbox & 1:1 Portrait Gate), SafeAreaHud (-5%~+10% Overscan), viewportStore',
      },
      {
        label: '5D · Loading Two-layer progress pipeline',
        tab: 'loading-preview',
        items:
          'DualProgressBar (Global Step + Micro Step MB/s / Shimmer Wave + Circuit Breaker Alert), LoadingScreen',
      },
      {
        label: '5E · Center-Upper Alert Message',
        tab: 'center-upper-info',
        items:
          'CenterUpperInfoHUD (HudAnchorStage upper-center · JetBrains Mono Thin 3-2-1-GO 750ms · Regular+Thin Winner · Out Glow)',
      },
      {
        label: '5G · Takeover Handoff & Vignette',
        tab: 'takeover',
        items:
          'TakeoverCountdownHUD & TakeoverVignetteOverlay (HudAnchorStage bottom-center upward offset · Stationary Top Regular + 3-2-1 Bottom Thin Scale Pop · replacing-in Signal + 4-Edge Vignette Curve)',
      },
      {
        label: '5H · Multiplayer Name Tag & Boost',
        tab: 'name-tag-tuner',
        items:
          'NameTagTunerPage & NameTagPillRenderer (4 Boost Modes: Bottom-Up Fill / Left-Right Fill / Sunset Circle / Border Only · Analytical 2D Ball Entity Occlusion · Direct NameTagTunerFloatingWindow Content Reuse)',
      },
    ],
  },
  {
    code: 'L6. Patterns',
    name: 'Patterns & Recipes (Scene templates and reference recipes)',
    rule: 'By L0~L5 Complete reusable business panel recipe assembled from components (Recipes) With Window/Notification Orchestrator (Orchestrators), Copy and Use.',
    importPath: 'src/ui-core/recipes/* | src/ui-core/panels/*',
    badgeColor: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/40',
    modules: [
      {
        label: '6A · Layer 1-2-3 Menu Code Map',
        tab: 'recipes',
        items:
          'Layer1MainMenuRecipe, Layer2PlayRecipe, Layer2GarageRecipe, Layer2SettingsRecipe, Layer2ManageRoomRecipe, Layer3TrainingConfigRecipe, Layer3KeybindingsRecipe, Layer3AudioEqRecipe',
      },
      {
        label: '6C · Live Preview Sidebar Storage',
        tab: 'live-preview',
        items:
          'LivePreviewDock, MorphingStageShell, Layer3BallTrajectoryRecipe, livePreviewStore',
      },
      {
        label: '6D · Floating Window Multi-window layout',
        tab: 'floating-windows',
        items:
          'FloatingWindowManager, FloatingStackIcon, floatingStore, QuickNotificationSystem',
      },
      {
        label: '6E · Edge Inspector Side hover inspection',
        tab: 'edge-inspector',
        items:
          'EdgeInspectorDrawer (Right/Left + Top/Bottom Offset + 0% Backdrop), Layer5StaticTrainingPackEditRecipe, StaticTrainingShotInspectorView',
      },
    ],
  },
  {
    code: 'L7. Sandboxes',
    name: 'Sandboxes & Demos (Integrated drill and sandbox)',
    rule: 'Top-level host simulation and stress testing field. Move L0~L6 Perform high-level permutations for panoramic preview and automated regression testing, Strictly prohibit reverse referencing of lower-level components L7.',
    importPath: 'src/showcase/pages/*',
    badgeColor: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40',
    modules: [
      {
        label: '7A · Menu Layer full-link sandbox',
        tab: 'layer-preview',
        items:
          'MenuLayerPreviewPage (Layer 0 Match ⇄ Layer 1-2-3 Menu Tree + Dual Animation + Side pill folding + Floating window tray sync)',
      },
      {
        label: '7C · Notification Concurrent Integration Test',
        tab: 'notification-integration',
        items:
          'NotificationIntegrationPage (Persistent notification preemption recovery + Ongoing Yield + Multi-layer Dialogue 6 Large automation regression suite)',
      },
    ],
  },
];
