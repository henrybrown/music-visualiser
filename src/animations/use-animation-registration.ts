import { useCallback, useRef, useEffect, useLayoutEffect, useState } from "react";
import type { AnimationDefinition } from "./animation-types";
import { useAnimationEngine, type EntityContext } from "./animation-engine-context";

export interface AnimationRegistrationOptions {
  entryTransition?: string; // Event to play on mount
  onComplete?: (event: string) => void; // Callback with event name
}

export function useAnimationRegistration(
  entityId: string,
  entityContext?: EntityContext,
  options?: AnimationRegistrationOptions,
) {
  const engine = useAnimationEngine();
  const refCallbacks = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);

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

  // Entry animation on mount (after refs register)
  useLayoutEffect(() => {
    if (!options?.entryTransition) return;

    const transitionsMap = new Map();
    transitionsMap.set(entityId, {
      entityId,
      event: options.entryTransition,
    });

    console.log("[Entity context]", entityContext);

    if (entityContext) {
      engine.updateEntityContext(entityId, entityContext);
    }

    engine.playTransitions(transitionsMap).then(() => {
      options.onComplete?.(options.entryTransition!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only on mount

  // Imperative trigger function
  const triggerTransition = useCallback(
    async (event: string) => {
      setIsAnimating(true);
      setCurrentAnimation(event);

      const transitionsMap = new Map();
      transitionsMap.set(entityId, {
        entityId,
        event,
      });

      await engine.playTransitions(transitionsMap);

      setIsAnimating(false);
      setCurrentAnimation(null);
      options?.onComplete?.(event);
    },
    [entityId, engine, options],
  );

  useEffect(() => {
    return () => {
      refCallbacks.current.clear();
    };
  }, []);

  return {
    createAnimationRef,
    triggerTransition,
    isAnimating,
    currentAnimation,
  };
}
