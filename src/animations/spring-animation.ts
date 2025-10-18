export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
  precision?: number;

  // Cascaded spring parameters (optional - 0 or undefined = disabled)
  targetStiffness?: number;  // Spring constant for target oscillator
  targetDamping?: number;    // Damping coefficient for target oscillator
}

export interface Spring {
  setTarget: (target: number) => void;
  tick: (deltaTime: number) => number;
  isAtRest: () => boolean;
  getCurrent: () => number;
  getVelocity: () => number;
  snapToTarget: () => void;
  getTarget?: () => number;
}

export const SPRING_PRESETS = {
  gentle: { stiffness: 120, damping: 14 },
  wobbly: { stiffness: 180, damping: 12 },
  stiff: { stiffness: 210, damping: 20 },
  slow: { stiffness: 280, damping: 60 },
} as const;

export const SPRING_CONFIGS = {
  extreme: { stiffness: 30, damping: 3, mass: 1 },
  bouncy: { stiffness: 40, damping: 5, mass: 1 },
  smooth: { stiffness: 60, damping: 12, mass: 1.5 },
  stiff: { stiffness: 120, damping: 20, mass: 1 },

  // Two-stage cascaded systems
  cascadedOverdamped: {
    stiffness: 40,           // Second stage: moderate bounce
    damping: 5,
    mass: 1,
    targetStiffness: 100,    // First stage: quick response
    targetDamping: 30,       // First stage: overdamped (ζ > 1, no overshoot)
  },
  cascadedUnderdamped: {
    stiffness: 30,           // Second stage: very bouncy
    damping: 3,
    mass: 1,
    targetStiffness: 60,     // First stage: moderate response
    targetDamping: 12,       // First stage: underdamped (ζ < 1, can overshoot)
  },
} as const;

export type SpringConfigKey = keyof typeof SPRING_CONFIGS;

// Backward compatibility alias
export const VISUALISER_MODES = SPRING_CONFIGS;
export type VisualiserMode = SpringConfigKey;

export const createSpring = (
  initial: number,
  config: SpringConfig = SPRING_PRESETS.gentle,
): Spring => {
  // Display oscillator state
  let current = initial;
  let velocity = 0;

  // Target oscillator state (cascaded system)
  let target = initial;           // Smoothed target position
  let desiredTarget = initial;    // External input (what user/audio wants)
  let targetVelocity = 0;         // Target has its own velocity

  const fullConfig = {
    stiffness: config.stiffness,
    damping: config.damping,
    mass: config.mass ?? 1,
    precision: config.precision ?? 0.01,
    targetStiffness: config.targetStiffness ?? 0,
    targetDamping: config.targetDamping ?? 10,
  };

  const setTarget = (newTarget: number): void => {
    // Set desired target - target oscillator will spring toward it
    desiredTarget = newTarget;

    // If cascading disabled, update target immediately (backward compatible)
    if (fullConfig.targetStiffness === 0) {
      target = newTarget;
      targetVelocity = 0;
    }
  };

  const getTarget = (): number => desiredTarget;

  const tick = (deltaTime: number): number => {
    if (isAtRest()) {
      return current;
    }

    const { stiffness, damping, mass, targetStiffness, targetDamping } = fullConfig;

    // PHASE 1: Update target oscillator (if enabled)
    if (targetStiffness > 0) {
      const targetSpringForce = -targetStiffness * (target - desiredTarget);
      const targetDampingForce = -targetDamping * targetVelocity;
      const targetAcceleration = targetSpringForce + targetDampingForce;

      targetVelocity += targetAcceleration * deltaTime;
      target += targetVelocity * deltaTime;
    }
    // If disabled, target = desiredTarget (set in setTarget)

    // PHASE 2: Update display oscillator (always runs)
    const springForce = -stiffness * (current - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * deltaTime;
    current += velocity * deltaTime;

    return current;
  };

  const isAtRest = (): boolean => {
    const { precision, targetStiffness } = fullConfig;

    // Check display oscillator
    const displayAtRest =
      Math.abs(current - target) < precision &&
      Math.abs(velocity) < precision;

    // If cascading enabled, also check target oscillator
    if (targetStiffness > 0) {
      const targetAtRest =
        Math.abs(target - desiredTarget) < precision &&
        Math.abs(targetVelocity) < precision;

      return displayAtRest && targetAtRest;
    }

    return displayAtRest;
  };

  const getCurrent = (): number => current;

  const getVelocity = (): number => velocity;

  const snapToTarget = (): void => {
    current = desiredTarget;
    target = desiredTarget;
    velocity = 0;
    targetVelocity = 0;
  };

  return {
    setTarget,
    tick,
    isAtRest,
    getCurrent,
    getVelocity,
    snapToTarget,
    getTarget,
  };
};
