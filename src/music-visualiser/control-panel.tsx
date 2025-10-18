import React from "react";
import { SPRING_CONFIGS } from "../../gameplay/animations";
import styles from "./control-panel.module.css";

export const SMOOTHING_TIME_CONSTANT = 0.8;

export interface ControlPanelProps {
  smoothing: number;
  onSmoothingChange: (value: number) => void;
  dbRangeMin: number;
  dbRangeMax: number;
  onDbRangeMinChange: (value: number) => void;
  onDbRangeMaxChange: (value: number) => void;
  audioRefreshRate: number;
  onAudioRefreshRateChange: (value: number) => void;
  springMode: keyof typeof SPRING_CONFIGS;
  onSpringModeChange: (value: keyof typeof SPRING_CONFIGS) => void;
  changeThreshold: number;
  onChangeThresholdChange: (value: number) => void;
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
  audioRefreshRate,
  onAudioRefreshRateChange,
  springMode,
  onSpringModeChange,
  changeThreshold,
  onChangeThresholdChange,
  onResetAll,
  isPlaying,
}) => {
  const minDecibels = -255 + dbRangeMin;
  const maxDecibels = -255 + dbRangeMax;

  return (
    <div className={styles.controlPanel}>
      {/* SECTION 1: Spring Physics */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Spring Physics</h3>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>
            Spring Mode
            <span className={styles.controlHint}>Animation bounce behavior</span>
          </label>
          <select
            value={springMode}
            onChange={(e) => onSpringModeChange(e.target.value as keyof typeof SPRING_CONFIGS)}
            className={styles.controlSelect}
          >
            <option value="extreme">Extreme - Maximum Bounce</option>
            <option value="bouncy">Bouncy - Visible Overshoot</option>
            <option value="stiff">Stiff - Quick & Controlled</option>
          </select>
        </div>
      </div>

      {/* SECTION 2: Input Processing */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Input Processing</h3>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>
            Audio Refresh Rate
            <span className={styles.controlHint}>
              {audioRefreshRate}ms ({Math.round(1000 / audioRefreshRate)}fps)
            </span>
          </label>
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={audioRefreshRate}
            onChange={(e) => onAudioRefreshRateChange(Number(e.target.value))}
            className={styles.controlSlider}
          />
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>
            Change Threshold: {changeThreshold.toFixed(2)}
            <span className={styles.controlHint}>
              Ignore changes smaller than this
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="0.3"
            step="0.01"
            value={changeThreshold}
            onChange={(e) => onChangeThresholdChange(Number(e.target.value))}
            className={styles.controlSlider}
          />
        </div>
      </div>

      {/* SECTION 3: Audio Analysis */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Audio Analysis</h3>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>
            Smoothing: {smoothing.toFixed(2)}
            <span className={styles.controlHint}>0 = reactive, 1 = smooth</span>
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
      </div>

      <button onClick={onResetAll} className={`${styles.button} ${styles.buttonReset}`}>
        Reset All to Defaults
      </button>
    </div>
  );
};
