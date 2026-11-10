import React from 'react';
import { UI_SPACING } from '../tokens/spacing';
import { UI_RADIUS } from '../tokens/radius';

export const ALPHA_COMPONENT_ID = 'Alpha:KeycapBadge' as const;

export type KeycapSize = 'sm' | 'md' | 'lg';
export type KeycapKind = 'keyboard' | 'gamepad';
export type KeycapShape = 'rounded' | 'pill';

export interface KeycapBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  /** Key label (e.g. 'ESC', 'ENTER', 'SPACE', 'W', 'A', 'S', 'D') */
  shortcut?: string;
  label?: string;
  kind?: KeycapKind;
  size?: KeycapSize;
  shape?: KeycapShape;
  isLight?: boolean;
  pressed?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * KeycapBadge
 * Standardized keycap badge representing physical keyboard shortcuts or gamepad buttons.
 * Flat, crisp badge ergonomics (no heavy bottom bevel shadow), distinct from background colors.
 * Supports rounded rectangle (default) and pill/capsule shapes.
 */
export const KeycapBadge: React.FC<KeycapBadgeProps> = React.memo(({
  children,
  shortcut,
  label: propLabel,
  kind = 'keyboard',
  size = 'md',
  shape = 'rounded',
  isLight = false,
  pressed = false,
  icon,
  className = '',
  ...props
}) => {
  const content = children || shortcut || propLabel;
  const sizeClass = UI_SPACING.keycap[size];
  const shapeClass = shape === 'pill' ? UI_RADIUS.full : UI_RADIUS.sm;

  // Gamepad specific coloring
  const isGamepad = kind === 'gamepad';
  const label = (typeof shortcut === 'string' ? shortcut : typeof content === 'string' ? content : '').trim().toUpperCase();

  let gamepadAccent = '';
  if (isGamepad) {
    if (label === 'A') gamepadAccent = 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';
    else if (label === 'B') gamepadAccent = 'text-red-500 border-red-500/40 bg-red-500/10';
    else if (label === 'X') gamepadAccent = 'text-sky-500 border-sky-500/40 bg-sky-500/10';
    else if (label === 'Y') gamepadAccent = 'text-amber-500 border-amber-500/40 bg-amber-500/10';
    else gamepadAccent = isLight ? 'text-neutral-700 border-neutral-300 bg-neutral-100' : 'text-neutral-300 border-neutral-700 bg-neutral-800';
  }

  const baseThemeStyle = isGamepad && (label === 'A' || label === 'B' || label === 'X' || label === 'Y')
    ? gamepadAccent
    : isLight
    ? pressed
      ? 'bg-neutral-200 border-neutral-400 text-neutral-900 shadow-2xs'
      : 'bg-neutral-100 border-neutral-300 text-neutral-800 shadow-2xs'
    : pressed
    ? 'bg-neutral-700 border-neutral-600 text-neutral-100'
    : 'bg-neutral-800 border-neutral-700 text-neutral-200';

  return (
    <kbd
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="keycap-badge"
      data-kind={kind}
      data-shape={shape}
      data-size={size}
      data-pressed={pressed ? 'true' : 'false'}
      className={`inline-flex items-center justify-center font-mono font-semibold tracking-wider select-none border transition-all duration-100 ${shapeClass} ${sizeClass} ${
        pressed ? 'scale-95 opacity-90' : ''
      } ${baseThemeStyle} ${className}`}
      {...props}
    >
      {icon && <span className="mr-1 shrink-0">{icon}</span>}
      <span className="leading-none">{content}</span>
    </kbd>
  );
});

KeycapBadge.displayName = 'KeycapBadge';
