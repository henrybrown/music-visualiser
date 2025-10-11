import type { AnimationDefinition, AnimationTransition } from "./animation-types";

export interface EntityContext {
  [key: string]: unknown;
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
}

export function createWebAnimationEngine(engineId: string = "default"): WebAnimationEngine {
  const registry = new Map<
    string,
    Map<string, { element: HTMLElement; animations: Record<string, AnimationDefinition> }>
  >();
  const runningAnimations = new Map<string, Animation>();
  const entityContexts = new Map<string, EntityContext>();

  const register = (
    entityId: string,
    elementId: string,
    element: HTMLElement,
    animations: Record<string, AnimationDefinition>,
  ) => {
    if (!registry.has(entityId)) {
      registry.set(entityId, new Map());
    }
    registry.get(entityId)!.set(elementId, { element, animations });
  };

  const unregister = (entityId: string, elementId: string) => {
    const entityRegistry = registry.get(entityId);
    if (entityRegistry) {
      entityRegistry.delete(elementId);
      if (entityRegistry.size === 0) {
        registry.delete(entityId);
        entityContexts.delete(entityId);
      }
    }
  };

  const updateEntityContext = (entityId: string, context: EntityContext) => {
    const existing = entityContexts.get(entityId) || {};
    entityContexts.set(entityId, { ...existing, ...context });
  };

  const getEntityContext = (entityId: string) => {
    return entityContexts.get(entityId);
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

      entityElements.forEach(({ element, animations }, elementId) => {
        const animDefOrFn = animations[transition.event];
        if (!animDefOrFn) {
          return;
        }

        // Resolve function or use static definition
        const context = entityContexts.get(entityId) || {};
        const animDef = typeof animDefOrFn === "function" ? animDefOrFn(context) : animDefOrFn;

        const animKey = `${entityId}-${elementId}-${transition.event}`;
        const existing = runningAnimations.get(animKey);

        // Prevent jerky interruptions: commit current position before starting new animation
        if (existing && existing.playState === "running") {
          try {
            return;
            //existing.commitStyles(); // Freeze where we are to avoid jump
            // existing.cancel(); // Stop old animation
          } catch (e) {}
        }

        const staggerDelay = index * 50;

        const options: KeyframeAnimationOptions = {
          ...animDef.options,
          delay: (animDef.options?.delay ?? 0) + staggerDelay,
        };

        const animation = element.animate(animDef.keyframes, options);

        runningAnimations.set(animKey, animation);

        const animationPromise: Promise<void> = animation.finished.then(
          () => {
            runningAnimations.delete(animKey);
            animation.commitStyles();
          },
          () => {
            runningAnimations.delete(animKey);
          },
        );

        promises.push(animationPromise);
      });
    });

    await Promise.all(promises);
  };

  const cancelAll = () => {
    runningAnimations.forEach((anim) => anim.cancel());
    runningAnimations.clear();
  };

  const getEngineInfo = () => ({
    registry: new Map(registry),
    runningAnimations: new Map(runningAnimations),
    entityContexts: new Map(entityContexts),
  });

  return {
    register,
    unregister,
    playTransitions,
    cancelAll,
    updateEntityContext,
    getEntityContext,
    getEngineInfo,
  };
}
