import React from 'react';

type HudAnchorPosition =
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

type HudAttachmentPlacement = 'top' | 'bottom' | 'left' | 'right';
type HudZoneDirection = 'col' | 'row' | 'col-reverse' | 'row-reverse';
type HudZoneAlign = 'start' | 'center' | 'end' | 'stretch';

export const ANCHOR_POSITION_CLASSES: Record<
  HudAnchorPosition,
  { flush: string; padded: string }
> = {
  'top-left': {
    flush: 'top-0 left-0',
    padded: 'top-2.5 left-3',
  },
  'top-center': {
    flush: 'top-0 left-1/2 -translate-x-1/2 w-max max-w-none',
    padded: 'top-3 left-1/2 -translate-x-1/2 w-max max-w-none',
  },
  'top-right': {
    flush: 'top-0 right-0',
    padded: 'top-2.5 right-3',
  },
  'upper-center': {
    flush: 'top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-none',
    padded: 'top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-none',
  },
  'left-edge': {
    flush: 'top-1/2 left-0 -translate-y-1/2',
    padded: 'top-1/2 left-3 -translate-y-1/2',
  },
  center: {
    flush: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-none',
    padded: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-none',
  },
  'right-edge': {
    flush: 'top-1/2 right-0 -translate-y-1/2',
    padded: 'top-1/2 right-3 -translate-y-1/2',
  },
  'bottom-left': {
    flush: 'bottom-0 left-0',
    padded: 'bottom-5 left-5',
  },
  'bottom-center': {
    flush: 'bottom-0 left-1/2 -translate-x-1/2 w-max max-w-none',
    padded: 'bottom-5 left-1/2 -translate-x-1/2 w-max max-w-none',
  },
  'bottom-right': {
    flush: 'bottom-0 right-0',
    padded: 'bottom-4 right-5',
  },
};

export const DEFAULT_ANCHOR_ALIGN: Record<HudAnchorPosition, 'start' | 'center' | 'end'> = {
  'top-left': 'start',
  'top-center': 'center',
  'top-right': 'end',
  'upper-center': 'center',
  'left-edge': 'start',
  center: 'center',
  'right-edge': 'end',
  'bottom-left': 'start',
  'bottom-center': 'center',
  'bottom-right': 'end',
};

export const DIRECTION_CLASSES: Record<HudZoneDirection, string> = {
  col: 'flex-col',
  row: 'flex-row',
  'col-reverse': 'flex-col-reverse',
  'row-reverse': 'flex-row-reverse',
};

export const ALIGN_CLASSES: Record<HudZoneAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

export const FLOW_DIRECTION_MAP: Record<HudAttachmentPlacement, string> = {
  bottom: 'flex-col',
  top: 'flex-col-reverse',
  right: 'flex-row',
  left: 'flex-row-reverse',
};

export function resolveFloatingAttachmentStyle(
  placement: HudAttachmentPlacement,
  align: 'start' | 'center' | 'end',
  gapCss: string
): React.CSSProperties {
  if (placement === 'right') {
    return {
      left: '100%',
      marginLeft: gapCss,
      ...(align === 'start'
        ? { top: 0 }
        : align === 'end'
        ? { bottom: 0 }
        : { top: '50%', transform: 'translateY(-50%)' }),
    };
  }
  if (placement === 'left') {
    return {
      right: '100%',
      marginRight: gapCss,
      ...(align === 'start'
        ? { top: 0 }
        : align === 'end'
        ? { bottom: 0 }
        : { top: '50%', transform: 'translateY(-50%)' }),
    };
  }
  if (placement === 'top') {
    return {
      bottom: '100%',
      marginBottom: gapCss,
      ...(align === 'start'
        ? { left: 0 }
        : align === 'end'
        ? { right: 0 }
        : { left: '50%', transform: 'translateX(-50%)' }),
    };
  }
  return {
    top: '100%',
    marginTop: gapCss,
    ...(align === 'start'
      ? { left: 0 }
      : align === 'end'
      ? { right: 0 }
      : { left: '50%', transform: 'translateX(-50%)' }),
  };
}
