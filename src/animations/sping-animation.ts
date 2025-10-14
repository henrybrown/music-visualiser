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
}

export const SPRING_PRESETS = {
  gentle: { stiffness: 120, damping: 14 },
  wobbly: { stiffness: 180, damping: 12 },
  stiff: { stiffness: 210, damping: 20 },
  slow: { stiffness: 280, damping: 60 },
  visualizer: { stiffness: 170, damping: 18 },
} as const;

export const createSpring = (
  initial: number,
  config: SpringConfig = SPRING_PRESETS.visualizer,
): Spring => {
  let current = initial;
  let target = initial;
  let velocity = 0;

  const fullConfig = {
    stiffness: config.stiffness,
    damping: config.damping,
    mass: config.mass ?? 1,
    precision: config.precision ?? 0.01,
  };

  const setTarget = (newTarget: number): void => {
    target = newTarget;
  };

  const tick = (deltaTime: number): number => {
    if (isAtRest()) {
      return current;
    }

    const { stiffness, damping, mass } = fullConfig;

    const springForce = -stiffness * (current - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * deltaTime;
    current += velocity * deltaTime;

    return current;
  };

  const isAtRest = (): boolean => {
    const { precision } = fullConfig;
    const displacement = Math.abs(current - target);
    const velocityLow = Math.abs(velocity) < precision;

    return displacement < precision && velocityLow;
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
  };
};
