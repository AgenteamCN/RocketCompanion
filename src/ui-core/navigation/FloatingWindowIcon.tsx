import React from 'react';
import {
  Activity,
  Bot,
  Box,
  Camera,
  Car,
  Cpu,
  Crosshair,
  Database,
  Film,
  History,
  Keyboard,
  Palette,
  PencilRuler,
  Router,
  Shield,
  Sliders,
  Sparkles,
  Tag,
  Target,
  Volume2,
} from 'lucide-react';

export const RotateCcwClockIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4 shrink-0' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    data-lucide="rotate-ccw-clock"
    className={`lucide lucide-rotate-ccw-clock ${className}`}
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

export interface FloatingWindowIconProps {
  category?: string;
  id?: string;
  className?: string;
}

/**
 * Canonical unified icon resolver for floating windows, ghost flights, and minimized stack tray items.
 * Supports all RocketCompanion floating windows (User + Developer).
 */
export const getFloatingWindowIcon = (category?: string, id?: string, extraClass: string = 'h-4 w-4 shrink-0') => {
  const normId = (id || '').toLowerCase();
  const normCat = (category || '').toLowerCase();

  if (normId.includes('keyboard-input') || normCat.includes('keyboard')) {
    return <Keyboard className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normId.includes('spatial-audio') || normCat.includes('audio')) {
    return <Volume2 className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('diagnostic-dump') || normCat === 'diagnosticdump') {
    return <Database className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('training-ball-cam') || normCat === 'trainingballcam') {
    return <Camera className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('replay-viewer') || normId.includes('replay-director') || normCat.includes('replay')) {
    return <Film className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('name-tag') || normCat === 'nametagtuner') {
    return <Tag className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('goal-volume') || normCat === 'goalvolumetuner') {
    return <Box className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normId.includes('goal-barrier') || normCat === 'goalbarrier') {
    return <Shield className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('rewinder') || normCat === 'rewinder') {
    return <History className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('reachability') || normCat === 'reachability') {
    return <Crosshair className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normId.includes('vehicle') || normCat.includes('vehicle')) {
    return <Car className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('multi-bots') || normId.includes('bot-pack') || normCat === 'experimentalbots') {
    return <Bot className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normId.includes('atmosphere') || normCat === 'atmospherefx') {
    return <Sparkles className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('subsystem-isolation') || normCat === 'developerlab') {
    return <Cpu className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('kickoff') || normCat === 'training') {
    return <PencilRuler className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normId.includes('opacity') || normId.includes('pacing') || normCat === 'pacingtuner') {
    return <Sliders className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('boost') || normId.includes('pad')) {
    return <Sparkles className={`${extraClass} text-amber-500 dark:text-amber-400`} />;
  }

  if (normId.includes('driftwood') || normId.includes('stadium') || normCat === 'graphics') {
    return <Palette className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normCat.includes('network') || normId.includes('network')) {
    return <Router className={`${extraClass} text-violet-500 dark:text-violet-400`} />;
  }

  if (normId.includes('camera-determinism') || normCat === 'cameradeterminism') {
    return <Camera className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normCat === 'determinism' || normId.includes('determinism')) {
    return <Target className={`${extraClass} text-emerald-500 dark:text-emerald-400`} />;
  }

  if (normCat === 'observer' || normId.includes('stream') || normId.includes('oscillo')) {
    return <Activity className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  if (normCat === 'diagnostic' || normId.includes('telemetry') || normId.includes('performance')) {
    return <Activity className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
  }

  return <Activity className={`${extraClass} text-sky-500 dark:text-sky-400`} />;
};

export const FloatingWindowIcon: React.FC<FloatingWindowIconProps> = ({ category, id, className }) => {
  return <>{getFloatingWindowIcon(category, id, className)}</>;
};
