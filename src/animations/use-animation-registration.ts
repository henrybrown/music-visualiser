import { useCallback, useRef, useEffect } from "react";
import type { SpringAnimationDefinition } from "./animation-types";
import { useAnimationEngine, type EntityContext } from "./animation-engine-context";

/**
 * Registers DOM elements with the spring animation engine and manages their lifecycle.
 *
 * Each entity (e.g. a visualizer bar) can own multiple animated elements (e.g. the bar
 * itself and its cap). This hook provides a ref callback factory that automatically
 * registers elements on mount and unregisters them on unmount.
 *
 * @param entityId   - Unique identifier for the animated entity (e.g. "bar-0")
 * @param entityContext - Optional initial context values forwarded to the engine
 * @returns An object containing `createAnimationRef` for binding elements
 */
export function useAnimationRegistration(
  entityId: string,
  entityContext?: EntityContext,
) {
  const engine = useAnimationEngine();
  const refCallbacks = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());

  // Sync external context into the engine whenever it changes
  useEffect(() => {
    if (entityContext) {
      engine.updateEntityContext(entityId, entityContext);
    }
  }, [engine, entityId, entityContext]);

  /**
   * Creates a stable ref callback for an animated element. The returned callback
   * registers the element with the engine when React attaches it to the DOM and
   * unregisters it on removal. Callbacks are cached per `elementId` so the same
   * ref identity is reused across re-renders, preventing unnecessary unregister/
   * register cycles.
   *
   * @param elementId  - Identifier for this element within the entity (e.g. "bar", "cap")
   * @param animations - Map of event names to spring animation definitions
   * @returns A ref callback suitable for a JSX `ref` prop
   */
  const createAnimationRef = useCallback(
    (elementId: string, animations: Record<string, SpringAnimationDefinition>) => {
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

  // Clear cached callbacks on unmount to avoid stale closures
  useEffect(() => {
    return () => {
      refCallbacks.current.clear();
    };
  }, []);

  return { createAnimationRef };
}
