import React, { useCallback, useMemo } from "react";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { AnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";

const BASE_HEIGHT = 30;
const CAP_HEIGHT = 6;
const UPDATE_INTERVAL_MS = 150;
const BAR_FALL_DURATION = 2000;

export const FREQUENCY_RANGES = [
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
  [100, 125],
  [125, 150],
  [150, 180],
  [180, 220],
  [220, 270],
  [270, 330],
  [330, 400],
  [400, 480],
  [480, 570],
  [570, 680],
  [680, 810],
  [810, 1000],
  [1000, 1200],
  [1200, 1500],
  [1500, 1800],
  [1800, 2200],
  [2200, 2700],
  [2700, 3300],
  [3300, 4000],
  [4000, 5000],
  [5000, 6200],
  [6200, 7600],
  [7600, 9300],
  [9300, 11500],
  [11500, 14000],
  [14000, 17000],
  [17000, 22000],
] as const;

export function subdivideFrequencyRanges(
  multiplier: 1 | 2 | 4,
): readonly (readonly [number, number])[] {
  if (multiplier === 1) return FREQUENCY_RANGES;

  const subdivided: [number, number][] = [];
  for (const [minHz, maxHz] of FREQUENCY_RANGES) {
    const rangeSize = (maxHz - minHz) / multiplier;
    for (let i = 0; i < multiplier; i++) {
      const subMin = minHz + rangeSize * i;
      const subMax = minHz + rangeSize * (i + 1);
      subdivided.push([Math.round(subMin), Math.round(subMax)]);
    }
  }
  return subdivided;
}

export function calculateFrequencyLabel(barIndex: number): string {
  if (barIndex >= FREQUENCY_RANGES.length) return "";
  const [minHz] = FREQUENCY_RANGES[barIndex];
  if (minHz < 1000) return `${Math.round(minHz)}Hz`;
  return `${(minHz / 1000).toFixed(1)}kHz`;
}

export function calculateHeight(
  dataArray: Uint8Array,
  barIndex: number,
  frequencyRanges: readonly (readonly [number, number])[],
  fftSize: number,
  sampleRate: number = 44100,
): number {
  const hzPerBin = sampleRate / 2 / (fftSize / 2);

  if (barIndex >= frequencyRanges.length) return BASE_HEIGHT;

  const [minHz, maxHz] = frequencyRanges[barIndex];
  const startBin = Math.max(1, Math.floor(minHz / hzPerBin));
  const endBin = Math.min(dataArray.length, Math.floor(maxHz / hzPerBin));

  let sum = 0;
  let count = 0;

  for (let i = startBin; i < endBin; i++) {
    sum += dataArray[i];
    count++;
  }

  const average = count > 0 ? sum / count : 0;
  const normalized = average / 255;
  const scaled = Math.pow(normalized, 1.1);

  return Math.max(BASE_HEIGHT, scaled * 300);
}

interface EqualizerBarProps {
  barId: string;
  frequencyRanges: readonly (readonly [number, number])[];
  barWidth: number;
  barResponse: number;
  barDecay: number;
}

export const EqualizerBar: React.FC<EqualizerBarProps> = ({
  barId,
  frequencyRanges,
  barWidth,
  barResponse,
  barDecay,
}) => {
  const getAnimationTiming = useCallback(
    (context: Record<string, unknown>) => {
      const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;
      const previousHeight = (context.previousHeight as number) || BASE_HEIGHT;
      const isRising = targetHeight > previousHeight;

      return {
        duration: isRising ? barResponse : barDecay,
        easing: isRising ? "ease-out" : "ease-out",
        targetHeight,
      };
    },
    [barResponse, barDecay],
  );

  const getGlowTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;
    return {
      duration: 100,
      easing: "ease-out" as const,
      targetHeight,
    };
  }, []);

  const animations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);

        return {
          keyframes: [{ transform: `scaleY(${targetHeight / BASE_HEIGHT})` }],
          options: {
            duration,
            easing,
            fill: "forwards" as const,
          },
        };
      },
    }),
    [getAnimationTiming],
  );

  const capAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);
        const translateY = -(targetHeight - BASE_HEIGHT);

        return {
          keyframes: [{ transform: `translateY(${translateY}px)` }],
          options: {
            duration,
            easing,
            fill: "forwards" as const,
          },
        };
      },
    }),
    [getAnimationTiming],
  );

  const glowAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getGlowTiming(context);

        return {
          keyframes: [{ transform: `scaleY(${targetHeight / BASE_HEIGHT})` }],
          options: {
            duration,
            easing,
            fill: "forwards" as const,
          },
        };
      },
    }),
    [getGlowTiming],
  );

  const { createAnimationRef } = useAnimationRegistration(barId);

  const barRef = createAnimationRef("bar", animations);
  const capRef = createAnimationRef("cap", capAnimations);
  const glowRef = createAnimationRef("glow", glowAnimations);

  const barIndex = parseInt(barId, 10);
  const frequencyLabel = useMemo(() => {
    if (barIndex < frequencyRanges.length) {
      const [minHz] = frequencyRanges[barIndex];
      if (minHz < 1000) return `${Math.round(minHz)}Hz`;
      return `${(minHz / 1000).toFixed(1)}kHz`;
    }
    return "";
  }, [barIndex, frequencyRanges]);

  const hue = (barIndex / frequencyRanges.length) * 280;

  return (
    <div
      className={styles.barContainer}
      style={{ width: `${barWidth}px` }}
      data-frequency={frequencyLabel}
    >
      <div
        ref={glowRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: `${BASE_HEIGHT}px`,
          transformOrigin: "bottom",
          background: `linear-gradient(180deg, hsla(${hue}, 70%, 60%, 0.4) 0%, transparent 100%)`,
          filter: "blur(10px)",
          //filter: "none", // <-- disable blur
          pointerEvents: "none",
          willChange: "transform",
        }}
      />

      <div
        ref={barRef}
        style={{
          position: "relative",
          width: "100%",
          height: `${BASE_HEIGHT}px`,
          transformOrigin: "bottom",
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 50%) 0%, hsl(${hue}, 70%, 45%) 100%)`,
          borderRadius: "4px 4px 0 0",
          boxShadow: `0 0 10px hsla(${hue}, 70%, 50%, 0.5)`,
          willChange: "transform",
        }}
      />

      <div
        ref={capRef}
        style={{
          position: "absolute",
          bottom: `${BASE_HEIGHT}px`,
          left: 0,
          width: "100%",
          height: `${CAP_HEIGHT}px`,
          transformOrigin: "bottom",
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 75%) 0%, hsl(${hue}, 70%, 70%) 100%)`,
          borderRadius: "4px 4px 0 0",
          boxShadow: `0 0 20px hsla(${hue}, 70%, 60%, 0.5)`,
          willChange: "transform",
        }}
      />
    </div>
  );
};
