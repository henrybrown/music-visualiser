import React from "react";
import styles from "./music-visualiser-demo.module.css";

const SMOOTHING_TIME_CONSTANT = 0.3;
const UPDATE_INTERVAL_MS = 150;
const BAR_FALL_DURATION = 2000;

export interface ControlPanelProps {
  barDensity: 1 | 2 | 4;
  barCount: number;
  barResponse: number;
  barDecay: number;
  smoothing: number;
  dbRangeMin: number;
  dbRangeMax: number;
  minDecibels: number;
  maxDecibels: number;
  onBarDensityChange: (density: 1 | 2 | 4) => void;
  onBarResponseChange: (value: number) => void;
  onBarDecayChange: (value: number) => void;
  onSmoothingChange: (value: number) => void;
  onDbRangeMinChange: (value: number) => void;
  onDbRangeMaxChange: (value: number) => void;
  onResetEQ: () => void;
  onResetAll: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  barDensity,
  barCount,
  barResponse,
  barDecay,
  smoothing,
  dbRangeMin,
  dbRangeMax,
  minDecibels,
  maxDecibels,
  onBarDensityChange,
  onBarResponseChange,
  onBarDecayChange,
  onSmoothingChange,
  onDbRangeMinChange,
  onDbRangeMaxChange,
  onResetEQ,
  onResetAll,
}) => {
  return (
    <div className={styles.controlPanel}>
      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          Bar Density
          <span className={styles.controlHint}>({barCount} bars)</span>
        </label>
        <select
          value={barDensity}
          onChange={(e) => onBarDensityChange(Number(e.target.value) as 1 | 2 | 4)}
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
          onChange={(e) => onBarResponseChange(Number(e.target.value))}
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
          onChange={(e) => onBarDecayChange(Number(e.target.value))}
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

      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          EQ Controls
          <span className={styles.controlHint}>(5-band parametric equalizer)</span>
        </label>
        <button onClick={onResetEQ} className={`${styles.button} ${styles.buttonReset}`} style={{ marginTop: 0 }}>
          Reset EQ (Flat)
        </button>
      </div>

      <button onClick={onResetAll} className={`${styles.button} ${styles.buttonReset}`}>
        Reset All to Defaults
      </button>
    </div>
  );
};

export { SMOOTHING_TIME_CONSTANT, UPDATE_INTERVAL_MS, BAR_FALL_DURATION };
