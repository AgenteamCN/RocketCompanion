import React from 'react';
import {
  Eye,
  Maximize2,
  TrendingUp,
  Compass,
  Gauge,
  RefreshCw,
  Zap,
  Repeat,
  Activity,
} from 'lucide-react';
import type { CameraSliderColorScheme } from '../../stores/cameraSettingsStyleStore';

export interface CameraConfig {
  cameraShake: boolean;
  fov: number;               // 60..110 (default 110)
  distance: number;          // 100..400 (default 270)
  height: number;            // 40..200 (default 100)
  angleDeg: number;          // -15..0 (default -4)
  stiffness: number;         // 0..1 (default 0.45)
  swivelSpeed: number;       // 1..10 (default 4.7)
  transitionSpeed: number;   // 1..2 (default 1.2)
  invertSwivel: boolean;
}

export interface CameraProfileSettings extends CameraConfig {
  presetId: string;
  fovDeg: number;
  distanceUu: number;
  heightUu: number;
}

export type CameraSettingsInput = Partial<CameraProfileSettings>;

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  cameraShake: false,
  invertSwivel: false,
  fov: 110,
  distance: 270,
  height: 90,
  angleDeg: -4.0,
  stiffness: 0.45,
  swivelSpeed: 4.7,
  transitionSpeed: 1.2,
};

export const DEFAULT_CAMERA_SETTINGS: Omit<CameraProfileSettings, 'presetId'> = {
  ...DEFAULT_CAMERA_CONFIG,
  fovDeg: 110,
  distanceUu: 270,
  heightUu: 90,
};

export function normalizeCameraSettings(
  base: CameraProfileSettings,
  input?: CameraSettingsInput
): CameraProfileSettings {
  if (!input) return base;
  const fov = input.fov ?? input.fovDeg ?? base.fov;
  const distance = input.distance ?? input.distanceUu ?? base.distance;
  const height = input.height ?? input.heightUu ?? base.height;
  return {
    presetId: input.presetId ?? base.presetId,
    cameraShake: input.cameraShake ?? base.cameraShake,
    invertSwivel: input.invertSwivel ?? base.invertSwivel,
    fov,
    fovDeg: fov,
    distance,
    distanceUu: distance,
    height,
    heightUu: height,
    angleDeg: input.angleDeg ?? base.angleDeg,
    stiffness: input.stiffness ?? base.stiffness,
    swivelSpeed: input.swivelSpeed ?? base.swivelSpeed,
    transitionSpeed: input.transitionSpeed ?? base.transitionSpeed,
  };
}

export function toCameraConfig(profile: CameraProfileSettings): CameraConfig {
  return {
    cameraShake: profile.cameraShake,
    invertSwivel: profile.invertSwivel,
    fov: profile.fov,
    distance: profile.distance,
    height: profile.height,
    angleDeg: profile.angleDeg,
    stiffness: profile.stiffness,
    swivelSpeed: profile.swivelSpeed,
    transitionSpeed: profile.transitionSpeed,
  };
}

export interface CameraSliderSpec {
  key: keyof Pick<
    CameraProfileSettings,
    | 'fovDeg'
    | 'distanceUu'
    | 'heightUu'
    | 'angleDeg'
    | 'stiffness'
    | 'swivelSpeed'
    | 'transitionSpeed'
  >;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hoverDescription: string;
}

export const CAMERA_SLIDER_SPECS: CameraSliderSpec[] = [
  {
    key: 'fovDeg',
    label: 'Field of View (FOV)',
    icon: Eye,
    iconColor: 'text-sky-400',
    min: 60,
    max: 110,
    step: 1,
    unit: '°',
    hoverDescription: 'Horizontal field of view in degrees (60° to 110°).',
  },
  {
    key: 'distanceUu',
    label: 'Distance',
    icon: Maximize2,
    iconColor: 'text-sky-400',
    min: 100,
    max: 400,
    step: 10,
    unit: ' UU',
    hoverDescription: 'Spring-arm trailing distance behind the vehicle in Unreal Units (UU).',
  },
  {
    key: 'heightUu',
    label: 'Height',
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    min: 40,
    max: 200,
    step: 10,
    unit: ' UU',
    hoverDescription: 'Vertical elevation offset above the vehicle roof in Unreal Units (UU).',
  },
  {
    key: 'angleDeg',
    label: 'Pitch Angle',
    icon: Compass,
    iconColor: 'text-amber-400',
    min: -15,
    max: 0,
    step: 1,
    unit: '°',
    hoverDescription: 'Downward pitch tilt angle of the camera lens (-15° to 0°).',
  },
  {
    key: 'stiffness',
    label: 'Stiffness',
    icon: Gauge,
    iconColor: 'text-amber-400',
    min: 0,
    max: 1,
    step: 0.05,
    unit: '',
    hoverDescription: 'Spring-arm damping stiffness during supersonic acceleration and turns.',
  },
  {
    key: 'swivelSpeed',
    label: 'Swivel Speed',
    icon: RefreshCw,
    iconColor: 'text-purple-400',
    min: 1,
    max: 10,
    step: 0.1,
    unit: '',
    hoverDescription: 'Manual right-stick free-look camera rotation speed.',
  },
  {
    key: 'transitionSpeed',
    label: 'Transition Speed',
    icon: Zap,
    iconColor: 'text-amber-500',
    min: 1,
    max: 2,
    step: 0.1,
    unit: '',
    hoverDescription: 'Interpolation speed when toggling between Car Cam and Ball Cam.',
  },
];

export interface CameraBooleanSpec {
  key: 'invertSwivel' | 'cameraShake';
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  hoverDescription: string;
}

export const CAMERA_BOOLEAN_SPECS: CameraBooleanSpec[] = [
  {
    key: 'invertSwivel',
    label: 'Invert Swivel',
    icon: Repeat,
    iconColor: 'text-sky-400',
    hoverDescription: 'Invert vertical right-stick free-look camera swivel pitch axis.',
  },
  {
    key: 'cameraShake',
    label: 'Camera Shake',
    icon: Activity,
    iconColor: 'text-rose-400',
    hoverDescription: 'Enable or disable screen shake on ball impacts, boosts, and demolitions.',
  },
];

export const resolveSliderFillClass = (
  scheme: CameraSliderColorScheme,
  isLight: boolean
): string => {
  if (scheme === 'amber') return 'bg-amber-500';
  if (scheme === 'orange') return 'bg-orange-500';
  if (scheme === 'sky') return 'bg-sky-500';
  if (scheme === 'emerald') return 'bg-emerald-500';
  if (scheme === 'rose') return 'bg-rose-500';
  return isLight ? 'bg-neutral-900' : 'bg-white';
};
