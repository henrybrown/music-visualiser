import React from "react";
import { SPRING_CONFIGS } from "../../gameplay/animations";
import styles from "./music-visualiser-demo.module.css";

export const SMOOTHING_TIME_CONSTANT = 0.8;

const SPRING_CONFIG_LABELS: Record<keyof typeof SPRING_CONFIGS, string> = {
  extreme: "Extreme - HUGE Bounce",
  bouncy: "Bouncy - Visible Overshoot",
  smooth: "Smooth - Gentle Movement",
  stiff: "Stiff - Quick & Controlled",
};

export interface ControlPanelProps {
  smoothing: number;
  onSmoothingChange: (value: number) => void;
  dbRangeMin: number;
  dbRangeMax: number;
  onDbRangeMinChange: (value: number) => void;
  onDbRangeMaxChange: (value: number) => void;
  barDensity: 1 | 2 | 4;
  onBarDensityChange: (value: 1 | 2 | 4) => void;
  visualizerMode: 'extreme' | 'bouncy' | 'smooth' | 'stiff';
  onVisualizerModeChange: (value: 'extreme' | 'bouncy' | 'smooth' | 'stiff') => void;
  audioRefreshRate: number;
  onAudioRefreshRateChange: (value: number) => void;
  onResetAll: () => void;
  isPlaying: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  smoothing,
  onSmoothingChange,
  dbRangeMin,
  dbRangeMax,
  onDbRangeMinChange,
  onDbRangeMaxChange,
  barDensity,
  onBarDensityChange,
  visualizerMode,
  onVisualizerModeChange,
  audioRefreshRate,
  onAudioRefreshRateChange,
  onResetAll,
  isPlaying,
}) => {
  const minDecibels = -255 + dbRangeMin;
  const maxDecibels = -255 + dbRangeMax;
  return (
    <div className={styles.controlPanel}>
      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          Bar Density
          <span className={styles.controlHint}>Visual resolution</span>
        </label>
        <select
          value={barDensity}
          onChange={(e) => onBarDensityChange(Number(e.target.value) as 1 | 2 | 4)}
          className={styles.controlSelect}
          disabled={isPlaying}
        >
          <option value={1}>Normal (31 bars)</option>
          <option value={2}>Double (62 bars)</option>
          <option value={4}>Quadruple (124 bars)</option>
        </select>
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          Animation Mode
          <span className={styles.controlHint}>Physics behavior</span>
        </label>
        <select
          value={visualizerMode}
          onChange={(e) => onVisualizerModeChange(e.target.value as 'extreme' | 'bouncy' | 'smooth' | 'stiff')}
          className={styles.controlSelect}
          disabled={isPlaying}
        >
          {(Object.keys(SPRING_CONFIGS) as Array<keyof typeof SPRING_CONFIGS>).map((key) => (
            <option key={key} value={key}>
              {SPRING_CONFIG_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          Audio Refresh Rate
          <span className={styles.controlHint}>
            {audioRefreshRate}ms ({Math.round(1000 / audioRefreshRate)}fps) - Higher = bouncier
          </span>
        </label>
        <input
          type="range"
          min="16"
          max="1000"
          step="16"
          value={audioRefreshRate}
          onChange={(e) => onAudioRefreshRateChange(Number(e.target.value))}
          className={styles.controlSlider}
          disabled={isPlaying}
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
          onChange={(e) => onSmoothingChange(Number(e.target.value))}
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
              if (val < dbRangeMax - 10) onDbRangeMinChange(val);
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
              if (val > dbRangeMin + 10) onDbRangeMaxChange(val);
            }}
            className={styles.dualSliderThumb}
          />
        </div>
      </div>

      <button onClick={onResetAll} className={`${styles.button} ${styles.buttonReset}`}>
        Reset All to Defaults
      </button>
    </div>
  );
};
