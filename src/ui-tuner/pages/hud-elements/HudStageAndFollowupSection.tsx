import React from 'react';
import { LayoutGrid, Zap } from 'lucide-react';
import { BallCameraIndicator } from '../../../ui-core/hud/BallCameraIndicator';
import { VelocityProgressBar } from '../../../ui-core/hud/VelocityProgressBar';
import { CircularBoostGauge } from '../../../ui-core/hud/CircularBoostGauge';
import { ArenaBackdrop } from '../../ArenaBackdrop';
import {
  type HudTransientChannel,
  type HudSpeedListener,
  type HudBoostListener,
  type HudBallCamListener,
} from '../../../ui-core/stores/hudTransientTypes';
import { GameViewport } from '../../components/GameViewport';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { HudFollowupOverlaysAndRecipeCard } from './HudFollowupOverlaysAndRecipeCard';

export type SlotLayoutPreset = 'classic-triad' | 'bottom-cluster' | 'edge-flush';

export interface HudStageBallCamConfig {
  active: boolean;
  subscribeFn?: (listener: HudBallCamListener) => () => void;
  shortcut: string | null;
  label: string;
  onToggle: () => void;
}

export interface HudStageAndFollowupSectionProps {
  isLight: boolean;
  is120HzLive: boolean;
  slotPreset: SlotLayoutPreset;
  setSlotPreset: (preset: SlotLayoutPreset) => void;
  ballCam: HudStageBallCamConfig;
  speed: number;
  subscribeSpeedFn?: (listener: HudSpeedListener) => () => void;
  boostAmount: number;
  isUnlimitedBoost: boolean;
  subscribeBoostFn?: (listener: HudBoostListener) => () => void;
  transientChannel: HudTransientChannel;
}

export const HudStageAndFollowupSection = React.memo<HudStageAndFollowupSectionProps>(
  ({
    isLight,
    is120HzLive,
    slotPreset,
    setSlotPreset,
    ballCam,
    speed,
    subscribeSpeedFn,
    boostAmount,
    isUnlimitedBoost,
    subscribeBoostFn,
    transientChannel,
  }) => {
    const {
      active: ballCamActive,
      subscribeFn: subscribeBallCamFn,
      shortcut: ballCamShortcut,
      label: ballCamLabel,
      onToggle: handleToggleBallCam,
    } = ballCam;
    return (
      <>
        <SectionErrorBoundary title="5A.5S Decoupled 3-Widget Stage" isLight={isLight}>
          <section id="hud-5a-5s-triad-stage" className="flex flex-col gap-4 scroll-mt-24">
            <div className="flex items-center justify-between border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="px-2 h-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs font-mono">
                  5A.5S
                </div>
                <h2 className="text-base font-bold tracking-tight">
                  Decoupled 3-Widget Stage (high frequency Speed/Boost + low frequency BallCam Zero-coupling slot test bench)
                </h2>
                <Badge variant="amber" size="sm" isLight={isLight}>
                  Layout-Agnostic Widgets
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                <LayoutGrid className="h-3.5 w-3.5 text-amber-500 mr-1" />
                <span className="text-neutral-400 text-[11px]">Slot Layout Experiment:</span>
                {(
                  [
                    { id: 'classic-triad', label: 'A. Classic Three-Point Anchor' },
                    { id: 'bottom-cluster', label: 'B. Bottom Compact Cluster' },
                    { id: 'edge-flush', label: 'C. Bottom edge full-width bar' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSlotPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-all ${
                      slotPreset === p.id
                        ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                        : isLight
                        ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
              Mount only the finalized version in this sandbox 3 Components (low frequency{' '}
              <code className="font-mono">BallCameraIndicator</code> + 120Hz high frequency{' '}
              <code className="font-mono">VelocityProgressBar</code> + 120Hz high frequency{' '}
              <code className="font-mono">CircularBoostGauge</code>). When switching top-right layout
              presets, <strong>No changes needed to internal component code</strong>, Position
              determined entirely by outer slot:
            </p>

            <div className="relative w-full h-[380px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-xl bg-black">
              <ArenaBackdrop preset={isLight ? 'daylight' : 'night'} brightness={isLight ? 80 : 30} />

              <div className="relative z-20 w-full h-full">
                <GameViewport isLight={isLight} className="w-full h-full">
                  <div className="relative w-full h-full pointer-events-none select-none p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="px-3 py-1 rounded-xl border bg-neutral-950/75 border-neutral-800 text-[11px] font-mono text-neutral-300 flex items-center gap-2 backdrop-blur-md">
                        <Zap className="h-3.5 w-3.5 text-emerald-400" />
                        <span>
                          Slot Preset: <strong className="text-amber-400 uppercase">{slotPreset}</strong>
                        </span>
                        <span className="text-neutral-600">|</span>
                        <span>
                          Drive: <strong className="text-emerald-400">{is120HzLive ? '120Hz Transient Ref' : 'Manual Props'}</strong>
                        </span>
                      </div>
                    </div>

                    {slotPreset === 'classic-triad' && (
                      <div className="w-full flex items-end justify-between gap-4">
                        <div className="w-1/4 flex justify-start">
                          <BallCameraIndicator
                            active={ballCamActive}
                            subscribeBallCam={subscribeBallCamFn}
                            shortcut={ballCamShortcut}
                            label={ballCamLabel}
                            isLight={isLight}
                            onToggle={handleToggleBallCam}
                          />
                        </div>

                        <div className="flex-1 max-w-[440px] flex flex-col items-center pb-1">
                          <VelocityProgressBar
                            speed={speed}
                            subscribeSpeed={subscribeSpeedFn}
                            width="100%"
                            height={16}
                          />
                        </div>

                        <div className="w-1/4 flex justify-end">
                          <CircularBoostGauge
                            amount={boostAmount}
                            isUnlimited={isUnlimitedBoost}
                            subscribeBoost={subscribeBoostFn}
                            isLight={isLight}
                          />
                        </div>
                      </div>
                    )}

                    {slotPreset === 'bottom-cluster' && (
                      <div className="w-full flex items-end justify-center gap-8">
                        <div className="flex flex-col items-start gap-2.5 w-[380px]">
                          <BallCameraIndicator
                            active={ballCamActive}
                            subscribeBallCam={subscribeBallCamFn}
                            shortcut={ballCamShortcut}
                            label={ballCamLabel}
                            isLight={isLight}
                            onToggle={handleToggleBallCam}
                          />
                          <VelocityProgressBar
                            speed={speed}
                            subscribeSpeed={subscribeSpeedFn}
                            width="100%"
                            height={14}
                          />
                        </div>

                        <CircularBoostGauge
                          amount={boostAmount}
                          isUnlimited={isUnlimitedBoost}
                          subscribeBoost={subscribeBoostFn}
                          isLight={isLight}
                        />
                      </div>
                    )}

                    {slotPreset === 'edge-flush' && (
                      <div className="w-full flex flex-col gap-3">
                        <div className="w-full flex items-end justify-between">
                          <BallCameraIndicator
                            active={ballCamActive}
                            subscribeBallCam={subscribeBallCamFn}
                            shortcut={ballCamShortcut}
                            label={ballCamLabel}
                            isLight={isLight}
                            onToggle={handleToggleBallCam}
                          />
                          <CircularBoostGauge
                            amount={boostAmount}
                            isUnlimited={isUnlimitedBoost}
                            subscribeBoost={subscribeBoostFn}
                            isLight={isLight}
                          />
                        </div>
                        <VelocityProgressBar
                          speed={speed}
                          subscribeSpeed={subscribeSpeedFn}
                          width="100%"
                          height={10}
                        />
                      </div>
                    )}
                  </div>
                </GameViewport>
              </div>
            </div>
          </section>
        </SectionErrorBoundary>

        <HudFollowupOverlaysAndRecipeCard
          isLight={isLight}
          is120HzLive={is120HzLive}
          boostAmount={boostAmount}
          isUnlimitedBoost={isUnlimitedBoost}
          transientChannel={transientChannel}
        />
      </>
    );
  }
);

HudStageAndFollowupSection.displayName = 'HudStageAndFollowupSection';
