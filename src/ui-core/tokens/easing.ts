/**
 * Motion & Physics Easing Presets
 * Apple HIG cubic-bezier & Framer Motion spring presets
 */
export const UI_EASING = {
  // Apple HIG standard transition curve: [0.2, 0.8, 0.25, 1]
  apple: [0.2, 0.8, 0.25, 1] as const,
  
  // Spring configurations for Framer Motion
  spring: {
    tactile: {
      type: 'spring' as const,
      stiffness: 450,
      damping: 32,
      mass: 0.8,
    },
    bouncy: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 20,
    },
    smooth: {
      type: 'spring' as const,
      stiffness: 260,
      damping: 28,
    },
    instant: {
      duration: 0.12,
      ease: [0.2, 0.8, 0.25, 1] as const,
    },
  },

  // Standard Container Transition Presets
  transitions: {
    // 1.  (Fluid Morph Transition)
    fluidMorph: {
      name: 'FluidMorphTransition' as const,
      displayName: 'Fluid Morph',
      description: 'Apple HIG continuous fluid morph: container dimensions and content interpolate smoothly via Apple Ease without stepped pauses.',
      duration: 0.28,
      ease: [0.2, 0.8, 0.25, 1] as const,
    },

    // 2.  (Sequenced Step Container Transition)
    sequencedStep: {
      name: 'SequencedStepTransition' as const,
      displayName: 'Sequenced Step',
      description: 'Apple HIG three-stage sequenced container transition: 100ms content fade-out, 150ms container resize, and 100ms content fade-in using Apple Ease.',
      fadeOut: {
        duration: 0.10, // 100ms
        ms: 100,
        ease: [0.2, 0.8, 0.25, 1] as const,
      },
      resize: {
        duration: 0.15, // 150ms
        ms: 150,
        ease: [0.2, 0.8, 0.25, 1] as const,
      },
      fadeIn: {
        duration: 0.10, // 100ms
        ms: 100,
        ease: [0.2, 0.8, 0.25, 1] as const,
      },
      totalDuration: 0.35, // 350ms
      totalMs: 350,
    },
  },
} as const;

export type ContainerTransitionMode = 'fluid-morph' | 'sequenced-step';

/**
 * 
 *  Apple HIG  [0.2, 0.8, 0.25, 1] duration ( 0.28s)
 */
export interface FluidMorphConfig {
  /**  0.28s */
  duration?: number;
  /**  Apple HIG  [0.2, 0.8, 0.25, 1] */
  ease?: readonly [number, number, number, number];
}

/**
 * 
 * /
 */
export interface SequencedStepConfig {
  /** / 0.10s (100ms) */
  fadeDuration?: number;
  /**  fadeDuration */
  fadeOutDuration?: number;
  /**  fadeDuration */
  fadeInDuration?: number;
  /**  0.15s (150ms) */
  resizeDuration?: number;
  /**  Apple HIG  [0.2, 0.8, 0.25, 1] */
  ease?: readonly [number, number, number, number];
}

export interface ContainerTransitionParams {
  fluid?: FluidMorphConfig;
  step?: SequencedStepConfig;
}
