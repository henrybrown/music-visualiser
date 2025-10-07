import type {
  AnimationDefinition,
  AnimationMetadata,
  AnimationTransition,
} from "./animation-types";

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
}

/**
 * Creates a generic Web Animation API engine for managing element animations
 *
 * The engine operates on entities (e.g., cards, players, UI elements) that can have
 * multiple animated elements (e.g., container, overlay, badge). Each element registers
 * with animation definitions keyed by event names (e.g., "deal", "select", "reveal").
 *
 * When transitions are played, the engine:
 * 1. Looks up all elements for each entity
 * 2. Finds the animation definition matching the event name
 * 3. Plays animations with optional stagger based on entity index
 * 4. Returns a Promise that resolves when all animations complete
 */
export function createWebAnimationEngine(): WebAnimationEngine {
  const registry = new Map<
    string,
    Map<string, { element: HTMLElement; animations: Record<string, AnimationDefinition> }>
  >();

  const runningAnimations = new Map<string, Animation>();

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
      }
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
        console.warn(`[WebAnimationEngine] No elements registered for entity: ${entityId}`);
        return;
      }

      const index = getIndex?.(entityId) ?? 0;

      entityElements.forEach(({ element, animations }, elementId) => {
        const animDef = animations[transition.event];
        if (!animDef) {
          console.warn(
            `[WebAnimationEngine] No animation for "${transition.event}" on ${elementId}`,
          );
          return;
        }

        const animKey = `${entityId}-${elementId}-${transition.event}`;
        const existing = runningAnimations.get(animKey);

        if (existing && existing.playState === "running") {
          return;
        }

        const staggerDelay = index * 50;
        const options = {
          ...animDef.options,
          delay: (animDef.options.delay ?? 0) + staggerDelay,
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

  return { register, unregister, playTransitions, cancelAll };
}
