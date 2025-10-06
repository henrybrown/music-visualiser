export interface AnimationDefinition {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

export interface AnimationMetadata {
  elementId: string;
  entityId: string;
}

export interface AnimationTransition {
  event: string;
}
