import { createContext, useContext, useRef, ReactNode } from 'react';
import { createWebAnimationEngine } from './web-animation-engine';
import type { WebAnimationEngine, EntityContext } from './web-animation-engine';
import { DevToolsPanel } from './animation-devtools';

const AnimationEngineContext = createContext<WebAnimationEngine | null>(null);

// Re-export for convenience
export type { EntityContext };

interface AnimationEngineProviderProps {
  children: ReactNode;
}

/**
 * Provides animation engine instance to child components
 *
 * Includes devtools panel in development mode.
 */
export function AnimationEngineProvider({ children }: AnimationEngineProviderProps) {
  const engineRef = useRef(createWebAnimationEngine('board-engine'));

  return (
    <AnimationEngineContext.Provider value={engineRef.current}>
      {children}
      {process.env.NODE_ENV === 'development' && <DevToolsPanel />}
    </AnimationEngineContext.Provider>
  );
}

export function useAnimationEngine(): WebAnimationEngine {
  const engine = useContext(AnimationEngineContext);

  if (!engine) {
    throw new Error('useAnimationEngine must be used within AnimationEngineProvider');
  }

  return engine;
}
