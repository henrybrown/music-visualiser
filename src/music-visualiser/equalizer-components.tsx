import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import styles from "./equalizer-components.module.css";

const MIN_GAIN = -12;
const MAX_GAIN = 12;

export interface EQControlNode {
  barIndex: number;
  gain: number;
}

export function getDefaultEQNodes(totalBars: number): EQControlNode[] {
  return [
    { barIndex: Math.floor(totalBars * 0.1), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.3), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.5), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.7), gain: 0 },
    { barIndex: Math.floor(totalBars * 0.9), gain: 0 },
  ];
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

export interface EQOverlayProps {
  controlNodes: EQControlNode[];
  onNodesChange: (nodes: EQControlNode[]) => void;
  containerHeight: number;
  barWidth: number;
  barCount: number;
  frequencyRanges: readonly (readonly [number, number])[];
}

const EQOverlay: React.FC<EQOverlayProps> = ({
  controlNodes,
  onNodesChange,
  containerHeight,
  barWidth,
  barCount,
  frequencyRanges,
}) => {
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
      className={`${styles.eqOverlay} ${draggingIndex !== null ? styles.eqOverlayDragging : styles.eqOverlayIdle}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <line
        x1="0"
        y1={zeroLineY}
        x2="100%"
        y2={zeroLineY}
        className={styles.zeroLine}
      />

      {generateCurvePath && (
        <path
          d={generateCurvePath}
          className={styles.curvePath}
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
            className={styles.interpolatedDot}
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
              className={`${styles.guideLine} ${isDragging ? styles.guideLineDragging : styles.guideLineIdle}`}
            />

            <circle
              cx={x}
              cy={y}
              r={isDragging ? 10 : 8}
              className={`${styles.controlNode} ${isDragging ? styles.controlNodeDragging : styles.controlNodeIdle}`}
              onMouseDown={() => handleMouseDown(index)}
            />

            {isDragging && (
              <text
                x={x}
                y={y - 20}
                className={styles.nodeLabel}
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

export default EQOverlay;
