import React, { useMemo, useRef, useEffect } from "react";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { SpringAnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";
import { VISUALIZER_MODES, type VisualizerMode } from "../../gameplay/animations";

const BASE_HEIGHT = 30;
const CAP_HEIGHT = 6;
const UPDATE_INTERVAL_MS = 150;
const BAR_FALL_DURATION = 2000;

export const EqualizerBar: React.FC<{
  barId: string;
  frequencyRanges: readonly (readonly [number, number])[];
  barWidth: number;
  visualizerMode: VisualizerMode;
}> = ({ barId, frequencyRanges, barWidth, visualizerMode }) => {
  const animations: Record<string, SpringAnimationDefinition> = useMemo(
    () => ({
      updateHeight: {
        keyframes: [{ transform: "scaleY(1)" }, { transform: "scaleY(10)" }],
        springConfig: VISUALIZER_MODES[visualizerMode],
        options: { duration: 1000 },
        trackContext: (context) => (context.audioLevel as number) ?? 0,
      },
    }),
    [visualizerMode],
  );

  const capAnimations: Record<string, SpringAnimationDefinition> = useMemo(
    () => ({
      updateHeight: {
        keyframes: [{ transform: "translateY(0px)" }, { transform: "translateY(-270px)" }],
        springConfig: VISUALIZER_MODES[visualizerMode],
        options: { duration: 1000 },
        trackContext: (context) => (context.audioLevel as number) ?? 0,
      },
    }),
    [visualizerMode],
  );

  const glowAnimations: Record<string, SpringAnimationDefinition> = useMemo(
    () => ({
      updateHeight: {
        keyframes: [{ transform: "scaleY(1)" }, { transform: "scaleY(10)" }],
        springConfig: {
          stiffness: 180,
          damping: 10,
          mass: 0.6,
        },
        options: { duration: 1000 },
        trackContext: (context) => (context.glowLevel as number) ?? 0,
      },
    }),
    [],
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
          bottom: `${BASE_HEIGHT - 2}px`,
          left: "0",
          width: `${barWidth}px`,
          height: `${CAP_HEIGHT}px`,
          transformOrigin: "bottom",
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
  visualizerMode: VisualizerMode;
  children?: React.ReactNode;
}

export const VisualizerDisplay: React.FC<VisualizerDisplayProps> = ({
  barCount,
  barWidth,
  frequencyRanges,
  visualizerMode,
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
          visualizerMode={visualizerMode}
        />
      ))}
      {children}
    </div>
  );
};
