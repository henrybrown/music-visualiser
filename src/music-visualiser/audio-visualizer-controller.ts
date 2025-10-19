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

  // Logging variables
  let updateCount = 0;
  let playCount = 0;

  function audioUpdateLoop(timestamp: number) {
    if (!playing) return;

    const dataArray = audioAnalyser.getFrequencyData();
    if (!dataArray) {
      rafId = requestAnimationFrame(audioUpdateLoop);
      return;
    }

    if (timestamp - lastAudioUpdate >= config.audioRefreshRate) {
      let updatesThisTick = 0;

      for (let i = 0; i < config.barCount; i++) {
        const rawLevel = calculateAudioLevel(dataArray, i, config.frequencyRanges, config.fftSize);
        const mappedLevel = BASELINE + rawLevel * (1.0 - BASELINE);
        const lastLevel = lastBarLevels[i];

        if (Math.abs(mappedLevel - lastLevel) > config.changeThreshold) {
          engine.updateEntityContext(`bar-${i}`, { audioLevel: mappedLevel });
          lastBarLevels[i] = mappedLevel;
          updatesThisTick++;
        }
      }

      updateCount += updatesThisTick;

      if (updateCount % 10 === 0) {
        console.log(
          `[Play ${playCount}] Audio updates: ${updateCount} (${updatesThisTick} this tick)`,
        );
      }

      if (updateCount === 0) {
        console.log(`🔍 FFT Debug:
    config.fftSize: ${config.fftSize}
    dataArray.length: ${dataArray.length}
    Expected bins: ${config.fftSize / 2}
    Sample rate: ${SAMPLE_RATE}
    Hz per bin: ${SAMPLE_RATE / 2 / (config.fftSize / 2)}
    First 10 values: ${Array.from(dataArray.slice(0, 10))}
  `);
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

      playCount++;
      updateCount = 0;
      console.log(`\n🎬 [Play ${playCount}] Starting...`);

      lastBarLevels.fill(0);
      lastAudioUpdate = 0;
      lastGlowUpdate = 0;

      // Start at BASELINE when playing begins
      for (let i = 0; i < config.barCount; i++) {
        engine.updateEntityContext(`bar-${i}`, {
          audioLevel: BASELINE,
          glowLevel: 0,
        });
      }

      await audioAnalyser.loadTrack(trackUrl);
      console.log(`✅ [Play ${playCount}] Track loaded`);

      rafId = requestAnimationFrame(audioUpdateLoop);
      glowRafId = requestAnimationFrame(glowUpdateLoop);

      playing = true;
      console.log(`✅ [Play ${playCount}] Loops started\n`);
    },

    stop: () => {
      if (!playing) return;

      console.log(`\n⏹ [Play ${playCount}] Stopping... Total updates: ${updateCount}`);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (glowRafId) {
        cancelAnimationFrame(glowRafId);
        glowRafId = null;
      }

      audioAnalyser.stop();

      // Reset bars to 0 for satisfying "pop" on next play
      for (let i = 0; i < config.barCount; i++) {
        engine.updateEntityContext(`bar-${i}`, {
          audioLevel: 0,
          glowLevel: 0,
        });
      }

      playing = false;
      lastBarLevels.fill(0);
      console.log(`✅ [Play ${playCount}] Stopped\n`);
    },

    updateConfig: (newConfig: Partial<VisualizerConfig>) => {
      const oldBarCount = config.barCount;
      config = { ...config, ...newConfig };

      // If barCount changed, force complete reset
      if (newConfig.barCount !== undefined && newConfig.barCount !== oldBarCount) {
        console.log(`📊 Bar count changed: ${oldBarCount} → ${config.barCount}`);

        // Reset cache
        lastBarLevels = new Array(config.barCount).fill(0);

        // If reducing bar count, clear removed bars
        if (config.barCount < oldBarCount) {
          for (let i = config.barCount; i < oldBarCount; i++) {
            engine.updateEntityContext(`bar-${i}`, {
              audioLevel: 0,
              glowLevel: 0,
            });
          }
        }

        // Always use BASELINE - only stop() should use 0
        for (let i = 0; i < config.barCount; i++) {
          engine.updateEntityContext(`bar-${i}`, {
            audioLevel: BASELINE,
            glowLevel: 0,
          });
        }

        console.log(`✅ All ${config.barCount} bars reset to baseline`);
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
