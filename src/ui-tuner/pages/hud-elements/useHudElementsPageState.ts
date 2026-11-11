import React, { useCallback, useEffect, useRef } from 'react';
import { createScopedSyncedState, crossClientSync } from '../../stores/crossClientSync';
import { createHudTransientChannel } from '../../../ui-core/stores/hudTransientChannel';
import {
  DEFAULT_SKIP_INDICATOR_CONFIG,
  resolveSkipIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type HudBallCamListener,
  type HudBoostListener,
  type HudSpeedListener,
  type HudTransientChannel,
} from '../../../ui-core/stores/hudTransientTypes';
import { useBoostGaugeStore } from '../../../ui-core/stores/boostGaugeStore';
import type { SlotLayoutPreset } from './HudStageAndFollowupSection';

const useState = createScopedSyncedState('page:hud-elements');

export type HudScenarioPresetId = 'kickoff' | 'defense' | 'supersonic-rush' | 'empty-clutch';

export interface HudElementsPageState {
  ballCamActive: boolean;
  setBallCamActive: React.Dispatch<React.SetStateAction<boolean>>;
  ballCamShortcut: string | null;
  ballCamLabel: string;
  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  boostAmount: number;
  setBoostAmount: React.Dispatch<React.SetStateAction<number>>;
  isUnlimitedBoost: boolean;
  setIsUnlimitedBoost: React.Dispatch<React.SetStateAction<boolean>>;
  is120HzLive: boolean;
  setIs120HzLive: React.Dispatch<React.SetStateAction<boolean>>;
  slotPreset: SlotLayoutPreset;
  setSlotPreset: React.Dispatch<React.SetStateAction<SlotLayoutPreset>>;
  edgeSkipReady: Record<1 | 2 | 3 | 4 | 5 | 6, boolean>;
  toggleEdgeSkipReady: (slot: 1 | 2 | 3 | 4 | 5 | 6) => void;
  edgeSkipConfig: Required<EdgeSkipIndicatorConfig>;
  setEdgeSkipConfig: React.Dispatch<React.SetStateAction<EdgeSkipIndicatorConfig>>;
  transientChannel: HudTransientChannel;
  liveSpeedReadoutRef: React.RefObject<HTMLSpanElement | null>;
  liveBoostReadoutRef: React.RefObject<HTMLSpanElement | null>;
  liveHzReadoutRef: React.RefObject<HTMLSpanElement | null>;
  liveRenderRateRef: React.RefObject<HTMLSpanElement | null>;
  toastMsg: string | null;
  applyScenarioPreset: (preset: HudScenarioPresetId) => void;
  subscribeSpeedFn?: (listener: HudSpeedListener) => () => void;
  subscribeBoostFn?: (listener: HudBoostListener) => () => void;
  subscribeBallCamFn?: (listener: HudBallCamListener) => () => void;
  handleToggleBallCam: () => void;
  build5AExportCode: () => string;
  handleReset5ADefaults: () => void;
}

export function useHudElementsPageState(): HudElementsPageState {
  const [ballCamActive, setBallCamActive] = useState<boolean>(true, 'ballCamActive');
  const [ballCamShortcut] = useState<string | null>('SPACE', 'ballCamShortcut');
  const [ballCamLabel] = useState<string>('BALL CAM', 'ballCamLabel');
  const [speed, setSpeed] = useState<number>(1410, 'speed');
  const [barWidth] = useState<string>('100%', 'barWidth');
  const [barHeight] = useState<number>(20, 'barHeight');
  const [boostAmount, setBoostAmount] = useState<number>(35, 'boostAmount');
  const [isUnlimitedBoost, setIsUnlimitedBoost] = useState<boolean>(false, 'isUnlimitedBoost');
  const [gaugeSize] = useState<number>(148, 'gaugeSize');
  const [is120HzLive, setIs120HzLive] = useState<boolean>(true, 'is120HzLive');
  const [slotPreset, setSlotPreset] = useState<SlotLayoutPreset>('classic-triad', 'slotPreset');
  const [edgeSkipReady, setEdgeSkipReady] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
    { 1: true, 2: false, 3: true, 4: true, 5: false, 6: false },
    'edgeSkipReady'
  );
  const [rawEdgeSkipConfig, setEdgeSkipConfig] = useState<EdgeSkipIndicatorConfig>(
    { ...DEFAULT_SKIP_INDICATOR_CONFIG },
    'edgeSkipConfigV2'
  );
  const edgeSkipConfig = resolveSkipIndicatorConfig(rawEdgeSkipConfig);
  const { resetTokens, exportConfigCode } = useBoostGaugeStore();

  const transientChannelRef = useRef(
    createHudTransientChannel({
      speed: 1410,
      boostAmount: 85,
      isUnlimitedBoost: false,
    })
  );

  const toggleEdgeSkipReady = useCallback(
    (slot: 1 | 2 | 3 | 4 | 5 | 6) => {
      setEdgeSkipReady((prev) => {
        const nextVal = !prev[slot];
        transientChannelRef.current.updatePlayerSlot(slot, { replaySkipReady: nextVal });
        return { ...prev, [slot]: nextVal };
      });
    },
    [setEdgeSkipReady]
  );

  useEffect(() => {
    const ch = transientChannelRef.current;
    ch.setRoster({ viewMode: 'spectator', skipIndicatorConfig: edgeSkipConfig });
    ([1, 2, 3, 4, 5, 6] as const).forEach((k) => {
      ch.updatePlayerSlot(k, { replaySkipReady: Boolean(edgeSkipReady?.[k]) });
    });
  }, [edgeSkipReady, edgeSkipConfig]);

  const reactRenderCountRef = useRef<number>(0);
  reactRenderCountRef.current += 1;
  const liveSpeedReadoutRef = useRef<HTMLSpanElement | null>(null);
  const liveBoostReadoutRef = useRef<HTMLSpanElement | null>(null);
  const liveHzReadoutRef = useRef<HTMLSpanElement | null>(null);
  const liveRenderRateRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const ch = transientChannelRef.current;
    ch.setBoost(ch.getBoost().amount, isUnlimitedBoost);
  }, [isUnlimitedBoost]);

  useEffect(() => {
    if (!is120HzLive) return;

    const channel = transientChannelRef.current;
    let rafId = 0;
    let tickCount = 0;
    let ticksThisWindow = 0;
    let lastTime = performance.now();
    let lastWindowMark = lastTime;
    let accumulatorMs = 0;
    let lastRenderSnap = reactRenderCountRef.current;
    let scrollCooldownUntil = 0;
    const stepMs = 1000 / 120;

    const onScrollCapture = () => {
      scrollCooldownUntil = performance.now() + 90;
    };
    window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      if (now < scrollCooldownUntil || document.hidden) {
        lastTime = now;
        return;
      }

      const dt = Math.min(34, Math.max(0, now - lastTime));
      lastTime = now;
      accumulatorMs += dt;

      let steps = 0;
      let latestSpeed = channel.getSpeed();
      let latestBoost = channel.getBoost().amount;

      while (accumulatorMs >= stepMs && steps < 4) {
        accumulatorMs -= stepMs;
        steps++;
        tickCount += 1;
        ticksThisWindow += 1;

        const t = (tickCount % 720) / 720;
        let simSpeed = 1410;
        let simBoost = 85;

        if (t < 0.25) {
          const p = t / 0.25;
          simSpeed = p * 1410;
          simBoost = Math.max(12, 55 - p * 35);
        } else if (t < 0.6) {
          const p = (t - 0.25) / 0.35;
          simSpeed = 1410 + Math.min(1, p * 1.25) * 885;
          simBoost = p < 0.45 ? 100 - p * 90 : Math.max(4, 60 - (p - 0.45) * 100);
        } else if (t < 0.8) {
          const p = (t - 0.6) / 0.2;
          simSpeed = 2240 + Math.sin(p * Math.PI * 4) * 45;
          simBoost = p > 0.3 ? 100 : 12;
        } else {
          const p = (t - 0.8) / 0.2;
          simSpeed = 2240 - p * 1620;
          simBoost = 100 - p * 45;
        }

        latestSpeed = simSpeed;
        latestBoost = simBoost;
        channel.setSpeed(simSpeed);
        channel.setBoost(simBoost, isUnlimitedBoost);
        channel.setFlipState({
          hasFlip: t < 0.72,
          status: t < 0.15 ? 'grounded' : t < 0.72 ? 'countdown' : 'expired',
          remainingSeconds: t < 0.72 ? Math.max(0, 1.25 * (1 - t / 0.72)) : 0,
        });
        channel.setTelemetrySnapshot({
          fps: 120,
          refreshHz: 120,
          renderScalePct: 100,
          physicsRateHz: 120.0,
          baseLatencyMs: 18 + Math.round(Math.sin(tickCount * 0.05) * 3),
          extraLatencyMs: 0,
        });
        channel.setKickoffFrame({
          episodeTick: tickCount % 240,
        });
      }

      if (steps > 0 && tickCount % 6 === 0) {
        if (liveSpeedReadoutRef.current) {
          liveSpeedReadoutRef.current.textContent = `${Math.round(latestSpeed)} uu/s`;
        }
        if (liveBoostReadoutRef.current) {
          liveBoostReadoutRef.current.textContent = isUnlimitedBoost
            ? '-- (∞)'
            : `${Math.round(latestBoost)}%`;
        }
      }

      if (now - lastWindowMark >= 600) {
        const elapsedSec = (now - lastWindowMark) / 1000;
        const hz = Math.round(ticksThisWindow / elapsedSec);
        const renderDelta = reactRenderCountRef.current - lastRenderSnap;
        const rendersPerSec = Math.round(renderDelta / elapsedSec);

        if (liveHzReadoutRef.current) {
          liveHzReadoutRef.current.textContent = `${hz} Hz`;
        }
        if (liveRenderRateRef.current) {
          liveRenderRateRef.current.textContent = `${rendersPerSec} / sec`;
        }
        ticksThisWindow = 0;
        lastWindowMark = now;
        lastRenderSnap = reactRenderCountRef.current;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScrollCapture, { capture: true });
    };
  }, [is120HzLive, isUnlimitedBoost]);

  const [toastMsg, setToastMsg] = useState<string | null>(null, 'toastMsg');
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const applyScenarioPreset = (preset: HudScenarioPresetId) => {
    setIs120HzLive(false);
    switch (preset) {
      case 'kickoff':
        setBallCamActive(true);
        setSpeed(1410);
        setBoostAmount(33);
        showToast('preset loaded: Kickoff sprint (Kickoff Rush · manual mode)');
        break;
      case 'defense':
        setBallCamActive(true);
        setSpeed(750);
        setBoostAmount(12);
        showToast('preset loaded: Goal-line defense (Goal Line Defense · manual mode)');
        break;
      case 'supersonic-rush':
        setBallCamActive(true);
        setSpeed(2280);
        setBoostAmount(99);
        showToast('preset loaded: Supersonic dash (Supersonic Surge · manual mode)');
        break;
      case 'empty-clutch':
        setBallCamActive(false);
        setSpeed(2300);
        setBoostAmount(0);
        showToast('preset loaded: Zero-G speed (Empty Boost Max Speed · manual mode)');
        break;
    }
  };

  const subscribeSpeedFn = is120HzLive ? transientChannelRef.current.subscribeSpeed : undefined;
  const subscribeBoostFn = is120HzLive ? transientChannelRef.current.subscribeBoost : undefined;
  const subscribeBallCamFn = is120HzLive
    ? transientChannelRef.current.subscribeBallCam
    : undefined;

  const handleToggleBallCam = () => {
    if (is120HzLive) {
      transientChannelRef.current.toggleBallCam();
    } else {
      setBallCamActive((prev) => !prev);
    }
  };

  const build5AExportCode = useCallback(() => {
    const snapshot = {
      is120HzLive,
      slotPreset,
      ballCam: {
        active: ballCamActive,
        shortcut: ballCamShortcut,
        label: ballCamLabel,
      },
      velocityBar: {
        speed,
        width: barWidth,
        height: barHeight,
      },
      boostGauge: {
        boostAmount,
        isUnlimitedBoost,
        gaugeSize,
      },
      edgeSkipConfig,
      edgeSkipReady,
    };
    return `// 5A High-Frequency Match HUD Calibrated Default Snapshot\nexport const DEFAULT_5A_HUD_ELEMENTS_SNAPSHOT = ${JSON.stringify(
      snapshot,
      null,
      2
    )};\n\n${exportConfigCode()}`;
  }, [
    is120HzLive,
    slotPreset,
    ballCamActive,
    ballCamShortcut,
    ballCamLabel,
    speed,
    barWidth,
    barHeight,
    boostAmount,
    isUnlimitedBoost,
    gaugeSize,
    edgeSkipConfig,
    edgeSkipReady,
    exportConfigCode,
  ]);

  const handleReset5ADefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:hud-elements:' });
    crossClientSync.resetAll({ scopePrefix: 'hud-spatial-sandbox:' });
    crossClientSync.resetAll({ scopePrefix: 'hud-5a-2-demo-inspector:' });
    crossClientSync.resetAll({ scopePrefix: 'hud-5a-2-skip-inspector:' });
    resetTokens();
  }, [resetTokens]);

  return {
    ballCamActive,
    setBallCamActive,
    ballCamShortcut,
    ballCamLabel,
    speed,
    setSpeed,
    boostAmount,
    setBoostAmount,
    isUnlimitedBoost,
    setIsUnlimitedBoost,
    is120HzLive,
    setIs120HzLive,
    slotPreset,
    setSlotPreset,
    edgeSkipReady,
    toggleEdgeSkipReady,
    edgeSkipConfig,
    setEdgeSkipConfig,
    transientChannel: transientChannelRef.current,
    liveSpeedReadoutRef,
    liveBoostReadoutRef,
    liveHzReadoutRef,
    liveRenderRateRef,
    toastMsg,
    applyScenarioPreset,
    subscribeSpeedFn,
    subscribeBoostFn,
    subscribeBallCamFn,
    handleToggleBallCam,
    build5AExportCode,
    handleReset5ADefaults,
  };
}
