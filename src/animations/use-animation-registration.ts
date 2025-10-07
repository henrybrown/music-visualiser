import { useCallback, useRef, useEffect } from "react";
import type { AnimationDefinition } from "./animation-types";
import { useAnimationEngine, type EntityContext } from "./animation-engine-context";

/**
 * Generic hook for registering animations with the animation engine
 *
 * Provides stable ref callbacks for attaching animated elements to the engine.
 * Optionally accepts entity context that will be synced to the engine via useEffect.
 *
 * @param entityId - Unique identifier for the entity (e.g., card word, player ID)
 * @param entityContext - Optional context data for the entity (synced to engine)
 */
export function useAnimationRegistration(entityId: string, entityContext?: EntityContext) {
  const engine = useAnimationEngine();
  const refCallbacks = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());

  // Sync context to engine
  useEffect(() => {
    if (entityContext) {
      engine.updateEntityContext(entityId, entityContext);
    }
  }, [engine, entityId, entityContext]);

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
    [entityId, engine],
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
