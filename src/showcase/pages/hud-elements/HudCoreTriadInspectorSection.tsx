import React from 'react';
import { Sliders } from 'lucide-react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { BallCameraIndicator } from '../../../ui-core/hud/BallCameraIndicator';
import {
  type HudSpeedListener,
  type HudBoostListener,
  type HudBallCamListener,
} from '../../../ui-core/stores/hudTransientTypes';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { HudBoostGaugeTunerSection } from './HudBoostGaugeTunerSection';
import { HudSpeedAndBallCamTriadCard } from './HudSpeedAndBallCamTriadCard';

const useState = createScopedSyncedState('page:hud-elements');

export interface HudCoreTriadInspectorSectionProps {
  isLight: boolean;
  handleToggleBallCam: () => void;
  subscribeBallCamFn?: (listener: HudBallCamListener) => () => void;
  subscribeSpeedFn?: (listener: HudSpeedListener) => () => void;
  subscribeBoostFn?: (listener: HudBoostListener) => () => void;
}

export const HudCoreTriadInspectorSection = React.memo<HudCoreTriadInspectorSectionProps>(
  ({
    isLight,
    handleToggleBallCam,
    subscribeBallCamFn,
    subscribeSpeedFn,
    subscribeBoostFn,
  }) => {
    const [is120HzLive, setIs120HzLive] = useState<boolean>(true, 'is120HzLive');
    const [ballCamActive, setBallCamActive] = useState<boolean>(true, 'ballCamActive');
    const [ballCamShortcut, setBallCamShortcut] = useState<string | null>(
      'SPACE',
      'ballCamShortcut'
    );
    const [ballCamLabel, setBallCamLabel] = useState<string>('BALL CAM', 'ballCamLabel');
    const [boostAmount, setBoostAmount] = useState<number>(35, 'boostAmount');
    const [isUnlimitedBoost, setIsUnlimitedBoost] = useState<boolean>(
      false,
      'isUnlimitedBoost'
    );
    const [, setGaugeSize] = useState<number>(148, 'gaugeSize');

    return (
      <>
        {/* ELEMENT 1: BALL CAMERA INDICATOR (LOW-FREQUENCY DISCRETE) */}
        <SectionErrorBoundary title="5A.3 BallCameraIndicator" isLight={isLight}>
          <section id="hud-5a-3-ball-cam" className="flex flex-col gap-4 scroll-mt-24">
            <div className="flex items-center gap-2 border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap">
              <div className="h-6 w-6 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center font-bold text-xs font-mono">
                5A.3
              </div>
              <h2 className="text-base font-bold tracking-tight">
                BallCameraIndicator (Low-Frequency Discrete · Ball View Indicator)
              </h2>
              <Badge variant="neutral" size="sm" isLight={isLight}>
                Low-Frequency · React.memo Isolated
              </Badge>
              <span className="text-xs font-mono text-neutral-500">
                Left-aligned dual red labels · Right-side split pane left-aligned
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
                <BallCameraIndicator
                  active={ballCamActive}
                  subscribeBallCam={subscribeBallCamFn}
                  shortcut={ballCamShortcut}
                  label={ballCamLabel}
                  actionText="TO TOGGLE"
                  isLight={isLight}
                  onToggle={handleToggleBallCam}
                />
              </div>

              <div
                className={`lg:col-span-7 p-6 rounded-3xl border flex flex-col justify-between gap-5 transition-colors shadow-2xs ${
                  isLight
                    ? 'bg-white border-neutral-200/90 text-neutral-800'
                    : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
                }`}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b pb-2.5 border-neutral-100 dark:border-neutral-800/70">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-bold font-mono tracking-wide">
                        CONFIGURATION PANEL: BALL CAMERA (LOW-FREQ)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-neutral-500">
                        {ballCamActive ? '● BALL CAM' : '○ CAR CAM'}
                      </span>
                      <Badge
                        variant={ballCamActive ? 'danger' : 'neutral'}
                        size="sm"
                        isLight={isLight}
                      >
                        {ballCamActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Main Switch (Active Toggle)</span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Re-render only when button toggle event is triggered 1 Times, and 120Hz Speed/Progress update decoupled
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={ballCamActive}
                      onCheckedChange={setBallCamActive}
                      isLight={isLight}
                    />
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Keybind Prompt (Keycap Shortcut)</span>
                      <span className="text-xs font-mono text-amber-500 font-bold">
                        [{ballCamShortcut || 'Hidden'}]
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {['SPACE', 'Y', '△', 'B', 'SHIFT', 'C'].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setBallCamShortcut(k)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-mono font-medium border cursor-pointer transition-all ${
                            ballCamShortcut === k
                              ? 'bg-red-500 text-white border-red-500 font-bold shadow-xs'
                              : isLight
                              ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-300'
                              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setBallCamShortcut(null)}
                        className={`px-2 py-1 rounded-xl text-xs font-mono cursor-pointer ${
                          ballCamShortcut === null
                            ? 'bg-neutral-500 text-white font-bold'
                            : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                      >
                        Hide Keys
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                    <span className="text-xs font-semibold">Main Title Text (Label Text)</span>
                    <div className="flex items-center gap-1.5">
                      {['BALL CAM', 'BALL CAMERA'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setBallCamLabel(t)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                            ballCamLabel === t
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                              : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-2xl text-[11px] font-mono flex items-start gap-2 border ${
                    isLight
                      ? 'bg-red-50/70 border-red-200/80 text-red-950'
                      : 'bg-red-950/20 border-red-900/40 text-red-300'
                  }`}
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0" />
                  <span>
                    Structural Specs: Container left-right split. Glowing red label on the left occupying two lines; Right-side text split into two lines and left-aligned, Top bold large text, Lower button operation instructions.
                  </span>
                </div>
              </div>
            </div>
          </section>
        </SectionErrorBoundary>

        {/* ELEMENT 2: VELOCITY PROGRESS BAR (120HZ HIGH-FREQUENCY TRANSIENT) */}
        <HudSpeedAndBallCamTriadCard isLight={isLight} subscribeSpeedFn={subscribeSpeedFn} />

        {/* ELEMENT 3: CIRCULAR BOOST GAUGE (120HZ HIGH-FREQUENCY TRANSIENT) */}
        <HudBoostGaugeTunerSection
          isLight={isLight}
          is120HzLive={is120HzLive}
          setIs120HzLive={setIs120HzLive}
          boostAmount={boostAmount}
          setBoostAmount={setBoostAmount}
          isUnlimitedBoost={isUnlimitedBoost}
          setIsUnlimitedBoost={setIsUnlimitedBoost}
          setGaugeSize={setGaugeSize}
          subscribeBoostFn={subscribeBoostFn}
        />
      </>
    );
  }
);

HudCoreTriadInspectorSection.displayName = 'HudCoreTriadInspectorSection';
