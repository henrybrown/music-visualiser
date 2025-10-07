import { useCallback, useRef, useEffect } from 'react';
import type { AnimationDefinition } from './animation-types';
import { useAnimationEngine } from './animation-engine-context';

/**
 * Generic hook for registering animations with the animation engine from context
 *
 * Provides stable ref callbacks for attaching animated elements to the engine.
 * Each entity can have multiple animated elements that are registered with
 * their own animation definitions.
 *
 * @param entityId - Unique identifier for the entity (e.g., card word, player ID)
 */
export function useAnimationRegistration(entityId: string) {
  const engine = useAnimationEngine();
  const refCallbacks = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());

  const createAnimationRef = useCallback(
    (elementId: string, animations: Record<string, AnimationDefinition>) => {
      let callback = refCallbacks.current.get(elementId);

      if (!callback) {
        callback = (element: HTMLElement | null) => {
          if (element) {
            engine.register(entityId, elementId, element, animations);
          } else {
            engine.unregister(entityId, elementId);
          }
        };
        refCallbacks.current.set(elementId, callback);
      }

      return callback;
    },
    [entityId, engine]
  );

  useEffect(() => {
    return () => {
      refCallbacks.current.clear();
    };
  }, []);

  return {
    createAnimationRef,
  };
}
