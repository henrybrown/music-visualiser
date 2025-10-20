import { useRef, useCallback } from "react";

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_SMOOTHING_TIME_CONSTANT = 0.3;
const DEFAULT_MIN_DECIBELS = -100;
const DEFAULT_MAX_DECIBELS = 0;

const EQ_BANDS = [
  { freq: 60, Q: 0.7 },
  { freq: 250, Q: 0.7 },
  { freq: 1000, Q: 0.7 },
  { freq: 4000, Q: 0.7 },
  { freq: 12000, Q: 0.7 },
] as const;

export const EQ_BAND_COUNT = EQ_BANDS.length;

interface AudioAnalyserConfig {
  fftSize: number;
  smoothing: number;
  minDecibels: number;
  maxDecibels: number;
}

interface AudioAnalyserReturn {
  loadTrack: (src: string) => Promise<void>;
  stop: () => void;
  getFrequencyData: () => Uint8Array | null;
  audioElement: HTMLAudioElement | null;
  updateConfig: (config: AudioAnalyserConfig) => void;
  updateEQGains: (gains: number[]) => void;
  initEQFilters: () => void;
}

/**
 * React hook that manages Web Audio API analyser node for real-time FFT analysis.
 *
 * Provides methods to:
 * - Load and play audio tracks
 * - Configure FFT parameters (size, smoothing, dB range)
 * - Apply 5-band parametric EQ
 * - Retrieve frequency data for visualization
 *
 * @returns Audio analyser interface with load/stop/config methods
 */
export function useAudioAnalyser(): AudioAnalyserReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const currentConfigRef = useRef<AudioAnalyserConfig>({
    fftSize: DEFAULT_FFT_SIZE,
    smoothing: DEFAULT_SMOOTHING_TIME_CONSTANT,
    minDecibels: DEFAULT_MIN_DECIBELS,
    maxDecibels: DEFAULT_MAX_DECIBELS,
  });

  const initAudioContext = useCallback((config: AudioAnalyserConfig) => {
    // Create audio context if it doesn't exist
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE });
    }

    // Check if we need to recreate the analyser
    const needsRecreate =
      !analyserRef.current || currentConfigRef.current.fftSize !== config.fftSize;

    if (needsRecreate) {
      // Disconnect old analyser if it exists
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      // Disconnect source from old analyser
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      // Create new analyser with new FFT size
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = config.fftSize;
      analyserRef.current.smoothingTimeConstant = config.smoothing;
      analyserRef.current.minDecibels = config.minDecibels;
      analyserRef.current.maxDecibels = config.maxDecibels;

      // Recreate data array with correct size
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      // Reconnect source if it exists
      if (sourceRef.current && audioContextRef.current) {
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
    } else {
      // Just update parameters without recreating
      if (analyserRef.current) {
        analyserRef.current.smoothingTimeConstant = config.smoothing;
        analyserRef.current.minDecibels = config.minDecibels;
        analyserRef.current.maxDecibels = config.maxDecibels;
      }
    }

    currentConfigRef.current = config;
  }, []);

  const updateConfig = useCallback(
    (config: AudioAnalyserConfig) => {
      initAudioContext(config);
    },
    [initAudioContext],
  );

  const initEQFilters = useCallback(() => {
    if (!audioContextRef.current) return;

    eqFiltersRef.current.forEach((filter) => filter.disconnect());
    eqFiltersRef.current = [];

    for (const band of EQ_BANDS) {
      const filter = audioContextRef.current.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = band.freq;
      filter.Q.value = band.Q;
      filter.gain.value = 0;
      eqFiltersRef.current.push(filter);
    }

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

  const updateEQGains = useCallback((gains: number[]) => {
    eqFiltersRef.current.forEach((filter, index) => {
      if (gains[index] !== undefined) {
        filter.gain.value = gains[index];
      }
    });
  }, []);

  const loadTrack = useCallback(
    async (src: string) => {
      try {
        initAudioContext(currentConfigRef.current);

        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }

        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.src = "";
          audioElementRef.current.load();
          audioElementRef.current = null;
        }

        const audio = new Audio();
        audio.src = src;
        audio.volume = 1.0;
        audioElementRef.current = audio;

        audio.addEventListener("error", (e) => {
          const error = audio.error;
          const errorMessage = error
            ? `Audio error (code ${error.code}): ${error.message}`
            : 'Unknown audio loading error';
          throw new Error(errorMessage);
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

        await audio.play();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load audio track';
        console.error('Audio loading error:', errorMessage);
        throw new Error(errorMessage);
      }
    },
    [initAudioContext],
  );

  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    eqFiltersRef.current.forEach((filter) => filter.disconnect());

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = "";
      audioElementRef.current.load();
      audioElementRef.current = null;
    }
  }, []);

  const getFrequencyData = (): Uint8Array | null => {
    if (!analyserRef.current || !dataArrayRef.current) return null;

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return dataArrayRef.current;
  };

  return {
    loadTrack,
    stop,
    getFrequencyData,
    audioElement: audioElementRef.current,
    updateConfig,
    updateEQGains,
    initEQFilters,
  };
}
