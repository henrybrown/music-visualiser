import type { AnimationDefinition, AnimationTransition } from "./animation-types";
import { isSpringAnimation } from "./animation-types";
import { createSpring, type Spring, SPRING_PRESETS } from "./spring-animation";

export interface EntityContext {
  [key: string]: unknown;
}

interface SpringData {
  spring: Spring;
  element: HTMLElement;
  property: 'scaleY' | 'translateY';
  baseHeight: number;
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

  const BASE_HEIGHT = 30;

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

      // DETECTION: Check if spring or WAAPI
      if (isSpringAnimation(animDef)) {
        const spring = createSpring(1, animDef.springConfig || SPRING_PRESETS.visualizer);

        springs.set(animKey, {
          spring,
          element,
          property: animDef.springProperty,
          baseHeight: BASE_HEIGHT
        });
      } else {
        // Existing WAAPI code
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

    springs.forEach((_, key) => {
      if (key.startsWith(animKeyPrefix)) {
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
    if (rafId) return;

    const tick = (currentTime: number) => {
      if (!lastTime) lastTime = currentTime;
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      springs.forEach(({ spring, element, property, baseHeight }) => {
        const value = spring.tick(deltaTime);

        switch (property) {
          case 'scaleY':
            element.style.transform = `scaleY(${value})`;
            break;
          case 'translateY':
            const translateY = (value - 1) * baseHeight;
            element.style.transform = `translateY(${translateY}px)`;
            break;
        }
      });

      if (springs.size > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        lastTime = 0;
      }
    };

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

      entityElements.forEach(({ element, animations: animationDefs }, elementId) => {
        const animDefOrFn = animationDefs[transition.event];
        if (!animDefOrFn) {
          return;
        }

        const context = entityContexts.get(entityId) || {};
        const animDef = typeof animDefOrFn === "function" ? animDefOrFn(context) : animDefOrFn;

        const animKey = `${entityId}-${elementId}-${transition.event}`;

        // Handle spring animations (NEW)
        if (isSpringAnimation(animDef)) {
          const springData = springs.get(animKey);
          if (springData) {
            const targetKeyframe = animDef.keyframes[0];
            const scaleYMatch = (targetKeyframe.transform as string)?.match(/scaleY\(([\d.]+)\)/);
            if (scaleYMatch) {
              springData.spring.setTarget(parseFloat(scaleYMatch[1]));
            }
          }
        } else {
          // Existing WAAPI code (unchanged)
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
