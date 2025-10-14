import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { AnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";
import { SPRING_PRESETS } from "../../gameplay/animations/";

const BASE_HEIGHT = 30;
const CAP_HEIGHT = 6;
const UPDATE_INTERVAL_MS = 150;
const BAR_FALL_DURATION = 2000;

export const EqualizerBar: React.FC<{
  barId: string;
  frequencyRanges: readonly (readonly [number, number])[];
  barWidth: number;
}> = ({ barId, frequencyRanges, barWidth }) => {
  const renderCount = useRef(0);
  const barIndex = parseInt(barId.split("-")[1]);

  useEffect(() => {
    renderCount.current++;

    // Log every 50th render for random bars to avoid spam
    if (renderCount.current % 50 === 0 && Math.random() < 0.05) {
      console.log(`[Bar ${barIndex}] Rendered ${renderCount.current} times`);
    }
  });
  const getAnimationTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;
    const previousHeight = (context.previousHeight as number) || BASE_HEIGHT;
    const barResponse = (context.barResponse as number) || UPDATE_INTERVAL_MS;
    const barDecay = (context.barDecay as number) || BAR_FALL_DURATION;
    const isRising = targetHeight > previousHeight;

    return {
      duration: isRising ? barResponse : barDecay,
      easing: isRising ? "ease-out" : "ease-out",
      targetHeight,
    };
  }, []);

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
        const scale = targetHeight / BASE_HEIGHT;

        return {
          keyframes: [{ transform: `scaleY(${scale})` }],
          options: { duration, easing, fill: "forwards" },
          mode: "spring", // NEW!
          springConfig: SPRING_PRESETS.visualizer, // NEW!
        };
      },
    }),
    [getAnimationTiming],
  );

  const capAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { targetHeight, barResponse, barDecay, previousHeight } = context;
        const height = (targetHeight as number) || BASE_HEIGHT;
        const prevHeight = (previousHeight as number) || BASE_HEIGHT;
        const translateY = -(height - BASE_HEIGHT);

        const isRising = height > prevHeight;
        const duration = isRising ? (barResponse as number) : (barDecay as number);

        return {
          keyframes: [{ transform: `translateY(${translateY}px)` }],
          options: { duration, easing: "ease-out", fill: "forwards" },
          mode: "tween", // ← Keep as tween, NOT spring
        };
      },
    }),
    [],
  );
  const glowAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getGlowTiming(context);
        const scale = targetHeight / BASE_HEIGHT;
        const glowScale = scale * 1.2;

        return {
          keyframes: [{ transform: `scaleY(${glowScale})` }],
          options: { duration, easing, fill: "forwards" },
        };
      },
    }),
    [getGlowTiming],
  );

  const { createAnimationRef } = useAnimationRegistration(barId, {
    targetHeight: BASE_HEIGHT,
    previousHeight: BASE_HEIGHT,
  });

  const index = parseInt(barId.split("-")[1]);
  const hue = ((10 + index * 22) / 720) * 360;

  const [minHz, maxHz] = index < frequencyRanges.length ? frequencyRanges[index] : [0, 0];
  const formatHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${hz}Hz`);
  const freqLabel = `${formatHz(minHz)} - ${formatHz(maxHz)}`;

  const glowSpread = barWidth * 0.25;

  return (
    <div
      className={styles.barContainer}
      data-frequency={freqLabel}
      style={{
        position: "relative",
        width: `${barWidth}px`,
        height: `${BASE_HEIGHT + CAP_HEIGHT}px`,
        willChange: "transform",
        transform: "translateZ(0)", // Force GPU layer explicitly
        isolation: "isolate", // Prevent layer sharing issues
      }}
    >
      <div
        ref={createAnimationRef("glow", glowAnimations)}
        style={{
          position: "absolute",
          bottom: "0",
          left: `-${glowSpread}px`,
          right: `-${glowSpread}px`,
          height: `${BASE_HEIGHT}px`,
          transformOrigin: "bottom",
          background: `radial-gradient(ellipse, hsla(${hue}, 70%, 60%, 0.6), transparent)`,
          filter: "blur(10px)",
          willChange: "transform",
          transform: "translateZ(0)", // Force GPU layer explicitly
          isolation: "isolate", // Prevent layer sharing issues
        }}
      />

      <div
        ref={createAnimationRef("bar", animations)}
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          width: `${barWidth}px`,
          height: `${BASE_HEIGHT}px`,
          transformOrigin: "bottom",
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 70%) 0%, hsl(${hue}, 70%, 50%) 100%)`,
          borderRadius: "0",
          boxShadow: `0 0 20px hsla(${hue}, 70%, 60%, 0.5)`,
          willChange: "transform",
          transform: "translateZ(0)", // Force GPU layer explicitly
          isolation: "isolate", // Prevent layer sharing issues
        }}
      />

      <div
        ref={createAnimationRef("cap", capAnimations)}
        style={{
          position: "absolute",
          bottom: `${BASE_HEIGHT - 1}px`,
          left: "0",
          width: `${barWidth}px`,
          height: `${CAP_HEIGHT}px`,
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 75%) 0%, hsl(${hue}, 70%, 70%) 100%)`,
          borderRadius: "4px 4px 0 0",
          boxShadow: `0 0 20px hsla(${hue}, 70%, 60%, 0.5)`,
          willChange: "transform",
          transform: "translateZ(0)", // Force GPU layer explicitly
          isolation: "isolate", // Prevent layer sharing issues
        }}
      />
    </div>
  );
};

export interface VisualizerDisplayProps {
  barCount: number;
  barWidth: number;
  frequencyRanges: readonly (readonly [number, number])[];
  children?: React.ReactNode;
}

export const VisualizerDisplay: React.FC<VisualizerDisplayProps> = ({
  barCount,
  barWidth,
  frequencyRanges,
  children,
}) => {
  return (
    <div className={styles.visualizer}>
      {Array.from({ length: barCount }, (_, i) => (
        <EqualizerBar
          key={`bar-${i}`}
          barId={`bar-${i}`}
          frequencyRanges={frequencyRanges}
          barWidth={barWidth}
        />
      ))}
      {children}
    </div>
  );
};
