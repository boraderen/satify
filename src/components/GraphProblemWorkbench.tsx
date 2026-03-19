"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { GraphEditor } from "@/components/GraphEditor";
import {
  buildNodeColorMap,
  CLAUSE_FAMILY_INFO,
  createCircularLayout,
  decodeCliqueAssignment,
  describeClique,
  MAX_INTERACTIVE_NODES,
  reduceCliqueToSat,
  type CliqueSatReduction,
  type GraphInstance,
} from "@/lib/clique";
import {
  complementIndices,
  createSampleIndependentSetInstance,
  createSampleVertexCoverInstance,
  generateRandomIndependentSetInstance,
  generateRandomVertexCoverInstance,
  reduceIndependentSetToClique,
  reduceVertexCoverToClique,
  solveIndependentSetBruteForce,
  solveVertexCoverBruteForce,
  type GraphProblemBruteForceResult,
} from "@/lib/graphProblems";
import {
  convertCnfToThreeSat,
  solveSat,
  type Clause,
  type ThreeSatFormula,
} from "@/lib/sat";

type GraphProblemMode = "independent-set" | "vertex-cover";

type ReductionRun = {
  cliqueInstance: GraphInstance;
  satReduction: CliqueSatReduction;
  threeSat: ThreeSatFormula;
  satMs: number;
  threeSatMs: number;
  totalMs: number;
};

type BruteForceRun = {
  result: GraphProblemBruteForceResult;
  runtimeMs: number;
};

type SatRun = {
  reduction: ReductionRun;
  satisfiable: boolean;
  solutionIndices: number[];
  bruteForce: BruteForceRun;
  satSolverMs: number;
  totalPipelineMs: number;
  solutionsAgree: boolean;
  isOptimal: boolean | null;
};

type ProblemConfig = {
  slug: string;
  title: string;
  targetPrompt: string;
  recoveredLabel: string;
  optimalLabel: string;
  reductionLabel: string;
  randomSuccessMessage: (nodeCount: number, targetK: number) => string;
  sample: () => GraphInstance;
  random: (nodeCount: number, density: number, targetK: number) => GraphInstance;
  bruteForce: (instance: GraphInstance) => GraphProblemBruteForceResult;
  toClique: (instance: GraphInstance) => GraphInstance;
  fromCliqueSelection: (indices: number[], nodeCount: number) => number[];
};

const PROBLEM_CONFIG: Record<GraphProblemMode, ProblemConfig> = {
  "independent-set": {
    slug: "independent-set",
    title: "Independent Set",
    targetPrompt: "Target independent set size k",
    recoveredLabel: "Recovered independent set",
    optimalLabel: "Maximum independent set",
    reductionLabel: "independent set -> k-clique -> SAT -> 3-SAT",
    randomSuccessMessage: (nodeCount, targetK) =>
      `Generated a random graph with ${nodeCount} vertices containing an independent set of size at least ${targetK}.`,
    sample: createSampleIndependentSetInstance,
    random: generateRandomIndependentSetInstance,
    bruteForce: solveIndependentSetBruteForce,
    toClique: reduceIndependentSetToClique,
    fromCliqueSelection: (indices) => indices,
  },
  "vertex-cover": {
    slug: "vertex-cover",
    title: "Vertex Cover",
    targetPrompt: "Target vertex cover size k",
    recoveredLabel: "Recovered vertex cover",
    optimalLabel: "Minimum vertex cover",
    reductionLabel: "vertex cover -> independent set -> k-clique -> SAT -> 3-SAT",
    randomSuccessMessage: (nodeCount, targetK) =>
      `Generated a random graph with ${nodeCount} vertices admitting a vertex cover of size at most ${targetK}.`,
    sample: createSampleVertexCoverInstance,
    random: generateRandomVertexCoverInstance,
    bruteForce: solveVertexCoverBruteForce,
    toClique: reduceVertexCoverToClique,
    fromCliqueSelection: (indices, nodeCount) =>
      complementIndices(nodeCount, indices),
  },
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
  children: ReactNode;
}) {
  return (
    <article className="formal-step">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="math-block">{children}</div>
    </article>
  );
}

function buildReduction(mode: GraphProblemMode, instance: GraphInstance): ReductionRun {
  const toClique = PROBLEM_CONFIG[mode].toClique;
  const cliqueInstance = toClique(instance);
  const satStart = now();
  const satReduction = reduceCliqueToSat(cliqueInstance);
  const satEnd = now();
  const threeSat = convertCnfToThreeSat(
    satReduction.formula.clauses,
    satReduction.variableOrder,
  );
  const threeSatEnd = now();

  return {
    cliqueInstance,
    satReduction,
    threeSat,
    satMs: satEnd - satStart,
    threeSatMs: threeSatEnd - satEnd,
    totalMs: threeSatEnd - satStart,
  };
}

function renderIndependentSetReduction() {
  return (
    <div className="formal-steps">
      <FormalStep
        title="1. Independent set instance"
        description="Start with an undirected graph and an integer k."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>,</mo>
            <mi>G</mi>
            <mo>=</mo>
            <mrow>
              <mo>(</mo>
              <mi>V</mi>
              <mo>,</mo>
              <mi>E</mi>
              <mo>)</mo>
            </mrow>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="2. Build the complement graph"
        description="Keep the same vertex set and connect exactly the pairs that were not edges before."
      >
        <math className="display-math">
          <mrow>
            <mi>G̅</mi>
            <mo>=</mo>
            <mrow>
              <mo>(</mo>
              <mi>V</mi>
              <mo>,</mo>
              <mi>Ē</mi>
              <mo>)</mo>
            </mrow>
            <mo>,</mo>
            <mi>Ē</mi>
            <mo>=</mo>
            <mrow>
              <mo>{"{"}</mo>
              <mrow>
                <mo>{"{"}</mo>
                <mi>u</mi>
                <mo>,</mo>
                <mi>v</mi>
                <mo>{"}"}</mo>
              </mrow>
              <mo>∣</mo>
              <mi>u</mi>
              <mo>≠</mo>
              <mi>v</mi>
              <mo>,</mo>
              <mrow>
                <mo>{"{"}</mo>
                <mi>u</mi>
                <mo>,</mo>
                <mi>v</mi>
                <mo>{"}"}</mo>
              </mrow>
              <mo>∉</mo>
              <mi>E</mi>
              <mo>{"}"}</mo>
            </mrow>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="3. Keep k unchanged"
        description="The target size is identical in the complement-graph clique instance."
      >
        <math className="display-math">
          <mrow>
            <mi>k</mi>
            <mo>′</mo>
            <mo>=</mo>
            <mi>k</mi>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="4. Equivalence with clique"
        description="A vertex subset is independent in G exactly when it forms a clique in the complement graph."
      >
        <math className="display-math">
          <mrow>
            <mi>S</mi>
            <mo>⊆</mo>
            <mi>V</mi>
            <mo> is independent in </mo>
            <mi>G</mi>
            <mo>⇔</mo>
            <mi>S</mi>
            <mo> is a clique in </mo>
            <mi>G̅</mi>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="5. Reduce the resulting clique instance"
        description="Apply the existing clique-to-SAT reduction and then convert the CNF formula into 3-SAT."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <mi>G̅</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mi>Φ</mi>
            <mo>↦</mo>
            <msub>
              <mi>Φ</mi>
              <mtext>3SAT</mtext>
            </msub>
          </mrow>
        </math>
      </FormalStep>
    </div>
  );
}

function renderVertexCoverReduction() {
  return (
    <div className="formal-steps">
      <FormalStep
        title="1. Vertex cover instance"
        description="Start with an undirected graph and a target size k for the cover."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>,</mo>
            <mi>G</mi>
            <mo>=</mo>
            <mrow>
              <mo>(</mo>
              <mi>V</mi>
              <mo>,</mo>
              <mi>E</mi>
              <mo>)</mo>
            </mrow>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="2. Switch to independent set"
        description="A set C is a vertex cover exactly when its complement V \\ C is an independent set."
      >
        <math className="display-math">
          <mrow>
            <mi>C</mi>
            <mo> is a vertex cover in </mo>
            <mi>G</mi>
            <mo>⇔</mo>
            <mi>V</mi>
            <mo>∖</mo>
            <mi>C</mi>
            <mo> is independent in </mo>
            <mi>G</mi>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="3. Compute the independent-set target"
        description="The equivalent independent-set instance uses the same graph and target |V| - k."
      >
        <math className="display-math">
          <mrow>
            <mi>k</mi>
            <mo>′</mo>
            <mo>=</mo>
            <mo>|</mo>
            <mi>V</mi>
            <mo>|</mo>
            <mo>-</mo>
            <mi>k</mi>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="4. Build the complement graph"
        description="Turn the independent-set instance into a clique instance by complementing the graph."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>′</mo>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <mi>G̅</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>′</mo>
            <mo>)</mo>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="5. Reduce the resulting clique instance"
        description="Apply the clique-to-SAT reduction on the transformed instance and then convert the CNF formula into 3-SAT."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mo>|</mo>
            <mi>V</mi>
            <mo>|</mo>
            <mo>-</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <mi>G̅</mi>
            <mo>,</mo>
            <mo>|</mo>
            <mi>V</mi>
            <mo>|</mo>
            <mo>-</mo>
            <mi>k</mi>
            <mo>)</mo>
            <mo>↦</mo>
            <mi>Φ</mi>
            <mo>↦</mo>
            <msub>
              <mi>Φ</mi>
              <mtext>3SAT</mtext>
            </msub>
          </mrow>
        </math>
      </FormalStep>
    </div>
  );
}

function TransformationCards({
  mode,
  cliqueInstance,
}: {
  mode: GraphProblemMode;
  cliqueInstance: GraphInstance;
}) {
  if (mode === "independent-set") {
    return (
      <div className="transform-grid">
        <article className="transform-card">
          <h3>Input</h3>
          <p>Independent Set on the current graph.</p>
          <math className="display-math transform-math">
            <mrow>
              <mo>(</mo>
              <mi>G</mi>
              <mo>,</mo>
              <mi>k</mi>
              <mo>)</mo>
            </mrow>
          </math>
        </article>

        <article className="transform-card">
          <h3>Complement graph</h3>
          <p>Use the same vertices and invert every non-diagonal edge relation.</p>
          <math className="display-math transform-math">
            <mrow>
              <mo>(</mo>
              <mi>G̅</mi>
              <mo>,</mo>
              <mi>k</mi>
              <mo>)</mo>
            </mrow>
          </math>
        </article>

        <article className="transform-card">
          <h3>Clique instance</h3>
          <p>
            The final SAT reduction runs on a clique target of{" "}
            <span className="math-inline">{cliqueInstance.targetCliqueSize}</span>.
          </p>
          <math className="display-math transform-math">
            <mrow>
              <mi>S</mi>
              <mo> independent in </mo>
              <mi>G</mi>
              <mo>⇔</mo>
              <mi>S</mi>
              <mo> clique in </mo>
              <mi>G̅</mi>
            </mrow>
          </math>
        </article>
      </div>
    );
  }

  return (
    <div className="transform-grid">
      <article className="transform-card">
        <h3>Input</h3>
        <p>Vertex Cover on the current graph.</p>
        <math className="display-math transform-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>)</mo>
          </mrow>
        </math>
      </article>

      <article className="transform-card">
        <h3>Independent set instance</h3>
        <p>Keep the graph and convert the cover bound into an independent-set target.</p>
        <math className="display-math transform-math">
          <mrow>
            <mo>(</mo>
            <mi>G</mi>
            <mo>,</mo>
            <mi>k</mi>
            <mo>′</mo>
            <mo>=</mo>
            <mo>|</mo>
            <mi>V</mi>
            <mo>|</mo>
            <mo>-</mo>
            <mi>k</mi>
            <mo>)</mo>
          </mrow>
        </math>
      </article>

      <article className="transform-card">
        <h3>Clique instance</h3>
        <p>
          The final SAT reduction uses the complement graph with clique target{" "}
          <span className="math-inline">{cliqueInstance.targetCliqueSize}</span>.
        </p>
        <math className="display-math transform-math">
          <mrow>
            <mi>C</mi>
            <mo> cover in </mo>
            <mi>G</mi>
            <mo>⇔</mo>
            <mi>V</mi>
            <mo>∖</mo>
            <mi>C</mi>
            <mo> clique in </mo>
            <mi>G̅</mi>
          </mrow>
        </math>
      </article>
    </div>
  );
}

export function GraphProblemWorkbench({
  mode,
}: {
  mode: GraphProblemMode;
}) {
  const config = PROBLEM_CONFIG[mode];
  const [instance, setInstance] = useState<GraphInstance>(() => config.sample());
  const [randomNodeCount, setRandomNodeCount] = useState(instance.nodes.length);
  const [randomTargetK, setRandomTargetK] = useState(instance.targetCliqueSize);
  const [randomDensity, setRandomDensity] = useState(0.55);
  const [targetInput, setTargetInput] = useState(String(instance.targetCliqueSize));
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

  function syncTargetInput(value: number) {
    setTargetInput(String(value));
  }

  function clearResults(nextInstance: GraphInstance) {
    setInstance(nextInstance);
    setReductionRun(null);
    setBruteForceRun(null);
    setSatRun(null);
    syncTargetInput(nextInstance.targetCliqueSize);
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
    const nextNodes = [
      ...instance.nodes,
      {
        id: `v${nextCount}`,
        label: layout[nextCount - 1].label,
        x: layout[nextCount - 1].x,
        y: layout[nextCount - 1].y,
      },
    ];
    const nextAdjacency = instance.adjacency.map((row) => [...row, false]);
    nextAdjacency.push(Array(nextCount).fill(false));
    const clampedTarget = Math.min(instance.targetCliqueSize, nextCount);

    clearResults({
      nodes: nextNodes,
      adjacency: nextAdjacency,
      targetCliqueSize: clampedTarget,
    });
    setRandomNodeCount(nextCount);
    setRandomTargetK((current) => Math.min(current, nextCount));
    setStatusMessage(`Added vertex ${layout[nextCount - 1].label}.`);
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

  function handleTargetChange(value: number) {
    const minTarget = mode === "vertex-cover" ? 0 : 1;
    const clampedValue = Math.min(
      Math.max(minTarget, Number.isNaN(value) ? minTarget : value),
      Math.max(minTarget, instance.nodes.length),
    );

    clearResults({
      ...instance,
      targetCliqueSize: clampedValue,
    });
  }

  function commitTargetInput(value: string) {
    if (value === "") {
      syncTargetInput(instance.targetCliqueSize);
      return;
    }

    handleTargetChange(Number(value));
  }

  function handleGenerateRandom() {
    const nodeCount = Math.min(
      MAX_INTERACTIVE_NODES,
      Math.max(3, randomNodeCount || 3),
    );
    const minTarget = mode === "vertex-cover" ? 1 : 1;
    const targetK = Math.min(nodeCount, Math.max(minTarget, randomTargetK || minTarget));
    const next = config.random(nodeCount, randomDensity, targetK);
    clearResults(next);
    setRandomNodeCount(nodeCount);
    setRandomTargetK(targetK);
    setStatusMessage(config.randomSuccessMessage(nodeCount, targetK));
  }

  async function handleReduce() {
    setBusyAction("reduce");
    setStatusMessage(`Reducing the current ${config.title.toLowerCase()} instance to SAT and 3-SAT.`);
    await waitForPaint();

    const nextReduction = buildReduction(mode, instance);
    setReductionRun(nextReduction);
    setStatusMessage("Reduction completed. Inspect the transformed graph and the clause mapping below.");
    setBusyAction(null);
  }

  async function handleBruteForce() {
    setBusyAction("brute");
    setStatusMessage(`Searching the graph exhaustively for a ${config.title.toLowerCase()} witness.`);
    await waitForPaint();

    const measurement = measureComputation(() => config.bruteForce(instance));
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

    const reduction = buildReduction(mode, instance);
    const solverStart = now();
    const satResult = solveSat(reduction.threeSat.clauses, reduction.threeSat.variables);
    const solverEnd = now();
    const bruteMeasurement = measureComputation(() => config.bruteForce(instance));

    const cliqueIndices =
      satResult.assignment && satResult.satisfiable
        ? decodeCliqueAssignment(satResult.assignment, reduction.satReduction)
        : [];
    const solutionIndices = config.fromCliqueSelection(
      cliqueIndices,
      instance.nodes.length,
    );

    const bruteForce = {
      result: bruteMeasurement.result,
      runtimeMs: bruteMeasurement.runtimeMs,
    };

    const solutionsAgree =
      satResult.satisfiable === bruteMeasurement.result.hasTargetSolution;
    const isOptimal =
      satResult.satisfiable && solutionIndices.length > 0
        ? solutionIndices.length === bruteMeasurement.result.optimalSolution.length
        : null;

    setReductionRun(reduction);
    setBruteForceRun(bruteForce);
    setSatRun({
      reduction,
      satisfiable: satResult.satisfiable,
      solutionIndices,
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
        <span>{config.slug}</span>
      </div>

      <section className="definition-card">
        <div className="definition-bar">{config.title}</div>
        <div className="definition-body">
          {mode === "independent-set" ? (
            <>
              <p>
                <strong>Input.</strong> An undirected graph{" "}
                <span className="math-text">G = (V, E)</span> and an integer{" "}
                <span className="math-text">k ∈ N</span>.
              </p>
              <p>
                <strong>Question.</strong> Does{" "}
                <span className="math-text">G</span> have an independent set of
                size at least <span className="math-text">k</span>?
              </p>
              <p>
                <strong>Independent set.</strong> A set{" "}
                <span className="math-text">S ⊆ V</span> is independent if no
                two distinct vertices in <span className="math-text">S</span>{" "}
                are adjacent.
              </p>
              <div className="definition-formula">
                <math className="display-math">
                  <mrow>
                    <mo>∃</mo>
                    <mi>S</mi>
                    <mo>⊆</mo>
                    <mi>V</mi>
                    <mo>:</mo>
                    <mo>|</mo>
                    <mi>S</mi>
                    <mo>|</mo>
                    <mo>≥</mo>
                    <mi>k</mi>
                    <mo>∧</mo>
                    <mo>∀</mo>
                    <mi>u</mi>
                    <mo>,</mo>
                    <mi>v</mi>
                    <mo>∈</mo>
                    <mi>S</mi>
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
                    <mo>∉</mo>
                    <mi>E</mi>
                  </mrow>
                </math>
              </div>
            </>
          ) : (
            <>
              <p>
                <strong>Input.</strong> An undirected graph{" "}
                <span className="math-text">G = (V, E)</span> and an integer{" "}
                <span className="math-text">k ∈ N</span>.
              </p>
              <p>
                <strong>Question.</strong> Does{" "}
                <span className="math-text">G</span> have a vertex cover of
                size at most <span className="math-text">k</span>?
              </p>
              <p>
                <strong>Vertex cover.</strong> A set{" "}
                <span className="math-text">C ⊆ V</span> is a vertex cover if
                every edge has at least one endpoint in{" "}
                <span className="math-text">C</span>.
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
                    <mo>≤</mo>
                    <mi>k</mi>
                    <mo>∧</mo>
                    <mo>∀</mo>
                    <mrow>
                      <mo>{"{"}</mo>
                      <mi>u</mi>
                      <mo>,</mo>
                      <mi>v</mi>
                      <mo>{"}"}</mo>
                    </mrow>
                    <mo>∈</mo>
                    <mi>E</mi>
                    <mo>:</mo>
                    <mi>u</mi>
                    <mo>∈</mo>
                    <mi>C</mi>
                    <mo>∨</mo>
                    <mi>v</mi>
                    <mo>∈</mo>
                    <mi>C</mi>
                  </mrow>
                </math>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="flat-section">
        <article className="flat-section-block">
          <div className="section-heading section-heading-tight">
            <div>
              <h2>Reduction to SAT and 3-SAT</h2>
            </div>
          </div>
          {mode === "independent-set"
            ? renderIndependentSetReduction()
            : renderVertexCoverReduction()}
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
            {config.targetPrompt}
            <input
              type="text"
              inputMode="numeric"
              value={targetInput}
              onChange={(event) =>
                setTargetInput(sanitizeIntegerInput(event.target.value))
              }
              onBlur={() => commitTargetInput(targetInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTargetInput(targetInput);
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
                label: config.reductionLabel,
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
                  ? displayedBruteForce.result.hasTargetSolution
                    ? "Yes"
                    : "No"
                  : null,
              },
              {
                label: config.optimalLabel,
                value: displayedBruteForce
                  ? describeClique(
                      displayedBruteForce.result.optimalSolution,
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
                label: config.recoveredLabel,
                value: satRun
                  ? satRun.solutionIndices.length > 0
                    ? describeClique(satRun.solutionIndices, instance.nodes)
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

            <TransformationCards
              mode={mode}
              cliqueInstance={activeReduction.cliqueInstance}
            />

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
                      { length: activeReduction.cliqueInstance.targetCliqueSize },
                      (_, index) => (
                        <span className="legend-math-token" key={`${node.id}-${index + 1}`}>
                          <MathVariable variable={`x_${index + 1},${node.label}`} />
                          {index < activeReduction.cliqueInstance.targetCliqueSize - 1 ? (
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
