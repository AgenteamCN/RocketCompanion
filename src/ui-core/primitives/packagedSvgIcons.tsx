import React from 'react';
import {
  BombEmojiSvg,
  ReplaySkipCheckSvg,
  buildSvgDropShadowFilter,
  computeContourStroke5120,
  type BounceSvgOptions,
  type CrossbarSvgOptions,
  type HighFiveSvgOptions,
  type PackagedSvgIconProps,
  type PackagedSvgStyleProps,
  type StrategySvgOptions,
  type TacticsSvgOptions,
} from './svg/packagedSvgDefinitions';
import { SVG_VECTOR_PATHS } from './svg/packagedSvgVectorPaths';

/**
 * 2. Crossbar SVG (`7267515` Outlined & `7267457` Solid)
 */
export const CrossbarSvg: React.FC<
  PackagedSvgStyleProps & CrossbarSvgOptions & { options?: CrossbarSvgOptions }
> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    variant,
    solidFrame: flatSolidFrame,
    showSparks: flatShowSparks,
    showReboundLines: flatShowReboundLines,
    options,
    className = '',
    style,
  }) => {
    const resolvedVariant = variant ?? options?.variant;
    const solidFrame =
      resolvedVariant !== undefined
        ? resolvedVariant === 'solid'
        : flatSolidFrame ?? options?.solidFrame ?? false;
    const showSparks = flatShowSparks ?? options?.showSparks ?? true;
    const showReboundLines = flatShowReboundLines ?? options?.showReboundLines ?? true;
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);

    const parts: string[] = [];
    if (solidFrame) {
      const p = SVG_VECTOR_PATHS.crossbar_7267457;
      parts.push(p.ballSolid, p.goalLeftSolid, p.goalRightSolid);
      if (showSparks) parts.push(...p.sparksTop);
      if (showReboundLines) parts.push(...p.reboundLinesBottom);
    } else {
      const p = SVG_VECTOR_PATHS.crossbar_7267515;
      parts.push(
        p.outerGoalAndBall,
        p.ballInnerCutout,
        p.goalLeftInnerCutout,
        p.goalRightInnerCutout
      );
      if (showSparks) parts.push(...p.sparksTop);
      if (showReboundLines) parts.push(...p.reboundLinesBottom);
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          <path d={parts.join(' ')} />
        </g>
      </svg>
    );
  }
);
CrossbarSvg.displayName = 'CrossbarSvg';

/**
 * 3. Bounce SVG (`7384294` Outlined & Solid Single-Line Trajectory/Platform Variation)
 * When `solidTrajectory` and `solidPlatform` are true (and `solidBall` is false),
 * the trajectory curve and ground platform render as solid single-line strokes while the ball stays normally outlined.
 */
export const BounceSvg: React.FC<
  PackagedSvgStyleProps & BounceSvgOptions & { options?: BounceSvgOptions }
> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    solidTrajectoryAndPlatform,
    solidTrajectory: flatSolidTrajectory,
    solidPlatform: flatSolidPlatform,
    solidBall: flatSolidBall,
    options,
    className = '',
    style,
  }) => {
    const bothSolid = solidTrajectoryAndPlatform ?? options?.solidTrajectoryAndPlatform;
    const solidTrajectory =
      bothSolid !== undefined ? bothSolid : flatSolidTrajectory ?? options?.solidTrajectory ?? false;
    const solidPlatform =
      bothSolid !== undefined ? bothSolid : flatSolidPlatform ?? options?.solidPlatform ?? false;
    const solidBall = flatSolidBall ?? options?.solidBall ?? false;
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);

    const p = SVG_VECTOR_PATHS.bounce_7384294;
    const parts: string[] = [p.outerContour];
    if (!solidBall) parts.push(p.ballInnerCutout);
    if (!solidTrajectory) parts.push(p.trajectoryInnerCutout);
    if (!solidPlatform) parts.push(p.platformInnerCutout);

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          <path d={parts.join(' ')} />
        </g>
      </svg>
    );
  }
);
BounceSvg.displayName = 'BounceSvg';

/**
 * 3B. Bounce Solid Single-Line SVG (`7384294` 5F Stats Event · C. Bounce )
 * Direct component wrapper with `solidTrajectoryAndPlatform={true}` for Settings -> Gameplay -> Ball Trajectory Predictor.
 */
export const BounceSolidSvg: React.FC<PackagedSvgStyleProps & BounceSvgOptions> = React.memo(
  (props) => <BounceSvg {...props} solidTrajectoryAndPlatform={true} />
);
BounceSolidSvg.displayName = 'BounceSolidSvg';

/**
 * 4. High Five SVG (`1154833` with 3 Boolean Toggles -> 2³ = 8 Combinations)
 * - `showSparks`: top 3 + bottom 3 = 6 spark lines
 * - `fillLeftHand`: left hand solid fill
 * - `fillRightHand`: right hand solid fill
 */
export const HighFiveSvg: React.FC<
  PackagedSvgStyleProps & HighFiveSvgOptions & { options?: HighFiveSvgOptions }
> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    showSparks: flatShowSparks,
    fillLeftHand: flatFillLeftHand,
    fillRightHand: flatFillRightHand,
    options,
    className = '',
    style,
  }) => {
    const showSparks = flatShowSparks ?? options?.showSparks ?? true;
    const fillLeftHand = flatFillLeftHand ?? options?.fillLeftHand ?? false;
    const fillRightHand = flatFillRightHand ?? options?.fillRightHand ?? false;
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);

    const p = SVG_VECTOR_PATHS.high_five_1154833;
    const parts: string[] = [p.handsOuterContour];
    if (!fillRightHand) parts.push(p.rightHandInnerCutout);
    if (!fillLeftHand) parts.push(p.leftHandInnerCutout);
    if (showSparks) {
      parts.push(...p.sparksTop, ...p.sparksBottom);
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          <path d={parts.join(' ')} />
        </g>
      </svg>
    );
  }
);
HighFiveSvg.displayName = 'HighFiveSvg';

/**
 * 5. Tactics Playmaker SVG (`6112985` Original & 1:1 Square Angled Arrow Variation)
 */
export const TacticsSvg: React.FC<
  PackagedSvgStyleProps & TacticsSvgOptions & { options?: TacticsSvgOptions }
> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    squareVariation: flatSquareVariation,
    arrowTiltDeg: flatArrowTiltDeg,
    options,
    className = '',
    style,
  }) => {
    const squareVariation = flatSquareVariation ?? options?.squareVariation ?? false;
    const arrowTiltDeg = flatArrowTiltDeg ?? options?.arrowTiltDeg ?? -18;
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);
    const p = SVG_VECTOR_PATHS.tactics_6112985;

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          {squareVariation ? (
            <>
              <path d={`${p.squareXMark} ${p.squareOOuter} ${p.squareOInner}`} />
              <g transform={`translate(2560, 2500) rotate(${arrowTiltDeg}) translate(-2480, -2420)`}>
                <path d={p.sCurveArrow} />
              </g>
            </>
          ) : (
            <path d={`${p.xMark} ${p.sCurveArrow} ${p.oOuter} ${p.oInner}`} />
          )}
        </g>
      </svg>
    );
  }
);
TacticsSvg.displayName = 'TacticsSvg';

/**
 * 6. Strategy Board SVG (`6112585` with 2 Boolean Toggles -> 2² = 4 X/O Combinations)
 * - `topLeftCircle`: false = X, true = Circle O
 * - `bottomRightCircle`: false = X, true = Circle O
 */
export const StrategySvg: React.FC<
  PackagedSvgStyleProps & StrategySvgOptions & { options?: StrategySvgOptions }
> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    topLeftCircle: flatTopLeftCircle,
    bottomRightCircle: flatBottomRightCircle,
    options,
    className = '',
    style,
  }) => {
    const topLeftCircle = flatTopLeftCircle ?? options?.topLeftCircle ?? false;
    const bottomRightCircle = flatBottomRightCircle ?? options?.bottomRightCircle ?? false;
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);
    const p = SVG_VECTOR_PATHS.strategy_6112585;

    const parts: string[] = [p.mainArrowOuter, p.mainArrowOInner];
    if (topLeftCircle) {
      parts.push(p.topLeftOOuter, p.topLeftOInner);
    } else {
      parts.push(p.topLeftX);
    }
    if (bottomRightCircle) {
      parts.push(p.bottomRightOOuter, p.bottomRightOInner);
    } else {
      parts.push(p.bottomRightX);
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          <path d={parts.join(' ')} />
        </g>
      </svg>
    );
  }
);
StrategySvg.displayName = 'StrategySvg';

/**
 * 7. Jet / Rocket Thrust SVG (`4873540` from Noun Project: https://thenounproject.com/search/icons/?q=jet&qv=4873540)
 * Used for Boost Volume in Audio Settings.
 * Uses optical `fillOpacity={0.72}` so the solid-filled rocket silhouette matches the visual weight of 2px stroke Lucide icons (`Volume2`, `Engine`).
 */
export const JetThrustSvg: React.FC<PackagedSvgStyleProps> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    className = '',
    style,
  }) => {
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const extraStroke = computeContourStroke5120(strokeWidth);
    const p = SVG_VECTOR_PATHS.jet_4873540;

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 select-none ${className}`}
        style={{
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        }}
      >
        <g
          transform="translate(0,512) scale(0.1,-0.1)"
          fill="currentColor"
          fillOpacity={0.72}
          stroke={extraStroke > 0 ? 'currentColor' : 'none'}
          strokeWidth={extraStroke}
          strokeLinejoin="round"
        >
          <path d={`${p.bodyPath} ${p.windowPath} ${p.flamePath}`} />
        </g>
      </svg>
    );
  }
);
JetThrustSvg.displayName = 'JetThrustSvg';

export const PackagedSvgIcon: React.FC<PackagedSvgIconProps> = React.memo(
  ({
    name,
    icon,
    bounceOptions,
    highFiveOptions,
    tacticsOptions,
    strategyOptions,
    crossbarOptions,
    ...styleProps
  }) => {
    const resolvedName = name ?? icon ?? 'bomb-emoji';
    switch (resolvedName) {
      case 'bomb-emoji':
        return <BombEmojiSvg {...styleProps} />;
      case 'replay-skip-check':
        return <ReplaySkipCheckSvg {...styleProps} />;
      case 'crossbar-outline':
        return <CrossbarSvg {...styleProps} options={{ solidFrame: false, ...crossbarOptions }} />;
      case 'crossbar-solid':
        return <CrossbarSvg {...styleProps} options={{ solidFrame: true, ...crossbarOptions }} />;
      case 'bounce-outline':
        return (
          <BounceSvg
            {...styleProps}
            options={{
              solidTrajectory: false,
              solidPlatform: false,
              solidBall: false,
              ...bounceOptions,
            }}
          />
        );
      case 'bounce-solid':
        return (
          <BounceSvg
            {...styleProps}
            options={{
              solidTrajectory: true,
              solidPlatform: true,
              solidBall: false,
              ...bounceOptions,
            }}
          />
        );
      case 'high-five':
        return <HighFiveSvg {...styleProps} options={highFiveOptions} />;
      case 'tactics':
        return <TacticsSvg {...styleProps} options={{ squareVariation: false, ...tacticsOptions }} />;
      case 'tactics-square':
        return <TacticsSvg {...styleProps} options={{ squareVariation: true, ...tacticsOptions }} />;
      case 'strategy':
        return <StrategySvg {...styleProps} options={strategyOptions} />;
      case 'jet-thrust':
        return <JetThrustSvg {...styleProps} />;
      default:
        return <BombEmojiSvg {...styleProps} />;
    }
  }
);
PackagedSvgIcon.displayName = 'PackagedSvgIcon';
