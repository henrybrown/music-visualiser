import type { WebAnimationEngine } from "../../gameplay/animations";
import type { SpringConfigKey } from "../../gameplay/animations";

const BASELINE = 0.1;
const SAMPLE_RATE = 44100;
const GLOW_UPDATE_RATE_MS = 16;
const SNAP_TO_ZERO_THRESHOLD = 0.1; // Matches changeThreshold default

export interface VisualizerConfig {
  barCount: number;
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
  initialConfig: VisualizerConfig;
}

/**
 * Calculates the average audio level for a specific frequency band.
 *
 * Maps FFT bins to the frequency range and averages their amplitudes.
 * Uses logarithmic frequency spacing to match human hearing perception.
 *
 * @param dataArray - FFT frequency data from Web Audio API (0-255 range)
 * @param barIndex - Index of the frequency band to analyze
 * @param frequencyRanges - Array of [minHz, maxHz] tuples defining each band
 * @param fftSize - FFT size used by the analyser (determines frequency resolution)
 * @returns Normalized audio level between 0 and 1
 */
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

/**
 * Creates an audio visualizer controller that bridges the Web Audio API
 * with the spring animation engine.
 *
 * Handles:
 * - Real-time FFT analysis at configurable refresh rates
 * - Proportional threshold system for adaptive sensitivity
 * - Glow effect calculations at 60fps
 * - Dynamic density switching during playback
 *
 * @param deps - Dependencies including animation engine and audio analyser
 * @returns Controller with play/stop/config methods
 */
export function createAudioVisualizerController(
  deps: ControllerDependencies,
): AudioVisualizerController {
  const { engine, audioAnalyser, initialConfig } = deps;

  let rafId: number | null = null;
  let glowRafId: number | null = null;
  let config: VisualizerConfig = initialConfig;
  let playing = false;

  let lastBarLevels = new Array(config.barCount).fill(0);
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
      for (let i = 0; i < config.barCount; i++) {
        const rawLevel = calculateAudioLevel(dataArray, i, config.frequencyRanges, config.fftSize);
        const mappedLevel = BASELINE + rawLevel * (1.0 - BASELINE);
        const lastLevel = lastBarLevels[i];

        /** set to 0 if within the threshol audio level */
        if (Math.abs(mappedLevel) <= config.changeThreshold) {
          engine.updateEntityContext(`bar-${i}`, { audioLevel: BASELINE });
          lastBarLevels[i] = BASELINE;
          continue;
        }

        if (Math.abs(mappedLevel - lastLevel) / Math.abs(mappedLevel) > config.changeThreshold) {
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

    if (timestamp - lastGlowUpdate >= GLOW_UPDATE_RATE_MS) {
      for (let i = 0; i < config.barCount; i++) {
        const glowLevel = calculateAudioLevel(dataArray, i, config.frequencyRanges, config.fftSize);
        engine.updateEntityContext(`bar-${i}`, { glowLevel });
      }
      lastGlowUpdate = timestamp;
    }

    glowRafId = requestAnimationFrame(glowUpdateLoop);
  }

  return {
    play: async (trackUrl: string) => {
      if (playing) return;

      try {
        lastBarLevels.fill(0);
        lastAudioUpdate = 0;
        lastGlowUpdate = 0;

        for (let i = 0; i < config.barCount; i++) {
          engine.updateEntityContext(`bar-${i}`, {
            audioLevel: BASELINE,
            glowLevel: 0,
          });
        }

        await audioAnalyser.loadTrack(trackUrl);

        rafId = requestAnimationFrame(audioUpdateLoop);
        glowRafId = requestAnimationFrame(glowUpdateLoop);

        playing = true;
      } catch (error) {
        // Reset state on error
        playing = false;
        lastBarLevels.fill(0);

        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (glowRafId) {
          cancelAnimationFrame(glowRafId);
          glowRafId = null;
        }

        throw new Error(`Failed to load audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    stop: () => {
      if (!playing) return;

      try {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (glowRafId) {
          cancelAnimationFrame(glowRafId);
          glowRafId = null;
        }

        audioAnalyser.stop();

        for (let i = 0; i < config.barCount; i++) {
          engine.updateEntityContext(`bar-${i}`, {
            audioLevel: 0,
            glowLevel: 0,
          });
        }

        playing = false;
        lastBarLevels.fill(0);
      } catch (error) {
        // Force cleanup even if error occurs
        playing = false;
        lastBarLevels.fill(0);
        rafId = null;
        glowRafId = null;
      }
    },

    updateConfig: (newConfig: Partial<VisualizerConfig>) => {
      const oldBarCount = config.barCount;
      config = { ...config, ...newConfig };

      if (newConfig.barCount !== undefined && newConfig.barCount !== oldBarCount) {
        lastBarLevels = new Array(config.barCount).fill(0);

        if (config.barCount < oldBarCount) {
          for (let i = config.barCount; i < oldBarCount; i++) {
            engine.updateEntityContext(`bar-${i}`, {
              audioLevel: 0,
              glowLevel: 0,
            });
          }
        }

        if (playing) {
          const dataArray = audioAnalyser.getFrequencyData();

          if (dataArray) {
            for (let i = 0; i < config.barCount; i++) {
              const rawLevel = calculateAudioLevel(
                dataArray,
                i,
                config.frequencyRanges,
                config.fftSize,
              );
              const mappedLevel = BASELINE + rawLevel * (1.0 - BASELINE);

              engine.updateEntityContext(`bar-${i}`, {
                audioLevel: mappedLevel,
                glowLevel: rawLevel,
              });

              lastBarLevels[i] = mappedLevel;
            }
          }
        }
      }
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
