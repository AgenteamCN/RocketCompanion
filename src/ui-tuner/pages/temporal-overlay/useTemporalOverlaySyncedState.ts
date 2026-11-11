import { useCallback } from 'react';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';

export const DEFAULT_T5A_REPLAY_FOOTER = {
  visible: true,
  scorerName: 'Vatira_KC',
  goalSpeedKph: 118,
  assisterName: 'Atow.',
  teamAccentColor: '#edce0b',
} as const;

export const DEFAULT_T5A_RESPAWN_TIMER = {
  remainingSeconds: 2.35,
  totalSeconds: 3.0,
  autoLoop: true,
} as const;

export function useTemporalOverlaySyncedState() {
  const [autoStream120Hz, setAutoStream120Hz] = useSyncedState<boolean>(
    'page:temporal-overlay:autoStream120Hz',
    true
  );
  const [replayVisible, setReplayVisible] = useSyncedState<boolean>(
    'page:temporal-overlay:replayVisible',
    DEFAULT_T5A_REPLAY_FOOTER.visible
  );
  const [scorerName, setScorerName] = useSyncedState<string>(
    'page:temporal-overlay:scorerName',
    DEFAULT_T5A_REPLAY_FOOTER.scorerName
  );
  const [goalSpeed, setGoalSpeed] = useSyncedState<number>(
    'page:temporal-overlay:goalSpeed',
    DEFAULT_T5A_REPLAY_FOOTER.goalSpeedKph
  );
  const [assisterName, setAssisterName] = useSyncedState<string>(
    'page:temporal-overlay:assisterName',
    DEFAULT_T5A_REPLAY_FOOTER.assisterName
  );
  const [teamAccentColor, setTeamAccentColor] = useSyncedState<string>(
    'page:temporal-overlay:teamAccentColor',
    DEFAULT_T5A_REPLAY_FOOTER.teamAccentColor
  );
  const [respawnRemSec, setRespawnRemSec] = useSyncedState<number>(
    'page:temporal-overlay:respawnRemSec',
    DEFAULT_T5A_RESPAWN_TIMER.remainingSeconds
  );
  const [respawnAutoLoop, setRespawnAutoLoop] = useSyncedState<boolean>(
    'page:temporal-overlay:respawnAutoLoop',
    DEFAULT_T5A_RESPAWN_TIMER.autoLoop
  );

  const handleResetT5ADefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:temporal-overlay:' });
  }, []);

  const buildT5AExportCode = useCallback(() => {
    const snapshot = {
      autoStream120Hz,
      replayFooter: {
        visible: replayVisible,
        scorerName,
        goalSpeed: `${goalSpeed}KPH`,
        assisterName,
        teamAccentColor,
      },
      respawnHourglassTimer: {
        remainingSeconds: respawnRemSec,
        totalSeconds: DEFAULT_T5A_RESPAWN_TIMER.totalSeconds,
        autoLoop: respawnAutoLoop,
      },
    };
    return `// T5A Temporal Overlay HUD Calibrated Default Snapshot\nexport const DEFAULT_T5A_TEMPORAL_OVERLAY_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    autoStream120Hz,
    replayVisible,
    scorerName,
    goalSpeed,
    assisterName,
    teamAccentColor,
    respawnRemSec,
    respawnAutoLoop,
  ]);

  return {
    autoStream120Hz,
    setAutoStream120Hz,
    replayVisible,
    setReplayVisible,
    scorerName,
    setScorerName,
    goalSpeed,
    setGoalSpeed,
    assisterName,
    setAssisterName,
    teamAccentColor,
    setTeamAccentColor,
    respawnRemSec,
    setRespawnRemSec,
    respawnAutoLoop,
    setRespawnAutoLoop,
    handleResetT5ADefaults,
    buildT5AExportCode,
  };
}
