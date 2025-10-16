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
