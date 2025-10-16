export { createWebAnimationEngine } from './web-animation-engine';
export type { WebAnimationEngine, EntityContext } from './web-animation-engine';
export type {
  AnimationDefinition,
  AnimationMetadata,
  AnimationTransition,
  WaapiAnimationDefinition,
  SpringAnimationDefinition,
} from './animation-types';
export {
  isSpringAnimation,
  isWaapiAnimation,
} from './animation-types';
export { createSpring, SPRING_PRESETS, SPRING_CONFIGS, VISUALIZER_MODES } from './spring-animation';
export type { Spring, SpringConfig, SpringConfigKey, VisualizerMode } from './spring-animation';
export { useAnimationRegistration } from './use-animation-registration';
export { AnimationEngineProvider, useAnimationEngine } from './animation-engine-context';
export { usePendingAnimations } from './use-pending-animations';
