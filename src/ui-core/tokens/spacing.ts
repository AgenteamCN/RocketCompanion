/**
 * Standard Spacing Tokens (4px Scale & SimpleUI Layout Standard)
 * Designed for predictable LLM generation and zero-drift UI consistency.
 */
export const UI_SPACING = {
  // 4px Base Grid
  space0: '0px',
  space1: '0.25rem',  // 4px
  space1_5: '0.375rem',// 6px
  space2: '0.5rem',   // 8px
  space2_5: '0.625rem',// 10px
  space3: '0.75rem',  // 12px
  space3_5: '0.875rem',// 14px
  space4: '1rem',     // 16px
  space5: '1.25rem',  // 20px
  space6: '1.5rem',   // 24px
  space8: '2rem',     // 32px
  space10: '2.5rem',  // 40px
  space12: '3rem',    // 48px

  // Component Paddings (Compact Game UI Standard aligned with Edge Inspector)
  panel: {
    window: 'p-0',
    header: 'px-4 py-2',      // Compact single-line header
    body: 'px-4 py-3',        // High-density content breathing room
    footer: 'px-4 py-2',      // Compact unified description footer
  },
  menu: {
    container: 'p-2',         // 8px cushioned inner boundary
    item: 'px-4 py-3',        // 16px horizontal, 12px vertical (min-h-[52px])
    gap: 'gap-2.5',           // 10px item separation
    iconGap: 'gap-3.5',       // 14px optical icon margin
  },
  card: {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
    gap: 'gap-3',
  },
  // Stack Spacing (Active Canvas Width Percentages: sm / md / lg)
  stack: {
    none: '0px',
    sm: 'calc(var(--ui-render-width, 100%) * 0.010)', // 1.0% Active Canvas  ( / sm)
    md: 'calc(var(--ui-render-width, 100%) * 0.018)', // 1.8% Active Canvas  ( / md)
    lg: 'calc(var(--ui-render-width, 100%) * 0.028)', // 2.8% Active Canvas  ( / lg)
  },
  stackPercentage: {
    none: '0%',
    sm: '1.0%',
    md: '1.8%',
    lg: '2.8%',
  },
  badge: {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  },
  keycap: {
    sm: 'px-1.5 py-0.5 text-[10px] min-w-[20px] min-h-[20px]',
    md: 'px-2 py-0.5 text-xs min-w-[24px] min-h-[24px]',
    lg: 'px-2.5 py-1 text-sm min-w-[28px] min-h-[28px]',
  }
} as const;

export type StackGap = 'none' | 'sm' | 'md' | 'lg';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch';
export type StackJustify = 'start' | 'center' | 'end' | 'between';

export const normalizeStackGap = (gap?: StackGap | 'xs' | 'xl'): StackGap => {
  if (gap === 'xs') return 'sm';
  if (gap === 'xl') return 'lg';
  return gap ?? 'md';
};


