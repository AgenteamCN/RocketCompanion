import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';
import { hudStore } from '../game/runtimeUiPort.ts';
import {
  getAudioSlotPool,
  subsystemState,
  type SignalAudioActiveModePort,
  type SignalAudioRuntimePort,
} from './audioContext.ts';
import { SIGNAL_EVENT_TYPES } from '../physics/RocketSimConstants.ts';

export type { SignalAudioActiveModePort, SignalAudioRuntimePort };

export function isSignalAudioMutedInGoalReplay(
  runtimeOverride: SignalAudioRuntimePort | null = null
): boolean {
  const muteCfg =
    REPLAY_DIRECTOR_CONFIG.muteSignalAudioInGoalReplay !== false &&
    audioConfig.get('muteSignalAudioInGoalReplay') !== false;
  if (!muteCfg) return false;

  const r = runtimeOverride || subsystemState.runtime;
  const hudState = hudStore?.getState?.();
  if (r?.replayViewerController?.isActive || hudState?.replayViewerActive) {
    return false;
  }
  const activeMode = r?.modeManager?.getActiveMode?.();
  const isModeReplayActive = Boolean(
    activeMode?.isGoalReplayActive?.() ||
    activeMode?.directorPreview?.isReplayActive ||
    activeMode?.replaySession?.isReplayActive
  );
  if (activeMode?.rewinderController?.isScrubbing && !isModeReplayActive) {
    return false;
  }

  const cameraOverrideActive =
    typeof r?.isGoalReplayCameraOverrideActive === 'function'
      ? r.isGoalReplayCameraOverrideActive()
      : false;

  return Boolean(
    hudState?.matchPhase === 'replay' ||
    r?.match?.state?.phase === 'replay' ||
    cameraOverrideActive ||
    r?.networkReconciler?.replayPlaybackMode ||
    isModeReplayActive ||
    activeMode?.goalReplayPhase === 'replaying'
  );
}

const SIGNAL_KEY_VOLUME_CONFIG_MAP: Readonly<Record<string, string>> = Object.freeze({
  match_countdown_321: 'countdown321Volume',
  training_countdown: 'trainingCountdownVolume',
  match_start_go: 'matchStartGoVolume',
  match_60_seconds_left: 'alert60sVolume',
  match_30_seconds_left: 'alert30sVolume',
  match_countdown_10s: 'countdown10sVolume',
  match_entering_overtime: 'overtimeVolume',
  endgame: 'endgameVolume',
  training_ball_expire: 'trainingBallExpireVolume',
  sfx_goal_poof: 'goalScoredVolume',
  sfx_error_no_boost: 'errorNoBoostVolume',
  boost_collect: 'boostCollectVolume',
});

const SIGNAL_SUBTYPE_KEYS: ReadonlyArray<string | null> = Object.freeze([
  null,
  'match_countdown_321',
  'training_countdown',
  'match_start_go',
  'match_60_seconds_left',
  'match_30_seconds_left',
  'match_countdown_10s',
  'match_entering_overtime',
  'endgame',
  'training_ball_expire',
]);

const SIGNAL_ROUTE_MAP = new Map<string | number, readonly [string, number]>([
  [SIGNAL_EVENT_TYPES.COUNTDOWN_TICK, ['match_countdown_321', 250]],
  [SIGNAL_EVENT_TYPES.KICKOFF_WILL_START, ['match_countdown_321', 250]],
  [SIGNAL_EVENT_TYPES.MATCH_WILL_RESUME, ['match_countdown_321', 250]],
  ['training_countdown', ['training_countdown', 250]],
  [SIGNAL_EVENT_TYPES.KICKOFF_GO, ['match_start_go', 300]],
  [SIGNAL_EVENT_TYPES.KICKOFF_START, ['match_start_go', 300]],
  [SIGNAL_EVENT_TYPES.MATCH_START, ['match_start_go', 300]],
  [SIGNAL_EVENT_TYPES.MATCH_STARTED, ['match_start_go', 300]],
  [SIGNAL_EVENT_TYPES.MATCH_RESUMED, ['match_start_go', 300]],
  [SIGNAL_EVENT_TYPES.TIME_ALERT_60S, ['match_60_seconds_left', 5000]],
  [SIGNAL_EVENT_TYPES.TIME_ALERT_30S, ['match_30_seconds_left', 5000]],
  [SIGNAL_EVENT_TYPES.COUNTDOWN_10S, ['match_countdown_10s', 200]],
  ['match_countdown_10s', ['match_countdown_10s', 200]],
  ['countdown_10s', ['match_countdown_10s', 200]],
  [SIGNAL_EVENT_TYPES.OVERTIME_START, ['match_entering_overtime', 1000]],
  ['match_entering_overtime', ['match_entering_overtime', 1000]],
  [SIGNAL_EVENT_TYPES.MATCH_ENDED, ['endgame', 5000]],
  [SIGNAL_EVENT_TYPES.PODIUM_START, ['endgame', 5000]],
  ['endgame', ['endgame', 5000]],
  ['match_ended', ['endgame', 5000]],
  ['training_ball_expire', ['training_ball_expire', 300]],
]);

export class SignalAudioEngine {
  lastPlayTime: Map<string, number>;
  signalBuffers: Map<string, AudioBuffer | null>;

  constructor() {
    this.signalBuffers = new Map();
    this.lastPlayTime = new Map();
  }

  setBuffer(signalKey: string, buffer: AudioBuffer | null): void {
    this.signalBuffers.set(signalKey, buffer);
  }

  handleSignal(signalType: string | number): void {
    if (isSignalAudioMutedInGoalReplay()) return;
    const route = SIGNAL_ROUTE_MAP.get(signalType);
    if (route) {
      this.play(route[0], 1.0, route[1]);
    }
  }

  playSignalSlotPod(subtype: number, gain = 1.0): void {
    const key = SIGNAL_SUBTYPE_KEYS[subtype | 0];
    if (key) {
      this.play(key, gain, 0);
    }
  }

  play(key: string, volMult = 1.0, minInterval = 0): void {
    if (isSignalAudioMutedInGoalReplay()) return;
    const now = performance.now();
    const effectiveMinInterval = key === 'endgame' ? Math.max(minInterval, 5000) : minInterval;
    if (effectiveMinInterval > 0) {
      const last = this.lastPlayTime.get(key) || 0;
      if (now - last < effectiveMinInterval) return;
    }
    this.lastPlayTime.set(key, now);

    const buf = this.signalBuffers.get(key);
    const pool = getAudioSlotPool();
    if (!buf || !pool) return;

    const master = audioConfig.get('masterVolume') ?? 1.0;
    const sigVol = audioConfig.get('signalVolume') ?? 1.0;
    const detailConfigKey = SIGNAL_KEY_VOLUME_CONFIG_MAP[key];
    const detailVol = detailConfigKey ? (audioConfig.get(detailConfigKey) ?? 1.0) : 1.0;
    const volume = Math.max(0, Math.min(5.0, volMult * detailVol * sigVol * master));

    pool.playBuffer(buf, {
      volume,
      priority: 8,
    });
  }

  playClick(volume = 1.0): void {
    const pool = getAudioSlotPool();
    const buf =
      this.signalBuffers.get('sfx_error_no_boost') ||
      subsystemState.buffers.get('sfx_error_no_boost');
    if (!pool || !buf) return;
    const master = audioConfig.get('masterVolume') ?? 1.0;
    const uiClickVol = audioConfig.get('uiClickVolume') ?? 1.0;
    pool.playBuffer(buf, {
      volume: Math.max(0, Math.min(5.0, volume * uiClickVol * master * 0.3)),
      playbackRate: 2.0,
      priority: 1,
    });
  }
}
