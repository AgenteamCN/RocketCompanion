import React from 'react';
import { Layers } from 'lucide-react';
import { CompactTelemetryBarHUD } from '../../../ui-core/hud/CompactTelemetryBarHUD';
import { FlipIndicatorPillHUD } from '../../../ui-core/hud/FlipIndicatorPillHUD';
import { KickoffRhythmOverlayHUD } from '../../../ui-core/hud/KickoffRhythmOverlayHUD';
import { StaticTrainingPackHUD } from '../../../ui-core/hud/StaticTrainingPackHUD';
import {
  type HudTransientChannel,
  type EditSubMode,
} from '../../../ui-core/stores/hudTransientTypes';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { CodeBlock } from '../../CodeBlock';

export interface HudFollowupOverlaysAndRecipeCardProps {
  isLight: boolean;
  is120HzLive: boolean;
  boostAmount: number;
  isUnlimitedBoost: boolean;
  transientChannel: HudTransientChannel;
}

export const HudFollowupOverlaysAndRecipeCard = React.memo<HudFollowupOverlaysAndRecipeCardProps>(
  ({ isLight, is120HzLive, boostAmount, isUnlimitedBoost, transientChannel }) => {
    const cardCls = isLight
      ? 'bg-neutral-50 border-neutral-200 text-neutral-900 shadow-xs'
      : 'bg-neutral-950 border-neutral-800/90 text-neutral-100';
    const headerTitleCls = `text-xs font-bold font-mono uppercase tracking-wider ${
      isLight ? 'text-amber-600' : 'text-amber-400'
    }`;

    return (
      <>
        <section className="flex flex-col gap-5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="px-2 h-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs font-mono">
                5A.6 ~ 5A.9
              </div>
              <h2 className="text-base font-bold tracking-tight">
                RocketCompanion 120Hz HUD Specialized Storage (`5A.6` ~ `5A.9` · Light/Dark Dual-mode adaptive)
              </h2>
              <Badge variant="amber" size="sm" isLight={isLight}>
                Zero React Re-render · Cached 2D Canvas + DOM Ref
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <SectionErrorBoundary
              title="5A.6 & 5A.7 CompactTelemetryBarHUD & FlipIndicatorPillHUD"
              isLight={isLight}
            >
              <div
                id="hud-5a-6-telemetry-flip"
                className={`p-6 rounded-3xl border flex flex-col justify-between gap-5 scroll-mt-24 ${cardCls}`}
              >
                <div className="flex items-center justify-between">
                  <span className={headerTitleCls}>
                    [5A.6 & 5A.7] CompactTelemetryBarHUD & FlipIndicatorPillHUD
                  </span>
                  <span className="text-[11px] font-mono text-emerald-500 font-bold">
                    0 VDOM Diff
                  </span>
                </div>

                <div className="flex flex-col gap-4 py-2">
                  <CompactTelemetryBarHUD
                    isLight={isLight}
                    subscribeTelemetry={
                      is120HzLive ? transientChannel.subscribeTelemetry : undefined
                    }
                  />
                  <div className="flex items-center gap-4">
                    <FlipIndicatorPillHUD
                      isLight={isLight}
                      subscribeFlip={is120HzLive ? transientChannel.subscribeFlip : undefined}
                    />
                  </div>
                </div>

                <p className={`text-[11px] font-mono ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  Top 4 Metric micro-capsules and bottom-left double-jump countdown status light: via{' '}
                  <code className="font-mono text-amber-500">subscribeTelemetry</code> and{' '}
                  <code className="font-mono text-amber-500">subscribeFlip</code> Direct Modification DOM Node text and progress bar width.
                </p>
              </div>
            </SectionErrorBoundary>
          </div>

          <SectionErrorBoundary title="5A.9 KickoffRhythmOverlayHUD" isLight={isLight}>
            <div
              id="hud-5a-9-kickoff-rhythm"
              className={`p-6 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${cardCls}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={headerTitleCls}>
                  [5A.9] KickoffRhythmOverlayHUD (120Hz Cached 2D Canvas Falling Note Highway + 9-Key Receptor Row)
                </span>
                <span className="text-[11px] font-mono text-emerald-500 font-bold">
                  subscribeKickoffFrame Connected · Zero Heap Alloc
                </span>
              </div>
              <KickoffRhythmOverlayHUD
                isLight={isLight}
                subscribeKickoffFrame={
                  is120HzLive ? transientChannel.subscribeKickoffFrame : undefined
                }
              />
            </div>
          </SectionErrorBoundary>

          <SectionErrorBoundary title="5A.10 StaticTrainingPackHUD" isLight={isLight}>
            <div
              id="hud-5a-10-static-training-pack"
              className={`p-6 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${cardCls}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={headerTitleCls}>
                  [5A.10] StaticTrainingPackHUD (Top-Center Shot Banner & Sub-Mode Selector)
                </span>
                <span className="text-[11px] font-mono text-sky-500 font-bold">
                  Pure Props Memo · Shared with 6E Edge Inspector
                </span>
              </div>
              <div className="relative min-h-[110px] rounded-2xl border border-neutral-500/20 flex items-center justify-center overflow-hidden">
                <StaticTrainingPackHUD
                  isLight={isLight}
                  shotIndex={0}
                  editSubMode={'car-heading' as EditSubMode}
                  shot={{
                    car: {
                      unlimitedBoost: isUnlimitedBoost,
                      initialBoost: boostAmount,
                      snapToGround: true,
                      hasFlip: true,
                      speedFollowsHeading: false,
                    },
                  }}
                  className="!static !translate-x-0"
                />
              </div>
            </div>
          </SectionErrorBoundary>
        </section>

        <section className="flex flex-col gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">
              Agent Copy call recipe (120Hz Transient & Memo HUD Recipe)
            </h3>
          </div>
          <CodeBlock
            isLight={isLight}
            title="120Hz Transient Zero-Repaint HUD + low frequency BallCam Decoupled Call Example"
            code={`import { BallCameraIndicator } from '@/ui-core/hud/BallCameraIndicator';
import { VelocityProgressBar } from '@/ui-core/hud/VelocityProgressBar';
import { CircularBoostGauge } from '@/ui-core/hud/CircularBoostGauge';
import { createHudTransientChannel } from '@/ui-core/stores/hudTransientChannel';

const hudChannel = createHudTransientChannel({ speed: 0, boostAmount: 100 });

<BallCameraIndicator
  active={isBallCamActive}
  shortcut="SPACE"
  onToggle={() => setBallCamActive((v) => !v)}
/>

<VelocityProgressBar
  subscribeSpeed={hudChannel.subscribeSpeed}
  width="100%"
  height={20}
/>

<CircularBoostGauge
  subscribeBoost={hudChannel.subscribeBoost}
  size={148}
  isLight={isLight}
/>`}
          />
        </section>
      </>
    );
  }
);

HudFollowupOverlaysAndRecipeCard.displayName = 'HudFollowupOverlaysAndRecipeCard';
