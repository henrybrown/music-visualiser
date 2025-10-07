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
  getDebugInfo: () => {
    registrySize: number;
    entities: string[];
    runningAnimations: number;
    contexts: Map<string, EntityContext>;
  };
}

export function createWebAnimationEngine(engineId: string = "default"): WebAnimationEngine {
  const registry = new Map<
    string,
    Map<string, { element: HTMLElement; animations: Record<string, AnimationDefinition> }>
  >();

  const runningAnimations = new Map<string, Animation>();
  const entityContexts = new Map<string, EntityContext>();

  // For devtools compatibility
  const elementRegistry = new Map<
    HTMLElement,
    {
      animations: Record<string, AnimationDefinition>;
      metadata: {
        elementId: string;
        entityId: string;
        tagName: string;
        className: string;
      };
    }
  >();

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

    // Register for devtools
    elementRegistry.set(element, {
      animations,
      metadata: {
        elementId,
        entityId,
        tagName: element.tagName,
        className: element.className,
      },
    });
  };

  const unregister = (entityId: string, elementId: string) => {
    const entityRegistry = registry.get(entityId);
    if (entityRegistry) {
      const data = entityRegistry.get(elementId);
      if (data) {
        elementRegistry.delete(data.element);
      }
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
        console.warn(`[AnimationEngine] No elements registered for entity: ${entityId}`);
        return;
      }

      const index = getIndex?.(entityId) ?? 0;

      entityElements.forEach(({ element, animations }, elementId) => {
        const animDef = animations[transition.event];
        if (!animDef) {
          return;
        }

        const animKey = `${entityId}-${elementId}-${transition.event}`;
        const existing = runningAnimations.get(animKey);

        if (existing && existing.playState === "running") {
          return;
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

  const getDebugInfo = () => ({
    registrySize: registry.size,
    entities: Array.from(registry.keys()),
    runningAnimations: runningAnimations.size,
    contexts: new Map(entityContexts),
  });

  const engine: WebAnimationEngine = {
    register,
    unregister,
    playTransitions,
    cancelAll,
    updateEntityContext,
    getEntityContext,
    getDebugInfo,
  };

  // Expose internal data for devtools (read-only)
  (engine as any)._devtoolsData = {
    elementRegistry,
    entityContexts,
    runningAnimations,
  };

  return engine;
}
