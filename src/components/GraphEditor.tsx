"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphInstance } from "@/lib/clique";
import { getGraphEdges } from "@/lib/clique";

const VIEWBOX_WIDTH = 620;
const VIEWBOX_HEIGHT = 360;
const NODE_RADIUS = 22;

type DragState = {
  nodeId: string;
} | null;

type GraphEditorProps = {
  instance: GraphInstance;
  nodeColors: Record<string, string>;
  onAddNode: () => void;
  onAutoLayout: () => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onToggleEdge: (from: number, to: number) => void;
  maxNodes: number;
  randomNodeCount: number;
  randomTargetK: number;
  randomDensity: number;
  onRandomNodeCountChange: (value: number) => void;
  onRandomTargetKChange: (value: number) => void;
  onRandomDensityChange: (value: number) => void;
  onGenerateRandom: () => void;
};

export function GraphEditor({
  instance,
  nodeColors,
  onAddNode,
  onAutoLayout,
  onMoveNode,
  onToggleEdge,
  maxNodes,
  randomNodeCount,
  randomTargetK,
  randomDensity,
  onRandomNodeCountChange,
  onRandomTargetKChange,
  onRandomDensityChange,
  onGenerateRandom,
}: GraphEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [nodeCountInput, setNodeCountInput] = useState(String(randomNodeCount));
  const [targetKInput, setTargetKInput] = useState(String(randomTargetK));

  useEffect(() => {
    setNodeCountInput(String(randomNodeCount));
  }, [randomNodeCount]);

  useEffect(() => {
    setTargetKInput(String(randomTargetK));
  }, [randomTargetK]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const activeNodeId = dragState.nodeId;

    function handlePointerMove(event: PointerEvent) {
      if (!svgRef.current) {
        return;
      }

      const rect = svgRef.current.getBoundingClientRect();
      const relativeX =
        ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
      const relativeY =
        ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;

      const clampedX = Math.min(
        VIEWBOX_WIDTH - NODE_RADIUS - 10,
        Math.max(NODE_RADIUS + 10, relativeX),
      );
      const clampedY = Math.min(
        VIEWBOX_HEIGHT - NODE_RADIUS - 10,
        Math.max(NODE_RADIUS + 10, relativeY),
      );

      onMoveNode(activeNodeId, clampedX, clampedY);
    }

    function handlePointerUp() {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, onMoveNode]);

  function sanitizeIntegerInput(value: string) {
    return value.replace(/\D+/g, "");
  }

  function commitNodeCount(value: string) {
    if (value === "") {
      setNodeCountInput(String(randomNodeCount));
      return;
    }

    const nextValue = Math.min(maxNodes, Math.max(3, Number(value)));
    onRandomNodeCountChange(nextValue);
    setNodeCountInput(String(nextValue));
  }

  function commitTargetK(value: string) {
    if (value === "") {
      setTargetKInput(String(randomTargetK));
      return;
    }

    const nextValue = Math.min(
      Math.max(1, Number(value)),
      Math.max(1, randomNodeCount),
    );
    onRandomTargetKChange(nextValue);
    setTargetKInput(String(nextValue));
  }

  return (
    <div className="editor-grid">
      <div className="panel panel-inset">
        <div className="editor-toolbar">
          <div>
            <h3>Graph</h3>
            <p>Drag vertices in the canvas and toggle edges in the matrix.</p>
          </div>
          <div className="toolbar-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={onAutoLayout}
            >
              Auto layout
            </button>
            <button
              className="accent-button"
              type="button"
              onClick={onAddNode}
              disabled={instance.nodes.length >= maxNodes}
            >
              Add node
            </button>
          </div>
        </div>

        <div className="editor-random-strip">
          <label className="editor-mini-field">
            <span>Vertices</span>
            <input
              type="text"
              inputMode="numeric"
              value={nodeCountInput}
              onChange={(event) =>
                setNodeCountInput(sanitizeIntegerInput(event.target.value))
              }
              onBlur={() => commitNodeCount(nodeCountInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitNodeCount(nodeCountInput);
                }
              }}
            />
          </label>
          <label className="editor-mini-field">
            <span>k</span>
            <input
              type="text"
              inputMode="numeric"
              value={targetKInput}
              onChange={(event) =>
                setTargetKInput(sanitizeIntegerInput(event.target.value))
              }
              onBlur={() => commitTargetK(targetKInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTargetK(targetKInput);
                }
              }}
            />
          </label>
          <label className="editor-mini-field editor-density-field">
            <span>Density</span>
            <input
              type="range"
              min={0.15}
              max={0.95}
              step={0.05}
              value={randomDensity}
              onChange={(event) =>
                onRandomDensityChange(Number(event.target.value))
              }
            />
            <small>{Math.round(randomDensity * 100)}%</small>
          </label>
          <button
            className="ghost-button"
            type="button"
            onClick={onGenerateRandom}
          >
            Random instance
          </button>
        </div>

        <div className="graph-canvas-shell">
          <svg
            ref={svgRef}
            className="graph-canvas"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            aria-label="Graph input canvas"
          >
            {getGraphEdges(instance).map((edge) => (
              <line
                key={`${edge.from.id}-${edge.to.id}`}
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                className="graph-edge"
              />
            ))}

            {instance.nodes.map((node) => (
              <g
                key={node.id}
                className="graph-node"
                onPointerDown={() => setDragState({ nodeId: node.id })}
                transform={`translate(${node.x}, ${node.y})`}
              >
                <circle
                  r={NODE_RADIUS}
                  fill={nodeColors[node.id] ?? "#1f3c88"}
                  className="graph-node-circle"
                />
                <text className="graph-node-label" textAnchor="middle" dy="6">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="panel panel-inset matrix-panel">
        <div className="editor-toolbar">
          <div>
            <h3>Adjacency matrix</h3>
            <p>Each checkbox toggles the undirected edge between two vertices.</p>
          </div>
        </div>

        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th />
                {instance.nodes.map((node) => (
                  <th key={`col-${node.id}`}>{node.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instance.nodes.map((rowNode, rowIndex) => (
                <tr key={`row-${rowNode.id}`}>
                  <th>{rowNode.label}</th>
                  {instance.nodes.map((columnNode, columnIndex) => {
                    if (rowIndex === columnIndex) {
                      return <td key={`${rowNode.id}-${columnNode.id}`}>-</td>;
                    }

                    return (
                      <td key={`${rowNode.id}-${columnNode.id}`}>
                        <input
                          type="checkbox"
                          checked={instance.adjacency[rowIndex][columnIndex]}
                          aria-label={`Edge ${rowNode.label}-${columnNode.label}`}
                          onChange={() => onToggleEdge(rowIndex, columnIndex)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
