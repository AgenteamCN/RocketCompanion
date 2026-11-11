import React from 'react';
import { Gauge } from 'lucide-react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { VelocityProgressBar, getVelocityBarColor } from '../../../ui-core/hud/VelocityProgressBar';
import { type HudSpeedListener } from '../../../ui-core/stores/hudTransientTypes';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';

const useState = createScopedSyncedState('page:hud-elements');

export interface HudSpeedAndBallCamTriadCardProps {
  isLight: boolean;
  subscribeSpeedFn?: (listener: HudSpeedListener) => () => void;
}

export const HudSpeedAndBallCamTriadCard = React.memo<HudSpeedAndBallCamTriadCardProps>(
  ({ isLight, subscribeSpeedFn }) => {
    const [is120HzLive, setIs120HzLive] = useState<boolean>(true, 'is120HzLive');
    const [speed, setSpeed] = useState<number>(1410, 'speed');
    const [barWidth, setBarWidth] = useState<string>('100%', 'barWidth');
    const [barHeight, setBarHeight] = useState<number>(20, 'barHeight');

    const velocityStatus = getVelocityBarColor(speed);

    return (
      <SectionErrorBoundary title="5A.4 · VelocityProgressBar" isLight={isLight}>
        <section id="hud-5a-4-velocity-bar" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-2 border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap">
            <div className="h-6 w-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs font-mono">
              5A.4
            </div>
            <h2 className="text-base font-bold tracking-tight">
              VelocityProgressBar (high frequency 120Hz · Square progress bar)
            </h2>
            <Badge variant="amber" size="sm" isLight={isLight}>
              120Hz Transient DOM Ref (0 React Re-render)
            </Badge>
            <span className="text-xs font-mono text-neutral-500">
              Zero Radius · Transparent Background · High-saturation gold-green-purple dynamic evolution · 85% Vertical Line
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div
              className={`lg:col-span-5 p-8 rounded-3xl border flex items-center justify-center transition-all ${
                isLight
                  ? 'bg-neutral-100/70 border-neutral-200/90 shadow-inner'
                  : 'bg-neutral-950 border-neutral-800/90 shadow-inner'
              }`}
            >
              <div className="w-full flex items-center justify-center">
                <VelocityProgressBar
                  speed={speed}
                  subscribeSpeed={subscribeSpeedFn}
                  width={barWidth}
                  height={barHeight}
                />
              </div>
            </div>

            <div
              className={`lg:col-span-7 p-6 rounded-3xl border flex flex-col justify-between gap-5 transition-colors shadow-2xs ${
                isLight
                  ? 'bg-white border-neutral-200/90 text-neutral-800'
                  : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
              }`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b pb-2.5 border-neutral-100 dark:border-neutral-800/70 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-bold font-mono tracking-wide">
                      CONFIGURATION PANEL: VELOCITY PROGRESS BAR
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {is120HzLive ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/40">
                        [Boost] 120Hz Transient channel direct drive (0 React Re-render)
                      </span>
                    ) : (
                      <>
                        <div
                          className="h-2.5 w-2.5 shadow-xs"
                          style={{ backgroundColor: velocityStatus.color }}
                        />
                        <span
                          className="font-mono text-xs font-black tabular-nums"
                          style={{ color: velocityStatus.color }}
                        >
                          {speed} uu/s ({velocityStatus.percent.toFixed(1)}%)
                        </span>
                        {velocityStatus.isSupersonic && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 font-bold border border-purple-500/40 animate-pulse">
                            SUPERSONIC
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <SliderControl
                  label="Real-time speed simulation (Dragging slider will pause 120Hz Stream and switch to manual inspection)"
                  value={speed}
                  min={0}
                  max={2300}
                  step={10}
                  unit=" uu/s"
                  colorScheme="emerald"
                  isLight={isLight}
                  onChange={(v) => {
                    setIs120HzLive(false);
                    setSpeed(v);
                  }}
                />

                <div className="flex flex-col gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                  <span className="text-xs font-semibold">Three-stage dynamics key node quick jump</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { val: 0, label: '0 (Static 0%)', activeCls: 'bg-amber-500 text-black border-amber-500 font-bold' },
                      { val: 1410, label: '1410 (Cruise 40%)', activeCls: 'bg-amber-500 text-black border-amber-500 font-bold' },
                      { val: 2200, label: '2200 (Vertical Line 85%)', activeCls: 'bg-purple-600 text-white border-purple-600 font-bold' },
                      { val: 2300, label: '2300 (Max Speed 100%)', activeCls: 'bg-purple-600 text-white border-purple-600 font-bold' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => {
                          setIs120HzLive(false);
                          setSpeed(item.val);
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                          !is120HzLive && speed === item.val
                            ? item.activeCls
                            : isLight
                            ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                            : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Border Width (Width)</span>
                    <div className="flex items-center gap-1 font-mono text-xs">
                      {['100%', '360px', '280px'].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setBarWidth(w)}
                          className={`px-2 py-0.5 rounded transition-all ${
                            barWidth === w
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                              : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Height (Height)</span>
                    <div className="flex items-center gap-1 font-mono text-xs">
                      {[12, 16, 20, 24].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setBarHeight(h)}
                          className={`px-2 py-0.5 rounded transition-all ${
                            barHeight === h
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                              : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {h}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="p-3 rounded-2xl text-[11px] font-mono flex items-start gap-2 border transition-colors"
                style={{
                  backgroundColor: `${velocityStatus.color}15`,
                  borderColor: `${velocityStatus.color}40`,
                  color: isLight ? '#0f172a' : '#f8fafc',
                }}
              >
                <div
                  className="h-2 w-2 mt-1 shrink-0"
                  style={{ backgroundColor: velocityStatus.color }}
                />
                <span>
                  Color Algorithm Spec: 0~1410 Pure Gold (#d4af37); 1410~2200 From Mid-Speed Dark
                  Green (#77ca7a) Linear transition to bright green (#59f168); &gt;=2200 Instant
                  Purple (#a020f0) Start supersonic heartbeat breathing effect. via Ref Direct
                  Change DOM style, 120Hz Zero Redraw.
                </span>
              </div>
            </div>
          </div>
        </section>
      </SectionErrorBoundary>
    );
  }
);

HudSpeedAndBallCamTriadCard.displayName = 'HudSpeedAndBallCamTriadCard';
