import type { SpringConfig } from "./spring-animation";

export interface SpringCushion {
  threshold: number;
  dampingMultiplier: number;
}

export interface SpringAnimationDefinition {
  keyframes: Keyframe[];
  springConfig?: SpringConfig;
  options?: KeyframeAnimationOptions;
  trackContext?: (context: Record<string, unknown>) => number;
  clampRange?:
    | { min?: number | null; max: number | null }
    | { min: number | null; max?: number | null };
  initialValue?: number;
  cushion?: SpringCushion;
}
