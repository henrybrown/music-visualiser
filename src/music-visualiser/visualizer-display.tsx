import React, { useMemo } from "react";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { SpringAnimationDefinition } from "../../gameplay/animations/animation-types";
import demoStyles from "./music-visualiser-demo.module.css";
import styles from "./visualizer-display.module.css";
import { SPRING_CONFIGS, type SpringConfigKey } from "../../gameplay/animations";

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

export function calculateAudioLevel(
  dataArray: Uint8Array,
  barIndex: number,
  frequencyRanges: readonly (readonly [number, number])[],
  fftSize: number,
  sampleRate: number = 44100,
): number {
  const hzPerBin = sampleRate / 2 / (fftSize / 2);

  if (barIndex >= frequencyRanges.length) return 0;

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

  return average / 255;
}

export const EqualizerBar: React.FC<{
  barId: string;
  frequencyRanges: readonly (readonly [number, number])[];
  barWidth: number;
  springMode: SpringConfigKey;
}> = ({ barId, frequencyRanges, barWidth, springMode }) => {
  const animations: Record<string, SpringAnimationDefinition> = useMemo(
    () => ({
      updateHeight: {
        keyframes: [{ transform: "scaleY(0)" }, { transform: "scaleY(10)" }],
        springConfig: SPRING_CONFIGS[springMode],
        options: { duration: 1000 },
        trackContext: (context) => {
          const audioLevel = (context.audioLevel as number) ?? 0.1;
          // Map audioLevel to spring progress: 0.1 → 0.1, 1.0 → 1.0
          return audioLevel;
        },
        clampRange: { min: 0 },
        cushion: {
          threshold: 0.1, // Below baseline (audioLevel < 0.1)
          dampingMultiplier: 4.0, // Double damping in cushion zone
        },
      },
    }),
    [springMode],
  );

  const capAnimations: Record<string, SpringAnimationDefinition> = useMemo(
    () => ({
      updateHeight: {
        keyframes: [{ transform: "translateY(0px)" }, { transform: "translateY(-300px)" }],
        springConfig: SPRING_CONFIGS[springMode],
        options: { duration: 1000 },
        trackContext: (context) => (context.audioLevel as number) ?? 0.1,
        clampRange: { min: 0 },
        cushion: {
          threshold: 0.1, // Below baseline (audioLevel < 0.1)
          dampingMultiplier: 4.0, // Double damping in cushion zone
        },
      },
    }),
    [springMode],
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

  const { createAnimationRef } = useAnimationRegistration(barId);

  const index = parseInt(barId.split("-")[1]);
  const hue = ((10 + index * 22) / 720) * 360;

  const [minHz, maxHz] = index < frequencyRanges.length ? frequencyRanges[index] : [0, 0];
  const formatHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${hz}Hz`);
  const freqLabel = `${formatHz(minHz)} - ${formatHz(maxHz)}`;

  const glowSpread = barWidth * 0.25;

  return (
    <div
      className={`${demoStyles.barContainer} ${styles.barWrapper}`}
      data-frequency={freqLabel}
      style={{
        width: `${barWidth}px`,
      }}
    >
      <div
        ref={createAnimationRef("glow", glowAnimations)}
        className={styles.glow}
        style={{
          left: `-${glowSpread}px`,
          right: `-${glowSpread}px`,
          background: `radial-gradient(ellipse, hsla(${hue}, 70%, 60%, 0.6), transparent)`,
        }}
      />

      <div
        ref={createAnimationRef("bar", animations)}
        className={styles.bar}
        style={{
          width: `${barWidth}px`,
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 70%) 0%, hsl(${hue}, 70%, 50%) 100%)`,
          boxShadow: `0 0 20px hsla(${hue}, 70%, 60%, 0.5)`,
        }}
      />

      <div
        ref={createAnimationRef("cap", capAnimations)}
        className={styles.cap}
        style={{
          width: `${barWidth}px`,
          background: `linear-gradient(180deg, hsl(${hue}, 70%, 75%) 0%, hsl(${hue}, 70%, 70%) 100%)`,
          boxShadow: `0 0 20px hsla(${hue}, 70%, 60%, 0.5)`,
        }}
      />
    </div>
  );
};

export interface VisualizerDisplayProps {
  barCount: number;
  barWidth: number;
  frequencyRanges: readonly (readonly [number, number])[];
  springMode: SpringConfigKey;
  children?: React.ReactNode;
}

export const VisualizerDisplay: React.FC<VisualizerDisplayProps> = ({
  barCount,
  barWidth,
  frequencyRanges,
  springMode,
  children,
}) => {
  return (
    <div className={demoStyles.visualizer}>
      {Array.from({ length: barCount }, (_, i) => (
        <EqualizerBar
          key={`bar-${i}`}
          barId={`bar-${i}`}
          frequencyRanges={frequencyRanges}
          barWidth={barWidth}
          springMode={springMode}
        />
      ))}
      {children}
    </div>
  );
};
