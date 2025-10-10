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
  [20, 40],      // Bar 0: Deep sub-bass
  [40, 60],      // Bar 1: Sub-bass
  [60, 80],      // Bar 2: Bass
  [80, 100],     // Bar 3: Bass
  [100, 125],    // Bar 4: Bass
  [125, 150],    // Bar 5: Bass
  [150, 180],    // Bar 6: Bass
  [180, 220],    // Bar 7: Upper bass
  [220, 270],    // Bar 8: Low-mids
  [270, 330],    // Bar 9: Low-mids
  [330, 400],    // Bar 10: Low-mids
  [400, 480],    // Bar 11: Low-mids

  // Mid range - medium spacing
  [480, 570],    // Bar 12: Mids
  [570, 680],    // Bar 13: Mids
  [680, 810],    // Bar 14: Mids
  [810, 1000],   // Bar 15: Mids
  [1000, 1200],  // Bar 16: Mids
  [1200, 1500],  // Bar 17: Upper-mids
  [1500, 1800],  // Bar 18: Upper-mids
  [1800, 2200],  // Bar 19: Upper-mids
  [2200, 2700],  // Bar 20: Upper-mids
  [2700, 3300],  // Bar 21: Upper-mids

  // High range - wider spacing
  [3300, 4000],  // Bar 22: Highs
  [4000, 5000],  // Bar 23: Highs
  [5000, 6200],  // Bar 24: Highs
  [6200, 7600],  // Bar 25: Highs
  [7600, 9300],  // Bar 26: Ultra-highs
  [9300, 11500], // Bar 27: Ultra-highs
  [11500, 14000],// Bar 28: Ultra-highs
  [14000, 17000],// Bar 29: Ultra-highs
  [17000, 22000],// Bar 30: Ultra-highs
] as const;

const BAR_COUNT = FREQUENCY_RANGES.length;
const BASE_HEIGHT = 30; // Minimum height for bars (px)
const CAP_HEIGHT = 6; // Height of the cap element on top of each bar
const UPDATE_INTERVAL_MS = 150; // How often to trigger bar height animations (ms)

interface AudioAnalyserReturn {
  loadTrack: (src: string) => void;
  stop: () => void;
  getFrequencyData: () => Uint8Array | null;
  audioElement: HTMLAudioElement | null;
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

  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;

    // Create audio context and analyser node for frequency analysis (Web Audio API)
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();

    // FFT (Fast Fourier Transform) size determines frequency resolution
    // 2048 samples gives us 1024 frequency bins (frequencyBinCount = fftSize / 2)
    analyserRef.current.fftSize = 2048;

    // Smoothing averages frequency data over time (0-1, where 0 = no smoothing)
    analyserRef.current.smoothingTimeConstant = 0.3;

    // Set decibel range for normalization (quietest to loudest)
    analyserRef.current.minDecibels = -90;
    analyserRef.current.maxDecibels = -10;

    // Create byte array to hold frequency data (values 0-255 for each frequency bin)
    const bufferLength = analyserRef.current.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);
  }, []);

  const loadTrack = useCallback(
    (src: string) => {
      initAudioContext();

      // Clean up previous audio element
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }

      // Create new audio element and set source
      const audio = new Audio();
      audio.src = src;
      audioElementRef.current = audio;

      // Disconnect old audio source if it exists
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }

      // Wire up the audio pipeline: Audio Element -> Analyser -> Speakers
      // This allows us to analyze the audio while it plays
      sourceRef.current = audioContextRef.current!.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(audioContextRef.current!.destination);

      audio.play();
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
    return '';
  }

  const [minHz] = FREQUENCY_RANGES[barIndex];

  if (minHz < 1000) {
    return `${Math.round(minHz)}Hz`;
  }
  return `${(minHz / 1000).toFixed(1)}k`;
}

/**
 * Calculates the height for a single bar based on frequency data.
 * Uses explicit frequency ranges with average aggregation for smooth visualization.
 */
function calculateHeight(dataArray: Uint8Array, barIndex: number): number {
  const sampleRate = 44100;
  const fftSize = 2048;
  const hzPerBin = (sampleRate / 2) / (fftSize / 2);

  if (barIndex >= FREQUENCY_RANGES.length) {
    return BASE_HEIGHT;
  }

  const [minHz, maxHz] = FREQUENCY_RANGES[barIndex];
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
const EqualizerBar: React.FC<{ barId: string }> = ({ barId }) => {
  const getAnimationTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;
    const previousHeight = (context.previousHeight as number) || BASE_HEIGHT;
    const isRising = targetHeight > previousHeight;

    return {
      duration: isRising ? 100 : 2000,
      easing: isRising ? ("ease-out" as const) : ("ease-in-out" as const),
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
  // Uses translateY to move with the bar height (also GPU-accelerated)
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

  return (
    <div
      style={{
        position: "relative",
        width: "20px",
        marginRight: "3px",
        height: `${BASE_HEIGHT + CAP_HEIGHT}px`,
      }}
    >
      <div
        ref={createAnimationRef("glow", glowAnimations)}
        style={{
          position: "absolute",
          bottom: "0",
          left: "-5px",
          right: "-5px",
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
          width: "20px",
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
          width: "20px",
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

  const audioAnalyser = useAudioAnalyser();
  const engine = useAnimationEngine();

  const intervalRef = useRef<number | null>(null);

  const resetBars = useCallback(() => {
    for (let i = 0; i < BAR_COUNT; i++) {
      engine.updateEntityContext(`bar-${i}`, {
        targetHeight: BASE_HEIGHT,
        previousHeight: BASE_HEIGHT,
      });
    }
  }, [engine]);

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
      });
    }

    // Trigger smooth animations down to rest position
    const transitions = new Map(
      Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
    );
    engine.playTransitions(transitions).finally(resetBars);
  }, [engine]);

  useEffect(() => {
    if (audioAnalyser.audioElement) {
      audioAnalyser.audioElement.addEventListener("ended", handleTrackEnd);
      return () => {
        audioAnalyser.audioElement?.removeEventListener("ended", handleTrackEnd);
      };
    }
  }, [audioAnalyser.audioElement, handleTrackEnd]);

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
        const height = calculateHeight(dataArray, i);
        const context = engine.getEntityContext(`bar-${i}`);
        const previousHeight = (context?.targetHeight as number) || BASE_HEIGHT;

        engine.updateEntityContext(`bar-${i}`, {
          targetHeight: height,
          previousHeight,
        });
      }

      // Trigger all bar animations at once via direct engine call
      const transitions = new Map(
        Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
      );
      engine.playTransitions(transitions);
    };

    // Simple interval ... animation runs at 60fps between the two points, so 100ms is simply
    // the frequency the height is looked up...
    intervalRef.current = window.setInterval(update, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, audioAnalyser, engine]);

  const frequencyLabels = useMemo(() => {
    const labels = [];
    const indicesToShow = [
      0,
      Math.floor(BAR_COUNT * 0.25),
      Math.floor(BAR_COUNT * 0.5),
      Math.floor(BAR_COUNT * 0.75),
      BAR_COUNT - 1
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
      <div className={styles.controls}>
        <button
          onClick={handlePlay}
          disabled={isPlaying}
          className={`${styles.button} ${styles.buttonPrimary} ${isPlaying ? styles.buttonDisabled : ""}`}
        >
          ▶ Play
        </button>

        {isPlaying && (
          <button onClick={handleStop} className={`${styles.button} ${styles.buttonStop}`}>
            ⏹ Stop
          </button>
        )}

        <div className={styles.statusIndicator}>
          <span className={isPlaying ? styles.statusText : styles.statusTextInactive}>
            {isPlaying ? "● Live" : "○ Ready"}
          </span>
        </div>
      </div>

      <div className={styles.visualizerWrapper}>
        <div className={styles.visualizer}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <EqualizerBar key={`bar-${i}`} barId={`bar-${i}`} />
          ))}
        </div>

        <div className={styles.frequencyLabels}>
          {frequencyLabels.map(({ index, label }) => (
            <span key={index}>{label}</span>
          ))}
        </div>

        {isPlaying && audioAnalyser.audioElement && (
          <div className={styles.audioControls}>
            <audio controls />
          </div>
        )}
      </div>
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
