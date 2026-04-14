import type { SpringAnimationDefinition } from "./animation-types";
import { createSpring, type Spring } from "./spring-animation";

export interface EntityContext {
  [key: string]: unknown;
}

/** Internal state for a single spring-driven animation bound to a DOM element. */
interface SpringData {
  spring: Spring;
  animation: Animation;
  duration: number;
  trackContext?: (context: Record<string, unknown>) => number;
  entityId: string;
  clampRange?:
    | { min?: number | null; max: number | null }
    | { min: number | null; max?: number | null };
}

export interface WebAnimationEngine {
  register: (
    entityId: string,
    elementId: string,
    element: HTMLElement,
    animations: Record<string, SpringAnimationDefinition>,
  ) => void;
  unregister: (entityId: string, elementId: string) => void;
  startSpringLoop: () => void;
  stopSpringLoop: () => void;
  cancelAll: () => void;
  updateEntityContext: (
    entityId: string,
    context: EntityContext,
    options?: { autoStartLoop?: boolean },
  ) => void;
  getEntityContext: (entityId: string) => EntityContext | undefined;
  getEngineInfo: () => {
    registry: Map<
      string,
      Map<string, { element: HTMLElement; animations: Record<string, SpringAnimationDefinition> }>
    >;
    entityContexts: Map<string, EntityContext>;
  };
}

/**
 * Spring-physics animation engine that uses paused Web Animations API
 * animations as GPU-composited interpolation targets.
 *
 * Instead of writing element.style.transform on every frame (which forces
 * layout + paint on the CPU), the engine creates a WAAPI animation on each
 * element and immediately pauses it. The spring physics run in a single RAF
 * loop and write each spring's progress into animation.currentTime, letting
 * the browser's compositor thread handle rendering on the GPU.
 *
 * Flow:
 *   context update -> spring retargets -> RAF ticks physics -> animation.currentTime = progress * duration -> GPU composites
 *
 * The RAF loop is self-managing: starts when any spring target changes,
 * stops when all springs settle. CPU usage is zero between activity bursts.
 */
export function createWebAnimationEngine(_engineId: string = "default"): WebAnimationEngine {
  /** Two-level map: entityId -> elementId -> { element, animations } */
  const registry = new Map<
    string,
    Map<string, { element: HTMLElement; animations: Record<string, SpringAnimationDefinition> }>
  >();

  /** Flat map of all active springs, keyed as "entityId-elementId-eventName" */
  const springs = new Map<string, SpringData>();

  /** Arbitrary key/value context per entity, consumed by spring trackContext functions */
  const entityContexts = new Map<string, EntityContext>();

  let rafId: number | null = null;
  let lastTime = 0;

  /**
   * Registers a DOM element and creates paused WAAPI animations as GPU
   * interpolation targets. Each animation is immediately paused -- the
   * spring physics simulation scrubs it via currentTime rather than
   * letting it play. This gives us GPU-composited transforms driven
   * by custom physics.
   */
  const register = (
    entityId: string,
    elementId: string,
    element: HTMLElement,
    animationDefs: Record<string, SpringAnimationDefinition>,
  ) => {
    if (!registry.has(entityId)) {
      registry.set(entityId, new Map());
    }
    registry.get(entityId)!.set(elementId, { element, animations: animationDefs });

    Object.entries(animationDefs).forEach(([eventName, animDef]) => {
      const animKey = `${entityId}-${elementId}-${eventName}`;

      const initialValue = animDef.initialValue ?? 0;
      const spring = createSpring(
        initialValue,
        animDef.springConfig,
        animDef.cushion,
      );

      // Create a paused animation as a GPU interpolation target.
      // We never play it -- the spring writes to currentTime directly.
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
        clampRange: animDef.clampRange,
      });
    });
  };

  /**
   * Removes an element, cancelling its paused animations and cleaning up
   * associated springs. If this was the entity's last element, the entity
   * context is also removed.
   */
  const unregister = (entityId: string, elementId: string) => {
    const entityRegistry = registry.get(entityId);
    if (!entityRegistry) return;

    const animKeyPrefix = `${entityId}-${elementId}`;
    const keysToDelete: string[] = [];

    springs.forEach((springData, key) => {
      if (key.startsWith(animKeyPrefix)) {
        try {
          springData.animation.cancel();
        } catch (e) {}
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      springs.delete(key);
    });

    entityRegistry.delete(elementId);
    if (entityRegistry.size === 0) {
      registry.delete(entityId);
      entityContexts.delete(entityId);
    }
  };

  /**
   * Merges new context values for an entity and propagates them to springs.
   *
   * Each spring can declare a `trackContext` function that derives a target
   * value from the entity's context (e.g. mapping an audio level to a
   * normalised 0–1 range). When the derived target differs from the spring's
   * current target, the spring is retargeted and the RAF loop is restarted
   * if it was idle.
   */
  const updateEntityContext = (
    entityId: string,
    context: EntityContext,
    options?: { autoStartLoop?: boolean },
  ) => {
    const existing = entityContexts.get(entityId) || {};
    const newContext = { ...existing, ...context };
    entityContexts.set(entityId, newContext);

    let anySpringTargetsChanged = false;

    springs.forEach((springData) => {
      if (springData.entityId === entityId && springData.trackContext) {
        const targetValue = springData.trackContext(newContext);
        const currentTarget = springData.spring.getTarget();

        if (Math.abs(targetValue - currentTarget) > 0.001) {
          springData.spring.setTarget(targetValue);
          anySpringTargetsChanged = true;
        }
      }
    });

    // Auto-start the loop if springs have new targets and the loop is idle
    if (anySpringTargetsChanged && !rafId && springs.size > 0) {
      startSpringLoop();
    }
  };

  const getEntityContext = (entityId: string) => {
    return entityContexts.get(entityId);
  };

  /**
   * Starts the RAF loop that ticks all active springs each frame.
   *
   * Per frame:
   *  1. Compute delta time (capped at 100ms to survive tab-switches)
   *  2. Tick each spring's physics simulation
   *  3. Write clamped progress into the paused animation's currentTime
   *  4. Stop the loop when every spring has settled (zero CPU at rest)
   */
  const startSpringLoop = () => {
    if (rafId) return;

    const tick = (currentTime: number) => {
      if (!lastTime) lastTime = currentTime;

      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      let anyActive = false;

      springs.forEach((springData) => {
        const { spring, animation, duration, clampRange } = springData;

        if (!spring.isAtRest()) {
          anyActive = true;

          const progress = spring.tick(deltaTime);
          const clamped = clampRange
            ? Math.max(clampRange.min || -Infinity, Math.min(clampRange.max || +Infinity, progress))
            : progress;

          animation.currentTime = clamped * duration;
        } else {
          // Snap to exact target for pixel-perfect settling
          const target = spring.getTarget();
          const clamped = clampRange
            ? Math.max(clampRange.min || -Infinity, Math.min(clampRange.max || +Infinity, target))
            : target;
          animation.currentTime = clamped * duration;
        }
      });

      if (anyActive && springs.size > 0) {
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

  /** Cancels all paused animations, clears springs, and stops the RAF loop. */
  const cancelAll = () => {
    springs.forEach((springData) => springData.animation.cancel());
    springs.clear();
    stopSpringLoop();
  };

  const getEngineInfo = () => ({
    registry: new Map(registry),
    entityContexts: new Map(entityContexts),
  });

  return {
    register,
    unregister,
    startSpringLoop,
    stopSpringLoop,
    cancelAll,
    updateEntityContext,
    getEntityContext,
    getEngineInfo,
  };
}
