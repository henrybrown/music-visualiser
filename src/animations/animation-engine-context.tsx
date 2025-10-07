import { createContext, useContext, useRef, ReactNode } from 'react';
import { createWebAnimationEngine } from './web-animation-engine';
import type { WebAnimationEngine } from './web-animation-engine';

const AnimationEngineContext = createContext<WebAnimationEngine | null>(null);

interface AnimationEngineProviderProps {
  children: ReactNode;
}

/**
 * Provides a Web Animation API engine instance to child components
 *
 * The engine is created once per provider instance and shared across
 * all descendants. Multiple providers can exist in the tree for different
 * animation scopes (e.g., game board vs UI elements).
 */
export function AnimationEngineProvider({ children }: AnimationEngineProviderProps) {
  const engineRef = useRef(createWebAnimationEngine());

  return (
    <AnimationEngineContext.Provider value={engineRef.current}>
      {children}
    </AnimationEngineContext.Provider>
  );
}

/**
 * Hook to access the nearest animation engine from context
 */
export function useAnimationEngine(): WebAnimationEngine {
  const engine = useContext(AnimationEngineContext);

  if (!engine) {
    throw new Error('useAnimationEngine must be used within AnimationEngineProvider');
  }

  return engine;
}
