import type { WebAnimationEngine } from "../../gameplay/animations";
import type { SpringConfigKey } from "../../gameplay/animations";

export interface VisualizerConfig {
  audioRefreshRate: number;
  changeThreshold: number;
  springMode: SpringConfigKey;
  frequencyRanges: readonly (readonly [number, number])[];
  fftSize: number;
}

export interface AudioVisualizerController {
  play: (trackUrl: string) => Promise<void>;
  stop: () => void;
  updateConfig: (config: Partial<VisualizerConfig>) => void;
  destroy: () => void;
  isPlaying: () => boolean;
}

interface ControllerDependencies {
  engine: WebAnimationEngine;
  audioAnalyser: {
    loadTrack: (src: string) => Promise<void>;
    stop: () => void;
    getFrequencyData: () => Uint8Array | null;
    audioElement: HTMLAudioElement | null;
  };
  barCount: number;
  initialConfig: VisualizerConfig;
}

const BASELINE = 0.1;
const SAMPLE_RATE = 44100;

function calculateAudioLevel(
  dataArray: Uint8Array,
  barIndex: number,
  frequencyRanges: readonly (readonly [number, number])[],
  fftSize: number,
): number {
  const hzPerBin = SAMPLE_RATE / 2 / (fftSize / 2);

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

export function createAudioVisualizerController(
  deps: ControllerDependencies,
): AudioVisualizerController {
  const { engine, audioAnalyser, barCount, initialConfig } = deps;

  let rafId: number | null = null;
  let glowRafId: number | null = null;
  let config: VisualizerConfig = initialConfig;
  let playing = false;

  const lastBarLevels = new Array(barCount).fill(0);
  let lastAudioUpdate = 0;
  let lastGlowUpdate = 0;

  function audioUpdateLoop(timestamp: number) {
    if (!playing) return;

    const dataArray = audioAnalyser.getFrequencyData();
    if (!dataArray) {
      rafId = requestAnimationFrame(audioUpdateLoop);
      return;
    }

    if (timestamp - lastAudioUpdate >= config.audioRefreshRate) {
      for (let i = 0; i < barCount; i++) {
        const rawLevel = calculateAudioLevel(
          dataArray,
          i,
          config.frequencyRanges,
          config.fftSize,
        );
        const mappedLevel = BASELINE + rawLevel * (1.0 - BASELINE);
        const lastLevel = lastBarLevels[i];

        if (Math.abs(mappedLevel - lastLevel) > config.changeThreshold) {
          engine.updateEntityContext(`bar-${i}`, { audioLevel: mappedLevel });
          lastBarLevels[i] = mappedLevel;
        }
      }
      lastAudioUpdate = timestamp;
    }

    rafId = requestAnimationFrame(audioUpdateLoop);
  }

  function glowUpdateLoop(timestamp: number) {
    if (!playing) return;

    const dataArray = audioAnalyser.getFrequencyData();
    if (!dataArray) {
      glowRafId = requestAnimationFrame(glowUpdateLoop);
      return;
    }

    if (timestamp - lastGlowUpdate >= 16) {
      for (let i = 0; i < barCount; i++) {
        const glowLevel = calculateAudioLevel(
          dataArray,
          i,
          config.frequencyRanges,
          config.fftSize,
        );
        engine.updateEntityContext(`bar-${i}`, { glowLevel });
      }
      lastGlowUpdate = timestamp;
    }

    glowRafId = requestAnimationFrame(glowUpdateLoop);
  }

  return {
    play: async (trackUrl: string) => {
      if (playing) return;

      lastBarLevels.fill(0);
      lastAudioUpdate = 0;
      lastGlowUpdate = 0;

      for (let i = 0; i < barCount; i++) {
        engine.updateEntityContext(`bar-${i}`, {
          audioLevel: BASELINE,
          glowLevel: 0,
        });
      }

      engine.startSpringLoop();
      rafId = requestAnimationFrame(audioUpdateLoop);
      glowRafId = requestAnimationFrame(glowUpdateLoop);

      await audioAnalyser.loadTrack(trackUrl);
      playing = true;
    },

    stop: () => {
      if (!playing) return;

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (glowRafId) {
        cancelAnimationFrame(glowRafId);
        glowRafId = null;
      }

      audioAnalyser.stop();

      for (let i = 0; i < barCount; i++) {
        engine.updateEntityContext(`bar-${i}`, {
          audioLevel: BASELINE,
          glowLevel: 0,
        });
      }

      playing = false;
      lastBarLevels.fill(0);
    },

    updateConfig: (newConfig: Partial<VisualizerConfig>) => {
      config = { ...config, ...newConfig };
    },

    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (glowRafId) cancelAnimationFrame(glowRafId);
      audioAnalyser.stop();
      playing = false;
    },

    isPlaying: () => playing,
  };
}
