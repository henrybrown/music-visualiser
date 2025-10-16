import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { VisualizerDisplay, subdivideFrequencyRanges, calculateAudioLevel } from "./visualizer-display";
import { ControlPanel, SMOOTHING_TIME_CONSTANT } from "./control-panel";
import EQOverlay, { getDefaultEQNodes, type EQControlNode } from "./equalizer-components";
import { useAudioAnalyser } from "./audio-analysis";
import { VISUALIZER_MODES, type VisualizerMode } from "../../gameplay/animations";
import styles from "./music-visualiser-demo.module.css";

const FFT_SIZE = 2048;

const MusicVisualizerDemoInner: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [smoothing, setSmoothing] = useState(SMOOTHING_TIME_CONSTANT);
  const [dbRangeMin, setDbRangeMin] = useState(170);
  const [dbRangeMax, setDbRangeMax] = useState(245);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("extreme");
  const [barDensity, setBarDensity] = useState<1 | 2 | 4>(1);
  const [showControls, setShowControls] = useState(false);
  const [showEQ, setShowEQ] = useState(true);
  const [eqControlNodes, setEqControlNodes] = useState<EQControlNode[]>([]);
  const [audioRefreshRate, setAudioRefreshRate] = useState(2000);

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
  const glowIntervalRef = useRef<number | null>(null);

  const handlePlay = useCallback(() => {
    audioAnalyser.loadTrack("/sample_audio_for_animation_demo.wav");
    setIsPlaying(true);
  }, [audioAnalyser.loadTrack]);

  const handleStop = useCallback(() => {
    audioAnalyser.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, [audioAnalyser.stop]);

  const handleTrackEnd = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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
        const audioLevel = calculateAudioLevel(dataArray, i, activeFrequencyRanges, scaledFftSize);
        engine.updateEntityContext(`bar-${i}`, { audioLevel });
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
  ]);

  const frequencyLabels = useMemo(() => {
    const targetFrequencies = [20, 100, 500, 1000, 5000, 10000, 20000];
    const labels = [];

    // Same calculation as EQ overlay
    const totalBarsWidth = barWidth * BAR_COUNT + 3 * (BAR_COUNT - 1);
    const containerWidth = 800; // Could get from ref if needed
    const offset = (containerWidth - totalBarsWidth) / 2;

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

      // Calculate position using SAME formula as EQ
      const xPos = offset + barWidth / 2 + (barWidth + 3) * closestIndex;

      labels.push({ index: closestIndex, label, xPos });
    }

    return labels;
  }, [activeFrequencyRanges, barWidth, BAR_COUNT]);

  const handleResetAll = useCallback(() => {
    setSmoothing(SMOOTHING_TIME_CONSTANT);
    setDbRangeMin(170);
    setDbRangeMax(245);
    setBarDensity(1);
    setVisualizerMode("extreme");
    setAudioRefreshRate(2000);
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

  return (
    <div className={styles.container}>
      <div className={styles.visualizerWrapper}>
        <VisualizerDisplay
          barCount={BAR_COUNT}
          barWidth={barWidth}
          frequencyRanges={activeFrequencyRanges}
          visualizerMode={visualizerMode}
        >
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
            // Set all bars to random targets to test bounce
            for (let i = 0; i < BAR_COUNT; i++) {
              engine.updateEntityContext(`bar-${i}`, { audioLevel: Math.random() });
            }
          }}
          className={`${styles.button}`}
        >
          🎲 Random Jump
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
          barDensity={barDensity}
          onBarDensityChange={setBarDensity}
          visualizerMode={visualizerMode}
          onVisualizerModeChange={setVisualizerMode}
          audioRefreshRate={audioRefreshRate}
          onAudioRefreshRateChange={setAudioRefreshRate}
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
