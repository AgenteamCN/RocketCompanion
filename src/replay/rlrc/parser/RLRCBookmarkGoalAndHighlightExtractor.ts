/**
 * RLRCBookmarkGoalAndHighlightExtractor.ts
 * Extracts goal, highlight, and player stat entries from .replay header properties,
 * estimates 30Hz source frame timestamps and 120Hz indices, and builds/aligns RLRCBookmarkRecord[].
 */

import {
  RLRC_TICK_RATE,
  type RLRCBookmarkKind,
  type RLRCBookmarkRecord,
  type RLRCPlayerSlotMeta,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';

export interface RLRCGoalHeaderEntry {
  frame: number;
  playerName: string;
  playerTeam: RLRCTeamIndex;
}

export interface RLRCHighlightHeaderEntry {
  frame: number;
  carName: string;
  ballName: string;
  goalActorName: string;
}

export interface RLRCPlayerStatHeaderEntry {
  name: string;
  platform: string;
  onlineId: string;
  team: RLRCTeamIndex;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  isBot: boolean;
}

export interface RLRCKeyFrameEntry {
  time: number;
  frame: number;
  bitPosition: number;
}

export interface RLRCTickMarkEntry {
  description: string;
  frame: number;
}

export interface RLRCBookmarkBuildOptions {
  frameTimesSeconds?: ArrayLike<number>;
  roster?: readonly Pick<RLRCPlayerSlotMeta, 'slotIndex' | 'userName' | 'team'>[];
  includeKeyframes?: boolean;
  includeKickoffs?: boolean;
}

export interface RLRCHeaderGoalsHighlightsAndStats {
  goals: readonly RLRCGoalHeaderEntry[];
  highlights: readonly RLRCHighlightHeaderEntry[];
  playerStats: readonly RLRCPlayerStatHeaderEntry[];
}

function asPropertyRecordArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v : [];
}

export function extractGoalsHighlightsAndStatsFromHeaderProps(
  props: Readonly<Record<string, unknown>>
): RLRCHeaderGoalsHighlightsAndStats {
  const goals: RLRCGoalHeaderEntry[] = asPropertyRecordArray(props.Goals).map((g) => ({
    frame: Math.max(0, Math.trunc(Number(g?.frame) || 0)),
    playerName: String(g?.PlayerName || 'Player'),
    playerTeam: Number(g?.PlayerTeam) === 1 ? 1 : 0,
  }));

  const highlights: RLRCHighlightHeaderEntry[] = asPropertyRecordArray(props.HighLights).map(
    (h) => ({
      frame: Math.max(0, Math.trunc(Number(h?.frame) || 0)),
      carName: String(h?.CarName || ''),
      ballName: String(h?.BallName || ''),
      goalActorName: String(h?.GoalActorName || ''),
    })
  );

  const playerStats: RLRCPlayerStatHeaderEntry[] = asPropertyRecordArray(props.PlayerStats).map(
    (s) => {
      const plat = s?.Platform as Record<string, unknown> | undefined;
      return {
        name: String(s?.Name || 'Player'),
        platform: String(plat?.value || plat?.enumName || 'Unknown'),
        onlineId: String(s?.OnlineID || '0'),
        team: Number(s?.Team) === 1 ? 1 : 0,
        score: Number(s?.Score) || 0,
        goals: Number(s?.Goals) || 0,
        assists: Number(s?.Assists) || 0,
        saves: Number(s?.Saves) || 0,
        shots: Number(s?.Shots) || 0,
        isBot: Boolean(s?.bBot),
      };
    }
  );

  return { goals, highlights, playerStats };
}

export function estimateSourceFrameTimeSeconds(
  frame30: number,
  keyframes: readonly RLRCKeyFrameEntry[],
  fps: number,
  frameTimes?: ArrayLike<number>
): number {
  const f = Math.max(0, Math.trunc(frame30));
  if (frameTimes && frameTimes.length > 0) {
    return Number(frameTimes[Math.min(f, frameTimes.length - 1)]) || 0;
  }
  const rate = fps > 0 ? fps : 30;
  if (keyframes.length === 0) return f / rate;
  if (f <= keyframes[0].frame) {
    return Math.max(0, keyframes[0].time - (keyframes[0].frame - f) / rate);
  }
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (f >= a.frame && f <= b.frame) {
      const span = b.frame - a.frame;
      return span <= 0 ? a.time : a.time + ((f - a.frame) / span) * (b.time - a.time);
    }
  }
  const last = keyframes[keyframes.length - 1];
  return last.time + (f - last.frame) / rate;
}

export function estimateFrameIndex120Hz(
  frame30: number,
  keyframes: readonly RLRCKeyFrameEntry[],
  fps: number,
  frameTimes?: ArrayLike<number>
): number {
  const t0 =
    frameTimes && frameTimes.length > 0 ? Number(frameTimes[0]) || 0 : (keyframes[0]?.time ?? 0);
  const t = estimateSourceFrameTimeSeconds(frame30, keyframes, fps, frameTimes);
  return Math.max(0, Math.round((t - t0) * RLRC_TICK_RATE));
}

export function buildRLRCBookmarksFromHeaderAndPart2(
  goals: readonly RLRCGoalHeaderEntry[],
  tickMarks: readonly RLRCTickMarkEntry[],
  keyframes: readonly RLRCKeyFrameEntry[],
  fps: number,
  options?: RLRCBookmarkBuildOptions
): RLRCBookmarkRecord[] {
  const ft = options?.frameTimesSeconds;
  const byName = new Map<string, { slotIndex: number; team: RLRCTeamIndex }>();
  for (const m of options?.roster ?? []) {
    byName.set(m.userName.toLowerCase(), { slotIndex: m.slotIndex, team: m.team });
  }

  const out: RLRCBookmarkRecord[] = [];
  const add = (
    kind: RLRCBookmarkKind,
    frame: number,
    label: string,
    slotIndex: number,
    team: RLRCTeamIndex | -1
  ): void => {
    out.push({
      kind,
      frameIndex120Hz: estimateFrameIndex120Hz(frame, keyframes, fps, ft),
      sourceFrame30Hz: frame,
      timeSeconds: estimateSourceFrameTimeSeconds(frame, keyframes, fps, ft),
      label,
      slotIndex,
      team,
    });
  };

  let userIdx = 0;
  for (const m of tickMarks) {
    if (m.description.trim().toLowerCase() === 'user') {
      add('user-mark', m.frame, `User Mark #${++userIdx}`, -1, -1);
    }
  }
  for (const g of goals) {
    const hit = byName.get(g.playerName.toLowerCase());
    const team: RLRCTeamIndex = g.playerTeam === 1 ? 1 : 0;
    add(
      'goal',
      g.frame,
      `Goal: ${g.playerName} (${team === 0 ? 'Blue' : 'Orange'})`,
      hit ? hit.slotIndex : -1,
      team
    );
  }
  for (const m of tickMarks) {
    const d = m.description.trim().toLowerCase();
    if (
      (d === 'team0goal' || d === 'team1goal' || d === 'goal') &&
      !goals.some((g) => Math.abs(g.frame - m.frame) <= 90)
    ) {
      const team: RLRCTeamIndex | -1 = d.includes('team0') ? 0 : d.includes('team1') ? 1 : -1;
      add(
        'goal',
        m.frame,
        `Goal (${team === 0 ? 'Blue' : team === 1 ? 'Orange' : 'Match'})`,
        -1,
        team
      );
    } else if (d.includes('save')) {
      const team: RLRCTeamIndex | -1 = d.includes('team0') ? 0 : d.includes('team1') ? 1 : -1;
      const isEpic = d.includes('epic');
      const teamLabel = team === 0 ? 'Blue' : team === 1 ? 'Orange' : 'Match';
      add('save', m.frame, `${isEpic ? 'Epic Save' : 'Save'} (${teamLabel})`, -1, team);
    }
  }
  if (options?.includeKickoffs) {
    for (const kf of keyframes) {
      if (kf.frame === 0 || goals.some((g) => kf.frame > g.frame && kf.frame - g.frame <= 150)) {
        add('kickoff', kf.frame, `Kickoff @ Frame ${kf.frame}`, -1, -1);
      }
    }
  }
  if (options?.includeKeyframes) {
    for (let i = 0; i < keyframes.length; i++) {
      add('ue-keyframe', keyframes[i].frame, `UE KeyFrame #${i + 1}`, -1, -1);
    }
  }
  return out.sort((a, b) => a.sourceFrame30Hz - b.sourceFrame30Hz);
}

export function alignRLRCBookmarksTo120HzFrames(
  bookmarks: readonly RLRCBookmarkRecord[],
  frameTimes: ArrayLike<number>
): RLRCBookmarkRecord[] {
  if (frameTimes.length === 0) return [...bookmarks];
  const t0 = Number(frameTimes[0]) || 0;
  return bookmarks.map((b) => {
    const idx = Math.max(0, Math.min(b.sourceFrame30Hz, frameTimes.length - 1));
    const timeSeconds = Number(frameTimes[idx]) || b.timeSeconds;
    return {
      ...b,
      timeSeconds,
      frameIndex120Hz: Math.max(0, Math.round((timeSeconds - t0) * RLRC_TICK_RATE)),
    };
  });
}
