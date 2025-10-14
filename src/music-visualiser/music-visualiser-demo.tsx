import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { VisualizerDisplay } from "./visualizer-display";
import {
  ControlPanel,
  SMOOTHING_TIME_CONSTANT,
  UPDATE_INTERVAL_MS,
  BAR_FALL_DURATION,
} from "./control-panel";
import EQOverlay, { getDefaultEQNodes, type EQControlNode } from "./equalizer-components";
import { useAudioAnalyser } from "./audio-analysis";
import { subdivideFrequencyRanges, calculateHeight } from "./visualizer-components";
import styles from "./music-visualiser-demo.module.css";

const FFT_SIZE = 2048;
const BASE_HEIGHT = 30;

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
  const [debugStats, setDebugStats] = useState({
    activeAnimations: 0,
    lastUpdateTime: 0,
    avgUpdateTime: 0,
  });

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
  }, [audioAnalyser.loadTrack]);

  const handleStop = useCallback(() => {
    audioAnalyser.stop();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
    resetBars();
  }, [audioAnalyser.stop, resetBars]);

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

    const update = () => {
      const dataArray = audioAnalyser.getFrequencyData();
      if (!dataArray) return;

      const targets = new Map<string, number>();
      for (let i = 0; i < BAR_COUNT; i++) {
        const height = calculateHeight(dataArray, i, activeFrequencyRanges, scaledFftSize);
        targets.set(`bar-${i}`, height / BASE_HEIGHT);
      }

      engine.updateSpringTargets(targets);
    };

    // Much faster interval for springs (they smooth it out)
    intervalRef.current = window.setInterval(update, 16); // 60fps updates

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      engine.stopSpringLoop();
    };
  }, [
    isPlaying,
    audioAnalyser.getFrequencyData,
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

      const [minHz, maxHz] = activeFrequencyRanges[closestIndex];
      const avgHz = (minHz + maxHz) / 2;
      const label = avgHz >= 1000 ? `${(avgHz / 1000).toFixed(1)}kHz` : `${Math.round(avgHz)}Hz`;

      labels.push({ index: closestIndex, label });
    }

    return labels;
  }, [activeFrequencyRanges]);

  const handleResetEQ = useCallback(() => {
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

  const handleResetAll = useCallback(() => {
    setBarResponse(UPDATE_INTERVAL_MS);
    setBarDecay(BAR_FALL_DURATION);
    setSmoothing(SMOOTHING_TIME_CONSTANT);
    setDbRangeMin(170);
    setDbRangeMax(245);
    setBarDensity(1);
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

  return (
    <div className={styles.container}>
      <div className={styles.visualizerWrapper}>
        <VisualizerDisplay
          barCount={BAR_COUNT}
          barWidth={barWidth}
          frequencyRanges={activeFrequencyRanges}
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
          {frequencyLabels.map(({ index, label }) => (
            <span key={index}>{label}</span>
          ))}
        </div>

        {isPlaying && (
          <div
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem",
              background: "rgba(0, 0, 0, 0.02)",
              borderRadius: "4px",
              fontSize: "0.7rem",
              fontFamily: "Monaco, monospace",
              color: "#64748b",
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
            }}
          >
            <span>Active: {debugStats.activeAnimations}</span>
            <span>Last: {debugStats.lastUpdateTime.toFixed(1)}ms</span>
            <span>Avg: {debugStats.avgUpdateTime.toFixed(1)}ms</span>
            <span>Target: {barResponse}ms</span>
          </div>
        )}
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
        <ControlPanel
          barDensity={barDensity}
          barCount={BAR_COUNT}
          barResponse={barResponse}
          barDecay={barDecay}
          smoothing={smoothing}
          dbRangeMin={dbRangeMin}
          dbRangeMax={dbRangeMax}
          minDecibels={minDecibels}
          maxDecibels={maxDecibels}
          onBarDensityChange={setBarDensity}
          onBarResponseChange={setBarResponse}
          onBarDecayChange={setBarDecay}
          onSmoothingChange={setSmoothing}
          onDbRangeMinChange={setDbRangeMin}
          onDbRangeMaxChange={setDbRangeMax}
          onResetEQ={handleResetEQ}
          onResetAll={handleResetAll}
        />
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
