import React from 'react';
import {
  ALIGN_CLASSES,
  ANCHOR_POSITION_CLASSES,
  DEFAULT_ANCHOR_ALIGN,
  DIRECTION_CLASSES,
  FLOW_DIRECTION_MAP,
  resolveFloatingAttachmentStyle,
} from './HudAnchorCalibrationOverlay';

/**
 * 9-Zone Semantic HUD Anchor Positions
 * Decouples individual HUD widgets from hardcoded screen coordinates.
 */
export type HudAnchorPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'upper-center'
  | 'left-edge'
  | 'center'
  | 'right-edge'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Slot Presence Strategy inside an Anchor Zone:
 * - `'reserve'`: Fixed landmark slot. When `visible={false}`, keeps its exact DOM box & spacing
 *    footprint (`visibility: hidden; opacity: 0`) so sibling widgets never jump (protects saccadic muscle memory).
 * - `'collapse'`: Flow stack slot. When `visible={false}`, smoothly collapses height & spacing to `0`
 *   so subsequent widgets in the same stack automatically glide into place.
 */
export type HudSlotMode = 'reserve' | 'collapse';

/**
 * Stage-Level Choreography Strategy Preset:
 * - `'reserve'`: Fixed slots everywhere; hiding top-left telemetry leaves `[1-3]` & `[4-6]` untouched.
 * - `'collapse-local'`: Independent corner stacks; hiding top-left telemetry pulls only left `[1-3]` upward.
 * - `'collapse-symmetric'`: Axial-symmetric linked flow; hiding top-left telemetry pulls both left `[1-3]`
 *   and right `[4-6]` upward in unison to preserve strict horizontal team symmetry.
 */
export type HudLayoutStrategy = 'reserve' | 'collapse-local' | 'collapse-symmetric';

export interface HudAnchorStageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Active spatial choreography strategy (exposed as `data-hud-strategy` for telemetry/debugging) */
  strategy?: HudLayoutStrategy;
  /** Optional safe margin in px (ignored on DOM, mapped to CSS custom property if provided) */
  safeMarginPx?: number;
  className?: string;
}

/**
 * HudAnchorStage (L2 Pure Spatial Layout Shell)
 * Full-canvas non-occluding overlay stage that hosts 9-zone `<HudZone>` containers.
 * Zero business logic, zero L3–L7 imports.
 */
export const HudAnchorStage: React.FC<HudAnchorStageProps> = React.memo(
  ({ children, strategy = 'reserve', safeMarginPx: _safeMarginPx, className = '', style, ...props }) => {
    return (
      <div
        data-layout="hud-anchor-stage"
        data-hud-strategy={strategy}
        className={`relative z-20 w-full h-full overflow-hidden select-none pointer-events-none ${className}`}
        style={style}
        {...props}
      >
        {children}
      </div>
    );
  }
);

HudAnchorStage.displayName = 'HudAnchorStage';

export interface HudZoneProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Which of the semantic screen zones this container anchors to */
  anchor: HudAnchorPosition;
  children: React.ReactNode;
  /**
   * If true, sits flush (`0px`) against the anchored viewport edge(s)
   * (e.g., `top-0` for `StepperScoreboardHUD`, `left-0` / `right-0` for `EdgePlayerHudStrip`).
   * If false, applies standard optical safe-area padding (`10px–20px`).
   */
  flush?: boolean;
  /** Flex stack direction inside the zone (defaults to `'col'`) */
  direction?: 'col' | 'row' | 'col-reverse' | 'row-reverse';
  /** Cross-axis alignment override (auto-inferred from `anchor` if omitted) */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Gap in px or CSS string between children when not using `<HudSlot spacingAfter>` */
  gap?: number | string;
  /** Optional z-index class (default `'z-30'`) */
  zIndexClassName?: string;
  className?: string;
}

/**
 * HudZone (L2 9-Anchor Spatial Zone Container)
 * Positions a group of HUD widgets at a semantic screen landmark without coupling child components to coordinates.
 */
export const HudZone: React.FC<HudZoneProps> = React.memo(
  ({
    anchor,
    children,
    flush = false,
    direction = 'col',
    align,
    gap,
    zIndexClassName = 'z-30',
    className = '',
    style,
    ...props
  }) => {
    const posClass = flush
      ? ANCHOR_POSITION_CLASSES[anchor].flush
      : ANCHOR_POSITION_CLASSES[anchor].padded;
    const resolvedAlign = align ?? DEFAULT_ANCHOR_ALIGN[anchor];

    return (
      <div
        data-layout="hud-zone"
        data-anchor={anchor}
        className={`absolute flex ${posClass} ${DIRECTION_CLASSES[direction]} ${ALIGN_CLASSES[resolvedAlign]} ${zIndexClassName} ${className}`}
        style={{
          ...(gap !== undefined
            ? { gap: typeof gap === 'number' ? `${gap}px` : gap }
            : undefined),
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

HudZone.displayName = 'HudZone';

export interface HudSlotProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** Whether the widget inside this slot is currently active/shown */
  visible?: boolean;
  /**
   * Presence strategy when `visible={false}`:
   * - `'reserve'`: Keeps the exact intrinsic height/width and spacing in the layout tree (`opacity-0 invisible`).
   * - `'collapse'`: Smoothly animates height (`grid-template-rows: 0fr`) and spacing to `0px` so neighbors reflow.
   */
  mode?: HudSlotMode;
  /**
   * Optional directional slide-out offset when `visible={false}` (e.g., `'translate3d(0, 140%, 0)'`,
   * `'translate3d(130%, 0, 0)'`, `'translate3d(-130%, 0, 0)'`).
   * Animates purely on the GPU compositor (`transform`, `opacity`).
   */
  exitOffset?: string;
  /**
   * If `true`, bypasses CSS transition (`duration-0`) for immediate 0ms show/hide
   * (e.g., when Spectator switches to/from `focusedSlotKey === null`).
   */
  instant?: boolean;
  /**
   * Optional explicit reserved height (px or CSS string) when used as a pure symmetric spacer
   * without children, or as a minimum height guarantee in `'reserve'` mode.
   */
  reservedHeight?: number | string;
  /** Bottom spacing (px or CSS string) that persists in `'reserve'` mode and collapses to `0px` in `'collapse'` mode */
  spacingAfter?: number | string;
  /** Top spacing (px or CSS string) that persists in `'reserve'` mode and collapses to `0px` in `'collapse'` mode */
  spacingBefore?: number | string;
  /** Optional inner wrapper class (e.g. inset padding for a specific card inside a flush zone) */
  innerClassName?: string;
  className?: string;
}

/**
 * HudSlot (L2 Presence & Reflow Wrapper)
 * Controls whether hiding a HUD widget reserves its landmark space (`mode="reserve"`)
 * or triggers a smooth spring reflow of neighboring widgets (`mode="collapse"`).
 * Keeps children mounted in DOM so 120Hz transient channel refs never detach.
 */
export const HudSlot: React.FC<HudSlotProps> = React.memo(
  (props) => {
    const {
      children,
      visible = true,
      mode = 'collapse',
      exitOffset,
      instant = false,
      reservedHeight,
      spacingAfter = 0,
      spacingBefore = 0,
      innerClassName = '',
      className = '',
      style,
      ...restProps
    } = props;
    const shouldHoldSpace = visible || mode === 'reserve';

    const resolvedMarginBottom = shouldHoldSpace
      ? typeof spacingAfter === 'number'
        ? `${spacingAfter}px`
        : spacingAfter
      : '0px';

    const resolvedMarginTop = shouldHoldSpace
      ? typeof spacingBefore === 'number'
        ? `${spacingBefore}px`
        : spacingBefore
      : '0px';

    const resolvedMinHeight =
      shouldHoldSpace && reservedHeight !== undefined
        ? typeof reservedHeight === 'number'
          ? `${reservedHeight}px`
          : reservedHeight
        : '0px';

    const resolvedTransform = visible
      ? 'translate3d(0, 0, 0)'
      : exitOffset ?? 'translate3d(0, 0, 0)';

    const transitionClass = instant
      ? 'transition-none duration-0'
      : 'transition-[grid-template-rows,transform,opacity,margin,min-height,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]';

    return (
      <div
        data-layout="hud-slot"
        data-slot-mode={mode}
        data-slot-visible={visible ? 'true' : 'false'}
        data-slot-instant={instant ? 'true' : 'false'}
        aria-hidden={!visible}
        className={`grid will-change-transform ${transitionClass} ${
          visible
            ? 'opacity-100 visible pointer-events-auto'
            : 'opacity-0 invisible pointer-events-none'
        } ${className}`}
        style={{
          gridTemplateRows: shouldHoldSpace ? '1fr' : '0fr',
          marginBottom: resolvedMarginBottom,
          marginTop: resolvedMarginTop,
          minHeight: resolvedMinHeight,
          transform: resolvedTransform,
          ...style,
        }}
        {...restProps}
      >
        <div
          className={`min-h-0 min-w-0 ${
            shouldHoldSpace ? 'overflow-visible' : 'overflow-hidden'
          } ${innerClassName}`}
        >
          {children}
        </div>
      </div>
    );
  }
);

HudSlot.displayName = 'HudSlot';

export type HudAttachmentPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface HudRelativeAnchorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The primary landmark widget */
  children: React.ReactNode;
  /** The secondary companion widget attached relative to the primary widget */
  attachment: React.ReactNode;
  /** Which side of the primary widget the attachment sits on */
  placement: HudAttachmentPlacement;
  /** Cross-axis alignment when stacked in flow (`'start' | 'center' | 'end'`) */
  align?: 'start' | 'center' | 'end';
  /** Gap between primary widget and attachment (in px or CSS string, default `10`) */
  gap?: number | string;
  /**
   * If `true`, positions the attachment out-of-flow (`absolute left-full` / `right-full` / `bottom-full` / `top-full`)
   * so the primary widget's own center/anchor alignment is never shifted by the attachment's size.
   */
  floating?: boolean;
  /** Extra classes for the attachment wrapper */
  attachmentClassName?: string;
  className?: string;
}

/**
 * HudRelativeAnchor (L2 Companion Attachment Container)
 * Eliminates hardcoded pixel offsets (`calc(50% + 196px)`, `top-[178px]`, `right-[206px]`)
 * by declaratively binding a companion widget to any side of a primary HUD landmark.
 */
export const HudRelativeAnchor: React.FC<HudRelativeAnchorProps> = React.memo(
  ({
    children,
    attachment,
    placement,
    align = 'center',
    gap = 10,
    floating = false,
    attachmentClassName = '',
    className = '',
    style,
    ...props
  }) => {
    const gapCss = typeof gap === 'number' ? `${gap}px` : gap;

    if (floating) {
      const floatPosStyle = resolveFloatingAttachmentStyle(placement, align, gapCss);
      return (
        <div
          data-layout="hud-relative-anchor"
          data-placement={placement}
          data-align={align}
          data-floating="true"
          className={`relative inline-flex items-center justify-center pointer-events-auto ${className}`}
          style={style}
          {...props}
        >
          {children}
          <div
            className={`absolute z-30 shrink-0 transition-all duration-300 ${attachmentClassName}`}
            style={floatPosStyle}
          >
            {attachment}
          </div>
        </div>
      );
    }

    return (
      <div
        data-layout="hud-relative-anchor"
        data-placement={placement}
        data-align={align}
        data-floating="false"
        className={`flex ${FLOW_DIRECTION_MAP[placement]} ${ALIGN_CLASSES[align]} transition-all duration-300 pointer-events-auto ${className}`}
        style={{ gap: gapCss, ...style }}
        {...props}
      >
        {children}
        <div className={`shrink-0 transition-all duration-300 ${attachmentClassName}`}>
          {attachment}
        </div>
      </div>
    );
  }
);

HudRelativeAnchor.displayName = 'HudRelativeAnchor';

export interface HudTopSplitBandProps extends React.HTMLAttributes<HTMLDivElement> {
  leftSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  bandHeight?: number | string;
  className?: string;
}

/**
 * HudTopSplitBand (L2 3-Container Horizontal Top Band)
 */
export const HudTopSplitBand: React.FC<HudTopSplitBandProps> = React.memo(
  ({
    leftSlot,
    centerSlot,
    rightSlot,
    bandHeight = 56,
    className = '',
    style,
    ...props
  }) => {
    const resolvedH = typeof bandHeight === 'number' ? `${bandHeight}px` : bandHeight;

    return (
      <div
        data-layout="hud-top-split-band"
        className={`relative z-40 w-full flex items-stretch justify-between pointer-events-none ${className}`}
        style={{ height: resolvedH, ...style }}
        {...props}
      >
        <div className="flex-1 flex items-center justify-start pl-3 min-w-0">
          {leftSlot}
        </div>
        <div className="shrink-0 flex flex-col items-center self-start">
          {centerSlot}
        </div>
        <div className="flex-1 flex items-center justify-end pr-3 min-w-0 relative z-50">
          {rightSlot}
        </div>
      </div>
    );
  }
);

HudTopSplitBand.displayName = 'HudTopSplitBand';
