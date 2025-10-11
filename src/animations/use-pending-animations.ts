import { useLayoutEffect } from "react";
import { useAnimationEngine } from "./animation-engine-context";
import type { AnimationTransition } from "./animation-types";

interface PendingBatch<T = any> {
  transitions: Map<string, T & { event: string }>;
  stagger?: number;
}

export function usePendingAnimations(
  pendingBatch: PendingBatch | null,
  onComplete: (entityIds: string[]) => void,
) {
  const engine = useAnimationEngine();

  useLayoutEffect(() => {
    if (!pendingBatch || pendingBatch.transitions.size === 0) return;

    const animTransitions = new Map<string, AnimationTransition>();
    const entityIds: string[] = [];

    pendingBatch.transitions.forEach((transition, entityId) => {
      animTransitions.set(entityId, { event: transition.event });
      entityIds.push(entityId);
    });

    const getIndex = pendingBatch.stagger
      ? (entityId: string) => entityIds.indexOf(entityId)
      : undefined;

    engine.playTransitions(animTransitions, getIndex).then(() => {
      onComplete(entityIds);
    });
  }, [pendingBatch, engine, onComplete]);
}
