import type { AnimationDefinition, AnimationTransition } from "./animation-types";
import { isSpringAnimation } from "./animation-types";
import { createSpring, type Spring, SPRING_PRESETS } from "./spring-animation";

export interface EntityContext {
  [key: string]: unknown;
}

interface SpringData {
  spring: Spring;
  animation: Animation;
  duration: number;
  trackContext?: (context: Record<string, unknown>) => number;
  entityId: string;
}

export interface WebAnimationEngine {
  register: (
    entityId: string,
    elementId: string,
    element: HTMLElement,
    animations: Record<string, AnimationDefinition>,
  ) => void;
  unregister: (entityId: string, elementId: string) => void;
  playTransitions: (
    transitions: Map<string, AnimationTransition>,
    getIndex?: (entityId: string) => number,
  ) => Promise<void>;
  updateSpringTargets: (targets: Map<string, number>) => void;
  startSpringLoop: () => void;
  stopSpringLoop: () => void;
  cancelAll: () => void;
  updateEntityContext: (entityId: string, context: EntityContext) => void;
  getEntityContext: (entityId: string) => EntityContext | undefined;
  getEngineInfo: () => {
    registry: Map<
      string,
      Map<string, { element: HTMLElement; animations: Record<string, AnimationDefinition> }>
    >;
    runningAnimations: Map<string, Animation>;
    entityContexts: Map<string, EntityContext>;
  };
  getStats: () => {
    registeredEntities: number;
    registeredElements: number;
    runningAnimations: number;
    runningSprings: number;
    contextSize: number;
  };
}

export function createWebAnimationEngine(engineId: string = "default"): WebAnimationEngine {
  const registry = new Map<
    string,
    Map<string, { element: HTMLElement; animations: Record<string, AnimationDefinition> }>
  >();
  const animations = new Map<string, Animation>();
  const springs = new Map<string, SpringData>();
  const entityContexts = new Map<string, EntityContext>();

  let rafId: number | null = null;
  let lastTime = 0;

  const register = (
    entityId: string,
    elementId: string,
    element: HTMLElement,
    animationDefs: Record<string, AnimationDefinition>,
  ) => {
    if (!registry.has(entityId)) {
      registry.set(entityId, new Map());
    }
    registry.get(entityId)!.set(elementId, { element, animations: animationDefs });

    Object.entries(animationDefs).forEach(([eventName, animDefOrFn]) => {
      const animKey = `${entityId}-${elementId}-${eventName}`;
      const context = entityContexts.get(entityId) || {};
      const animDef = typeof animDefOrFn === "function" ? animDefOrFn(context) : animDefOrFn;

      if (isSpringAnimation(animDef)) {
        const spring = createSpring(0, animDef.springConfig || SPRING_PRESETS.visualizer);

        const animation = element.animate(animDef.keyframes, {
          ...animDef.options,
          duration: animDef.options?.duration ?? 1000,
          fill: "forwards",
        });

        animation.pause();

        springs.set(animKey, {
          spring,
          animation,
          duration: animation.effect!.getTiming().duration as number,
          trackContext: animDef.trackContext,
          entityId,
        });
      } else {
        const animation = element.animate(animDef.keyframes, {
          ...animDef.options,
          fill: "forwards",
        });
        animation.finish();
        animations.set(animKey, animation);
      }
    });
  };

  const unregister = (entityId: string, elementId: string) => {
    const entityRegistry = registry.get(entityId);
    if (!entityRegistry) return;

    const animKeyPrefix = `${entityId}-${elementId}`;
    const keysToDelete: string[] = [];

    animations.forEach((animation, key) => {
      if (key.startsWith(animKeyPrefix)) {
        try {
          animation.cancel();
        } catch (e) {}
        keysToDelete.push(key);
      }
    });

    springs.forEach((springData, key) => {
      if (key.startsWith(animKeyPrefix)) {
        try {
          springData.animation.cancel();
        } catch (e) {}
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      animations.delete(key);
      springs.delete(key);
    });

    entityRegistry.delete(elementId);
    if (entityRegistry.size === 0) {
      registry.delete(entityId);
      entityContexts.delete(entityId);
    }
  };

  const updateEntityContext = (entityId: string, context: EntityContext) => {
    const existing = entityContexts.get(entityId) || {};
    entityContexts.set(entityId, { ...existing, ...context });

    // Auto-restart RAF loop if it stopped and we have springs
    // This ensures context changes immediately trigger animation updates
    if (!rafId && springs.size > 0) {
      startSpringLoop();
    }
  };

  const getEntityContext = (entityId: string) => {
    return entityContexts.get(entityId);
  };

  const updateSpringTargets = (targets: Map<string, number>) => {
    targets.forEach((target, key) => {
      const springData = springs.get(key);
      if (springData) {
        springData.spring.setTarget(target);
      }
    });
  };

  const startSpringLoop = () => {
    // Guard: Prevent multiple RAF loops from running simultaneously
    if (rafId) return;

    const tick = (currentTime: number) => {
      // Initialize lastTime on first frame
      if (!lastTime) lastTime = currentTime;

      // Calculate time elapsed since last frame (capped at 100ms to prevent physics explosions)
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Track whether ANY spring is still moving
      // If all springs are at rest, we can stop the RAF loop to save CPU
      let anyActive = false;

      springs.forEach(({ spring, animation, duration, trackContext, entityId }) => {
        // PHASE 1: Sync spring target with entity context (if tracking enabled)
        // This reads reactive state and updates the spring's destination
        if (trackContext) {
          const context = entityContexts.get(entityId) || {};
          const targetValue = trackContext(context);
          spring.setTarget(targetValue);
        }

        // PHASE 2: Only tick springs that are moving
        // Springs at rest don't need physics calculations or DOM updates
        if (!spring.isAtRest()) {
          anyActive = true;

          // Run physics simulation: calculates forces, velocity, and new position
          const progress = spring.tick(deltaTime);
          if (entityId === "bar-4") {
            console.log(
              "Spring progress:",
              progress.toFixed(3),
              "Target:",
              spring.getTarget?.() ?? "unknown",
            );
          }

          // Allow overshoot up to 150%, but prevent negative values
          const clamped = Math.max(0, progress);
          animation.currentTime = clamped * duration;
        }
        // Springs at rest are skipped - no work needed
      });

      // PHASE 3: Decide whether to continue RAF loop
      // Continue only if springs exist AND at least one is moving
      // Otherwise stop the loop to conserve CPU until next context update
      if (anyActive && springs.size > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        // All springs settled - stop RAF loop
        rafId = null;
        lastTime = 0;
      }
    };

    // Kickstart the RAF loop - schedules the first frame
    rafId = requestAnimationFrame(tick);
  };

  const stopSpringLoop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastTime = 0;
    }
  };

  const playTransitions = async (
    transitions: Map<string, AnimationTransition>,
    getIndex?: (entityId: string) => number,
  ): Promise<void> => {
    const promises: Promise<void>[] = [];

    transitions.forEach((transition, entityId) => {
      const entityElements = registry.get(entityId);

      if (!entityElements) {
        console.warn(
          `[AnimationEngine:${engineId}] No elements registered for entity: ${entityId}`,
        );
        return;
      }

      const index = getIndex?.(entityId) ?? 0;

      entityElements.forEach(({ animations: animationDefs }, elementId) => {
        const animDefOrFn = animationDefs[transition.event];
        if (!animDefOrFn) {
          return;
        }

        const context = entityContexts.get(entityId) || {};
        const animDef = typeof animDefOrFn === "function" ? animDefOrFn(context) : animDefOrFn;

        const animKey = `${entityId}-${elementId}-${transition.event}`;

        if (isSpringAnimation(animDef)) {
          // Springs don't use playTransitions - they use updateSpringTargets
          // This is here for compatibility but does nothing
        } else {
          const animation = animations.get(animKey);
          if (!animation) return;

          const staggerDelay = index * 50;

          const options: KeyframeAnimationOptions = {
            ...animDef.options,
            delay: (animDef.options?.delay ?? 0) + staggerDelay,
          };

          const effect = animation.effect as KeyframeEffect;

          animation.commitStyles();
          effect.setKeyframes(animDef.keyframes);
          effect.updateTiming(options as OptionalEffectTiming);
          animation.cancel();
          animation.play();

          const animationPromise: Promise<void> = animation.finished.then(
            () => {},
            () => {},
          );

          promises.push(animationPromise);
        }
      });
    });

    await Promise.all(promises);
  };

  const cancelAll = () => {
    animations.forEach((anim) => anim.cancel());
    animations.clear();

    springs.forEach((springData) => springData.animation.cancel());
    springs.clear();

    stopSpringLoop();
  };

  const getEngineInfo = () => ({
    registry: new Map(registry),
    runningAnimations: new Map(animations),
    entityContexts: new Map(entityContexts),
  });

  const getStats = () => ({
    registeredEntities: registry.size,
    registeredElements: Array.from(registry.values()).reduce((sum, map) => sum + map.size, 0),
    runningAnimations: animations.size,
    runningSprings: springs.size,
    contextSize: entityContexts.size,
  });

  return {
    register,
    unregister,
    playTransitions,
    updateSpringTargets,
    startSpringLoop,
    stopSpringLoop,
    cancelAll,
    updateEntityContext,
    getEntityContext,
    getEngineInfo,
    getStats,
  };
}
