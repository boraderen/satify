"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FormulaEditor, type FormulaDraftClause } from "@/components/FormulaEditor";
import {
  buildVariableNames,
  convertCnfToThreeSat,
  createSampleFormula,
  generateRandomCnfFormula,
  projectAssignment,
  solveSat,
  solveSatBruteForce,
  type Assignment,
  type Clause,
  type CnfFormula,
  type FormulaMode,
  type Literal,
  type ThreeSatFormula,
} from "@/lib/sat";

const MAX_FORMULA_VARIABLES = 12;
const MAX_FORMULA_CLAUSES = 18;
const MAX_SAT_CLAUSE_LENGTH = 6;
const CLAUSE_COLORS = [
  "#26547c",
  "#ef476f",
  "#2a9d8f",
  "#f4a261",
  "#8e5a9b",
  "#e76f51",
  "#0a9396",
  "#5f0f40",
];

type ReductionRun = {
  inputFormula: CnfFormula;
  threeSat: ThreeSatFormula;
  totalMs: number;
};

type BruteForceRun = {
  satisfiable: boolean;
  assignment: Assignment | null;
  checkedAssignments: number;
  runtimeMs: number;
};

type SatRun = {
  reduction: ReductionRun;
  satisfiable: boolean;
  assignment: Assignment | null;
  bruteForce: BruteForceRun;
  satSolverMs: number;
  totalPipelineMs: number;
  solutionsAgree: boolean;
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function formatValue(value?: ReactNode) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return value;
}

function parseVariableName(variable: string) {
  const parts = variable.split("_");

  return {
    base: parts[0] ?? variable,
    subscript: parts.slice(1).join(", "),
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
  literal: Literal;
}) {
  return (
    <span className="math-literal">
      {literal.negated ? <span className="math-negation">¬</span> : null}
      <MathVariable variable={literal.variable} />
    </span>
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
  items: Array<{ label: string; value?: ReactNode }>;
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

function buildClauseColorMap(clauses: Clause[]) {
  return Object.fromEntries(
    clauses.map((clause, index) => [clause.id, CLAUSE_COLORS[index % CLAUSE_COLORS.length]]),
  );
}

function buildDraftFromFormula(formula: CnfFormula): FormulaDraftClause[] {
  return formula.clauses.map((clause) => ({
    id: clause.id,
    literals: clause.literals.map((literal) => ({
      variable: literal.variable,
      negated: literal.negated,
    })),
  }));
}

function createDefaultClause(
  mode: FormulaMode,
  variableNames: string[],
): FormulaDraftClause {
  const literalCount = mode === "3sat" ? 3 : Math.min(3, MAX_SAT_CLAUSE_LENGTH);
  const fallbackVariable = variableNames[0] ?? "x_1";

  return {
    id: createId("clause"),
    literals: Array.from({ length: literalCount }, (_, index) => ({
      variable: variableNames[index % variableNames.length] ?? fallbackVariable,
      negated: false,
    })),
  };
}

function normalizeDraftClauses(
  clauses: FormulaDraftClause[],
  variableNames: string[],
  mode: FormulaMode,
) {
  const fallbackVariable = variableNames[variableNames.length - 1] ?? variableNames[0] ?? "x_1";
  const allowedVariables = new Set(variableNames);

  return clauses.map((clause) => {
    let literals = clause.literals.map((literal) => ({
      ...literal,
      variable: allowedVariables.has(literal.variable)
        ? literal.variable
        : fallbackVariable,
    }));

    if (mode === "3sat") {
      if (literals.length === 0) {
        literals = [{ variable: fallbackVariable }];
      }

      while (literals.length < 3) {
        literals = [...literals, { ...literals[literals.length - 1] }];
      }

      literals = literals.slice(0, 3);
    } else {
      if (literals.length === 0) {
        literals = [{ variable: fallbackVariable }];
      }

      literals = literals.slice(0, MAX_SAT_CLAUSE_LENGTH);
    }

    return {
      ...clause,
      literals,
    };
  });
}

function buildInputFormula(
  variableCount: number,
  draftClauses: FormulaDraftClause[],
): CnfFormula {
  const variables = buildVariableNames(variableCount);

  return {
    variables,
    clauses: draftClauses.map((clause, index) => ({
      id: `c${index + 1}`,
      family: "input",
      description: `Input clause C${index + 1}.`,
      literals: clause.literals.map((literal) => ({
        variable: literal.variable,
        negated: literal.negated,
      })),
    })),
  };
}

function buildReduction(formula: CnfFormula): ReductionRun {
  const start = now();
  const threeSat = convertCnfToThreeSat(formula.clauses, formula.variables);
  const end = now();

  return {
    inputFormula: formula,
    threeSat,
    totalMs: end - start,
  };
}

function formatAssignment(assignment: Assignment | null, variables: string[]) {
  if (!assignment) {
    return "None";
  }

  const preview = variables.slice(0, 8).map((variable) => {
    const display = variable.replace("_", "");
    return `${display}=${assignment[variable] ? 1 : 0}`;
  });

  if (variables.length > 8) {
    preview.push(`+${variables.length - 8} more`);
  }

  return preview.join(", ");
}

function ReductionMappingCard({
  originalClause,
  mappedClauses,
  accent,
}: {
  originalClause: Clause;
  mappedClauses: Clause[];
  accent: string;
}) {
  return (
    <article className="formula-map-card">
      <div className="formula-map-head">
        <span
          className="formula-map-accent"
          style={{ background: accent }}
        />
        <h3>{originalClause.id.toUpperCase()}</h3>
      </div>

      <div className="formula-map-row">
        <span className="formula-map-label">Original</span>
        <div className="formula-map-math">
          <FormulaClause clause={originalClause} />
        </div>
      </div>

      <div className="formula-map-row">
        <span className="formula-map-label">
          {mappedClauses.length === 1 ? "3-SAT clause" : "3-SAT clauses"}
        </span>
        <div className="formula-map-output">
          {mappedClauses.map((clause, index) => (
            <span className="formula-fragment" key={clause.id}>
              <FormulaClause clause={clause} />
              {index < mappedClauses.length - 1 ? (
                <span className="formula-conjunction">∧</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function SatReductionSteps() {
  return (
    <div className="formal-steps">
      <FormalStep
        title="1. Start with the CNF formula"
        description="Write the input as a conjunction of clauses, and each clause as a disjunction of literals."
      >
        <math className="display-math">
          <mrow>
            <mi>Φ</mi>
            <mo>=</mo>
            <munderover>
              <mo className="big-operator">⋀</mo>
              <mrow>
                <mi>i</mi>
                <mo>=</mo>
                <mn>1</mn>
              </mrow>
              <mi>m</mi>
            </munderover>
            <msub>
              <mi>C</mi>
              <mi>i</mi>
            </msub>
            <mo>,</mo>
            <msub>
              <mi>C</mi>
              <mi>i</mi>
            </msub>
            <mo>=</mo>
            <munder>
              <mo className="big-operator">⋁</mo>
              <mrow>
                <mi>j</mi>
                <mo>=</mo>
                <mn>1</mn>
              </mrow>
            </munder>
            <msub>
              <mi>t</mi>
              <mi>i</mi>
            </msub>
            <msub>
              <mi>ℓ</mi>
              <mrow>
                <mi>i</mi>
                <mo>,</mo>
                <mi>j</mi>
              </mrow>
            </msub>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="2. Short clauses are padded"
        description="Clauses with one or two literals are rewritten to equivalent 3-literal clauses by repeating literals."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>)</mo>
          </mrow>
        </math>
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>2</mn>
            </msub>
            <mo>)</mo>
            <mo>↦</mo>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>2</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>2</mn>
            </msub>
            <mo>)</mo>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="3. Long clauses are split with fresh variables"
        description="For every clause with at least four literals, introduce fresh variables and replace it by a chain of 3-literal clauses."
      >
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>2</mn>
            </msub>
            <mo>∨</mo>
            <mo>…</mo>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mi>t</mi>
            </msub>
            <mo>)</mo>
            <mo>↦</mo>
          </mrow>
        </math>
        <math className="display-math">
          <mrow>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>2</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>y</mi>
              <mn>1</mn>
            </msub>
            <mo>)</mo>
            <mo>∧</mo>
            <mo>(</mo>
            <mo>¬</mo>
            <msub>
              <mi>y</mi>
              <mn>1</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mn>3</mn>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>y</mi>
              <mn>2</mn>
            </msub>
            <mo>)</mo>
            <mo>∧</mo>
            <mo>…</mo>
            <mo>∧</mo>
            <mo>(</mo>
            <mo>¬</mo>
            <msub>
              <mi>y</mi>
              <mrow>
                <mi>t</mi>
                <mo>-</mo>
                <mn>3</mn>
              </mrow>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mrow>
                <mi>t</mi>
                <mo>-</mo>
                <mn>1</mn>
              </mrow>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mi>t</mi>
            </msub>
            <mo>)</mo>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="4. Final 3-SAT formula"
        description="The transformed formula is satisfiable exactly when the original CNF formula is satisfiable."
      >
        <math className="display-math">
          <mrow>
            <msub>
              <mi>Φ</mi>
              <mtext>3SAT</mtext>
            </msub>
            <mo>=</mo>
            <munderover>
              <mo className="big-operator">⋀</mo>
              <mrow>
                <mi>i</mi>
                <mo>=</mo>
                <mn>1</mn>
              </mrow>
              <mi>m</mi>
            </munderover>
            <msub>
              <mi>D</mi>
              <mi>i</mi>
            </msub>
          </mrow>
        </math>
        <p className="math-caption">
          <span className="math-inline">Φ</span> is satisfiable if and only if{" "}
          <span className="math-inline">Φ₃SAT</span> is satisfiable.
        </p>
      </FormalStep>
    </div>
  );
}

function ThreeSatReductionSteps() {
  return (
    <div className="formal-steps">
      <FormalStep
        title="1. Start with a 3-CNF formula"
        description="The input is already a conjunction of clauses, and every clause has exactly three literals."
      >
        <math className="display-math">
          <mrow>
            <mi>Φ</mi>
            <mo>=</mo>
            <munderover>
              <mo className="big-operator">⋀</mo>
              <mrow>
                <mi>i</mi>
                <mo>=</mo>
                <mn>1</mn>
              </mrow>
              <mi>m</mi>
            </munderover>
            <mo>(</mo>
            <msub>
              <mi>ℓ</mi>
              <mrow>
                <mi>i</mi>
                <mo>,</mo>
                <mn>1</mn>
              </mrow>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mrow>
                <mi>i</mi>
                <mo>,</mo>
                <mn>2</mn>
              </mrow>
            </msub>
            <mo>∨</mo>
            <msub>
              <mi>ℓ</mi>
              <mrow>
                <mi>i</mi>
                <mo>,</mo>
                <mn>3</mn>
              </mrow>
            </msub>
            <mo>)</mo>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="2. No structural change is needed"
        description="Since every clause already has exactly three literals, the reduction is the identity map."
      >
        <math className="display-math">
          <mrow>
            <msub>
              <mi>Φ</mi>
              <mtext>3SAT</mtext>
            </msub>
            <mo>=</mo>
            <mi>Φ</mi>
          </mrow>
        </math>
      </FormalStep>

      <FormalStep
        title="3. Satisfiability is preserved"
        description="The formula after reduction has the same satisfying assignments on the original variables."
      >
        <math className="display-math">
          <mrow>
            <mi>Φ</mi>
            <mtext> is satisfiable </mtext>
            <mo>⇔</mo>
            <msub>
              <mi>Φ</mi>
              <mtext>3SAT</mtext>
            </msub>
            <mtext> is satisfiable</mtext>
          </mrow>
        </math>
      </FormalStep>
    </div>
  );
}

export function FormulaWorkbench({
  mode,
}: {
  mode: FormulaMode;
}) {
  const initialFormula = createSampleFormula(mode);
  const [variableCount, setVariableCount] = useState(initialFormula.variables.length);
  const [clauses, setClauses] = useState<FormulaDraftClause[]>(
    buildDraftFromFormula(initialFormula),
  );
  const [randomVariableCount, setRandomVariableCount] = useState(
    initialFormula.variables.length,
  );
  const [randomClauseCount, setRandomClauseCount] = useState(initialFormula.clauses.length);
  const [randomMaxClauseLength, setRandomMaxClauseLength] = useState(4);
  const [busyAction, setBusyAction] = useState<"reduce" | "brute" | "sat" | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState(
    "Edit the sample formula or generate a new instance.",
  );
  const [reductionRun, setReductionRun] = useState<ReductionRun | null>(null);
  const [bruteForceRun, setBruteForceRun] = useState<BruteForceRun | null>(null);
  const [satRun, setSatRun] = useState<SatRun | null>(null);

  const variableNames = buildVariableNames(variableCount);

  function clearResults(nextVariableCount: number, nextClauses: FormulaDraftClause[]) {
    setVariableCount(nextVariableCount);
    setClauses(nextClauses);
    setReductionRun(null);
    setBruteForceRun(null);
    setSatRun(null);
  }

  function handleVariableCountChange(nextVariableCount: number) {
    const nextVariables = buildVariableNames(nextVariableCount);
    clearResults(
      nextVariableCount,
      normalizeDraftClauses(clauses, nextVariables, mode),
    );
    setStatusMessage(`Using ${nextVariableCount} variables in the current formula.`);
  }

  function handleAddClause() {
    if (clauses.length >= MAX_FORMULA_CLAUSES) {
      setStatusMessage(
        `This demo stays responsive up to ${MAX_FORMULA_CLAUSES} clauses.`,
      );
      return;
    }

    clearResults(variableCount, [
      ...clauses,
      createDefaultClause(mode, variableNames),
    ]);
    setStatusMessage("Added a new clause.");
  }

  function handleRemoveClause(clauseId: string) {
    if (clauses.length <= 1) {
      return;
    }

    clearResults(
      variableCount,
      clauses.filter((clause) => clause.id !== clauseId),
    );
    setStatusMessage("Removed a clause.");
  }

  function handleUpdateLiteral(
    clauseId: string,
    literalIndex: number,
    nextLiteral: Literal,
  ) {
    clearResults(
      variableCount,
      clauses.map((clause) =>
        clause.id === clauseId
          ? {
              ...clause,
              literals: clause.literals.map((literal, index) =>
                index === literalIndex ? nextLiteral : literal,
              ),
            }
          : clause,
      ),
    );
  }

  function handleAddLiteral(clauseId: string) {
    clearResults(
      variableCount,
      clauses.map((clause) =>
        clause.id === clauseId
          ? {
              ...clause,
              literals:
                clause.literals.length >= MAX_SAT_CLAUSE_LENGTH
                  ? clause.literals
                  : [
                      ...clause.literals,
                      {
                        variable: variableNames[clause.literals.length % variableNames.length],
                        negated: false,
                      },
                    ],
            }
          : clause,
      ),
    );
  }

  function handleRemoveLiteral(clauseId: string, literalIndex: number) {
    clearResults(
      variableCount,
      clauses.map((clause) =>
        clause.id === clauseId
          ? {
              ...clause,
              literals:
                clause.literals.length <= 1
                  ? clause.literals
                  : clause.literals.filter((_, index) => index !== literalIndex),
            }
          : clause,
      ),
    );
  }

  function handleGenerateRandom() {
    const nextVariableCount = Math.min(
      MAX_FORMULA_VARIABLES,
      Math.max(1, randomVariableCount),
    );
    const nextClauseCount = Math.min(
      MAX_FORMULA_CLAUSES,
      Math.max(1, randomClauseCount),
    );
    const nextFormula = generateRandomCnfFormula({
      mode,
      variableCount: nextVariableCount,
      clauseCount: nextClauseCount,
      maxClauseLength: randomMaxClauseLength,
    });

    clearResults(nextVariableCount, buildDraftFromFormula(nextFormula));
    setRandomVariableCount(nextVariableCount);
    setRandomClauseCount(nextClauseCount);
    setStatusMessage(
      `Generated a random satisfiable ${mode === "sat" ? "CNF" : "3-CNF"} formula.`,
    );
  }

  function getCurrentFormula() {
    return buildInputFormula(variableCount, clauses);
  }

  async function handleReduce() {
    setBusyAction("reduce");
    setStatusMessage("Reducing the current formula to 3-SAT.");
    await waitForPaint();

    const reduction = buildReduction(getCurrentFormula());
    setReductionRun(reduction);
    setStatusMessage("Reduction completed. Inspect the clause mapping below.");
    setBusyAction(null);
  }

  async function handleBruteForce() {
    setBusyAction("brute");
    setStatusMessage("Checking the formula with exhaustive assignment search.");
    await waitForPaint();

    const formula = getCurrentFormula();
    const measurement = measureComputation(() =>
      solveSatBruteForce(formula.clauses, formula.variables),
    );

    setBruteForceRun({
      ...measurement.result,
      assignment: projectAssignment(
        measurement.result.assignment,
        formula.variables,
      ),
      runtimeMs: measurement.runtimeMs,
    });
    setStatusMessage("Brute-force solving finished.");
    setBusyAction(null);
  }

  async function handleSolveVia3Sat() {
    setBusyAction("sat");
    setStatusMessage(
      "Reducing the formula, solving the 3-SAT instance, and comparing with brute force.",
    );
    await waitForPaint();

    const formula = getCurrentFormula();
    const reduction = buildReduction(formula);
    const solverStart = now();
    const satResult = solveSat(reduction.threeSat.clauses, reduction.threeSat.variables);
    const solverEnd = now();
    const bruteMeasurement = measureComputation(() =>
      solveSatBruteForce(formula.clauses, formula.variables),
    );

    const projectedAssignment = projectAssignment(satResult.assignment, formula.variables);
    const bruteForce: BruteForceRun = {
      ...bruteMeasurement.result,
      assignment: projectAssignment(
        bruteMeasurement.result.assignment,
        formula.variables,
      ),
      runtimeMs: bruteMeasurement.runtimeMs,
    };

    setReductionRun(reduction);
    setBruteForceRun(bruteForce);
    setSatRun({
      reduction,
      satisfiable: satResult.satisfiable,
      assignment: projectedAssignment,
      bruteForce,
      satSolverMs: solverEnd - solverStart,
      totalPipelineMs: reduction.totalMs + (solverEnd - solverStart),
      solutionsAgree: satResult.satisfiable === bruteForce.satisfiable,
    });
    setStatusMessage("3-SAT solving completed.");
    setBusyAction(null);
  }

  const activeReduction = satRun?.reduction ?? reductionRun;
  const displayedBruteForce = satRun?.bruteForce ?? bruteForceRun;
  const clauseColors = activeReduction
    ? buildClauseColorMap(activeReduction.inputFormula.clauses)
    : {};
  const reductionLabel = mode === "sat" ? "SAT -> 3-SAT" : "3-SAT -> 3-SAT";
  const satNote = satRun
    ? `Matches brute force: ${satRun.solutionsAgree ? "yes" : "no"}. Optimality is not applicable for decision problems.`
    : undefined;

  return (
    <div className="problem-shell">
      <div className="breadcrumb-row">
        <Link className="inline-link" href="/">
          Home
        </Link>
        <span>/</span>
        <span>{mode === "sat" ? "sat" : "3-sat"}</span>
      </div>

      <section className="definition-card">
        <div className="definition-bar">{mode === "sat" ? "SAT" : "3-SAT"}</div>
        <div className="definition-body">
          {mode === "sat" ? (
            <>
              <p>
                <strong>Input.</strong> A Boolean formula{" "}
                <span className="math-text">Φ</span> in conjunctive normal form.
              </p>
              <p>
                <strong>Question.</strong> Is{" "}
                <span className="math-text">Φ</span> satisfiable?
              </p>
              <p>
                <strong>CNF.</strong> A CNF formula is a conjunction of clauses,
                and each clause is a disjunction of literals.
              </p>
              <div className="definition-formula">
                <math className="display-math">
                  <mrow>
                    <mi>Φ</mi>
                    <mo>=</mo>
                    <munderover>
                      <mo className="big-operator">⋀</mo>
                      <mrow>
                        <mi>i</mi>
                        <mo>=</mo>
                        <mn>1</mn>
                      </mrow>
                      <mi>m</mi>
                    </munderover>
                    <mo>(</mo>
                    <munder>
                      <mo className="big-operator">⋁</mo>
                      <mrow>
                        <mi>j</mi>
                        <mo>=</mo>
                        <mn>1</mn>
                      </mrow>
                    </munder>
                    <msub>
                      <mi>t</mi>
                      <mi>i</mi>
                    </msub>
                    <msub>
                      <mi>ℓ</mi>
                      <mrow>
                        <mi>i</mi>
                        <mo>,</mo>
                        <mi>j</mi>
                      </mrow>
                    </msub>
                    <mo>)</mo>
                  </mrow>
                </math>
              </div>
            </>
          ) : (
            <>
              <p>
                <strong>Input.</strong> A Boolean formula{" "}
                <span className="math-text">Φ</span> in 3-CNF.
              </p>
              <p>
                <strong>Question.</strong> Is{" "}
                <span className="math-text">Φ</span> satisfiable?
              </p>
              <p>
                <strong>3-CNF.</strong> A 3-CNF formula is a conjunction of
                clauses, and each clause has exactly three literals.
              </p>
              <div className="definition-formula">
                <math className="display-math">
                  <mrow>
                    <mi>Φ</mi>
                    <mo>=</mo>
                    <munderover>
                      <mo className="big-operator">⋀</mo>
                      <mrow>
                        <mi>i</mi>
                        <mo>=</mo>
                        <mn>1</mn>
                      </mrow>
                      <mi>m</mi>
                    </munderover>
                    <mo>(</mo>
                    <msub>
                      <mi>ℓ</mi>
                      <mrow>
                        <mi>i</mi>
                        <mo>,</mo>
                        <mn>1</mn>
                      </mrow>
                    </msub>
                    <mo>∨</mo>
                    <msub>
                      <mi>ℓ</mi>
                      <mrow>
                        <mi>i</mi>
                        <mo>,</mo>
                        <mn>2</mn>
                      </mrow>
                    </msub>
                    <mo>∨</mo>
                    <msub>
                      <mi>ℓ</mi>
                      <mrow>
                        <mi>i</mi>
                        <mo>,</mo>
                        <mn>3</mn>
                      </mrow>
                    </msub>
                    <mo>)</mo>
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
              <h2>Reduction to 3-SAT</h2>
            </div>
          </div>

          {mode === "sat" ? <SatReductionSteps /> : <ThreeSatReductionSteps />}
        </article>
      </section>

      <FormulaEditor
        mode={mode}
        clauses={clauses}
        variableCount={variableCount}
        variableNames={variableNames}
        maxVariables={MAX_FORMULA_VARIABLES}
        maxClauses={MAX_FORMULA_CLAUSES}
        maxClauseLength={MAX_SAT_CLAUSE_LENGTH}
        randomVariableCount={randomVariableCount}
        randomClauseCount={randomClauseCount}
        randomMaxClauseLength={randomMaxClauseLength}
        onVariableCountChange={handleVariableCountChange}
        onRandomVariableCountChange={setRandomVariableCount}
        onRandomClauseCountChange={setRandomClauseCount}
        onRandomMaxClauseLengthChange={setRandomMaxClauseLength}
        onGenerateRandom={handleGenerateRandom}
        onAddClause={handleAddClause}
        onRemoveClause={handleRemoveClause}
        onUpdateLiteral={handleUpdateLiteral}
        onAddLiteral={handleAddLiteral}
        onRemoveLiteral={handleRemoveLiteral}
      />

      <section className="panel controls-panel">
        <div className="controls-left">
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
                label: reductionLabel,
                value: activeReduction ? formatMs(activeReduction.totalMs) : null,
              },
            ]}
          />

          <ResultGroup
            title="Brute force"
            items={[
              {
                label: "Answer",
                value: displayedBruteForce
                  ? displayedBruteForce.satisfiable
                    ? "Yes"
                    : "No"
                  : null,
              },
              {
                label: "Assignment",
                value: displayedBruteForce
                  ? formatAssignment(displayedBruteForce.assignment, variableNames)
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
                label: "Assignment",
                value: satRun ? formatAssignment(satRun.assignment, variableNames) : null,
              },
              {
                label: "Solver time",
                value: satRun ? formatMs(satRun.satSolverMs) : null,
              },
            ]}
            note={satNote}
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

            <div className="formula-map-grid">
              {activeReduction.inputFormula.clauses.map((clause) => {
                const mappedClauses = activeReduction.threeSat.clauses.filter(
                  (candidate) => (candidate.sourceClauseId ?? candidate.id) === clause.id,
                );

                return (
                  <ReductionMappingCard
                    key={clause.id}
                    originalClause={clause}
                    mappedClauses={mappedClauses}
                    accent={clauseColors[clause.id]}
                  />
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
