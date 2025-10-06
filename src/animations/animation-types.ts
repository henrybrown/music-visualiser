/**
 * Shared animation type definitions for the WAAPI-based animation system
 */

export interface AnimationDefinition {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

export interface AnimationMetadata {
  elementId: string;
  entityId: string;
}
