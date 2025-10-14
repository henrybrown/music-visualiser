import type { SpringConfig } from "./sping-animation";

export interface AnimationDefinitionStatic {
  keyframes: Keyframe[];
  options?: KeyframeAnimationOptions;
  mode?: "tween" | "spring";
  springConfig?: SpringConfig;
}

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
