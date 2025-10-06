import { useCallback, useRef, useEffect } from 'react';
import type { AnimationDefinition } from './animation-types';
import type { WebAnimationEngine } from './web-animation-engine';

/**
 * Generic hook for registering animations with a WebAnimationEngine
 *
 * Provides stable ref callbacks for attaching animated elements to an engine.
 * Each entity can have multiple animated elements that are registered with
 * their own animation definitions.
 *
 * @param entityId - Unique identifier for the entity (e.g., card word, player ID)
 * @param engine - The animation engine instance to register with
 */
export function useAnimationRegistration(entityId: string, engine: WebAnimationEngine) {
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
