import React, { useState } from 'react';
import { Film, RotateCcw, Download, Check, VolumeX } from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../../config/replayDirectorConfig';
import { useReplayDirectorStore } from '../../stores/replayDirectorStore';
import { getReplayDirectorConfig, updateReplayDirectorConfig, resetReplayDirectorConfig } from '../../config/replayDirectorConfig';
import { audioConfig } from '../../config/audioConfig';
import { useAppStore } from '../../stores/appStore';
import { useSubsystemIsolationLabStore } from '../../stores/subsystemIsolationLabStore';
import { useSpatialAudioStore } from '../../stores/spatialAudioStore';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { ReplayDirectorOrientationCard } from './replay-director-tuner/ReplayDirectorOrientationCard';
import { ReplayDirectorCameraCard } from './replay-director-tuner/ReplayDirectorCameraCard';

export const SURFACE_META: SurfaceMeta = {
  id: 'replay-director-tuner',
  title: 'Replay Director Camera & Slow-Mo Tuner',
  subtitle: '.rcgr.gz Goal Replay · 3D Arena Preview · 2-Touch Lookahead',
  description:
    '.rcgr.gz Goal Replay container export/import, 3D Arena preview, anomaly peak seek chips & +-15f window.',
  icon: 'Film',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 485,
    height: 640,
    minHeight: 200,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'framing',
      label: 'Corridor & Damping',
      description: 'Suffix safe-zone, camera elevation, smoothing damping & corridor distances',
    },
    {
      variantId: 'lookahead',
      label: '2-Touch Lookahead',
      description: 'Scoring anchors, opponent interceptors & 2-touch anticipation weights',
    },
    {
      variantId: 'slowmo',
      label: 'Slow-Mo Windows',
      description: 'Final touch impact slow-mo window & goal-line crossing speed scale',
    },
  ],
};

export interface ReplayDirectorTunerFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const ReplayDirectorTunerFloatingWindow: React.FC<ReplayDirectorTunerFloatingWindowProps> = ({
  isLight = false,
  active = true,
  activeTab,
  onTabChange,
}) => {
  const cfg = useReplayDirectorStore((s) => s.config);
  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const handleMuteSignalAudioChange = (mute: boolean) => {
    const next = Boolean(mute);
    updateReplayDirectorConfig({ muteSignalAudioInGoalReplay: next });
    try {
      audioConfig.set('muteSignalAudioInGoalReplay', next);
      useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
        goalReplayMuteSignalAudio: next,
      });
      useSpatialAudioStore.getState().updateTunerConfig({
        muteSignalAudioInGoalReplay: next,
      });
    } catch {
      // Ignore if store/config is unavailable
    }
  };

  const handleResetAll = () => {
    resetReplayDirectorConfig();
    useAppStore.getState().setFreeCamFov(DEFAULT_REPLAY_DIRECTOR_FOV_DEG);
    try {
      audioConfig.set('muteSignalAudioInGoalReplay', true);
      useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
        goalReplayMuteSignalAudio: true,
      });
      useSpatialAudioStore.getState().updateTunerConfig({
        muteSignalAudioInGoalReplay: true,
      });
    } catch {
      // Ignore if store/config is unavailable
    }
  };

  const handleCopyJson = () => {
    const json = JSON.stringify(getReplayDirectorConfig(), null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(json).catch((err) => {
        console.warn('[ReplayDirectorTuner] Failed to copy director config JSON to clipboard:', err);
      });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const subPanelBg = isLight
    ? 'bg-white border-neutral-200'
    : 'bg-neutral-900/60 border-neutral-800/80';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className="flex flex-col gap-2.5 select-none">
      {/* Header Summary Card */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Film className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="font-bold text-xs truncate">
              Replay Director AutoCam & Slow-Mo Tuner
            </span>
          </div>
          <Badge variant="amber" size="sm" isLight={isLight} className="font-mono text-[10px]">
            LIVE CONFIG
          </Badge>
        </div>
        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          Real-time tuning for <code>REPLAY_DIRECTOR_CONFIG</code> in{' '}
          <code>replayDirectorConfig.js</code>. Import historical downloaded Director Pattern CSVs to
          preview, scrub, and exit in the 3D Arena, or adjust damping rates, corridor distances,
          2-touch anticipation, and slow-motion plateaus live.
        </p>

        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 mt-0.5 ${subPanelBg}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <VolumeX className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-[11px] truncate">
                Mute Signal Audio in Goal Replay
              </span>
              <span className={`text-[10px] truncate ${mutedText}`}>
                Suppress kickoff 3-2-1 &amp; 10s/30s/60s timer signal cues during Goal Replay
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={Boolean(cfg.muteSignalAudioInGoalReplay ?? true)}
            onCheckedChange={handleMuteSignalAudioChange}
            isLight={isLight}
            variant="amber"
          />
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetAll}
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            <RotateCcw className="h-3 w-3 text-amber-400 shrink-0" />
            <span>Reset Defaults</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyJson}
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Copied JSON!</span>
              </>
            ) : (
              <>
                <Download className="h-3 w-3 text-sky-400 shrink-0" />
                <span>Copy Config JSON</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <ReplayDirectorOrientationCard isLight={isLight} />
      <ReplayDirectorCameraCard
        isLight={isLight}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </div>
  );
};

export default ReplayDirectorTunerFloatingWindow;
