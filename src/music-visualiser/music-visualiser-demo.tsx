// music-visualiser-demo.tsx
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { useAnimationRegistration } from "../../gameplay/animations/use-animation-registration";
import type { AnimationDefinition } from "../../gameplay/animations/animation-types";
import styles from "./music-visualiser-demo.module.css";

const FREQUENCY_RANGES = [
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
  [100, 125],
  [125, 150],
  [150, 180],
  [180, 220],
  [220, 270],
  [270, 330],
  [330, 400],
  [400, 480],
  [480, 570],
  [570, 680],
  [680, 810],
  [810, 1000],
  [1000, 1200],
  [1200, 1500],
  [1500, 1800],
  [1800, 2200],
  [2200, 2700],
  [2700, 3300],
  [3300, 4000],
  [4000, 5000],
  [5000, 6200],
  [6200, 7600],
  [7600, 9300],
  [9300, 11500],
  [11500, 14000],
  [14000, 17000],
  [17000, 22000],
] as const;

const FFT_SIZE = 2048;
const SAMPLE_RATE = 44100;
const SMOOTHING_TIME_CONSTANT = 0.3;
const MIN_DECIBELS = -100;
const MAX_DECIBELS = 0;
const BASE_HEIGHT = 30;
const CAP_HEIGHT = 6;
const UPDATE_INTERVAL_MS = 150;
const BAR_FALL_DURATION = 2000;
const MIN_GAIN = -12;
const MAX_GAIN = 12;

interface EQControlNode {
  barIndex: number;
  gain: number;
}

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
  initEQFilters: (frequencyRanges: readonly (readonly [number, number])[]) => void;
  updateEQFilters: (
    nodes: EQControlNode[],
    frequencyRanges: readonly (readonly [number, number])[],
  ) => void;
}

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

function calculateBarPositions(
  containerWidth: number,
  barWidth: number,
  barCount: number,
  gap: number,
): number[] {
  const totalBarsWidth = barWidth * barCount + gap * (barCount - 1);
  const offset = (containerWidth - totalBarsWidth) / 2;

  return Array.from({ length: barCount }, (_, i) => {
    return offset + barWidth / 2 + (barWidth + gap) * i;
  });
}

function getDefaultEQNodes(totalBars: number): EQControlNode[] {
  return [
    { barIndex: Math.floor(totalBars * 0.1), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.3), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.5), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.7), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.9), gain: 0 },
  ];
}

function useAudioAnalyser(): AudioAnalyserReturn {
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

      if (sourceRef.current && analyserRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current!.destination);
      }
    },
    [initAudioContext],
  );

  const initEQFilters = useCallback(
    (frequencyRanges: readonly (readonly [number, number])[]) => {
      if (!audioContextRef.current) {
        initAudioContext(currentConfigRef.current);
      }

      eqFiltersRef.current.forEach((filter) => filter.disconnect());
      eqFiltersRef.current = [];

      const defaultNodes = getDefaultEQNodes(frequencyRanges.length);

      for (const node of defaultNodes) {
        const filter = audioContextRef.current!.createBiquadFilter();
        filter.type = "peaking";
        const [minHz, maxHz] = frequencyRanges[node.barIndex];
        filter.frequency.value = (minHz + maxHz) / 2;
        filter.Q.value = 1.0;
        filter.gain.value = 0;
        eqFiltersRef.current.push(filter);
      }
    },
    [initAudioContext],
  );

  const updateEQFilters = useCallback(
    (nodes: EQControlNode[], frequencyRanges: readonly (readonly [number, number])[]) => {
      if (eqFiltersRef.current.length === 0) return;
      if (nodes.length === 0) return;

      nodes.forEach((node, index) => {
        if (index < eqFiltersRef.current.length) {
          const filter = eqFiltersRef.current[index];
          const [minHz, maxHz] = frequencyRanges[node.barIndex];
          filter.frequency.value = (minHz + maxHz) / 2;
          filter.gain.value = node.gain;
        }
      });
    },
    [],
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

  return {
    loadTrack,
    stop,
    getFrequencyData,
    audioElement: audioElementRef.current,
    updateConfig,
    initEQFilters,
    updateEQFilters,
  };
}

function calculateFrequencyLabel(
  barIndex: number,
  frequencyRanges: readonly (readonly [number, number])[],
): string {
  if (barIndex >= frequencyRanges.length) {
    return "";
  }

  const [minHz] = frequencyRanges[barIndex];

  if (minHz < 1000) {
    return `${Math.round(minHz)}Hz`;
  }
  return `${(minHz / 1000).toFixed(1)}kHz`;
}

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

  const getGlowTiming = useCallback((context: Record<string, unknown>) => {
    const targetHeight = (context.targetHeight as number) || BASE_HEIGHT;

    return {
      duration: 100,
      easing: "ease-out" as const,
      targetHeight,
    };
  }, []);

  const animations: Record<string, AnimationDefinition> = useMemo(
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

  const capAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getAnimationTiming(context);
        const translateY = -(targetHeight - BASE_HEIGHT);

        return {
          keyframes: [{ transform: `translateY(${translateY}px)` }],
          options: { duration, easing, fill: "forwards" },
        };
      },
    }),
    [getAnimationTiming],
  );

  const glowAnimations: Record<string, AnimationDefinition> = useMemo(
    () => ({
      updateHeight: (context: Record<string, unknown>) => {
        const { duration, easing, targetHeight } = getGlowTiming(context);
        const scale = targetHeight / BASE_HEIGHT;
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

  const [minHz, maxHz] = index < frequencyRanges.length ? frequencyRanges[index] : [0, 0];
  const formatHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${hz}Hz`);
  const freqLabel = `${formatHz(minHz)} - ${formatHz(maxHz)}`;

  const glowSpread = barWidth * 0.25;

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

const EQOverlay: React.FC<{
  controlNodes: EQControlNode[];
  onNodesChange: (nodes: EQControlNode[]) => void;
  containerHeight: number;
  barWidth: number;
  barCount: number;
  frequencyRanges: readonly (readonly [number, number])[];
}> = ({ controlNodes, onNodesChange, containerHeight, barWidth, barCount, frequencyRanges }) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const containerWidth = svgRef.current?.clientWidth || 800;

  const barPositions = useMemo(() => {
    return calculateBarPositions(containerWidth, barWidth, barCount, 3);
  }, [containerWidth, barWidth, barCount]);

  const interpolatedNodes = useMemo(() => {
    if (controlNodes.length === 0) return [];

    const sortedNodes = [...controlNodes].sort((a, b) => a.barIndex - b.barIndex);
    const nodes: { barIndex: number; gain: number }[] = [];

    for (let barIndex = 0; barIndex < barCount; barIndex++) {
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
      const gain = lowerNode.gain + t * (upperNode.gain - lowerNode.gain);

      nodes.push({ barIndex, gain });
    }

    return nodes;
  }, [controlNodes, barCount]);

  const gainToY = useCallback(
    (gain: number): number => {
      return ((MAX_GAIN - gain) / (MAX_GAIN - MIN_GAIN)) * containerHeight;
    },
    [containerHeight],
  );

  const yToGain = useCallback(
    (y: number): number => {
      return MAX_GAIN - (y / containerHeight) * (MAX_GAIN - MIN_GAIN);
    },
    [containerHeight],
  );

  const xToBarIndex = useCallback(
    (x: number): number => {
      let closestIndex = 0;
      let minDist = Math.abs(x - barPositions[0]);

      for (let i = 1; i < barPositions.length; i++) {
        const dist = Math.abs(x - barPositions[i]);
        if (dist < minDist) {
          minDist = dist;
          closestIndex = i;
        }
      }

      return closestIndex;
    },
    [barPositions],
  );

  const generateCurvePath = useMemo(() => {
    if (controlNodes.length === 0) return "";

    const sortedNodes = [...controlNodes].sort((a, b) => a.barIndex - b.barIndex);

    const points = sortedNodes.map((node) => ({
      x: barPositions[node.barIndex] || 0,
      y: gainToY(node.gain),
    }));

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;

      path += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
      path += ` Q ${next.x} ${next.y}, ${next.x} ${next.y}`;
    }

    return path;
  }, [controlNodes, barPositions, gainToY]);

  const handleMouseDown = useCallback((index: number) => {
    setDraggingIndex(index);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (draggingIndex === null || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const snappedBarIndex = xToBarIndex(x);
      const newGain = Math.max(MIN_GAIN, Math.min(yToGain(y), MAX_GAIN));

      const isOccupiedByOtherNode = controlNodes.some(
        (node, idx) => idx !== draggingIndex && node.barIndex === snappedBarIndex,
      );

      if (isOccupiedByOtherNode) return;

      const updatedNodes = [...controlNodes];
      updatedNodes[draggingIndex] = {
        barIndex: snappedBarIndex,
        gain: Math.round(newGain * 10) / 10,
      };

      onNodesChange(updatedNodes);
    },
    [draggingIndex, controlNodes, onNodesChange, xToBarIndex, yToGain],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  useEffect(() => {
    if (draggingIndex !== null) {
      const handleGlobalMouseUp = () => setDraggingIndex(null);
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
    }
  }, [draggingIndex]);

  const zeroLineY = gainToY(0);

  const formatFrequency = (barIndex: number): string => {
    if (barIndex >= frequencyRanges.length) return "";
    const [minHz, maxHz] = frequencyRanges[barIndex];
    const avgHz = (minHz + maxHz) / 2;
    return avgHz >= 1000 ? `${(avgHz / 1000).toFixed(1)}kHz` : `${Math.round(avgHz)}Hz`;
  };

  const formatGain = (gain: number): string => {
    return `${gain >= 0 ? "+" : ""}${gain.toFixed(1)}dB`;
  };

  return (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 10002,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <line
        x1="0"
        y1={zeroLineY}
        x2="100%"
        y2={zeroLineY}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {generateCurvePath && (
        <path
          d={generateCurvePath}
          fill="none"
          stroke="rgba(59, 130, 246, 0.6)"
          strokeWidth="2"
          style={{ pointerEvents: "none" }}
        />
      )}

      {interpolatedNodes.map((node) => {
        const isControlNode = controlNodes.some((cn) => cn.barIndex === node.barIndex);
        if (isControlNode) return null;

        const x = barPositions[node.barIndex] || 0;
        const y = gainToY(node.gain);

        return (
          <circle
            key={node.barIndex}
            cx={x}
            cy={y}
            r={2}
            fill="rgba(59, 130, 246, 0.4)"
            style={{ pointerEvents: "none" }}
          />
        );
      })}

      {controlNodes.map((node, index) => {
        const x = barPositions[node.barIndex] || 0;
        const y = gainToY(node.gain);
        const isDragging = draggingIndex === index;

        return (
          <g key={index}>
            <line
              x1={x}
              y1="0"
              x2={x}
              y2="100%"
              stroke={isDragging ? "rgba(59, 130, 246, 0.4)" : "rgba(59, 130, 246, 0.2)"}
              strokeWidth={isDragging ? "2" : "1"}
              strokeDasharray="2 2"
              style={{ pointerEvents: "none" }}
            />

            <circle
              cx={x}
              cy={y}
              r={isDragging ? 10 : 8}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="2"
              style={{
                cursor: "grab",
                pointerEvents: "auto",
                filter: isDragging
                  ? "drop-shadow(0 6px 16px rgba(59, 130, 246, 1))"
                  : "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))",
                transition: isDragging ? "none" : "filter 0.15s ease",
              }}
              onMouseDown={() => handleMouseDown(index)}
            />

            {isDragging && (
              <text
                x={x}
                y={y - 20}
                fill="#ffffff"
                fontSize="12"
                fontWeight="600"
                fontFamily="Monaco, Courier New, monospace"
                textAnchor="middle"
                style={{
                  pointerEvents: "none",
                  filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))",
                }}
              >
                {formatFrequency(node.barIndex)} | {formatGain(node.gain)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const MusicVisualizerDemo: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [smoothing, setSmoothing] = useState(SMOOTHING_TIME_CONSTANT);
  const [dbRangeMin, setDbRangeMin] = useState(170);
  const [dbRangeMax, setDbRangeMax] = useState(245);
  const [barResponse, setBarResponse] = useState(UPDATE_INTERVAL_MS);
  const [barDecay, setBarDecay] = useState(BAR_FALL_DURATION);
  const [barDensity, setBarDensity] = useState<1 | 2 | 4>(1);
  const [showControls, setShowControls] = useState(false);
  const [showEQ, setShowEQ] = useState(true);
  const [eqControlNodes, setEqControlNodes] = useState<EQControlNode[]>([]);

  const minDecibels = -255 + dbRangeMin;
  const maxDecibels = -255 + dbRangeMax;

  const activeFrequencyRanges = useMemo(() => subdivideFrequencyRanges(barDensity), [barDensity]);
  const BAR_COUNT = activeFrequencyRanges.length;

  const barWidth = useMemo(() => {
    switch (barDensity) {
      case 1:
        return 20;
      case 2:
        return 10;
      case 4:
        return 5;
    }
  }, [barDensity]);

  const scaledFftSize = useMemo(() => {
    switch (barDensity) {
      case 1:
        return FFT_SIZE;
      case 2:
        return FFT_SIZE * 2;
      case 4:
        return FFT_SIZE * 4;
    }
  }, [barDensity]);

  useEffect(() => {
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

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
  }, [engine, BAR_COUNT, barResponse, barDecay]);

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

    const transitions = new Map(
      Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
    );
    engine.playTransitions(transitions).finally(resetBars);
  }, [engine, BAR_COUNT, barResponse, barDecay, resetBars]);

  useEffect(() => {
    if (audioAnalyser.audioElement) {
      audioAnalyser.audioElement.addEventListener("ended", handleTrackEnd);
      return () => {
        audioAnalyser.audioElement?.removeEventListener("ended", handleTrackEnd);
      };
    }
  }, [audioAnalyser.audioElement, handleTrackEnd]);

  useEffect(() => {
    audioAnalyser.updateConfig({
      fftSize: scaledFftSize,
      smoothing,
      minDecibels,
      maxDecibels,
    });
  }, [smoothing, dbRangeMin, dbRangeMax, audioAnalyser, minDecibels, maxDecibels, scaledFftSize]);

  useEffect(() => {
    audioAnalyser.initEQFilters(activeFrequencyRanges);
  }, [activeFrequencyRanges, audioAnalyser]);

  useEffect(() => {
    audioAnalyser.updateEQFilters(eqControlNodes, activeFrequencyRanges);
  }, [eqControlNodes, activeFrequencyRanges, audioAnalyser]);

  useEffect(() => {
    if (!isPlaying) return;

    const update = () => {
      const dataArray = audioAnalyser.getFrequencyData();
      if (!dataArray) return;

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

      const transitions = new Map(
        Array.from({ length: BAR_COUNT }).map((_, i) => [`bar-${i}`, { event: "updateHeight" }]),
      );
      engine.playTransitions(transitions);
    };

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
    const targetFrequencies = [20, 100, 500, 1000, 5000, 10000, 20000];
    const labels = [];

    for (const targetHz of targetFrequencies) {
      let closestIndex = 0;
      let minDiff = Infinity;

      for (let i = 0; i < activeFrequencyRanges.length; i++) {
        const [minHz, maxHz] = activeFrequencyRanges[i];
        const centerHz = (minHz + maxHz) / 2;
        const diff = Math.abs(centerHz - targetHz);

        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }

      labels.push({
        index: closestIndex,
        label: calculateFrequencyLabel(closestIndex, activeFrequencyRanges),
      });
    }

    return labels;
  }, [activeFrequencyRanges]);

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

          {showEQ && (
            <EQOverlay
              controlNodes={eqControlNodes}
              onNodesChange={setEqControlNodes}
              containerHeight={380}
              barWidth={barWidth}
              barCount={BAR_COUNT}
              frequencyRanges={activeFrequencyRanges}
            />
          )}
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
          onClick={() => setShowEQ(!showEQ)}
          className={`${styles.button} ${styles.buttonEQ}`}
        >
          {showEQ ? "Hide" : "Show"} EQ
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

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>
              EQ Controls
              <span className={styles.controlHint}>(5-band parametric equalizer)</span>
            </label>
            <button
              onClick={() => setEqControlNodes(getDefaultEQNodes(BAR_COUNT))}
              className={`${styles.button} ${styles.buttonReset}`}
              style={{ marginTop: 0 }}
            >
              Reset EQ (Flat)
            </button>
          </div>

          <button
            onClick={() => {
              setBarResponse(UPDATE_INTERVAL_MS);
              setBarDecay(BAR_FALL_DURATION);
              setSmoothing(SMOOTHING_TIME_CONSTANT);
              setDbRangeMin(170);
              setDbRangeMax(245);
              setBarDensity(1);
              setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
            }}
            className={`${styles.button} ${styles.buttonReset}`}
          >
            Reset All to Defaults
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
export default MusicVisualizerDemoWrapper;
