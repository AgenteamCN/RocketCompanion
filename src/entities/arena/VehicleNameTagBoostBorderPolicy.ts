import type {
  NameTagBoostBorderAudience,
  NameTagBoostBorderOverride,
  NameTagBoostBorderSceneFlags,
  NameTagCarEntry,
  NameTagConfig,
} from '../../ui-core/config/nameTagConfig.ts';

export type NameTagBoostBorderSceneContext =
  'matchPlaying' | 'goalReplay' | 'cinematicCamera' | 'tunerOverview';

export interface ResolveCarBoostBorderInput {
  config: NameTagConfig;
  carEntry: NameTagCarEntry | undefined;
  carIndex: number;
  carTeam: 0 | 1;
  focusedCarIndex: number;
  focusedCarTeam: 0 | 1;
  isGoalReplayActive: boolean;
  isCinematicCamera: boolean;
  isTunerFreeCamOverview: boolean;
  liveCarBoostAmount?: number;
  liveCarDoubleJumpedAndClimbing?: boolean;
  runtimeOverride?: NameTagBoostBorderOverride;
  systemOverride?: NameTagBoostBorderOverride;
}

export interface ResolvedCarBoostBorderState {
  visible: boolean;
  boostAmount: number;
  boostFraction: number;
  borderColorHex: string;
  sceneContext: NameTagBoostBorderSceneContext;
  offscreenAudienceVisible: boolean;
  isDoubleJumpedAndClimbing: boolean;
  aerialClimbGlowVisible: boolean;
}

function isAudienceValue(value: unknown): value is NameTagBoostBorderAudience {
  return value === 'teammates' || value === 'all' || value === 'none';
}

function isSceneFlagsObject(
  value: NameTagBoostBorderOverride
): value is NameTagBoostBorderSceneFlags {
  return Boolean(value && typeof value === 'object');
}

function evaluateAudienceVisibility(
  audience: NameTagBoostBorderAudience,
  carTeam: 0 | 1,
  focusedCarTeam: 0 | 1
): boolean {
  if (audience === 'none') return false;
  if (audience === 'all') return true;
  return carTeam === focusedCarTeam;
}

function applySingleOverrideRule(
  rule: boolean | NameTagBoostBorderAudience | undefined,
  defaultAudience: NameTagBoostBorderAudience,
  carTeam: 0 | 1,
  focusedCarTeam: 0 | 1
): boolean | null {
  if (rule === undefined) return null;
  if (typeof rule === 'boolean') {
    if (!rule) return false;
    return evaluateAudienceVisibility(defaultAudience, carTeam, focusedCarTeam);
  }
  if (isAudienceValue(rule)) {
    return evaluateAudienceVisibility(rule, carTeam, focusedCarTeam);
  }
  return null;
}

export function resolveBoostBorderSceneContext(
  isGoalReplayActive: boolean,
  isCinematicCamera: boolean,
  isTunerFreeCamOverview: boolean
): NameTagBoostBorderSceneContext {
  if (isGoalReplayActive) return 'goalReplay';
  if (isCinematicCamera) return 'cinematicCamera';
  if (isTunerFreeCamOverview) return 'tunerOverview';
  return 'matchPlaying';
}

export function resolveBoostBorderColorHex(
  config: Pick<
    NameTagConfig,
    | 'boostBorderColorMode'
    | 'blueBoostBorderColor'
    | 'orangeBoostBorderColor'
    | 'sharedBoostBorderColor'
  >,
  team: 0 | 1
): string {
  if (config.boostBorderColorMode === 'shared') {
    return config.sharedBoostBorderColor || '#ffffff';
  }
  return team === 1
    ? config.orangeBoostBorderColor || '#ffffff'
    : config.blueBoostBorderColor || '#ffffff';
}

export function resolveCarBoostBorderState(
  input: ResolveCarBoostBorderInput
): ResolvedCarBoostBorderState {
  const {
    config,
    carEntry,
    carIndex,
    carTeam,
    focusedCarTeam,
    isGoalReplayActive,
    isCinematicCamera,
    isTunerFreeCamOverview,
    liveCarBoostAmount,
    liveCarDoubleJumpedAndClimbing,
    runtimeOverride,
    systemOverride,
  } = input;

  const sceneContext = resolveBoostBorderSceneContext(
    isGoalReplayActive,
    isCinematicCamera,
    isTunerFreeCamOverview
  );

  const fallbackBoost =
    config.previewBoostAmounts?.[carIndex] ?? config.previewBoostAmounts?.[carIndex % 6] ?? 100;
  const rawBoost =
    typeof carEntry?.boostAmount === 'number' && Number.isFinite(carEntry.boostAmount)
      ? carEntry.boostAmount
      : typeof liveCarBoostAmount === 'number' && Number.isFinite(liveCarBoostAmount)
        ? liveCarBoostAmount
        : fallbackBoost;

  const boostAmount = Math.max(0, Math.min(100, rawBoost));
  const boostFraction = boostAmount / 100;
  const borderColorHex = resolveBoostBorderColorHex(config, carTeam);

  const offscreenAudienceVisible =
    Boolean(config.offscreenIndicatorEnabled) &&
    evaluateAudienceVisibility(config.offscreenAudience || 'teammates', carTeam, focusedCarTeam);

  const fallbackClimbing = Boolean(
    config.previewAerialClimbingFlags?.[carIndex] ??
    config.previewAerialClimbingFlags?.[carIndex % 6] ??
    false
  );
  const isDoubleJumpedAndClimbing =
    typeof carEntry?.isDoubleJumpedAndClimbing === 'boolean'
      ? carEntry.isDoubleJumpedAndClimbing
      : typeof liveCarDoubleJumpedAndClimbing === 'boolean'
        ? liveCarDoubleJumpedAndClimbing
        : fallbackClimbing;

  const aerialClimbGlowVisible =
    Boolean(config.aerialClimbAlertEnabled) &&
    isDoubleJumpedAndClimbing &&
    evaluateAudienceVisibility(
      config.aerialClimbAlertAudience || 'teammates',
      carTeam,
      focusedCarTeam
    );

  const makeResult = (visible: boolean): ResolvedCarBoostBorderState => ({
    visible,
    boostAmount,
    boostFraction,
    borderColorHex,
    sceneContext,
    offscreenAudienceVisible,
    isDoubleJumpedAndClimbing,
    aerialClimbGlowVisible,
  });

  if (
    !config.boostBorderEnabled ||
    (config.boostIndicatorMode === 'border-only' && config.borderWidth <= 0)
  ) {
    return makeResult(false);
  }

  // Per-car explicit override takes highest precedence when set
  if (typeof carEntry?.showBoostBorder === 'boolean') {
    return makeResult(carEntry.showBoostBorder);
  }

  const activeOverride =
    systemOverride !== undefined && systemOverride !== null
      ? systemOverride
      : runtimeOverride !== undefined && runtimeOverride !== null
        ? runtimeOverride
        : null;

  const defaultSceneAudience: NameTagBoostBorderAudience =
    sceneContext === 'goalReplay' || sceneContext === 'cinematicCamera'
      ? config.boostBorderReplayAudience
      : sceneContext === 'tunerOverview'
        ? 'all'
        : config.boostBorderMatchAudience;

  if (activeOverride !== null) {
    if (typeof activeOverride === 'boolean' || isAudienceValue(activeOverride)) {
      const resolved = applySingleOverrideRule(
        activeOverride,
        defaultSceneAudience,
        carTeam,
        focusedCarTeam
      );
      if (resolved !== null) {
        return makeResult(resolved);
      }
    } else if (isSceneFlagsObject(activeOverride)) {
      const sceneRule =
        sceneContext === 'goalReplay'
          ? activeOverride.goalReplay
          : sceneContext === 'cinematicCamera'
            ? (activeOverride.cinematicCamera ?? activeOverride.goalReplay)
            : activeOverride.matchPlaying;
      const resolved = applySingleOverrideRule(
        sceneRule,
        defaultSceneAudience,
        carTeam,
        focusedCarTeam
      );
      if (resolved !== null) {
        return makeResult(resolved);
      }
    }
  }

  let visible = false;
  if (sceneContext === 'goalReplay' || sceneContext === 'cinematicCamera') {
    visible =
      config.showBoostBorderInGoalReplay &&
      evaluateAudienceVisibility(config.boostBorderReplayAudience, carTeam, focusedCarTeam);
  } else if (sceneContext === 'tunerOverview') {
    visible = config.showBoostBorderInMatchPlaying;
  } else {
    visible =
      config.showBoostBorderInMatchPlaying &&
      evaluateAudienceVisibility(config.boostBorderMatchAudience, carTeam, focusedCarTeam);
  }

  return makeResult(visible);
}
