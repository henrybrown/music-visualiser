import { useRef, useCallback } from "react";
import type { EQControlNode } from "./equalizer-components";

const FFT_SIZE = 2048;
const SAMPLE_RATE = 44100;
const SMOOTHING_TIME_CONSTANT = 0.3;
const MIN_DECIBELS = -100;
const MAX_DECIBELS = 0;

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
  updateEQFilters: (
    controlNodes: EQControlNode[],
    frequencyRanges: readonly (readonly [number, number])[],
  ) => void;
  initEQFilters: (frequencyRanges: readonly (readonly [number, number])[]) => void;
}

export function useAudioAnalyser(): AudioAnalyserReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const currentConfigRef = useRef<AudioAnalyserConfig>({
    fftSize: FFT_SIZE,
    smoothing: SMOOTHING_TIME_CONSTANT,
    minDecibels: MIN_DECIBELS,
    maxDecibels: MAX_DECIBELS,
  });

  const initAudioContext = useCallback((config: AudioAnalyserConfig) => {
    if (audioContextRef.current && currentConfigRef.current.fftSize === config.fftSize) {
      if (analyserRef.current) {
        analyserRef.current.smoothingTimeConstant = config.smoothing;
        analyserRef.current.minDecibels = config.minDecibels;
        analyserRef.current.maxDecibels = config.maxDecibels;
      }
      currentConfigRef.current = config;
      return;
    }

    if (audioContextRef.current && currentConfigRef.current.fftSize !== config.fftSize) {
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
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
    },
    [initAudioContext],
  );

  const loadTrack = useCallback(
    async (src: string) => {
      initAudioContext(currentConfigRef.current);

      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }

      const audio = new Audio();
      audio.src = src;
      audio.volume = 1.0;
      audioElementRef.current = audio;

      audio.addEventListener("error", (e) => {
        console.error("Audio loading error:", e);
      });

      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }

      sourceRef.current = audioContextRef.current!.createMediaElementSource(audio);

      if (eqFiltersRef.current.length > 0) {
        sourceRef.current.connect(eqFiltersRef.current[0]);

        for (let i = 0; i < eqFiltersRef.current.length - 1; i++) {
          eqFiltersRef.current[i].connect(eqFiltersRef.current[i + 1]);
        }

        eqFiltersRef.current[eqFiltersRef.current.length - 1].connect(analyserRef.current!);
      } else {
        sourceRef.current.connect(analyserRef.current!);
      }

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

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return dataArrayRef.current;
  }, []);

  const initEQFilters = useCallback((frequencyRanges: readonly (readonly [number, number])[]) => {
    if (!audioContextRef.current) return;

    // Disconnect old filters
    eqFiltersRef.current.forEach((filter) => filter.disconnect());
    eqFiltersRef.current = [];

    // Create new filters
    for (let i = 0; i < frequencyRanges.length; i++) {
      const filter = audioContextRef.current.createBiquadFilter();
      filter.type = "peaking";

      // Use the average of the frequency range
      const [minHz, maxHz] = frequencyRanges[i];
      const freq = (minHz + maxHz) / 2;
      filter.frequency.value = freq;

      filter.Q.value = 1.0;
      filter.gain.value = 0;

      eqFiltersRef.current.push(filter);
    }

    // Reconnect the audio chain if source exists
    if (sourceRef.current && analyserRef.current) {
      sourceRef.current.disconnect();

      if (eqFiltersRef.current.length > 0) {
        sourceRef.current.connect(eqFiltersRef.current[0]);

        for (let i = 0; i < eqFiltersRef.current.length - 1; i++) {
          eqFiltersRef.current[i].connect(eqFiltersRef.current[i + 1]);
        }

        eqFiltersRef.current[eqFiltersRef.current.length - 1].connect(analyserRef.current);
      } else {
        sourceRef.current.connect(analyserRef.current);
      }

      analyserRef.current.connect(audioContextRef.current.destination);
    }
  }, []);

  const updateEQFilters = useCallback(
    (controlNodes: EQControlNode[], frequencyRanges: readonly (readonly [number, number])[]) => {
      if (eqFiltersRef.current.length !== frequencyRanges.length) {
        initEQFilters(frequencyRanges);
      }

      if (controlNodes.length === 0) {
        eqFiltersRef.current.forEach((filter) => {
          filter.gain.value = 0;
        });
        return;
      }

      const sortedNodes = [...controlNodes].sort((a, b) => a.barIndex - b.barIndex);

      eqFiltersRef.current.forEach((filter, barIndex) => {
        let lowerNode = sortedNodes[0];
        let upperNode = sortedNodes[sortedNodes.length - 1];

        for (let i = 0; i < sortedNodes.length - 1; i++) {
          if (barIndex >= sortedNodes[i].barIndex && barIndex <= sortedNodes[i + 1].barIndex) {
            lowerNode = sortedNodes[i];
            upperNode = sortedNodes[i + 1];
            break;
          }
        }

        const range = upperNode.barIndex - lowerNode.barIndex;
        const t = range === 0 ? 0 : (barIndex - lowerNode.barIndex) / range;

        const interpolatedGain = lowerNode.gain + t * (upperNode.gain - lowerNode.gain);

        filter.gain.value = interpolatedGain;
      });
    },
    [initEQFilters],
  );

  return {
    loadTrack,
    stop,
    getFrequencyData,
    audioElement: audioElementRef.current,
    updateConfig,
    updateEQFilters,
    initEQFilters,
  };
}
