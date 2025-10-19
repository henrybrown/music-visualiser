import { useRef, useEffect, useLayoutEffect } from "react";
import { useAnimationEngine } from "../../gameplay/animations/animation-engine-context";
import { useAudioAnalyser } from "./audio-analysis";
import {
  createAudioVisualizerController,
  type AudioVisualizerController,
  type VisualizerConfig,
} from "./audio-visualizer-controller";

interface UseAudioVisualizerConfig {
  barCount: number;
  audioRefreshRate: number;
  changeThreshold: number;
  springMode: VisualizerConfig["springMode"];
  frequencyRanges: readonly (readonly [number, number])[];
  fftSize: number;
}

export function useAudioVisualizer(
  config: UseAudioVisualizerConfig,
  audioAnalyser: ReturnType<typeof useAudioAnalyser>,
): AudioVisualizerController {
  const engine = useAnimationEngine();
  const controllerRef = useRef<AudioVisualizerController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createAudioVisualizerController({
      engine,
      audioAnalyser,
      initialConfig: {
        barCount: config.barCount,
        audioRefreshRate: config.audioRefreshRate,
        changeThreshold: config.changeThreshold,
        springMode: config.springMode,
        frequencyRanges: config.frequencyRanges,
        fftSize: config.fftSize,
      },
    });
  }

  const controller = controllerRef.current;

  useLayoutEffect(() => {
    controller.updateConfig({
      barCount: config.barCount,
      audioRefreshRate: config.audioRefreshRate,
      changeThreshold: config.changeThreshold,
      springMode: config.springMode,
      frequencyRanges: config.frequencyRanges,
      fftSize: config.fftSize,
    });
  }, [
    config.barCount,
    config.audioRefreshRate,
    config.changeThreshold,
    config.springMode,
    config.frequencyRanges,
    config.fftSize,
  ]);

  useEffect(() => {
    return () => controller.destroy();
  }, []);

  return controller;
}
