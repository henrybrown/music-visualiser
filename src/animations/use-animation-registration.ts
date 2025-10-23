import { useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type { AnimationDefinition } from './animation-types';
import { useAnimationEngine, type EntityContext } from './animation-engine-context';

export interface AnimationRegistrationOptions {
  autoAnimate?: boolean;
  pendingTransition?: { event: string; toState: unknown } | null;
  onComplete?: (entityId: string) => void;
}

export function useAnimationRegistration(
  entityId: string,
  entityContext?: EntityContext,
  options?: AnimationRegistrationOptions,
) {
  const engine = useAnimationEngine();
  const refCallbacks = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());

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

  // Auto-animate when pendingTransition changes
  useLayoutEffect(() => {
    const autoAnimate = options?.autoAnimate ?? true;
    const pendingTransition = options?.pendingTransition;
    const onComplete = options?.onComplete;

    if (!autoAnimate || !pendingTransition) {
      return;
    }

    // Play the transition for this single entity
    const transitionsMap = new Map();
    transitionsMap.set(entityId, {
      entityId,
      event: pendingTransition.event,
    });

    engine
      .playTransitions(transitionsMap)
      .then(() => {
        // Call completion callback with entityId
        onComplete?.(entityId);
      });
  }, [engine, entityId, options?.autoAnimate, options?.pendingTransition, options?.onComplete]);

  useEffect(() => {
    return () => {
      refCallbacks.current.clear();
    };
  }, []);

  return {
    createAnimationRef,
  };
}
