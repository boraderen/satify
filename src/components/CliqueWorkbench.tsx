"use client";

import Link from "next/link";
import { useState } from "react";
import { GraphEditor } from "@/components/GraphEditor";
import {
  buildNodeColorMap,
  CLAUSE_FAMILY_INFO,
  createCircularLayout,
  createSampleCliqueInstance,
  decodeCliqueAssignment,
  describeClique,
  generateRandomCliqueInstance,
  MAX_INTERACTIVE_NODES,
  reduceCliqueToSat,
  solveCliqueBruteForce,
  type BruteForceCliqueResult,
  type CliqueSatReduction,
  type GraphInstance,
} from "@/lib/clique";
import {
  convertCnfToThreeSat,
  solveSat,
  type Clause,
  type ThreeSatFormula,
} from "@/lib/sat";

type ReductionRun = {
  satReduction: CliqueSatReduction;
  threeSat: ThreeSatFormula;
  satMs: number;
  threeSatMs: number;
  totalMs: number;
};

type BruteForceRun = {
  result: BruteForceCliqueResult;
  runtimeMs: number;
};

type SatRun = {
  reduction: ReductionRun;
  satisfiable: boolean;
  cliqueIndices: number[];
  bruteForce: BruteForceRun;
  satSolverMs: number;
  totalPipelineMs: number;
  solutionsAgree: boolean;
  isOptimal: boolean | null;
};

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function measureComputation<T>(fn: () => T) {
  const firstStart = now();
  let result = fn();
  const firstElapsed = now() - firstStart;

  if (firstElapsed >= 1) {
    return {
      result,
      runtimeMs: firstElapsed,
      iterations: 1,
    };
  }

  let iterations = 1;
  let totalElapsed = firstElapsed;

  while (totalElapsed < 12 && iterations < 256) {
    const nextIterations = Math.min(iterations * 2, 256);
    const start = now();

    for (let index = 0; index < nextIterations; index += 1) {
      result = fn();
    }

    totalElapsed = now() - start;
    iterations = nextIterations;
  }

  return {
    result,
    runtimeMs: totalElapsed / iterations,
    iterations,
  };
}

function formatMs(value: number) {
  if (value < 1) {
    return `${value.toFixed(3)} ms`;
  }

  if (value < 100) {
    return `${value.toFixed(2)} ms`;
  }

  return `${value.toFixed(1)} ms`;
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function parseVariableName(variable: string) {
  const separatorIndex = variable.indexOf("_");

  if (separatorIndex === -1) {
    return { base: variable, subscript: "" };
  }

  return {
    base: variable.slice(0, separatorIndex),
    subscript: variable.slice(separatorIndex + 1).replaceAll(",", ", "),
  };
}

function MathVariable({
  variable,
}: {
  variable: string;
}) {
  const { base, subscript } = parseVariableName(variable);

  return (
    <span className="math-token">
      <span className="math-token-base">{base}</span>
      {subscript ? <sub className="math-token-sub">{subscript}</sub> : null}
    </span>
  );
}

function MathLiteral({
  literal,
}: {
  literal: Clause["literals"][number];
}) {
  return (
    <span className="math-literal">
      {literal.negated ? <span className="math-negation">¬</span> : null}
      <MathVariable variable={literal.variable} />
    </span>
  );
}

function LiteralChip({
  literal,
  nodeColors,
}: {
  literal: Clause["literals"][number];
  nodeColors: Record<string, string>;
}) {
  const background =
    literal.nodeId && nodeColors[literal.nodeId]
      ? `${nodeColors[literal.nodeId]}22`
      : "#dce4ef";
  const border =
    literal.nodeId && nodeColors[literal.nodeId]
      ? nodeColors[literal.nodeId]
      : "#8aa0bb";

  return (
    <span
      className="literal-chip"
      style={{
        background,
        borderColor: border,
      }}
    >
      <MathLiteral literal={literal} />
    </span>
  );
}

function ClausePreview({
  clause,
  nodeColors,
}: {
  clause: Clause;
  nodeColors: Record<string, string>;
}) {
  return (
    <div className="clause-preview">
      <p>{clause.description}</p>
      <div className="clause-chip-row">
        <span className="clause-paren">(</span>
        {clause.literals.map((literal, index) => (
          <div className="clause-literal" key={`${clause.id}-${index}`}>
            <LiteralChip literal={literal} nodeColors={nodeColors} />
            {index < clause.literals.length - 1 ? (
              <span className="math-join-symbol">∨</span>
            ) : null}
          </div>
        ))}
        <span className="clause-paren">)</span>
      </div>
    </div>
  );
}

function FormulaClause({
  clause,
}: {
  clause: Clause;
}) {
  return (
    <span className="formula-clause">
      <span className="clause-paren">(</span>
      {clause.literals.map((literal, index) => (
        <span className="formula-literal" key={`${clause.id}-${index}`}>
          <MathLiteral literal={literal} />
          {index < clause.literals.length - 1 ? (
            <span className="math-join-symbol">∨</span>
          ) : null}
        </span>
      ))}
      <span className="clause-paren">)</span>
    </span>
  );
}

function ResultGroup({
  title,
  items,
  note,
}: {
  title: string;
  items: Array<{ label: string; value?: string | number | null }>;
  note?: string;
}) {
  return (
    <article className="result-group">
      <h3>{title}</h3>
      <dl className="result-list">
        {items.map((item) => (
          <div className="result-row" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{formatValue(item.value)}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="result-note">{note}</p> : null}
    </article>
  );
}

function FormalStep({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="formal-step">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="math-block">{children}</div>
    </article>
  );
}

function buildReduction(instance: GraphInstance): ReductionRun {
  const satStart = now();
  const satReduction = reduceCliqueToSat(instance);
  const satEnd = now();
  const threeSat = convertCnfToThreeSat(
    satReduction.formula.clauses,
    satReduction.variableOrder,
  );
  const threeSatEnd = now();

  return {
    satReduction,
    threeSat,
    satMs: satEnd - satStart,
    threeSatMs: threeSatEnd - satEnd,
    totalMs: threeSatEnd - satStart,
  };
}

export function CliqueWorkbench() {
  const [instance, setInstance] = useState<GraphInstance>(() =>
    createSampleCliqueInstance(),
  );
  const [randomNodeCount, setRandomNodeCount] = useState(5);
  const [randomTargetK, setRandomTargetK] = useState(3);
  const [randomDensity, setRandomDensity] = useState(0.55);
  const [targetCliqueInput, setTargetCliqueInput] = useState(() =>
    String(createSampleCliqueInstance().targetCliqueSize),
  );
  const [busyAction, setBusyAction] = useState<"reduce" | "brute" | "sat" | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState(
    "Start from the sample instance or generate a new graph.",
  );
  const [reductionRun, setReductionRun] = useState<ReductionRun | null>(null);
  const [bruteForceRun, setBruteForceRun] = useState<BruteForceRun | null>(null);
  const [satRun, setSatRun] = useState<SatRun | null>(null);

  const nodeColors = buildNodeColorMap(instance.nodes);

  function sanitizeIntegerInput(value: string) {
    return value.replace(/\D+/g, "");
  }

  function syncTargetCliqueInput(value: number) {
    setTargetCliqueInput(String(value));
  }

  function clearResults(nextInstance: GraphInstance) {
    setInstance(nextInstance);
    setReductionRun(null);
    setBruteForceRun(null);
    setSatRun(null);
    syncTargetCliqueInput(nextInstance.targetCliqueSize);
  }

  function handleMoveNode(nodeId: string, x: number, y: number) {
    clearResults({
      ...instance,
      nodes: instance.nodes.map((node) =>
        node.id === nodeId ? { ...node, x, y } : node,
      ),
    });
  }

  function handleToggleEdge(from: number, to: number) {
    const nextAdjacency = instance.adjacency.map((row) => [...row]);
    const nextValue = !nextAdjacency[from][to];
    nextAdjacency[from][to] = nextValue;
    nextAdjacency[to][from] = nextValue;
    clearResults({
      ...instance,
      adjacency: nextAdjacency,
    });
  }

  function handleAddNode() {
    if (instance.nodes.length >= MAX_INTERACTIVE_NODES) {
      setStatusMessage(
        `The interactive solver stays practical up to ${MAX_INTERACTIVE_NODES} nodes in this demo.`,
      );
      return;
    }

    const nextCount = instance.nodes.length + 1;
    const layout = createCircularLayout(nextCount);
    const nextLabel = layout[nextCount - 1].label;
    const nextNodes = [
      ...instance.nodes,
      {
        id: `v${nextCount}`,
        label: nextLabel,
        x: layout[nextCount - 1].x,
        y: layout[nextCount - 1].y,
      },
    ];
    const nextAdjacency = instance.adjacency.map((row) => [...row, false]);
    nextAdjacency.push(Array(nextCount).fill(false));

    clearResults({
      nodes: nextNodes,
      adjacency: nextAdjacency,
      targetCliqueSize: Math.min(instance.targetCliqueSize, nextCount),
    });
    setRandomNodeCount(nextCount);
    setRandomTargetK((current) => Math.min(current, nextCount));
    setStatusMessage(`Added vertex ${nextLabel}.`);
  }

  function handleAutoLayout() {
    const layout = createCircularLayout(instance.nodes.length);
    clearResults({
      ...instance,
      nodes: instance.nodes.map((node, index) => ({
        ...node,
        x: layout[index].x,
        y: layout[index].y,
      })),
    });
    setStatusMessage("Applied a circular layout to the current graph.");
  }

  function handleTargetCliqueChange(value: number) {
    const clampedValue = Math.min(
      Math.max(1, value || 1),
      Math.max(1, instance.nodes.length),
    );

    clearResults({
      ...instance,
      targetCliqueSize: clampedValue,
    });
  }

  function commitTargetCliqueInput(value: string) {
    if (value === "") {
      syncTargetCliqueInput(instance.targetCliqueSize);
      return;
    }

    handleTargetCliqueChange(Number(value));
  }

  function handleGenerateRandom() {
    const nodeCount = Math.min(
      MAX_INTERACTIVE_NODES,
      Math.max(3, randomNodeCount || 3),
    );
    const targetK = Math.min(nodeCount, Math.max(2, randomTargetK || 2));
    const next = generateRandomCliqueInstance(nodeCount, randomDensity, targetK);
    clearResults(next);
    setRandomNodeCount(nodeCount);
    setRandomTargetK(targetK);
    setStatusMessage(
      `Generated a random graph with ${nodeCount} vertices containing a clique of size at least ${targetK}.`,
    );
  }

  async function handleReduce() {
    setBusyAction("reduce");
    setStatusMessage("Reducing the current k-clique instance to SAT and 3-SAT.");
    await waitForPaint();

    const nextReduction = buildReduction(instance);
    setReductionRun(nextReduction);
    setStatusMessage("Reduction completed. Inspect the formula and clause mapping below.");
    setBusyAction(null);
  }

  async function handleBruteForce() {
    setBusyAction("brute");
    setStatusMessage("Searching the graph exhaustively for a clique.");
    await waitForPaint();

    const measurement = measureComputation(() => solveCliqueBruteForce(instance));
    setBruteForceRun({
      result: measurement.result,
      runtimeMs: measurement.runtimeMs,
    });
    setStatusMessage("Brute-force search finished.");
    setBusyAction(null);
  }

  async function handleSolveVia3Sat() {
    setBusyAction("sat");
    setStatusMessage(
      "Running the full reduction pipeline, solving the 3-SAT instance, and checking the result against brute force.",
    );
    await waitForPaint();

    const reduction = buildReduction(instance);

    const solverStart = now();
    const satResult = solveSat(reduction.threeSat.clauses, reduction.threeSat.variables);
    const solverEnd = now();

    const bruteMeasurement = measureComputation(() =>
      solveCliqueBruteForce(instance),
    );

    const cliqueIndices =
      satResult.assignment && satResult.satisfiable
        ? decodeCliqueAssignment(
            satResult.assignment,
            reduction.satReduction,
          )
        : [];

    const bruteForce = {
      result: bruteMeasurement.result,
      runtimeMs: bruteMeasurement.runtimeMs,
    };

    const solutionsAgree =
      satResult.satisfiable === bruteMeasurement.result.hasCliqueAtTargetSize;
    const isOptimal =
      satResult.satisfiable && cliqueIndices.length > 0
        ? cliqueIndices.length === bruteMeasurement.result.maximumClique.length
        : null;

    setReductionRun(reduction);
    setBruteForceRun(bruteForce);
    setSatRun({
      reduction,
      satisfiable: satResult.satisfiable,
      cliqueIndices,
      bruteForce,
      satSolverMs: solverEnd - solverStart,
      totalPipelineMs: reduction.totalMs + (solverEnd - solverStart),
      solutionsAgree,
      isOptimal,
    });
    setBusyAction(null);
    setStatusMessage("3-SAT solving completed.");
  }

  const activeReduction = satRun?.reduction ?? reductionRun;
  const displayedBruteForce = satRun?.bruteForce ?? bruteForceRun;
  const satComparisonNote = satRun
    ? `Matches brute force: ${satRun.solutionsAgree ? "yes" : "no"}.${
        satRun.isOptimal === null
          ? ""
          : ` Optimal: ${satRun.isOptimal ? "yes" : "no"}.`
      }`
    : undefined;

  return (
    <div className="problem-shell">
      <div className="breadcrumb-row">
        <Link className="inline-link" href="/">
          Home
        </Link>
        <span>/</span>
        <span>k-clique</span>
      </div>

      <section className="definition-card">
        <div className="definition-bar">k-Clique</div>
        <div className="definition-body">
          <p>
            <strong>Input.</strong> An undirected graph{" "}
            <span className="math-text">G = (V, E)</span> and an integer{" "}
            <span className="math-text">k ∈ N</span>.
          </p>
          <p>
            <strong>Question.</strong> Does{" "}
            <span className="math-text">G</span> have a{" "}
            <span className="math-text">k</span>-clique?
          </p>
          <p>
            <strong>Clique.</strong> A clique is a set{" "}
            <span className="math-text">C ⊆ V</span> such that every two
            distinct vertices in <span className="math-text">C</span> are
            adjacent.
          </p>
          <div className="definition-formula">
            <math className="display-math">
              <mrow>
                <mo>∃</mo>
                <mi>C</mi>
                <mo>⊆</mo>
                <mi>V</mi>
                <mo>:</mo>
                <mo>|</mo>
                <mi>C</mi>
                <mo>|</mo>
                <mo>≥</mo>
                <mi>k</mi>
                <mo>∧</mo>
                <mo>∀</mo>
                <mi>u</mi>
                <mo>,</mo>
                <mi>v</mi>
                <mo>∈</mo>
                <mi>C</mi>
                <mo>,</mo>
                <mi>u</mi>
                <mo>≠</mo>
                <mi>v</mi>
                <mo>⇒</mo>
                <mrow>
                  <mo>{"{"}</mo>
                  <mi>u</mi>
                  <mo>,</mo>
                  <mi>v</mi>
                  <mo>{"}"}</mo>
                </mrow>
                <mo>∈</mo>
                <mi>E</mi>
              </mrow>
            </math>
          </div>
        </div>
      </section>

      <section className="flat-section">
        <article className="flat-section-block">
          <div className="section-heading section-heading-tight">
            <div>
              <h2>Reduction to SAT and 3-SAT</h2>
            </div>
          </div>

          <div className="formal-steps">
            <FormalStep
              title="1. Variables"
              description="For every clique position i and every vertex v, introduce one Boolean variable."
            >
              <math className="display-math">
                <mrow>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>∈</mo>
                  <mrow>
                    <mo>{"{"}</mo>
                    <mn>0</mn>
                    <mo>,</mo>
                    <mn>1</mn>
                    <mo>{"}"}</mo>
                  </mrow>
                </mrow>
              </math>
              <math className="display-math">
                <mrow>
                  <mi>i</mi>
                  <mo>∈</mo>
                  <mrow>
                    <mo>{"{"}</mo>
                    <mn>1</mn>
                    <mo>,</mo>
                    <mo>…</mo>
                    <mo>,</mo>
                    <mi>k</mi>
                    <mo>{"}"}</mo>
                  </mrow>
                  <mo>,</mo>
                  <mi>v</mi>
                  <mo>∈</mo>
                  <mi>V</mi>
                </mrow>
              </math>
              <p className="math-caption">
                <span className="math-inline">xᵢ,ᵥ = 1</span> means that vertex{" "}
                <span className="math-inline">v</span> is chosen for clique
                position <span className="math-inline">i</span>.
              </p>
            </FormalStep>

            <FormalStep
              title="2. Every clique position is occupied"
              description="Each of the k positions must contain at least one selected vertex."
            >
              <math className="display-math">
                <mrow>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>cover</mtext>
                  </msub>
                  <mo>=</mo>
                  <munderover>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mi>i</mi>
                      <mo>=</mo>
                      <mn>1</mn>
                    </mrow>
                    <mi>k</mi>
                  </munderover>
                  <mo>(</mo>
                  <munder>
                    <mo className="big-operator">⋁</mo>
                    <mrow>
                      <mi>v</mi>
                      <mo>∈</mo>
                      <mi>V</mi>
                    </mrow>
                  </munder>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>)</mo>
                </mrow>
              </math>
            </FormalStep>

            <FormalStep
              title="3. A vertex cannot be used twice"
              description="The same graph vertex cannot appear in two different clique positions."
            >
              <math className="display-math">
                <mrow>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>vertex</mtext>
                  </msub>
                  <mo>=</mo>
                  <munder>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mi>v</mi>
                      <mo>∈</mo>
                      <mi>V</mi>
                    </mrow>
                  </munder>
                  <munder>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mn>1</mn>
                      <mo>≤</mo>
                      <mi>i</mi>
                      <mo>&lt;</mo>
                      <mi>j</mi>
                      <mo>≤</mo>
                      <mi>k</mi>
                    </mrow>
                  </munder>
                  <mo>(</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>∨</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>j</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>)</mo>
                </mrow>
              </math>
            </FormalStep>

            <FormalStep
              title="4. A position cannot contain two vertices"
              description="Each clique position must contain at most one vertex."
            >
              <math className="display-math">
                <mrow>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>position</mtext>
                  </msub>
                  <mo>=</mo>
                  <munderover>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mi>i</mi>
                      <mo>=</mo>
                      <mn>1</mn>
                    </mrow>
                    <mi>k</mi>
                  </munderover>
                  <munder>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mi>u</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                      <mo>∈</mo>
                      <mi>V</mi>
                      <mo>,</mo>
                      <mi>u</mi>
                      <mo>&lt;</mo>
                      <mi>v</mi>
                    </mrow>
                  </munder>
                  <mo>(</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>u</mi>
                    </mrow>
                  </msub>
                  <mo>∨</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>)</mo>
                </mrow>
              </math>
            </FormalStep>

            <FormalStep
              title="5. Non-edges are forbidden"
              description="If two vertices are not adjacent, they cannot both be chosen for the clique."
            >
              <math className="display-math">
                <mrow>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>edge</mtext>
                  </msub>
                  <mo>=</mo>
                  <munder>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mn>1</mn>
                      <mo>≤</mo>
                      <mi>i</mi>
                      <mo>&lt;</mo>
                      <mi>j</mi>
                      <mo>≤</mo>
                      <mi>k</mi>
                    </mrow>
                  </munder>
                  <munder>
                    <mo className="big-operator">⋀</mo>
                    <mrow>
                      <mrow>
                        <mo>{"{"}</mo>
                        <mi>u</mi>
                        <mo>,</mo>
                        <mi>v</mi>
                        <mo>{"}"}</mo>
                      </mrow>
                      <mo>∉</mo>
                      <mi>E</mi>
                    </mrow>
                  </munder>
                  <mo>(</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>i</mi>
                      <mo>,</mo>
                      <mi>u</mi>
                    </mrow>
                  </msub>
                  <mo>∨</mo>
                  <mo>¬</mo>
                  <msub>
                    <mi>x</mi>
                    <mrow>
                      <mi>j</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                    </mrow>
                  </msub>
                  <mo>)</mo>
                </mrow>
              </math>
            </FormalStep>

            <FormalStep
              title="6. Final SAT formula"
              description="The graph has a k-clique exactly when the conjunction below is satisfiable."
            >
              <math className="display-math">
                <mrow>
                  <mi>Φ</mi>
                  <mo>=</mo>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>cover</mtext>
                  </msub>
                  <mo>∧</mo>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>vertex</mtext>
                  </msub>
                  <mo>∧</mo>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>position</mtext>
                  </msub>
                  <mo>∧</mo>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>edge</mtext>
                  </msub>
                </mrow>
              </math>
              <p className="math-caption">
                <span className="math-inline">G</span> has a{" "}
                <span className="math-inline">k</span>-clique if and only if{" "}
                <span className="math-inline">Φ</span> is satisfiable.
              </p>
            </FormalStep>

            <FormalStep
              title="7. Conversion to 3-SAT"
              description="Finally, convert Φ into an equisatisfiable 3-CNF formula in which every clause has exactly three literals."
            >
              <math className="display-math">
                <mrow>
                  <mi>Φ</mi>
                  <mo>↦</mo>
                  <msub>
                    <mi>Φ</mi>
                    <mtext>3SAT</mtext>
                  </msub>
                </mrow>
              </math>
              <p className="math-caption">
                Every clause in{" "}
                <span className="math-inline">Φ₃SAT</span> has exactly three
                literals.
              </p>
            </FormalStep>
          </div>
        </article>
      </section>

      <GraphEditor
        instance={instance}
        nodeColors={nodeColors}
        onAddNode={handleAddNode}
        onAutoLayout={handleAutoLayout}
        onMoveNode={handleMoveNode}
        onToggleEdge={handleToggleEdge}
        maxNodes={MAX_INTERACTIVE_NODES}
        randomNodeCount={randomNodeCount}
        randomTargetK={randomTargetK}
        randomDensity={randomDensity}
        onRandomNodeCountChange={setRandomNodeCount}
        onRandomTargetKChange={setRandomTargetK}
        onRandomDensityChange={setRandomDensity}
        onGenerateRandom={handleGenerateRandom}
      />

      <section className="panel controls-panel">
        <div className="controls-left">
          <label className="target-label">
            Target clique size k
            <input
              type="text"
              inputMode="numeric"
              value={targetCliqueInput}
              onChange={(event) =>
                setTargetCliqueInput(sanitizeIntegerInput(event.target.value))
              }
              onBlur={() => commitTargetCliqueInput(targetCliqueInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTargetCliqueInput(targetCliqueInput);
                }
              }}
            />
          </label>
          <p className="status-line">{statusMessage}</p>
        </div>

        <div className="action-row">
          <button
            className="accent-button"
            type="button"
            onClick={handleReduce}
            disabled={busyAction !== null}
          >
            {busyAction === "reduce" ? "Reducing..." : "Reduce to 3-SAT"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleBruteForce}
            disabled={busyAction !== null}
          >
            {busyAction === "brute" ? "Running..." : "Solve with brute force"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleSolveVia3Sat}
            disabled={busyAction !== null}
          >
            {busyAction === "sat" ? "Solving..." : "Solve using 3-SAT"}
          </button>
        </div>
      </section>

      <section className="panel results-panel">
        <div className="section-heading section-heading-tight">
          <div>
            <h2>Results</h2>
          </div>
        </div>

        <div className="results-grid">
          <ResultGroup
            title="Reduction"
            items={[
              {
                label: "3-SAT variables",
                value: activeReduction?.threeSat.variables.length,
              },
              {
                label: "3-SAT clauses",
                value: activeReduction?.threeSat.clauses.length,
              },
              {
                label: "k-clique -> 3-SAT",
                value: activeReduction
                  ? formatMs(activeReduction.totalMs)
                  : null,
              },
            ]}
          />

          <ResultGroup
            title="Brute force"
            items={[
              {
                label: "Answer",
                value: displayedBruteForce
                  ? displayedBruteForce.result.hasCliqueAtTargetSize
                    ? "Yes"
                    : "No"
                  : null,
              },
              {
                label: "Maximum clique",
                value: displayedBruteForce
                  ? describeClique(
                      displayedBruteForce.result.maximumClique,
                      instance.nodes,
                    ) || "None"
                  : null,
              },
              {
                label: "Time",
                value: displayedBruteForce
                  ? formatMs(displayedBruteForce.runtimeMs)
                  : null,
              },
            ]}
          />

          <ResultGroup
            title="3-SAT"
            items={[
              {
                label: "Answer",
                value: satRun ? (satRun.satisfiable ? "Yes" : "No") : null,
              },
              {
                label: "Recovered clique",
                value: satRun
                  ? satRun.cliqueIndices.length > 0
                    ? describeClique(satRun.cliqueIndices, instance.nodes)
                    : "None"
                  : null,
              },
              {
                label: "Solver time",
                value: satRun ? formatMs(satRun.satSolverMs) : null,
              },
            ]}
            note={satComparisonNote}
          />
        </div>
      </section>

      {activeReduction ? (
        <section className="stack">
          <article className="panel visualisation-panel">
            <div className="section-heading section-heading-tight">
              <div>
                <h2>Reduction visualisation</h2>
              </div>
            </div>

            <div className="node-legend">
              {instance.nodes.map((node) => (
                <div className="legend-chip" key={node.id}>
                  <span
                    className="legend-dot"
                    style={{ background: nodeColors[node.id] }}
                  />
                  <span className="legend-label">{node.label}</span>
                  <div className="legend-math-row">
                    {Array.from(
                      { length: instance.targetCliqueSize },
                      (_, index) => (
                        <span className="legend-math-token" key={`${node.id}-${index + 1}`}>
                          <MathVariable variable={`x_${index + 1},${node.label}`} />
                          {index < instance.targetCliqueSize - 1 ? (
                            <span className="math-join-symbol">,</span>
                          ) : null}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="family-grid">
              {Object.entries(CLAUSE_FAMILY_INFO).map(([family, info]) => {
                const clauses = activeReduction.satReduction.formula.clauses
                  .filter((clause) => clause.family === family)
                  .slice(0, 3);

                return (
                  <article className="family-card" key={family}>
                    <div className="family-card-head">
                      <span
                        className="family-accent"
                        style={{ background: info.accent }}
                      />
                      <div>
                        <h3>{info.title}</h3>
                        <p>{info.description}</p>
                      </div>
                    </div>
                    <div className="clause-preview-stack">
                      {clauses.map((clause) => (
                        <ClausePreview
                          key={clause.id}
                          clause={clause}
                          nodeColors={nodeColors}
                        />
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </article>

          <article className="panel final-formula-panel">
            <div className="section-heading section-heading-tight">
              <div>
                <h2>Final 3-SAT formula</h2>
              </div>
            </div>

            <div className="formula-box formula-math-box">
              {activeReduction.threeSat.clauses.map((clause, index) => (
                <span className="formula-fragment" key={clause.id}>
                  <FormulaClause clause={clause} />
                  {index < activeReduction.threeSat.clauses.length - 1 ? (
                    <span className="formula-conjunction">∧</span>
                  ) : null}
                </span>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
