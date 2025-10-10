import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { AnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";

// Visualizer constants
const BAR_COUNT = 24; // Number of frequency bars to display
const BASE_HEIGHT = 30; // Minimum height for bars (px)
const CAP_HEIGHT = 6; // Height of the cap element on top of each bar
const UPDATE_INTERVAL_MS = 50; // How often to trigger bar height animations (ms)

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
    // 256 samples gives us 128 frequency bins (frequencyBinCount = fftSize / 2)
    analyserRef.current.fftSize = 256;

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
 * Uses logarithmic scaling since human hearing perceives frequencies logarithmically.
 *
 * @param barIndex - The bar's position (0 to totalBars-1)
 * @param totalBars - Total number of bars in the visualizer
 * @param sampleRate - Audio sample rate (default 44.1kHz)
 * @returns Formatted frequency label (e.g., "120Hz" or "2.5k")
 */
function calculateFrequencyLabel(
  barIndex: number,
  totalBars: number,
  sampleRate: number = 44100,
): string {
  // Nyquist frequency: maximum frequency we can represent (half the sample rate)
  const nyquist = sampleRate / 2;

  // Only use 60% of nyquist to focus on audible/interesting frequencies
  const usefulRange = nyquist * 0.6;

  // Logarithmic mapping: lower bars get more resolution in bass frequencies
  const logIndex = Math.pow(barIndex / totalBars, 2.0);
  const freq = logIndex * usefulRange;

  if (freq < 1000) return `${Math.round(freq)}Hz`;
  return `${(freq / 1000).toFixed(1)}k`;
}

/**
 * Calculates the height for a single bar based on frequency data.
 * Uses logarithmic frequency mapping for natural-looking visualization.
 */
function calculateHeight(dataArray: Uint8Array, barIndex: number): number {
  const totalBins = dataArray.length; // Total frequency bins from FFT
  const usefulBins = Math.floor(totalBins * 0.6); // Focus on lower 60% of frequencies

  // Map each bar to a range of frequency bins using logarithmic scaling
  // This gives more resolution to bass/mid frequencies (which are more perceptually important)
  const logIndex = Math.pow(barIndex / BAR_COUNT, 2.0);
  const startBin = Math.floor(logIndex * usefulBins);
  const nextLogIndex = Math.pow((barIndex + 1) / BAR_COUNT, 2.0);
  const endBin = Math.floor(nextLogIndex * usefulBins);

  // Calculate average and max values for this bar's frequency range
  let sum = 0;
  let count = 0;
  let max = 0;

  for (let i = startBin; i < endBin && i < usefulBins; i++) {
    const value = dataArray[i];
    sum += value;
    max = Math.max(max, value);
    count++;
  }

  const average = count > 0 ? sum / count : 0;

  // Use max for bass (first half of bars) for punchier response
  // Use average for higher frequencies for smoother visualization
  const value = barIndex < 12 ? max : average;

  // Normalize (0-1) and apply power curve for better visual scaling
  const normalized = value / 255;
  const scaled = Math.pow(normalized, 1.1);

  // Convert to pixel height with minimum of BASE_HEIGHT
  return Math.max(30, scaled * 300);
}

/**
 * Individual frequency bar component with three animated layers: bar, cap, and glow.
 * Uses transform-based animations (scale/translate) instead of height changes for better performance.
 */
const EqualizerBar: React.FC<{ barId: string }> = ({ barId }) => {
  const getAnimationTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight =
      (context.targetHeight as number) || (context.previousHeight as number) || BASE_HEIGHT;
    const previousHeight = (context.previousHeight as number) || BASE_HEIGHT;
    const isRising = targetHeight >= previousHeight;

    // Fast rise (50ms) for snappy response to beats
    // Slower fall (300ms) for smooth decay
    return {
      duration: isRising ? 10 : 500,
      easing: isRising ? ("ease-out" as const) : ("ease-in-out" as const),
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
  const glowAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);
        const scale = targetHeight / BASE_HEIGHT;

        return {
          keyframes: [{ transform: `scaleY(${scale})` }],
          options: { duration, easing, fill: "forwards" },
        };
      },
    }),
    [getAnimationTiming],
  );

  const { createAnimationRef } = useAnimationRegistration(barId, {
    targetHeight: BASE_HEIGHT,
    previousHeight: BASE_HEIGHT,
  });

  const index = parseInt(barId.split("-")[1]);
  const hue = ((10 + index * 30) / 720) * 360;

  return (
    <div
      style={{
        position: "relative",
        width: "26px",
        marginRight: "4px",
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
          width: "26px",
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
          width: "26px",
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
    resetBars();
  }, [resetBars]);

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

    // Simple interval - no requestAnimationFrame needed since we throttle to 100ms anyway
    intervalRef.current = window.setInterval(update, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, audioAnalyser, engine]);

  const frequencyLabels = useMemo(() => {
    const labels = [];
    const indicesToShow = [0, 6, 12, 18, 23];
    for (const i of indicesToShow) {
      labels.push({
        index: i,
        label: calculateFrequencyLabel(i, BAR_COUNT),
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
