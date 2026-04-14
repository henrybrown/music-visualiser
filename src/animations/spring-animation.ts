export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
  precision?: number;
}

export interface Spring {
  setTarget: (target: number) => void;
  tick: (deltaTime: number) => number;
  isAtRest: () => boolean;
  getCurrent: () => number;
  getVelocity: () => number;
  snapToTarget: () => void;
  getTarget: () => number;
}

export const SPRING_CONFIGS = {
  extreme: { stiffness: 30, damping: 3, mass: 1 },
  bouncy: { stiffness: 40, damping: 5, mass: 1 },
  stiff: { stiffness: 120, damping: 20, mass: 1 },
} as const;

export type SpringConfigKey = keyof typeof SPRING_CONFIGS;

export const createSpring = (
  initial: number,
  config: SpringConfig = SPRING_CONFIGS.extreme,
  cushion?: { threshold: number; dampingMultiplier: number },
): Spring => {
  let current = initial;
  let target = initial;
  let velocity = 0;

  const fullConfig = {
    stiffness: config.stiffness,
    damping: config.damping,
    mass: config.mass ?? 1,
    precision: config.precision ?? 0.001,
  };

  const setTarget = (newTarget: number): void => {
    target = newTarget;
  };

  const getTarget = (): number => target;

  const tick = (deltaTime: number): number => {
    if (isAtRest()) {
      return current;
    }

    const { stiffness, mass } = fullConfig;
    let { damping } = fullConfig;

    if (cushion && current < cushion.threshold) {
      damping = damping * cushion.dampingMultiplier;
    }

    const springForce = -stiffness * (current - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * deltaTime;
    current += velocity * deltaTime;

    if (current < 0) {
      current = 0;
      velocity = 0;
    }

    return current;
  };

  const isAtRest = (): boolean => {
    const { precision } = fullConfig;
    return Math.abs(current - target) < precision && Math.abs(velocity) < precision;
  };

  const getCurrent = (): number => current;

  const getVelocity = (): number => velocity;

  const snapToTarget = (): void => {
    current = target;
    velocity = 0;
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
