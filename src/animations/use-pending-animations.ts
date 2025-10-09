import { useLayoutEffect } from "react";
import { useAnimationEngine } from "./animation-engine-context";
import type { AnimationTransition } from "./animation-types";

export function usePendingAnimations<T extends { animationType: string }>(
  pendingTransitions: Map<string, T>,
  onComplete: (entityIds: string[]) => void,
  getIndex?: (entityId: string) => number,
) {
  const engine = useAnimationEngine();

  useLayoutEffect(() => {
    if (pendingTransitions.size === 0) return;

    console.log("[PendingAnimations] Processing transitions:", pendingTransitions.size);

    const animTransitions = new Map<string, AnimationTransition>();
    const entityIds: string[] = [];

    pendingTransitions.forEach((transition, entityId) => {
      animTransitions.set(entityId, { event: transition.animationType });
      entityIds.push(entityId);
    });

    engine.playTransitions(animTransitions, getIndex).then(() => {
      console.log("[PendingAnimations] Animations complete, invoking callback");
      onComplete(entityIds);
    });
  }, [pendingTransitions, engine, onComplete, getIndex]);
}
