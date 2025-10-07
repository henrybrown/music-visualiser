export interface AnimationDefinition {
  keyframes: Keyframe[];
  options?: KeyframeAnimationOptions;
}

export interface AnimationMetadata {
  elementId: string;
  entityId: string;
  [key: string]: string | undefined;
}

export interface AnimationTransition {
  event: string;
}
