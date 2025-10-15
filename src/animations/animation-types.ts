import type { SpringConfig } from './spring-animation';

export interface WaapiAnimationDefinition {
  keyframes: Keyframe[];
  options?: KeyframeAnimationOptions;
}

export interface SpringAnimationDefinition {
  keyframes: Keyframe[];
  springConfig?: SpringConfig;
  options?: KeyframeAnimationOptions;
  trackContext?: (context: Record<string, unknown>) => number;
}

export type AnimationDefinitionStatic = WaapiAnimationDefinition | SpringAnimationDefinition;

export type AnimationDefinition =
  | AnimationDefinitionStatic
  | ((context: Record<string, unknown>) => AnimationDefinitionStatic);

export interface AnimationMetadata {
  elementId: string;
  entityId: string;
  [key: string]: string | undefined;
}

export interface AnimationTransition {
  event: string;
}

export const isSpringAnimation = (
  def: AnimationDefinitionStatic
): def is SpringAnimationDefinition => {
  return 'springConfig' in def;
};

export const isWaapiAnimation = (
  def: AnimationDefinitionStatic
): def is WaapiAnimationDefinition => {
  return !('springConfig' in def);
};
