import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import {
  VisualizerDisplay,
  subdivideFrequencyRanges,
  calculateAudioLevel,
} from "./visualizer-display";
import { ControlPanel, SMOOTHING_TIME_CONSTANT } from "./control-panel";
import EQOverlay, { getDefaultEQNodes, type EQControlNode } from "./equalizer-components";
import { useAudioAnalyser } from "./audio-analysis";
import { SPRING_CONFIGS, type SpringConfigKey } from "../../gameplay/animations";
import styles from "./music-visualiser-demo.module.css";

const FFT_SIZE = 2048;

const MusicVisualizerDemoInner: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [smoothing, setSmoothing] = useState(SMOOTHING_TIME_CONSTANT);
  const [dbRangeMin, setDbRangeMin] = useState(170);
  const [dbRangeMax, setDbRangeMax] = useState(245);
  const [barDensity, setBarDensity] = useState<1 | 2 | 4>(1);
  const [showControls, setShowControls] = useState(false);
  const [showEQ, setShowEQ] = useState(true);
  const [eqControlNodes, setEqControlNodes] = useState<EQControlNode[]>([]);
  const [audioRefreshRate, setAudioRefreshRate] = useState(2000);
  const [springMode, setSpringMode] = useState<SpringConfigKey>("extreme");
  const [changeThreshold, setChangeThreshold] = useState(0.1);

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
    lastBarLevelsRef.current = new Array(BAR_COUNT).fill(0);
  }, [BAR_COUNT]);

  const audioAnalyser = useAudioAnalyser();
  const engine = useAnimationEngine();

  const intervalRef = useRef<number | null>(null);
  const glowIntervalRef = useRef<number | null>(null);
  const visualizerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [visualizerWidth, setVisualizerWidth] = useState(800);
  const lastBarLevelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  const resetAllBars = useCallback(() => {
    for (let i = 0; i < BAR_COUNT; i++) {
      engine.updateEntityContext(`bar-${i}`, { audioLevel: 0 });
      lastBarLevelsRef.current[i] = 0;
    }
  }, [BAR_COUNT, engine]);

  const handlePlay = useCallback(() => {
    resetAllBars();
    audioAnalyser.loadTrack("/sample_audio_for_animation_demo.wav");
    setIsPlaying(true);
  }, [audioAnalyser.loadTrack, resetAllBars]);

  const handleStop = useCallback(() => {
    audioAnalyser.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (glowIntervalRef.current) {
      clearInterval(glowIntervalRef.current);
      glowIntervalRef.current = null;
    }
    setIsPlaying(false);
    resetAllBars();
  }, [audioAnalyser.stop, resetAllBars]);

  const handleTrackEnd = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (glowIntervalRef.current) {
      clearInterval(glowIntervalRef.current);
      glowIntervalRef.current = null;
    }
    resetAllBars();
  }, [resetAllBars]);

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
  }, [smoothing, minDecibels, maxDecibels, scaledFftSize, audioAnalyser.updateConfig]);

  useEffect(() => {
    audioAnalyser.initEQFilters();
  }, [audioAnalyser.initEQFilters]);

  // Measure visualizer container width
  useEffect(() => {
    const measureWidth = () => {
      if (visualizerWrapperRef.current) {
        const width = visualizerWrapperRef.current.offsetWidth;
        setVisualizerWidth(width);
      }
    };

    measureWidth();
    window.addEventListener("resize", measureWidth);
    return () => window.removeEventListener("resize", measureWidth);
  }, []);

  useEffect(() => {
    const gains = eqControlNodes.map((node) => node.gain);
    audioAnalyser.updateEQGains(gains);
  }, [eqControlNodes, audioAnalyser.updateEQGains]);

  useEffect(() => {
    if (!isPlaying) return;

    engine.startSpringLoop(); // Start spring RAF loop

    // Bar updates - slow refresh for smooth, bouncy motion
    const updateBars = () => {
      const dataArray = audioAnalyser.getFrequencyData();
      if (!dataArray) return;

      for (let i = 0; i < BAR_COUNT; i++) {
        const newLevel = calculateAudioLevel(dataArray, i, activeFrequencyRanges, scaledFftSize);
        const lastLevel = lastBarLevelsRef.current[i];

        // Only update if change exceeds threshold
        if (Math.abs(newLevel - lastLevel) > changeThreshold) {
          engine.updateEntityContext(`bar-${i}`, { audioLevel: newLevel });
          lastBarLevelsRef.current[i] = newLevel;
        }
        // Otherwise: spring continues toward previous target
      }
    };

    // Glow updates - fast refresh for reactive, energetic motion
    const updateGlows = () => {
      const dataArray = audioAnalyser.getFrequencyData();
      if (!dataArray) return;

      for (let i = 0; i < BAR_COUNT; i++) {
        const glowLevel = calculateAudioLevel(dataArray, i, activeFrequencyRanges, scaledFftSize);
        engine.updateEntityContext(`bar-${i}`, { glowLevel });
      }
    };

    // Two independent intervals at different rates
    intervalRef.current = window.setInterval(updateBars, audioRefreshRate);
    glowIntervalRef.current = window.setInterval(updateGlows, 16);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (glowIntervalRef.current) {
        clearInterval(glowIntervalRef.current);
      }
      engine.stopSpringLoop();
    };
  }, [
    isPlaying,
    audioAnalyser.getFrequencyData,
    engine,
    activeFrequencyRanges,
    BAR_COUNT,
    scaledFftSize,
    audioRefreshRate,
    changeThreshold,
  ]);

  const frequencyLabels = useMemo(() => {
    const targetFrequencies = [20, 100, 500, 1000, 5000, 10000, 20000];
    const labels = [];

    // Account for container padding (1rem = 16px on each side)
    const containerPadding = 32; // 16px * 2
    const availableWidth = visualizerWidth - containerPadding;

    // Calculate actual bars width
    const totalBarsWidth = barWidth * BAR_COUNT + 3 * (BAR_COUNT - 1);

    // Bars are centered via flexbox, calculate offset from container edge
    const offset = Math.max(0, (availableWidth - totalBarsWidth) / 2) + 16; // +16 for left padding

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

      // Same frequency formatting as EQ
      const [minHz, maxHz] = activeFrequencyRanges[closestIndex];
      const avgHz = (minHz + maxHz) / 2;
      const label = avgHz >= 1000 ? `${(avgHz / 1000).toFixed(1)}kHz` : `${Math.round(avgHz)}Hz`;

      // Calculate position relative to container
      const xPos = offset + barWidth / 2 + (barWidth + 3) * closestIndex;

      labels.push({ index: closestIndex, label, xPos });
    }

    return labels;
  }, [activeFrequencyRanges, barWidth, BAR_COUNT, visualizerWidth]);

  const handleResetAll = useCallback(() => {
    setSmoothing(SMOOTHING_TIME_CONSTANT);
    setDbRangeMin(170);
    setDbRangeMax(245);
    setBarDensity(1);
    setAudioRefreshRate(500);
    setSpringMode("extreme");
    setChangeThreshold(0.1);
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

  return (
    <div className={styles.container}>
      <div ref={visualizerWrapperRef} className={styles.visualizerWrapper}>
        <VisualizerDisplay
          barCount={BAR_COUNT}
          barWidth={barWidth}
          frequencyRanges={activeFrequencyRanges}
          springMode={springMode}
        >
          {showEQ && (
            <EQOverlay
              controlNodes={eqControlNodes}
              onNodesChange={setEqControlNodes}
              containerHeight={380}
              barWidth={barWidth}
              barCount={BAR_COUNT}
              frequencyRanges={activeFrequencyRanges}
              containerWidth={visualizerWidth}
            />
          )}
        </VisualizerDisplay>

        <div className={styles.frequencyLabels}>
          {frequencyLabels.map(({ index, label, xPos }) => (
            <span
              key={index}
              style={{
                position: "absolute",
                left: `${xPos}px`,
                transform: "translateX(-50%)",
              }}
            >
              {label}
            </span>
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

        <div className={styles.densityToggle}>
          <button
            onClick={() => setBarDensity(1)}
            className={`${styles.button} ${styles.buttonDensity} ${barDensity === 1 ? styles.buttonSelected : ""}`}
          >
            31
          </button>
          <button
            onClick={() => setBarDensity(2)}
            className={`${styles.button} ${styles.buttonDensity} ${barDensity === 2 ? styles.buttonSelected : ""}`}
          >
            62
          </button>
          <button
            onClick={() => setBarDensity(4)}
            className={`${styles.button} ${styles.buttonDensity} ${barDensity === 4 ? styles.buttonSelected : ""}`}
          >
            124
          </button>
        </div>

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

        <button
          onClick={() => {
            for (let i = 0; i < BAR_COUNT; i++) {
              engine.updateEntityContext(`bar-${i}`, { audioLevel: Math.random() });
            }
          }}
          className={`${styles.button} ${styles.buttonRandom}`}
        >
          🎲
        </button>
      </div>

      {showControls && (
        <ControlPanel
          smoothing={smoothing}
          onSmoothingChange={setSmoothing}
          dbRangeMin={dbRangeMin}
          dbRangeMax={dbRangeMax}
          onDbRangeMinChange={setDbRangeMin}
          onDbRangeMaxChange={setDbRangeMax}
          audioRefreshRate={audioRefreshRate}
          onAudioRefreshRateChange={setAudioRefreshRate}
          springMode={springMode}
          onSpringModeChange={setSpringMode}
          changeThreshold={changeThreshold}
          onChangeThresholdChange={setChangeThreshold}
          onResetAll={handleResetAll}
          isPlaying={isPlaying}
        />
      )}
    </div>
  );
};

export const MusicVisualizerDemo: React.FC = () => {
  return (
    <AnimationEngineProvider engineId="music-visualizer-demo">
      <MusicVisualizerDemoInner />
    </AnimationEngineProvider>
  );
};
