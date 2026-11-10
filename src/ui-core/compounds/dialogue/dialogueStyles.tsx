import React from 'react';
import { 
  OctagonAlert, 
  AlertCircle,
  AlertTriangle, 
  Info, 
  Flame,
  X 
} from 'lucide-react';
import { lookupLucideIcon } from '../../primitives/iconLookup';
import { UI_THEME } from '../../tokens/colors';
import { DialogueTone, DialogueButtonVariant, DialogueProps } from './dialogueTypes';

export const buildCombinedShadow = (
  tone: DialogueTone,
  isLight: boolean,
  innerGlowBlur: number,
  outerShadowBlur: number
): string => {
  const parts: string[] = [];

  // 1. Inner Glow (inset)
  if (innerGlowBlur > 0) {
    switch (tone) {
      case 'error':
        parts.push(
          isLight
            ? `inset 0 0 ${innerGlowBlur}px rgba(239, 68, 68, 0.16)`
            : `inset 0 0 ${Math.round(innerGlowBlur * 1.2)}px rgba(239, 68, 68, 0.25)`
        );
        break;
      case 'orange':
        parts.push(
          isLight
            ? `inset 0 0 ${innerGlowBlur}px rgba(249, 115, 22, 0.16)`
            : `inset 0 0 ${Math.round(innerGlowBlur * 1.2)}px rgba(249, 115, 22, 0.25)`
        );
        break;
      case 'warning':
        parts.push(
          isLight
            ? `inset 0 0 ${innerGlowBlur}px rgba(234, 179, 8, 0.16)`
            : `inset 0 0 ${Math.round(innerGlowBlur * 1.2)}px rgba(234, 179, 8, 0.25)`
        );
        break;
      case 'info':
      default:
        parts.push(
          isLight
            ? `inset 0 0 ${innerGlowBlur}px rgba(163, 163, 163, 0.18)`
            : `inset 0 0 ${Math.round(innerGlowBlur * 1.2)}px rgba(255, 255, 255, 0.08)`
        );
        break;
    }
  }

  // 2. Omnidirectional 360-degree floating outer shadow
  if (outerShadowBlur > 0) {
    if (isLight) {
      parts.push(
        `0 0 0 1px rgba(0, 0, 0, 0.08)`,
        `0 0 ${outerShadowBlur}px rgba(0, 0, 0, 0.16)`,
        `0 ${Math.round(outerShadowBlur * 0.4)}px ${Math.round(outerShadowBlur * 1.2)}px rgba(0, 0, 0, 0.14)`
      );
    } else {
      parts.push(
        `0 0 0 1px rgba(255, 255, 255, 0.14)`,
        `0 0 ${outerShadowBlur}px rgba(0, 0, 0, 0.85)`,
        `0 ${Math.round(outerShadowBlur * 0.4)}px ${Math.round(outerShadowBlur * 1.2)}px rgba(0, 0, 0, 0.95)`
      );
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'none';
};

export const getLucideIconComponent = (name: string) =>
  lookupLucideIcon(name);

/**
 * Tone configuration for the 4 levels (Grey, Yellow, Orange, Red)
 */
export const getToneConfig = (tone: DialogueTone, isLight: boolean) => {
  switch (tone) {
    case 'error':
      return {
        defaultIconComponent: OctagonAlert,
        iconContainerClass: isLight
          ? 'bg-red-50 text-red-600 border border-red-200/90'
          : 'bg-red-950/70 text-red-400 border border-red-800/80',
        plainIconColorClass: isLight ? 'text-red-600' : 'text-red-400',
        cardBorderClass: isLight ? 'border-red-300/80' : 'border-red-900/60',
        defaultButtonVariant: 'danger' as DialogueButtonVariant,
      };
    case 'orange':
      return {
        defaultIconComponent: Flame,
        iconContainerClass: isLight
          ? 'bg-orange-50 text-orange-600 border border-orange-200/90'
          : 'bg-orange-950/70 text-orange-400 border border-orange-800/80',
        plainIconColorClass: isLight ? 'text-orange-600' : 'text-orange-400',
        cardBorderClass: isLight ? 'border-orange-300/80' : 'border-orange-900/60',
        defaultButtonVariant: 'primary' as DialogueButtonVariant,
      };
    case 'warning':
      return {
        defaultIconComponent: AlertTriangle,
        iconContainerClass: isLight
          ? 'bg-yellow-50 text-yellow-600 border border-yellow-200/90'
          : 'bg-yellow-950/70 text-yellow-400 border border-yellow-800/80',
        plainIconColorClass: isLight ? 'text-yellow-600' : 'text-yellow-400',
        cardBorderClass: isLight ? 'border-yellow-300/80' : 'border-yellow-900/60',
        defaultButtonVariant: 'primary' as DialogueButtonVariant,
      };
    case 'info':
    default:
      return {
        defaultIconComponent: Info,
        iconContainerClass: isLight
          ? 'bg-neutral-100 text-neutral-600 border border-neutral-300/80'
          : 'bg-neutral-800 text-neutral-300 border border-neutral-700/80',
        plainIconColorClass: isLight ? 'text-neutral-600' : 'text-neutral-400',
        cardBorderClass: isLight ? 'border-neutral-300/80' : 'border-neutral-800/80',
        defaultButtonVariant: 'primary' as DialogueButtonVariant,
      };
  }
};

export const resolveDialogueIconNode = (
  icon: React.ReactNode | string | undefined,
  effectiveIconSize: number,
  DefaultToneIcon: React.ComponentType<{ size?: number; className?: string }>
): React.ReactNode => {
  if (typeof icon === 'string' && icon.trim()) {
    const IconComponent = getLucideIconComponent(icon.trim()) || DefaultToneIcon;
    return <IconComponent size={effectiveIconSize} className="shrink-0 transition-all" />;
  }
  if (React.isValidElement(icon)) {
    const iconElement = icon as React.ReactElement<{ size?: number; className?: string }>;
    return React.cloneElement(iconElement, {
      size: effectiveIconSize,
      className: `${iconElement.props.className || ''} shrink-0 transition-all`,
    });
  }
  if (icon) return icon;
  return <DefaultToneIcon size={effectiveIconSize} className="shrink-0 transition-all" />;
};

export const resolveDialogueTitleColorClass = (
  tone: DialogueTone,
  isLight: boolean,
  titleColorMode: NonNullable<DialogueProps['titleColorMode']>,
  titleColor?: string
): string => {
  if (titleColor) return '';
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;
  switch (titleColorMode) {
    case 'muted':
      return theme.textMuted;
    case 'primary':
      return theme.textPrimary;
    case 'tone':
      if (tone === 'error') return isLight ? 'text-red-600' : 'text-red-400';
      if (tone === 'orange') return isLight ? 'text-orange-600' : 'text-orange-400';
      if (tone === 'warning') return isLight ? 'text-yellow-600' : 'text-yellow-400';
      return theme.textSecondary;
    case 'content':
    default:
      return theme.textSecondary;
  }
};

export const resolveDialogueButtonVariantClasses = (
  variant: DialogueButtonVariant,
  isLight: boolean
): string => {
  if (variant === 'primary') {
    return isLight
      ? 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 shadow-xs'
      : 'bg-white text-neutral-950 hover:bg-neutral-100 border-white shadow-xs';
  }
  if (variant === 'danger') {
    return isLight
      ? 'bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-xs'
      : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border-red-500/40 shadow-xs';
  }
  return isLight
    ? 'bg-transparent text-neutral-800 hover:bg-neutral-100/90 border-neutral-300'
    : 'bg-transparent text-neutral-200 hover:bg-white/10 border-neutral-700';
};

export const measureEqualDialogueButtonWidth = (
  container: HTMLElement | null
): number | null => {
  if (!container) return null;
  const btnElements = container.querySelectorAll<HTMLButtonElement>('button[data-dialogue-btn="true"]');
  if (btnElements.length === 0) return null;
  btnElements.forEach((btn) => {
    btn.style.width = 'auto';
  });
  let maxW = 0;
  btnElements.forEach((btn) => {
    const rect = btn.getBoundingClientRect();
    if (rect.width > maxW) maxW = rect.width;
  });
  return maxW > 0 ? Math.ceil(Math.max(maxW, 92)) : null;
};

export const MONO_FONT_STACK = "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace";

export const DEFAULT_TITLES: Record<DialogueTone, string> = {
  error: 'ERROR',
  warning: 'WARNING',
  orange: 'ALERT',
  info: 'INFO',
};
