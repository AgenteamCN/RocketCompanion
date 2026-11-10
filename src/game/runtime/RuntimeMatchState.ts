export const DEFAULT_MATCH_DURATION_SECONDS = 300;
export const KICKOFF_COUNTDOWN_SECONDS = 3;

export const MATCH_MODES = Object.freeze({ FREEPLAY: 'freeplay', MATCH: 'match' });
export const MATCH_PHASES = Object.freeze({
  PLAYING: 'playing',
  KICKOFF: 'kickoff',
  GOAL: 'goal',
  REPLAY: 'replay',
  PAUSED: 'paused',
  ENDED: 'ended',
  PODIUM: 'podium',
});

export interface MatchStateData {
  mode: string;
  phase: string;
  blueScore: number;
  orangeScore: number;
  remainingSeconds: number;
  durationSeconds?: number;
  clockSeconds?: number;
  score?: { blue: number; orange: number };
  overtime: boolean;
  overtimeSeconds: number;
  countdown: number;
  winner: string | number | null;
  winReason: string | null;
  scorer: number | null;
  scorerCarIndex?: number;
  paused: boolean;
}

export const DEFAULT_MATCH_STATE: Readonly<MatchStateData> = Object.freeze({
  mode: MATCH_MODES.FREEPLAY,
  phase: MATCH_PHASES.PLAYING,
  blueScore: 0,
  orangeScore: 0,
  remainingSeconds: DEFAULT_MATCH_DURATION_SECONDS,
  overtime: false,
  overtimeSeconds: 0,
  countdown: 0,
  winner: null,
  winReason: null,
  scorer: null,
  paused: false,
});

export class RuntimeMatchState {
  state: MatchStateData;

  constructor() {
    this.state = { ...DEFAULT_MATCH_STATE };
  }

  start(): void {
    Object.assign(this.state, {
      mode: MATCH_MODES.MATCH,
      phase: MATCH_PHASES.KICKOFF,
      blueScore: 0,
      orangeScore: 0,
      remainingSeconds: DEFAULT_MATCH_DURATION_SECONDS,
      overtime: false,
      overtimeSeconds: 0,
      countdown: KICKOFF_COUNTDOWN_SECONDS,
      winner: null,
      winReason: null,
      scorer: null,
      paused: false,
    });
  }

  leave(): void {
    this.state.mode = MATCH_MODES.FREEPLAY;
    this.state.phase = MATCH_PHASES.PLAYING;
    this.state.paused = false;
  }
}
