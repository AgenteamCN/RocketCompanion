import React from 'react';

export type DialogueTone = 'info' | 'warning' | 'orange' | 'error';
export type DialogueButtonVariant = 'primary' | 'outline' | 'danger';
export type DialogueIconVariant = 'plain' | 'container';

export interface DialogueButtonConfig {
  key?: string;
  label: string;
  variant?: DialogueButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
}

export interface DialogueProps {
  /** Centered title text (default: 'ALERT') */
  title?: string;
  /** Title font size in px (default: 32) */
  titleFontSize?: number;
  /** Title letter spacing in px or string (default: 10) */
  titleLetterSpacing?: number | string;
  /** Title font weight (default: 400) */
  titleFontWeight?: number | string;
  /** Title top margin in px (default: 0) */
  titleMarginTop?: number;
  /** Title bottom margin in px (default: 10) */
  titleMarginBottom?: number;
  /** Title color mode: 'content' (matches body text), 'muted', 'primary', 'tone' (default: 'content') */
  titleColorMode?: 'content' | 'muted' | 'primary' | 'tone';
  /** Optional explicit title color string (e.g. hex or rgba) */
  titleColor?: string;
  /** Information body text / node, vertically centered with left icon */
  content?: React.ReactNode;
  /** Content bottom margin (gap before buttons) in px (default: 20) */
  contentMarginBottom?: number;
  /** Left icon: Lucide icon name (string, e.g. 'octagon-alert', 'bell') or ReactNode (default: 'octagon-alert') */
  icon?: string | React.ReactNode;
  /** Icon variation: 'plain' (bare icon only) or 'container' (with frame box) (default: 'plain') */
  iconVariant?: DialogueIconVariant;
  /** Icon size in px (default: 46) */
  iconSize?: number;
  /** Tone level: error (red), warning (yellow), orange (orange), info (grey) (default: 'error') */
  tone?: DialogueTone;
  /** Action buttons, centered, compact, equal width */
  buttons?: DialogueButtonConfig[];
  /** Light / Dark theme */
  isLight?: boolean;
  /** Dialogue container top padding in px (default: 10) */
  paddingTop?: number;
  /** Dialogue container bottom padding in px (default: 16) */
  paddingBottom?: number;
  /** Dialogue container vertical padding in px (default: 16) */
  paddingY?: number;
  /** Dialogue container horizontal padding in px (default: 32) */
  paddingX?: number;
  /** Legacy unified dialogue padding in px */
  dialoguePadding?: number;
  /** Legacy unified section gap in px */
  sectionGap?: number;
  /** Inner glow blur radius in px (default: 36, 0 to disable) */
  innerGlowBlur?: number;
  /** Omnidirectional outer shadow blur in px (default: 20, 0 to disable) */
  outerShadowBlur?: number;
  /** Minimum container height (default: 165) */
  minHeight?: number | string;
  /** Maximum container width (default: 560) */
  maxWidth?: number | string;
  /** Optional custom class name */
  className?: string;
  /** Whether to show top-right close icon (default: false) */
  showCloseButton?: boolean;
  /** Optional close handler */
  onClose?: () => void;
}

/**
 * Build combined box-shadow: inner glow (inset) + omnidirectional 360-degree floating outer shadow
 */

export interface DialogueModalProps extends DialogueProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback to close modal */
  onClose?: () => void;
  /** Whether clicking overlay closes modal (default: false, forces action button selection) */
  closeOnClickOutside?: boolean;
  /** Whether pressing Esc closes modal (default: false, forces action button selection) */
  closeOnEsc?: boolean;
  /** Custom z-index (default: 800) */
  zIndex?: number;
}

export interface StackedDialogueOptions extends Omit<DialogueProps, 'isLight'> {
  id?: string;
  isLight?: boolean;
  zIndex?: number;
}

export interface DialogueStackItem extends StackedDialogueOptions {
  id: string;
  zIndex: number;
}
