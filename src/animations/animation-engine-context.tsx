import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { createWebAnimationEngine, WebAnimationEngine } from './web-animation-engine';

export type { EntityContext } from './web-animation-engine';

const AnimationEngineContext = createContext<WebAnimationEngine | null>(null);

interface AnimationEngineProviderProps {
  children: ReactNode;
  engineId?: string;
}

export const AnimationEngineProvider: React.FC<AnimationEngineProviderProps> = ({
  children,
  engineId = 'default'
}) => {
  const engine = useMemo(() => createWebAnimationEngine(engineId), [engineId]);

  return (
    <AnimationEngineContext.Provider value={engine}>
      {children}
    </AnimationEngineContext.Provider>
  );
};

export const useAnimationEngine = (): WebAnimationEngine => {
  const engine = useContext(AnimationEngineContext);

  if (!engine) {
    throw new Error('useAnimationEngine must be used within AnimationEngineProvider');
  }

  return engine;
};
