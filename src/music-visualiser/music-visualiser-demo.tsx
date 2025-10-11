import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { AnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";

// Visualizer constants
const FREQUENCY_RANGES = [
  // Bass region - tight spacing for detail
  [20, 40], // Bar 0: Deep sub-bass
  [40, 60], // Bar 1: Sub-bass
  [60, 80], // Bar 2: Bass
  [80, 100], // Bar 3: Bass
  [100, 125], // Bar 4: Bass
  [125, 150], // Bar 5: Bass
  [150, 180], // Bar 6: Bass
  [180, 220], // Bar 7: Upper bass
  [220, 270], // Bar 8: Low-mids
  [270, 330], // Bar 9: Low-mids
  [330, 400], // Bar 10: Low-mids
  [400, 480], // Bar 11: Low-mids

  // Mid range - medium spacing
  [480, 570], // Bar 12: Mids
  [570, 680], // Bar 13: Mids
  [680, 810], // Bar 14: Mids
  [810, 1000], // Bar 15: Mids
  [1000, 1200], // Bar 16: Mids
  [1200, 1500], // Bar 17: Upper-mids
  [1500, 1800], // Bar 18: Upper-mids
  [1800, 2200], // Bar 19: Upper-mids
  [2200, 2700], // Bar 20: Upper-mids
  [2700, 3300], // Bar 21: Upper-mids

  // High range - wider spacing
  [3300, 4000], // Bar 22: Highs
  [4000, 5000], // Bar 23: Highs
  [5000, 6200], // Bar 24: Highs
  [6200, 7600], // Bar 25: Highs
  [7600, 9300], // Bar 26: Ultra-highs
  [9300, 11500], // Bar 27: Ultra-highs
  [11500, 14000], // Bar 28: Ultra-highs
  [14000, 17000], // Bar 29: Ultra-highs
  [17000, 22000], // Bar 30: Ultra-highs
] as const;

// Audio analysis configuration
const FFT_SIZE = 2048; // Number of samples for FFT (higher = better frequency resolution, slower updates)
const SAMPLE_RATE = 44100; // Audio sample rate in Hz (CD quality standard)
const SMOOTHING_TIME_CONSTANT = 0.3; // Time averaging (0-1, lower = more responsive, higher = smoother)
const MIN_DECIBELS = -100; // Minimum power level in dB (quietest sound to show, more negative = picks up quieter sounds)
const MAX_DECIBELS = 0; // Maximum power level in dB (loudest sound, 0 = digital maximum)

/**
 * Subdivide frequency ranges to create more bars
 * @param multiplier - 1 = normal (31 bars), 2 = double (62 bars), 4 = quadruple (124 bars)
 */
function subdivideFrequencyRanges(multiplier: 1 | 2 | 4): readonly (readonly [number, number])[] {
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

const BASE_HEIGHT = 30; // Minimum height for bars (px)
const CAP_HEIGHT = 6; // Height of the cap element on top of each bar
const UPDATE_INTERVAL_MS = 150; // How often to trigger bar height animations (ms) - also used for bar rise duration
const BAR_FALL_DURATION = 2000; // How slowly bars decay (ms)

interface AudioAnalyserConfig {
  fftSize: number;
  smoothing: number;
  minDecibels: number;
  maxDecibels: number;
}

interface AudioAnalyserReturn {
  loadTrack: (src: string) => void;
  stop: () => void;
  getFrequencyData: () => Uint8Array | null;
  audioElement: HTMLAudioElement | null;
  updateConfig: (config: AudioAnalyserConfig) => void;
}

/**
 * Custom hook for audio analysis using the Web Audio API.
 * Sets up an audio context and analyser node to extract frequency data from audio playback.
 */
function useAudioAnalyser(): AudioAnalyserReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentConfigRef = useRef<AudioAnalyserConfig>({
    fftSize: FFT_SIZE,
    smoothing: SMOOTHING_TIME_CONSTANT,
    minDecibels: MIN_DECIBELS,
    maxDecibels: MAX_DECIBELS,
  });

  const initAudioContext = useCallback((config: AudioAnalyserConfig) => {
    if (audioContextRef.current && currentConfigRef.current.fftSize === config.fftSize) {
      // Just update parameters that don't require recreating analyser
      if (analyserRef.current) {
        analyserRef.current.smoothingTimeConstant = config.smoothing;
        analyserRef.current.minDecibels = config.minDecibels;
        analyserRef.current.maxDecibels = config.maxDecibels;
      }
      currentConfigRef.current = config;
      return;
    }

    // Need to recreate analyser if fftSize changed
    if (audioContextRef.current && currentConfigRef.current.fftSize !== config.fftSize) {
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = config.fftSize;
    analyserRef.current.smoothingTimeConstant = config.smoothing;
    analyserRef.current.minDecibels = config.minDecibels;
    analyserRef.current.maxDecibels = config.maxDecibels;

    const bufferLength = analyserRef.current.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);
    currentConfigRef.current = config;
  }, []);

  const updateConfig = useCallback(
    (config: AudioAnalyserConfig) => {
      initAudioContext(config);

      // If audio is playing, reconnect with new analyser
      if (sourceRef.current && analyserRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current!.destination);
      }
    },
    [initAudioContext],
  );

  const loadTrack = useCallback(
    async (src: string) => {
      initAudioContext(currentConfigRef.current);

      // Resume audio context if suspended (browser autoplay policy)
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // Clean up previous audio element
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }

      // Create new audio element and set source
      const audio = new Audio();
      audio.src = src;
      audio.volume = 1.0; // Ensure volume is set
      audioElementRef.current = audio;

      // Add error handler for debugging
      audio.addEventListener("error", (e) => {
        console.error("Audio loading error:", e);
      });

      // Disconnect old audio source if it exists
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }

      // Wire up the audio pipeline: Audio Element -> Analyser -> Speakers
      // This allows us to analyze the audio while it plays
      sourceRef.current = audioContextRef.current!.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(audioContextRef.current!.destination);

      try {
        await audio.play();
        console.log("Audio playing, context state:", audioContextRef.current?.state);
      } catch (err) {
        console.error("Audio playback error:", err);
      }
    },
    [initAudioContext],
  );

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current || !dataArrayRef.current) return null;

    // Fills dataArray with current frequency data (0-255 for each frequency bin)
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return dataArrayRef.current;
  }, []);

  return {
    loadTrack,
    stop,
    getFrequencyData,
    audioElement: audioElementRef.current,
    updateConfig,
  };
}

/**
 * Calculates the frequency label for a given bar index.
 * Reads directly from FREQUENCY_RANGES array.
 *
 * @param barIndex - The bar's position (0 to BAR_COUNT-1)
 * @returns Formatted frequency label (e.g., "86Hz" or "2.5k")
 */
function calculateFrequencyLabel(barIndex: number): string {
  if (barIndex >= FREQUENCY_RANGES.length) {
    return "";
  }

  const [minHz] = FREQUENCY_RANGES[barIndex];

  if (minHz < 1000) {
    return `${Math.round(minHz)}Hz`;
  }
  return `${(minHz / 1000).toFixed(1)}kHz`;
}

/**
 * Calculates the height for a single bar based on frequency data.
 * Uses explicit frequency ranges with average aggregation for smooth visualization.
 */
function calculateHeight(
  dataArray: Uint8Array,
  barIndex: number,
  frequencyRanges: readonly (readonly [number, number])[],
  fftSize: number,
  sampleRate: number = SAMPLE_RATE,
): number {
  const hzPerBin = sampleRate / 2 / (fftSize / 2);

  if (barIndex >= frequencyRanges.length) {
    return BASE_HEIGHT;
  }

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

/**
 * Individual frequency bar component with three animated layers: bar, cap, and glow.
 * Uses transform-based animations (scale/translate) instead of height changes for better performance.
 */
const EqualizerBar: React.FC<{
  barId: string;
  frequencyRanges: readonly (readonly [number, number])[];
  barWidth: number;
}> = ({ barId, frequencyRanges, barWidth }) => {
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

  // Separate timing for glow - always fast and reactive!
  const getGlowTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;

    return {
      duration: 100, // Fixed fast duration - no slow decay for more energy!
      easing: "ease-out" as const,
      targetHeight,
    };
  }, []);

  // Main bar animations - uses scaleY instead of height for GPU acceleration
  // Transform animations trigger composite layer, avoiding layout/paint on every frame
  const animations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);
        const scale = targetHeight / BASE_HEIGHT;

        return {
          // scaleY avoids layout recalculation (much faster than animating height property)
          keyframes: [{ transform: `scaleY(${scale})` }],
          options: { duration, easing, fill: "forwards" },
        };
      },
    }),
    [getAnimationTiming],
  );

  // Cap animations - the small element that sits on top of each bar
  // Uses translateY to move with the bar height (also GPU-accelerated)...
  // border-radius is stretched under transform... hence why this hack is needed...
  const capAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);
        const translateY = -(targetHeight - BASE_HEIGHT);

        return {
          // translateY keeps cap positioned at top of scaled bar
          keyframes: [{ transform: `translateY(${translateY}px)` }],
          options: { duration, easing, fill: "forwards" },
        };
      },
    }),
    [getAnimationTiming],
  );

  // Glow layer animations - adds visual depth with blurred background effect
  // Uses separate timing for more energetic/jumpy behavior
  const glowAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        // Glow uses separate timing - always fast and jumpy!
        const { duration, easing, targetHeight } = getGlowTiming(context);
        const scale = targetHeight / BASE_HEIGHT;

        // Boost the glow scale for more dramatic effect (20% bigger than bar)
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

  // Get frequency range for this bar
  const [minHz, maxHz] = index < frequencyRanges.length ? frequencyRanges[index] : [0, 0];
  const formatHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${hz}Hz`);
  const freqLabel = `${formatHz(minHz)} - ${formatHz(maxHz)}`;

  const glowSpread = barWidth * 0.25; // Glow extends 25% beyond bar on each side

  return (
    <div
      className={styles.barContainer}
      data-frequency={freqLabel}
      style={{
        position: "relative",
        width: `${barWidth}px`,
        height: `${BASE_HEIGHT + CAP_HEIGHT}px`,
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
        }}
      />
    </div>
  );
};

const MusicVisualizerDemo: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio analysis parameters (configurable via control panel)
  const [smoothing, setSmoothing] = useState(SMOOTHING_TIME_CONSTANT);
  const [dbRangeMin, setDbRangeMin] = useState(170); // 0-255 scale for min (170 = -85 dB)
  const [dbRangeMax, setDbRangeMax] = useState(245); // 0-255 scale for max (245 = -10 dB)
  const [barResponse, setBarResponse] = useState(UPDATE_INTERVAL_MS);
  const [barDecay, setBarDecay] = useState(BAR_FALL_DURATION);
  const [barDensity, setBarDensity] = useState<1 | 2 | 4>(1); // 1 = 31 bars, 2 = 62 bars, 4 = 124 bars
  const [showControls, setShowControls] = useState(false);

  // Convert 0-255 range to decibels (-255 to 0 dB)
  const minDecibels = -255 + dbRangeMin;
  const maxDecibels = -255 + dbRangeMax;

  // Get subdivided frequency ranges based on density
  const activeFrequencyRanges = useMemo(() => subdivideFrequencyRanges(barDensity), [barDensity]);
  const BAR_COUNT = activeFrequencyRanges.length;

  // Calculate bar width based on density (narrower bars for higher density)
  const barWidth = useMemo(() => {
    switch (barDensity) {
      case 1:
        return 20; // Normal - 20px
      case 2:
        return 10; // Double - 10px
      case 4:
        return 5; // Quadruple - 5px
    }
  }, [barDensity]);

  // Calculate bar width based on density (narrower bars for higher density)
  const scaledFftSize = useMemo(() => {
    switch (barDensity) {
      case 1:
        return FFT_SIZE; // Normal - 20px
      case 2:
        return FFT_SIZE * 2; // Double - 10px
      case 4:
        return FFT_SIZE * 4; // Quadruple - 5px
    }
  }, [barDensity]);

  const audioAnalyser = useAudioAnalyser();
  const engine = useAnimationEngine();

  const intervalRef = useRef<number | null>(null);

  const resetBars = useCallback(() => {
    for (let i = 0; i < BAR_COUNT; i++) {
      engine.updateEntityContext(`bar-${i}`, {
        targetHeight: BASE_HEIGHT,
        previousHeight: BASE_HEIGHT,
        barResponse,
        barDecay,
      });
    }
  }, [engine, barResponse, barDecay]);

  const handlePlay = useCallback(() => {
    audioAnalyser.loadTrack("/sample_audio_for_animation_demo.wav");
    setIsPlaying(true);
  }, [audioAnalyser]);

  const handleStop = useCallback(() => {
    audioAnalyser.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    resetBars();
  }, [audioAnalyser, resetBars]);

  const handleTrackEnd = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // DON'T resetBars() immediately - animate them down smoothly!
    // Update contexts to base height
    for (let i = 0; i < BAR_COUNT; i++) {
      const context = engine.getEntityContext(`bar-${i}`);
      const previousHeight = (context?.targetHeight as number) || BASE_HEIGHT;

      engine.updateEntityContext(`bar-${i}`, {
        targetHeight: BASE_HEIGHT,
        previousHeight,
        barResponse,
        barDecay,
      });
    }

    // Trigger smooth animations down to rest position
    const transitions = new Map(
      Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
    );
    engine.playTransitions(transitions).finally(resetBars);
  }, [engine, barResponse, barDecay, resetBars]);

  useEffect(() => {
    if (audioAnalyser.audioElement) {
      audioAnalyser.audioElement.addEventListener("ended", handleTrackEnd);
      return () => {
        audioAnalyser.audioElement?.removeEventListener("ended", handleTrackEnd);
      };
    }
  }, [audioAnalyser.audioElement, handleTrackEnd]);

  // Update audio analyser when parameters change
  useEffect(() => {
    audioAnalyser.updateConfig({
      fftSize: scaledFftSize,
      smoothing,
      minDecibels,
      maxDecibels,
    });
  }, [smoothing, dbRangeMin, dbRangeMax, audioAnalyser, minDecibels, maxDecibels, scaledFftSize]);

  // Visualization update loop - runs on interval when playing
  // Uses setInterval for timed updated with the web animation API running
  // at 60fps between the points.
  useEffect(() => {
    if (!isPlaying) return;

    const update = () => {
      const dataArray = audioAnalyser.getFrequencyData();
      if (!dataArray) return;

      // Calculate heights and update engine context directly (no state updates!)
      for (let i = 0; i < BAR_COUNT; i++) {
        const height = calculateHeight(dataArray, i, activeFrequencyRanges, scaledFftSize);
        const context = engine.getEntityContext(`bar-${i}`);
        const previousHeight = (context?.targetHeight as number) || BASE_HEIGHT;

        engine.updateEntityContext(`bar-${i}`, {
          targetHeight: height,
          previousHeight,
          barResponse,
          barDecay,
        });
      }

      // Trigger all bar animations at once via direct engine call
      const transitions = new Map(
        Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
      );
      engine.playTransitions(transitions);
    };

    // Simple interval ... animation runs at 60fps between the two points, so barResponse is simply
    // the frequency the height is looked up...
    intervalRef.current = window.setInterval(update, barResponse);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [
    isPlaying,
    audioAnalyser,
    engine,
    barResponse,
    barDecay,
    activeFrequencyRanges,
    BAR_COUNT,
    scaledFftSize,
  ]);

  const frequencyLabels = useMemo(() => {
    const labels = [];
    const indicesToShow = [
      0,
      Math.floor(BAR_COUNT * 0.25),
      Math.floor(BAR_COUNT * 0.5),
      Math.floor(BAR_COUNT * 0.75),
      BAR_COUNT - 1,
    ];

    for (const i of indicesToShow) {
      labels.push({
        index: i,
        label: calculateFrequencyLabel(i),
      });
    }
    return labels;
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.visualizerWrapper}>
        <div className={styles.visualizer}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <EqualizerBar
              key={`bar-${i}`}
              barId={`bar-${i}`}
              frequencyRanges={activeFrequencyRanges}
              barWidth={barWidth}
            />
          ))}
        </div>

        <div className={styles.frequencyLabels}>
          {frequencyLabels.map(({ index, label }) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          onClick={handlePlay}
          disabled={isPlaying}
          className={`${styles.button} ${styles.buttonPlay} ${isPlaying ? styles.buttonDisabled : ""}`}
        >
          ▶ Play
        </button>

        <button
          onClick={handleStop}
          disabled={!isPlaying}
          className={`${styles.button} ${styles.buttonStop} ${!isPlaying ? styles.buttonDisabled : ""}`}
        >
          ⏹ Stop
        </button>

        <button
          onClick={() => setShowControls(!showControls)}
          className={`${styles.button} ${styles.buttonSettings}`}
        >
          ⚙️ {showControls ? "Hide" : "Settings"}
        </button>
      </div>

      {showControls && (
        <div className={styles.controlPanel}>
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              Bar Density
              <span className={styles.controlHint}>({BAR_COUNT} bars)</span>
            </label>
            <select
              value={barDensity}
              onChange={(e) => setBarDensity(Number(e.target.value) as 1 | 2 | 4)}
              className={styles.controlSelect}
            >
              <option value={1}>Normal (31 bars)</option>
              <option value={2}>Double (62 bars)</option>
              <option value={4}>Quadruple (124 bars)</option>
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              Bar Response: {barResponse}ms
              <span className={styles.controlHint}>(how quickly bars rise)</span>
            </label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={barResponse}
              onChange={(e) => setBarResponse(Number(e.target.value))}
              className={styles.controlSlider}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              Bar Decay: {barDecay}ms
              <span className={styles.controlHint}>(how slowly bars fall)</span>
            </label>
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={barDecay}
              onChange={(e) => setBarDecay(Number(e.target.value))}
              className={styles.controlSlider}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              Smoothing: {smoothing.toFixed(2)}
              <span className={styles.controlHint}>(0 = reactive, 1 = smooth)</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={smoothing}
              onChange={(e) => setSmoothing(Number(e.target.value))}
              className={styles.controlSlider}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              Decibel Range
              <span className={styles.controlHint}>
                ({minDecibels} dB to {maxDecibels} dB)
              </span>
            </label>
            <div className={styles.dualSliderContainer}>
              <div className={styles.dualSliderTrack}>
                <div
                  className={styles.dualSliderRange}
                  style={{
                    left: `${(dbRangeMin / 255) * 100}%`,
                    right: `${((255 - dbRangeMax) / 255) * 100}%`,
                  }}
                />
              </div>
              <input
                type="range"
                min="0"
                max="255"
                step="5"
                value={dbRangeMin}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val < dbRangeMax - 10) setDbRangeMin(val);
                }}
                className={styles.dualSliderThumb}
              />
              <input
                type="range"
                min="0"
                max="255"
                step="5"
                value={dbRangeMax}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > dbRangeMin + 10) setDbRangeMax(val);
                }}
                className={styles.dualSliderThumb}
              />
            </div>
          </div>

          <button
            onClick={() => {
              setBarResponse(UPDATE_INTERVAL_MS);
              setBarDecay(BAR_FALL_DURATION);
              setSmoothing(SMOOTHING_TIME_CONSTANT);
              setDbRangeMin(170);
              setDbRangeMax(245);
              setBarDensity(1);
            }}
            className={`${styles.button} ${styles.buttonReset}`}
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
};

export const MusicVisualizerDemoWrapper: React.FC = () => {
  return (
    <AnimationEngineProvider engineId="music-visualizer-demo">
      <MusicVisualizerDemo />
    </AnimationEngineProvider>
  );
};
