import React, { lazy } from 'react';
import type { DeepLayerRecipeSpec } from './deepLayerOnlineRecipeSpecs';

const Layer3ExpMultiBotsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3ExpMultiBotsRecipe').then((m) => ({
    default: m.Layer3ExpMultiBotsRecipe,
  }))
);
const Layer3ExpBotPackRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3ExpBotPackRecipe').then((m) => ({
    default: m.Layer3ExpBotPackRecipe,
  }))
);
const Layer3DevSandboxesRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevSandboxesRecipe').then((m) => ({
    default: m.Layer3DevSandboxesRecipe,
  }))
);
const Layer3DevActiveTunersRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevActiveTunersRecipe').then((m) => ({
    default: m.Layer3DevActiveTunersRecipe,
  }))
);
const Layer3DevCalibratedPresetsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevCalibratedPresetsRecipe').then((m) => ({
    default: m.Layer3DevCalibratedPresetsRecipe,
  }))
);
const Layer3DevSelfTestRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevSelfTestRecipe').then((m) => ({
    default: m.Layer3DevSelfTestRecipe,
  }))
);
const Layer3DevUnderDevelopmentRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevUnderDevelopmentRecipe').then((m) => ({
    default: m.Layer3DevUnderDevelopmentRecipe,
  }))
);
const Layer3DevRemoteProfileRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevRemoteProfileRecipe').then((m) => ({
    default: m.Layer3DevRemoteProfileRecipe,
  }))
);
const Layer3DevQuickActionsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3DevQuickActionsRecipe').then((m) => ({
    default: m.Layer3DevQuickActionsRecipe,
  }))
);
const Layer4StaticTrainingPackBrowseRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer4StaticTrainingPackBrowseRecipe').then((m) => ({
    default: m.Layer4StaticTrainingPackBrowseRecipe,
  }))
);
const StaticTrainingShotInspectorDrawer = lazy(() =>
  import('../../../ui-core/recipes/StaticTrainingShotInspectorDrawer').then((m) => ({
    default: m.StaticTrainingShotInspectorDrawer,
  }))
);
const Layer4AdvancedAudioRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer4AdvancedAudioRecipe').then((m) => ({
    default: m.Layer4AdvancedAudioRecipe,
  }))
);
const Layer4ControllerSettingsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer4ControllerSettingsRecipe').then((m) => ({
    default: m.Layer4ControllerSettingsRecipe,
  }))
);
const Layer4EventTriggerRulesRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer4EventTriggerRulesRecipe').then((m) => ({
    default: m.Layer4EventTriggerRulesRecipe,
  }))
);
const Layer4DevSignalingLabRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer4DevSignalingLabRecipe').then((m) => ({
    default: m.Layer4DevSignalingLabRecipe,
  }))
);

const noop = () => {};

export const DEEP_LAYER_DEV_AND_L4_RECIPE_SPECS: DeepLayerRecipeSpec[] = [
  {
    id: 'recipe-6a-13-multibots',
    code: '6A.13',
    badgeColor: 'amber',
    title: 'Layer 3 Experimental Multi-Bots 3v3 (Dual Team 6 Independent Slots ONNX Bot Layout & POV Select)',
    panelId: 'layer3-exp-multi-bots',
    tunerLabel: 'Layer 3 Experimental Multi-Bots (3v3)',
    recommendation: 'Dual Team 6 Independent Slots ONNX Bot Layout & POV Select',
    renderPreview: (isLight) => <Layer3ExpMultiBotsRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-13b-botpack',
    code: '6A.13B',
    badgeColor: 'amber',
    title: 'Layer 3 Experimental Bot Pack #9700488 (8 Native SafeTensors RLBot Models Showcase)',
    panelId: 'layer3-exp-botpack',
    tunerLabel: 'Layer 3 Experimental Bot Pack #9700488',
    recommendation: 'Spectate the 8 native SafeTensors models from RLBot Pack #9700488 in recommended match formats.',
    renderPreview: (isLight) => <Layer3ExpBotPackRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-14-rcspack',
    code: '6A.14',
    badgeColor: 'sky',
    title: 'Layer 4 Static Training Pack Browser (.RCSPack Dual-column training pack browser and metadata inspector)',
    panelId: 'layer4-static-training-pack',
    tunerLabel: 'Layer 4 Static Training Pack Browser (.RCSPack)',
    recommendation: 'Dual-column training pack browser and metadata inspector',
    renderPreview: (isLight) => <Layer4StaticTrainingPackBrowseRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-14b-shot-inspector',
    code: '6A.14B',
    badgeColor: 'sky',
    title: 'Layer 4 Static Training Shot Inspector Drawer (Per-shot initial state, trajectory & variable editor)',
    panelId: 'layer4-static-training-pack',
    tunerLabel: 'Layer 4 Static Training Shot Inspector Drawer',
    recommendation: 'Fixed height 680px side-docked inspector drawer for editing individual training shots.',
    renderPreview: (isLight) => <StaticTrainingShotInspectorDrawer isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-15-adv-audio',
    code: '6A.15',
    badgeColor: 'sky',
    title: 'Layer 4 Advanced Audio Synthesis Pool (Boost and Rumble Stage sample matrix tuning)',
    panelId: 'layer4-advanced-audio',
    tunerLabel: 'Layer 4 Advanced Audio Synthesis Pool',
    recommendation: 'Boost and Rumble Stage sample matrix tuning',
    renderPreview: (isLight) => <Layer4AdvancedAudioRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-16-adv-ctrl',
    code: '6A.16',
    badgeColor: 'sky',
    title: 'Layer 4 Controller Settings (Controller Axis Mapping and Turning / Dodging Deadzone Visualization)',
    panelId: 'layer4-controller-settings',
    tunerLabel: 'Layer 4 Controller Settings',
    recommendation: 'Gamepad input device detection, 4-Axis Mapping, Deadzone / Dodge Deadzone High-performance dual-graph deadzone visualization',
    renderPreview: (isLight) => <Layer4ControllerSettingsRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-17-triggers',
    code: '6A.17',
    badgeColor: 'sky',
    title: 'Layer 4 Event & Trigger Rules Engine (Dual-cursor threshold conditions and automatic training action trigger engine)',
    panelId: 'layer4-event-trigger-rules',
    tunerLabel: 'Layer 4 Event & Trigger Rules Engine',
    recommendation: 'Dual-cursor threshold conditions and automatic training action trigger engine',
    renderPreview: (isLight) => <Layer4EventTriggerRulesRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-20-dev-isolation',
    code: '6A.20',
    badgeColor: 'amber',
    title: 'Layer 3 Sandboxes & Isolation Lab (6 Physics & AI Independent subsystem verification sandbox)',
    panelId: 'layer3-dev-sandboxes',
    tunerLabel: 'Layer 3 Sandboxes & Isolation Lab (6-Tab Launcher)',
    recommendation: '6 Physics & AI Independent subsystem verification sandbox',
    renderPreview: (isLight) => <Layer3DevSandboxesRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-21-dev-tuners',
    code: '6A.21',
    badgeColor: 'amber',
    title: 'Layer 3 Active Tuners & Phase Matrix (Active tuning floating window launcher and phase matrix)',
    panelId: 'layer3-dev-active-tuners',
    tunerLabel: 'Layer 3 Active Tuners & Phase Matrix',
    recommendation: 'Active parameter tuning floating window launcher and L3 PhaseVariationMatrix Phase Matrix',
    renderPreview: (isLight) => <Layer3DevActiveTunersRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-22-dev-presets',
    code: '6A.22',
    badgeColor: 'amber',
    title: 'Layer 3 Calibrated Presets & Tuners (10 Physical baseline solidified/Camera/Shader tuner floating window summary)',
    panelId: 'layer3-dev-calibrated-presets',
    tunerLabel: 'Layer 3 Calibrated Presets & Tuners',
    recommendation: '10 Physical baseline solidified/Camera/Shader tuner floating window summary',
    renderPreview: (isLight) => <Layer3DevCalibratedPresetsRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-23-dev-under-dev',
    code: '6A.23',
    badgeColor: 'amber',
    title: 'Layer 3 Under Development (Three-Wheeler · Throwback Stadium · Per-Car Boost · Camera Shake)',
    panelId: 'layer3-dev-under-development',
    tunerLabel: 'Layer 3 Under Development (Experimental features lab)',
    recommendation: '3-Wheel Mode, Retro Arena, Bike Boost Fine-tuning and collision camera shake parameter panel',
    renderPreview: (isLight) => <Layer3DevUnderDevelopmentRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-24-dev-self-test',
    code: '6A.24',
    badgeColor: 'amber',
    title: 'Layer 3 Developer Self Test (Automated subsystem self-test suites and verification harnesses)',
    panelId: 'layer3-dev-self-test',
    tunerLabel: 'Layer 3 Developer Self Test',
    recommendation: 'Automated diagnostic and self-test suites available for the active developer environment',
    renderPreview: (isLight) => <Layer3DevSelfTestRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-25-dev-signaling-lab',
    code: '6A.25',
    badgeColor: 'sky',
    title: 'Layer 4 4-Server Signaling & Dual Bridge Lab (emqx_cn · emqx_gb · supabase_jp · supabase_sg Full-Mesh Diagnostic)',
    panelId: 'layer4-dev-signaling-lab',
    tunerLabel: 'Layer 4 4-Server Signaling & Dual Bridge Lab',
    recommendation: '4-Server Full-Mesh, Dual Edge Function fanout, 5-layer anti-loop guards, and One-Click Full Diagnostic',
    renderPreview: (isLight) => <Layer4DevSignalingLabRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-27-dev-remote-profile',
    code: '6A.27',
    badgeColor: 'amber',
    title: 'Layer 3 Remote Profile Management (Cloud Account Directory & Live Remote Profile Tuning)',
    panelId: 'layer3-dev-remote-profile',
    tunerLabel: 'Layer 3 Remote Profile Management',
    recommendation: '2-Tab cloud user account directory and live remote profile tuning.',
    renderPreview: (isLight) => <Layer3DevRemoteProfileRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-28-dev-quick-actions',
    code: '6A.28',
    badgeColor: 'amber',
    title: 'Layer 3 Developer Quick Actions (Developer Mode Auto-Activated Quick Toggles)',
    panelId: 'layer3-dev-quick-actions',
    tunerLabel: 'Layer 3 Developer Quick Actions',
    recommendation: 'Developer quick actions auto-activated in Developer Mode and deployable to remote profiles.',
    renderPreview: (isLight) => <Layer3DevQuickActionsRecipe isLight={isLight} onBack={noop} />,
  },
];
