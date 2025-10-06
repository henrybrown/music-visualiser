/**
 * WebAnimationEngine - Core WAAPI animation system
 *
 * Manages animation registration, execution, and cleanup for game entities.
 * Replaces CSS-based animations with JavaScript-controlled WAAPI.
 */

import type { AnimationDefinition, AnimationMetadata } from './animation-types';

interface ElementRegistration {
  element: HTMLElement;
  animations: Record<string, AnimationDefinition>;
  metadata: AnimationMetadata;
}

interface RunningAnimation {
  animation: Animation;
  entityId: string;
  elementId: string;
}

export interface WebAnimationEngine {
  register: (
    element: HTMLElement,
    elementId: string,
    entityId: string,
    animations: Record<string, AnimationDefinition>
  ) => void;
  unregister: (element: HTMLElement) => void;
  play: (
    entityId: string,
    animationName: string,
    options?: { stagger?: number }
  ) => Promise<void>;
  cancel: (entityId: string) => void;
  cancelAll: () => void;
}

/**
 * Creates a new WebAnimationEngine instance
 */
export function createWebAnimationEngine(): WebAnimationEngine {
  const registry = new Map<HTMLElement, ElementRegistration>();
  const runningAnimations = new Map<string, RunningAnimation[]>();

  /**
   * Register an element with its animation definitions
   */
  function register(
    element: HTMLElement,
    elementId: string,
    entityId: string,
    animations: Record<string, AnimationDefinition>
  ): void {
    registry.set(element, {
      element,
      animations,
      metadata: { elementId, entityId },
    });
  }

  /**
   * Unregister an element and cancel any running animations
   */
  function unregister(element: HTMLElement): void {
    const registration = registry.get(element);
    if (registration) {
      // Cancel any running animations for this element
      const entityAnimations = runningAnimations.get(registration.metadata.entityId);
      if (entityAnimations) {
        const filtered = entityAnimations.filter((ra) => {
          if (ra.elementId === registration.metadata.elementId) {
            ra.animation.cancel();
            return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          runningAnimations.delete(registration.metadata.entityId);
        } else {
          runningAnimations.set(registration.metadata.entityId, filtered);
        }
      }

      registry.delete(element);
    }
  }

  /**
   * Play an animation on all registered elements for an entity
   *
   * @param entityId - The entity (card word) to animate
   * @param animationName - The name of the animation to play
   * @param options - Optional configuration (stagger delay)
   * @returns Promise that resolves when all animations complete
   */
  function play(
    entityId: string,
    animationName: string,
    options?: { stagger?: number }
  ): Promise<void> {
    // Cancel any existing animations for this entity
    cancel(entityId);

    const promises: Promise<void>[] = [];
    const newRunningAnimations: RunningAnimation[] = [];

    // Find all elements that belong to this entity
    for (const [element, registration] of registry.entries()) {
      if (registration.metadata.entityId === entityId) {
        const animationDef = registration.animations[animationName];

        if (animationDef) {
          // Create the WAAPI animation
          const animationOptions = { ...animationDef.options };

          // Apply stagger if provided
          if (options?.stagger !== undefined) {
            animationOptions.delay = (animationOptions.delay || 0) + options.stagger;
          }

          const animation = element.animate(animationDef.keyframes, animationOptions);

          // Track running animation
          newRunningAnimations.push({
            animation,
            entityId,
            elementId: registration.metadata.elementId,
          });

          // Create promise for completion
          const promise = new Promise<void>((resolve) => {
            animation.onfinish = () => resolve();
            animation.oncancel = () => resolve();
          });

          promises.push(promise);
        }
      }
    }

    // Store running animations
    if (newRunningAnimations.length > 0) {
      runningAnimations.set(entityId, newRunningAnimations);
    }

    // Return promise that resolves when all animations complete
    return Promise.all(promises).then(() => {
      // Clean up finished animations
      runningAnimations.delete(entityId);
    });
  }

  /**
   * Cancel all running animations for an entity
   */
  function cancel(entityId: string): void {
    const animations = runningAnimations.get(entityId);
    if (animations) {
      animations.forEach((ra) => ra.animation.cancel());
      runningAnimations.delete(entityId);
    }
  }

  /**
   * Cancel all running animations
   */
  function cancelAll(): void {
    for (const animations of runningAnimations.values()) {
      animations.forEach((ra) => ra.animation.cancel());
    }
    runningAnimations.clear();
  }

  return {
    register,
    unregister,
    play,
    cancel,
    cancelAll,
  };
}
