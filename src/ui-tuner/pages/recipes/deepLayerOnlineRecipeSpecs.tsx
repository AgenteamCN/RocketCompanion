import React, { lazy } from 'react';
import { MultiStateRecipeShootoutStage } from './MultiStateRecipeShootoutStage';
import {
  LAYER2_MANAGE_ROOM_STATES,
  LAYER3_HOST_TRAINING_STATES,
} from './recipeStateMatrixSpecs';
import type { MenuPanelId } from '../../../ui-core/tokens/menuLayoutTokens';

export interface DeepLayerRecipeSpec {
  id: string;
  code: string;
  badgeColor: 'emerald' | 'amber' | 'sky';
  title: string;
  panelId: MenuPanelId;
  tunerLabel: string;
  recommendation: string;
  renderPreview: (isLight: boolean) => React.ReactNode;
}

const Layer2ManageRoomRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer2ManageRoomRecipe').then((m) => ({
    default: m.Layer2ManageRoomRecipe,
  }))
);
const Layer3HostTrainingRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3HostTrainingRecipe').then((m) => ({
    default: m.Layer3HostTrainingRecipe,
  }))
);
const Layer3CustomPlayRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3CustomPlayRecipe').then((m) => ({
    default: m.Layer3CustomPlayRecipe,
  }))
);
const Layer3ExhibitionRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3ExhibitionRecipe').then((m) => ({
    default: m.Layer3ExhibitionRecipe,
  }))
);
const Layer3SelfTrainingRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3SelfTrainingRecipe').then((m) => ({
    default: m.Layer3SelfTrainingRecipe,
  }))
);
const Layer3KickoffTrainingRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3KickoffTrainingRecipe').then((m) => ({
    default: m.Layer3KickoffTrainingRecipe,
  }))
);
const Layer3TrainingConfigRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3TrainingConfigRecipe').then((m) => ({
    default: m.Layer3TrainingConfigRecipe,
  }))
);
const Layer3CameraRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3CameraRecipe').then((m) => ({
    default: m.Layer3CameraRecipe,
  }))
);
const Layer3KeybindingsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3KeybindingsRecipe').then((m) => ({
    default: m.Layer3KeybindingsRecipe,
  }))
);
const Layer3BallTrajectoryRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer3BallTrajectoryRecipe').then((m) => ({
    default: m.Layer3BallTrajectoryRecipe,
  }))
);

const noop = () => {};

export const DEEP_LAYER_ONLINE_AND_USER_RECIPE_SPECS: DeepLayerRecipeSpec[] = [
  {
    id: 'recipe-6a-8-host-ctrl',
    code: '6A.8',
    badgeColor: 'emerald',
    title: 'Layer 2 Online Room Control Hub (6-State Matrix & Single Stage · Match Lobby / During Match / Online Warmup · Host & Client)',
    panelId: 'layer2-manage-room',
    tunerLabel: 'Layer 2 Online Room Control Hub (Online Room Console)',
    recommendation: '6-state matrix or single stage rendering Match Lobby, During Match, and Online Warmup for both Host and Client roles via StoreSnapshotScope.',
    renderPreview: (isLight) => (
      <MultiStateRecipeShootoutStage
        referenceCode="6A.8"
        states={LAYER2_MANAGE_ROOM_STATES}
        badgeColor="amber"
        isLight={isLight}
        renderStateCard={(st) => (
          <Layer2ManageRoomRecipe
            isLight={isLight}
            activeTab={st.props.sessionContext}
            onBack={noop}
          />
        )}
      />
    ),
  },
  {
    id: 'recipe-6a-19-host-train',
    code: '6A.19',
    badgeColor: 'emerald',
    title: 'Layer 3 Host Training (4-State Matrix & Single Stage · Idle / Registering Step 3 / Ready Step 5 / Error Step 3)',
    panelId: 'layer3-host-training',
    tunerLabel: 'Layer 3 Host Training (Online Shared Training Setup)',
    recommendation: '4-state matrix or single stage rendering Host Training room creation lifecycle states via StoreSnapshotScope.',
    renderPreview: (isLight) => (
      <MultiStateRecipeShootoutStage
        referenceCode="6A.19"
        states={LAYER3_HOST_TRAINING_STATES}
        badgeColor="emerald"
        isLight={isLight}
        renderStateCard={() => (
          <Layer3HostTrainingRecipe isLight={isLight} onBack={noop} />
        )}
      />
    ),
  },
  {
    id: 'recipe-6a-9-bot-diff',
    code: '6A.9',
    badgeColor: 'emerald',
    title: 'Layer 3 Exhibition Match Setup (Offline Exhibition and Nexto/Necto Difficulty Settings)',
    panelId: 'layer3-exhibition',
    tunerLabel: 'Layer 3 Exhibition Match Setup',
    recommendation: 'Configure Offline Format, Nexto/Necto Difficulty and match duration',
    renderPreview: (isLight) => <Layer3ExhibitionRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-10-self-train',
    code: '6A.10',
    badgeColor: 'emerald',
    title: 'Layer 3 Self-Training Hub (Solo training 2x2 grid entry)',
    panelId: 'layer3-self-training',
    tunerLabel: 'Layer 3 Self-Training Hub',
    recommendation: 'Solo training four-grid entry',
    renderPreview: (isLight) => <Layer3SelfTrainingRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-11-kickoff',
    code: '6A.11',
    badgeColor: 'emerald',
    title: 'Layer 3 Kickoff Training Setup (Kickoff training sub-mode and 120Hz Rhythm Track Settings)',
    panelId: 'layer3-kickoff-training',
    tunerLabel: 'Layer 3 Kickoff Training Setup',
    recommendation: 'Kick-off training sub-mode, AI Mirrored Position and 120Hz Rhythm Track Toggle',
    renderPreview: (isLight) => <Layer3KickoffTrainingRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-12-camera',
    code: '6A.12',
    badgeColor: 'emerald',
    title: 'Layer 3 Camera Settings (Camera geometry parameters and Hold Live Preview [TAB])',
    panelId: 'layer3-camera',
    tunerLabel: 'Layer 3 Camera Settings',
    recommendation: 'Camera geometry parameters and Hold Live Preview [TAB]',
    renderPreview: (isLight) => <Layer3CameraRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-12b-keybindings',
    code: '6A.12B',
    badgeColor: 'emerald',
    title: 'Layer 3 Key Bindings & Controls (Three-column key and controller mapping table + Advanced Stick Settings)',
    panelId: 'layer3-keybindings',
    tunerLabel: 'Layer 3 Key Bindings & Controls',
    recommendation: 'Three-column key and controller mapping table + Advanced Stick Settings',
    renderPreview: (isLight) => <Layer3KeybindingsRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-12c-trajectory',
    code: '6A.12C',
    badgeColor: 'emerald',
    title: 'Layer 3 Ball Trajectory Predictor (Trajectory Prediction Time, Dashed line interval and color config)',
    panelId: 'layer3-ball-trajectory',
    tunerLabel: 'Layer 3 Ball Trajectory Predictor (Live Preview)',
    recommendation: 'Trajectory Prediction Time, Dashed line interval and color config',
    renderPreview: (isLight) => <Layer3BallTrajectoryRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-18-training',
    code: '6A.18',
    badgeColor: 'emerald',
    title: 'Layer 3 Training Configuration (Trajectory Prediction Toggle, Goal Barrier and TAS Rewinder Timeline Access)',
    panelId: 'layer3-training-config',
    tunerLabel: 'Layer 3 Training Configuration',
    recommendation: 'Trajectory Prediction Toggle, Goal Barrier and TAS Rewinder Timeline Access',
    renderPreview: (isLight) => <Layer3TrainingConfigRecipe isLight={isLight} onBack={noop} />,
  },
  {
    id: 'recipe-6a-26-custom-play',
    code: '6A.26',
    badgeColor: 'emerald',
    title: 'Layer 3 Custom Play (Custom Game Modes & Mutator Presets Placeholder)',
    panelId: 'layer3-custom-play',
    tunerLabel: 'Layer 3 Custom Play',
    recommendation: 'Auto-Fit: Under-construction placeholder for custom game modes and mutator rule builders.',
    renderPreview: (isLight) => <Layer3CustomPlayRecipe isLight={isLight} onBack={noop} />,
  },
];
