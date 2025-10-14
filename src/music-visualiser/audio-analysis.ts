import { useRef, useCallback } from "react";

const FFT_SIZE = 2048;
const SAMPLE_RATE = 44100;
const SMOOTHING_TIME_CONSTANT = 0.3;
const MIN_DECIBELS = -100;
const MAX_DECIBELS = 0;

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
  loadTrack: (src: string) => void;
  stop: () => void;
  getFrequencyData: () => Uint8Array | null;
  audioElement: HTMLAudioElement | null;
  updateConfig: (config: AudioAnalyserConfig) => void;
  updateEQGains: (gains: number[]) => void;
  initEQFilters: () => void;
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

    eqFiltersRef.current.forEach((filter) => filter.disconnect());

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = "";
      audioElementRef.current.load();
      audioElementRef.current = null;
    }
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current || !dataArrayRef.current) return null;

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    return dataArrayRef.current;
  }, []);

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
