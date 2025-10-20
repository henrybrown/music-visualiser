import type { WebAnimationEngine } from "../../gameplay/animations";
import type { SpringConfigKey } from "../../gameplay/animations";

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

    if (timestamp - lastGlowUpdate >= 16) {
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

      for (let i = 0; i < config.barCount; i++) {
        engine.updateEntityContext(`bar-${i}`, {
          audioLevel: 0,
          glowLevel: 0,
        });
      }

      playing = false;
      lastBarLevels.fill(0);
    },

    updateConfig: (newConfig: Partial<VisualizerConfig>) => {
      const oldBarCount = config.barCount;
      config = { ...config, ...newConfig };

      if (newConfig.barCount !== undefined && newConfig.barCount !== oldBarCount) {
        console.log(`📊 Density change: ${oldBarCount} → ${config.barCount}, playing: ${playing}`);

        // Reset cache for new bar count
        lastBarLevels = new Array(config.barCount).fill(0);

        // Clear removed bars if decreasing
        if (config.barCount < oldBarCount) {
          console.log(`🧹 Clearing bars ${config.barCount}-${oldBarCount - 1}`);
          for (let i = config.barCount; i < oldBarCount; i++) {
            engine.updateEntityContext(`bar-${i}`, {
              audioLevel: 0,
              glowLevel: 0,
            });
          }
        }

        // Force update all remaining bars if playing
        if (playing) {
          const dataArray = audioAnalyser.getFrequencyData();

          if (dataArray) {
            console.log(`🔄 Forcing update for bars 0-${config.barCount - 1}`);

            const sampleUpdates: string[] = [];

            for (let i = 0; i < config.barCount; i++) {
              const rawLevel = calculateAudioLevel(
                dataArray,
                i,
                config.frequencyRanges,
                config.fftSize,
              );

              let mappedLevel: number = BASELINE + rawLevel * (1.0 - BASELINE);

              if (mappedLevel < config.changeThreshold) {
                mappedLevel = 0;
              }

              // Log first 5 bars for debugging
              if (i < 5) {
                const context = engine.getEntityContext(`bar-${i}`);
                const oldAudioLevel = context?.audioLevel ?? "none";
                sampleUpdates.push(`  bar-${i}: ${oldAudioLevel} → ${mappedLevel.toFixed(3)}`);
              }

              engine.updateEntityContext(`bar-${i}`, {
                audioLevel: mappedLevel,
                glowLevel: rawLevel,
              });

              lastBarLevels[i] = mappedLevel;
            }

            console.log("Sample updates:\n" + sampleUpdates.join("\n"));
          } else {
            console.warn("⚠️ No audio data available for forced update");
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
