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
    let key: string | null = null;
    let minInterval = 0;
    switch (signalType) {
      case SIGNAL_EVENT_TYPES.COUNTDOWN_TICK:
      case SIGNAL_EVENT_TYPES.KICKOFF_WILL_START:
      case SIGNAL_EVENT_TYPES.MATCH_WILL_RESUME:
        key = 'match_countdown_321';
        minInterval = 250;
        break;
      case 'training_countdown':
        key = 'training_countdown';
        minInterval = 250;
        break;
      case SIGNAL_EVENT_TYPES.KICKOFF_GO:
      case SIGNAL_EVENT_TYPES.KICKOFF_START:
      case SIGNAL_EVENT_TYPES.MATCH_START:
      case SIGNAL_EVENT_TYPES.MATCH_STARTED:
      case SIGNAL_EVENT_TYPES.MATCH_RESUMED:
        key = 'match_start_go';
        minInterval = 300;
        break;
      case SIGNAL_EVENT_TYPES.TIME_ALERT_60S:
        key = 'match_60_seconds_left';
        minInterval = 5000;
        break;
      case SIGNAL_EVENT_TYPES.TIME_ALERT_30S:
        key = 'match_30_seconds_left';
        minInterval = 5000;
        break;
      case SIGNAL_EVENT_TYPES.COUNTDOWN_10S:
      case 'match_countdown_10s':
      case 'countdown_10s':
        key = 'match_countdown_10s';
        minInterval = 200;
        break;
      case SIGNAL_EVENT_TYPES.OVERTIME_START:
      case 'match_entering_overtime':
        key = 'match_entering_overtime';
        minInterval = 1000;
        break;
      case SIGNAL_EVENT_TYPES.MATCH_ENDED:
      case SIGNAL_EVENT_TYPES.PODIUM_START:
      case 'endgame':
      case 'match_ended':
        key = 'endgame';
        minInterval = 5000;
        break;
      case 'training_ball_expire':
        key = 'training_ball_expire';
        minInterval = 300;
        break;
      default:
        break;
    }
    if (key) {
      this.play(key, 1.0, minInterval);
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
    const effectiveMult = volMult * detailVol;
    const volume = Math.max(0, Math.min(5.0, effectiveMult * sigVol * master));

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
