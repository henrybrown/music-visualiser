import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AnimationEngineProvider,
  useAnimationEngine,
} from "../../gameplay/animations/animation-engine-context";
import { VisualizerDisplay, subdivideFrequencyRanges } from "./visualizer-display";
import { ControlPanel, SMOOTHING_TIME_CONSTANT } from "./control-panel";
import EQOverlay, { getDefaultEQNodes, type EQControlNode } from "./equalizer-components";
import { useAudioAnalyser } from "./audio-analysis";
import { useAudioVisualizer } from "./use-audio-visualizer";
import type { SpringConfigKey } from "../../gameplay/animations";
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
  const [audioRefreshRate, setAudioRefreshRate] = useState(100);
  const [springMode, setSpringMode] = useState<SpringConfigKey>("extreme");
  const [changeThreshold, setChangeThreshold] = useState(0.1);

  const minDecibels = -255 + dbRangeMin;
  const maxDecibels = -255 + dbRangeMax;

  const activeFrequencyRanges = useMemo(() => subdivideFrequencyRanges(barDensity), [barDensity]);
  const BAR_COUNT = activeFrequencyRanges.length;

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
  const visualizerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [visualizerWidth, setVisualizerWidth] = useState(800);

  const barWidth = useMemo(() => {
    const GAP = 3; // Gap between bars in pixels
    const PADDING = 32; // 1rem on each side = 32px total
    const availableWidth = visualizerWidth - PADDING;
    const totalGapWidth = (BAR_COUNT - 1) * GAP;
    const totalBarWidth = availableWidth - totalGapWidth;
    const calculatedWidth = totalBarWidth / BAR_COUNT;

    // Ensure minimum bar width of 2px for visibility
    return Math.max(2, calculatedWidth);
  }, [visualizerWidth, BAR_COUNT]);

  const visualizer = useAudioVisualizer(
    {
      barCount: BAR_COUNT,
      audioRefreshRate,
      changeThreshold,
      springMode,
      frequencyRanges: activeFrequencyRanges,
      fftSize: scaledFftSize,
    },
    audioAnalyser,
  );

  const handlePlay = useCallback(async () => {
    try {
      await visualizer.play("/sample_audio_for_animation_demo.wav");
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
    }
  }, [visualizer]);

  const handleStop = useCallback(() => {
    visualizer.stop();
    setIsPlaying(false);
  }, [visualizer]);

  const handleTrackEnd = useCallback(() => {
    visualizer.stop();
    setIsPlaying(false);
  }, [visualizer]);

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

  // Add spacebar play/pause keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (isPlaying) {
          handleStop();
        } else {
          handlePlay();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, handlePlay, handleStop]);

  const frequencyLabels = useMemo(() => {
    const frequencies = [
      { hz: 20, label: "20Hz" },
      { hz: 100, label: "100Hz" },
      { hz: 500, label: "500Hz" },
      { hz: 1000, label: "1kHz" },
      { hz: 5000, label: "5kHz" },
      { hz: 10000, label: "10kHz" },
      { hz: 20000, label: "20kHz" },
    ];

    const MIN_FREQ = 20;
    const MAX_FREQ = 22000;

    return frequencies.map(({ hz, label }) => {
      // Logarithmic position: log scale from 20Hz to 22kHz
      const logMin = Math.log10(MIN_FREQ);
      const logMax = Math.log10(MAX_FREQ);
      const logHz = Math.log10(hz);

      const positionPercent = ((logHz - logMin) / (logMax - logMin)) * 100;

      return { label, positionPercent };
    });
  }, []); // Empty deps - completely static!

  const handleResetAll = useCallback(() => {
    setSmoothing(SMOOTHING_TIME_CONSTANT);
    setDbRangeMin(170);
    setDbRangeMax(245);
    setBarDensity(1);
    setAudioRefreshRate(100);
    setSpringMode("extreme");
    setChangeThreshold(0.1);
    setEqControlNodes(getDefaultEQNodes(BAR_COUNT));
  }, [BAR_COUNT]);

  return (
    <div className={styles.container}>
      <div className={styles.visualizerWrapper}>
        {/* Eye Toggle - Top Right, Above Visualizer */}
        <button
          onClick={() => setShowEQ(!showEQ)}
          className={`${styles.eyeToggle} ${showEQ ? styles.active : ''}`}
          title={showEQ ? "Hide EQ" : "Show EQ"}
        >
          <span className={`${styles.eyeIcon} ${!showEQ ? styles.hidden : ''}`}>👁</span>
        </button>

        {/* Visualizer Display */}
        <div ref={visualizerWrapperRef} className={styles.visualizerContainer}>
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

          {/* Frequency Labels */}
          <div className={styles.frequencyLabels}>
            {frequencyLabels.map(({ label, positionPercent }) => (
              <span
                key={label}
                style={{
                  position: "absolute",
                  left: `${positionPercent}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Controls Row: Density | Play/Stop | Dice */}
        <div className={styles.controlsRow}>
          {/* Left: Density Toggle */}
          <div className={styles.controlsLeft}>
            <div className={styles.densityToggle}>
              <button
                onClick={() => setBarDensity(1)}
                className={`${styles.densityOption} ${barDensity === 1 ? styles.active : ''}`}
              >
                32
              </button>
              <button
                onClick={() => setBarDensity(2)}
                className={`${styles.densityOption} ${barDensity === 2 ? styles.active : ''}`}
              >
                64
              </button>
              <button
                onClick={() => setBarDensity(4)}
                className={`${styles.densityOption} ${barDensity === 4 ? styles.active : ''}`}
              >
                128
              </button>
            </div>
          </div>

          {/* Center: Media Controls */}
          <div className={styles.controlsCenter}>
            <button
              onClick={handlePlay}
              disabled={isPlaying}
              className={`${styles.controlButton} ${isPlaying ? styles.disabled : ''}`}
            >
              ▶
            </button>
            <button
              onClick={handleStop}
              disabled={!isPlaying}
              className={`${styles.controlButton} ${!isPlaying ? styles.disabled : ''}`}
            >
              ⏹
            </button>
          </div>

          {/* Right: Dice Button */}
          <div className={styles.controlsRight}>
            <button
              onClick={() => {
                for (let i = 0; i < BAR_COUNT; i++) {
                  engine.updateEntityContext(`bar-${i}`, { audioLevel: Math.random() });
                }
              }}
              className={styles.diceButton}
            >
              🎲
            </button>
          </div>
        </div>
      </div>

      {/* Settings Button - Fixed Bottom Right */}
      <button
        onClick={() => setShowControls(!showControls)}
        className={styles.settingsButton}
      >
        ⚙️
      </button>

      {/* Settings Drawer */}
      {showControls && (
        <>
          <div className={styles.settingsOverlay} onClick={() => setShowControls(false)} />
          <div className={styles.settingsDrawer}>
            <div className={styles.settingsHeader}>
              <h2>Settings</h2>
              <button onClick={() => setShowControls(false)} className={styles.closeButton}>
                ×
              </button>
            </div>

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
          </div>
        </>
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
