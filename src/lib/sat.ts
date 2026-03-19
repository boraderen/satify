export type ClauseFamilyKey =
  | "coverage"
  | "unique-vertex"
  | "unique-position"
  | "non-edge";

export type FormulaMode = "sat" | "3sat";

export type Literal = {
  variable: string;
  negated?: boolean;
  nodeId?: string;
  nodeLabel?: string;
  position?: number;
};

export type Clause = {
  id: string;
  family: string;
  description: string;
  sourceClauseId?: string;
  literals: Literal[];
};

export type CnfFormula = {
  clauses: Clause[];
  variables: string[];
};

export type ThreeSatFormula = {
  clauses: Clause[];
  variables: string[];
  auxiliaryVariables: string[];
};

export type Assignment = Record<string, boolean>;

export type SatSolveResult = {
  satisfiable: boolean;
  assignment: Assignment | null;
  stats: {
    decisions: number;
    unitPropagations: number;
    pureAssignments: number;
    branches: number;
  };
};

export type BruteForceSatResult = {
  satisfiable: boolean;
  assignment: Assignment | null;
  checkedAssignments: number;
};

type RandomFormulaOptions = {
  mode: FormulaMode;
  variableCount: number;
  clauseCount: number;
  maxClauseLength?: number;
};

export function literalToString(literal: Literal) {
  return `${literal.negated ? "¬" : ""}${literal.variable}`;
}

export function clauseToString(clause: Clause) {
  return `(${clause.literals.map(literalToString).join(" or ")})`;
}

export function buildVariableNames(variableCount: number) {
  const nextCount = Math.max(1, Math.floor(variableCount));

  return Array.from({ length: nextCount }, (_, index) => `x_${index + 1}`);
}

export function projectAssignment(
  assignment: Assignment | null,
  variables: string[],
): Assignment | null {
  if (!assignment) {
    return null;
  }

  return Object.fromEntries(
    variables.map((variable) => [variable, assignment[variable] ?? false]),
  );
}

function evaluateLiteral(literal: Literal, assignment: Assignment) {
  const value = assignment[literal.variable];

  if (value === undefined) {
    return undefined;
  }

  return literal.negated ? !value : value;
}

function reduceClauses(clauses: Clause[], assignment: Assignment) {
  const reducedClauses: Clause[] = [];

  for (const clause of clauses) {
    let satisfied = false;
    const remainingLiterals: Literal[] = [];

    for (const literal of clause.literals) {
      const value = evaluateLiteral(literal, assignment);

      if (value === true) {
        satisfied = true;
        break;
      }

      if (value === undefined) {
        remainingLiterals.push(literal);
      }
    }

    if (satisfied) {
      continue;
    }

    if (remainingLiterals.length === 0) {
      return { conflict: true as const, clauses: [] as Clause[] };
    }

    reducedClauses.push({
      ...clause,
      literals: remainingLiterals,
    });
  }

  return { conflict: false as const, clauses: reducedClauses };
}

function findUnitLiteral(clauses: Clause[]) {
  return clauses.find((clause) => clause.literals.length === 1)?.literals[0];
}

function findPureLiteral(clauses: Clause[], assignment: Assignment) {
  const seen = new Map<string, Set<boolean>>();

  for (const clause of clauses) {
    for (const literal of clause.literals) {
      if (assignment[literal.variable] !== undefined) {
        continue;
      }

      const values = seen.get(literal.variable) ?? new Set<boolean>();
      values.add(Boolean(literal.negated));
      seen.set(literal.variable, values);
    }
  }

  for (const [variable, signs] of seen.entries()) {
    if (signs.size === 1) {
      const isNegated = signs.has(true);
      return {
        variable,
        value: !isNegated,
      };
    }
  }

  return null;
}

function chooseVariable(clauses: Clause[], variables: string[], assignment: Assignment) {
  const shortestClause = clauses.reduce<Clause | null>((best, clause) => {
    if (!best || clause.literals.length < best.literals.length) {
      return clause;
    }

    return best;
  }, null);

  if (shortestClause) {
    const fromClause = shortestClause.literals.find(
      (literal) => assignment[literal.variable] === undefined,
    );

    if (fromClause) {
      return fromClause.variable;
    }
  }

  return variables.find((variable) => assignment[variable] === undefined);
}

function evaluateClause(clause: Clause, assignment: Assignment) {
  return clause.literals.some((literal) => evaluateLiteral(literal, assignment) === true);
}

function evaluateFormula(clauses: Clause[], assignment: Assignment) {
  return clauses.every((clause) => evaluateClause(clause, assignment));
}

function makeInputClause(id: string, literals: Literal[], description: string): Clause {
  return {
    id,
    family: "input",
    description,
    literals,
  };
}

function dpll(
  clauses: Clause[],
  assignment: Assignment,
  variables: string[],
  stats: SatSolveResult["stats"],
): Assignment | null {
  let workingClauses = clauses;
  let workingAssignment = assignment;

  while (true) {
    const reduced = reduceClauses(workingClauses, workingAssignment);

    if (reduced.conflict) {
      return null;
    }

    if (reduced.clauses.length === 0) {
      return workingAssignment;
    }

    workingClauses = reduced.clauses;

    const unitLiteral = findUnitLiteral(workingClauses);
    if (unitLiteral) {
      stats.unitPropagations += 1;
      workingAssignment = {
        ...workingAssignment,
        [unitLiteral.variable]: !unitLiteral.negated,
      };
      continue;
    }

    const pureLiteral = findPureLiteral(workingClauses, workingAssignment);
    if (pureLiteral) {
      stats.pureAssignments += 1;
      workingAssignment = {
        ...workingAssignment,
        [pureLiteral.variable]: pureLiteral.value,
      };
      continue;
    }

    break;
  }

  const variable = chooseVariable(workingClauses, variables, workingAssignment);

  if (!variable) {
    return workingAssignment;
  }

  stats.branches += 1;

  for (const guess of [true, false]) {
    stats.decisions += 1;
    const result = dpll(
      workingClauses,
      { ...workingAssignment, [variable]: guess },
      variables,
      stats,
    );

    if (result) {
      return result;
    }
  }

  return null;
}

export function solveSat(clauses: Clause[], variables: string[]): SatSolveResult {
  const stats = {
    decisions: 0,
    unitPropagations: 0,
    pureAssignments: 0,
    branches: 0,
  };
  const assignment = dpll(
    clauses,
    {},
    Array.from(new Set(variables)),
    stats,
  );

  return {
    satisfiable: assignment !== null,
    assignment,
    stats,
  };
}

export function solveSatBruteForce(
  clauses: Clause[],
  variables: string[],
): BruteForceSatResult {
  const orderedVariables = Array.from(new Set(variables));
  let checkedAssignments = 0;

  function search(index: number, assignment: Assignment): Assignment | null {
    if (index >= orderedVariables.length) {
      checkedAssignments += 1;
      return evaluateFormula(clauses, assignment) ? assignment : null;
    }

    const variable = orderedVariables[index];

    for (const value of [true, false]) {
      const result = search(index + 1, {
        ...assignment,
        [variable]: value,
      });

      if (result) {
        return result;
      }
    }

    return null;
  }

  const assignment = search(0, {});

  return {
    satisfiable: assignment !== null,
    assignment,
    checkedAssignments,
  };
}

export function convertCnfToThreeSat(
  clauses: Clause[],
  variables: string[],
): ThreeSatFormula {
  const nextClauses: Clause[] = [];
  const allVariables = [...variables];
  const auxiliaryVariables: string[] = [];

  for (const clause of clauses) {
    if (clause.literals.length === 3) {
      nextClauses.push(clause);
      continue;
    }

    if (clause.literals.length === 1) {
      nextClauses.push({
        ...clause,
        id: `${clause.id}-3sat`,
        sourceClauseId: clause.id,
        description: `${clause.description} Padded to length 3.`,
        literals: [clause.literals[0], clause.literals[0], clause.literals[0]],
      });
      continue;
    }

    if (clause.literals.length === 2) {
      nextClauses.push({
        ...clause,
        id: `${clause.id}-3sat`,
        sourceClauseId: clause.id,
        description: `${clause.description} Padded to length 3.`,
        literals: [clause.literals[0], clause.literals[1], clause.literals[1]],
      });
      continue;
    }

    const auxiliaryCount = clause.literals.length - 3;
    const helperVariables = Array.from({ length: auxiliaryCount }, (_, index) => {
      const variable = `y_${clause.id}_${index + 1}`;
      auxiliaryVariables.push(variable);
      allVariables.push(variable);
      return variable;
    });

    nextClauses.push({
      ...clause,
      id: `${clause.id}-split-1`,
      sourceClauseId: clause.id,
      description: `${clause.description} Split into 3-SAT clauses.`,
      literals: [
        clause.literals[0],
        clause.literals[1],
        {
          variable: helperVariables[0],
        },
      ],
    });

    for (let index = 0; index < helperVariables.length - 1; index += 1) {
      nextClauses.push({
        ...clause,
        id: `${clause.id}-split-${index + 2}`,
        sourceClauseId: clause.id,
        description: `${clause.description} Split into 3-SAT clauses.`,
        literals: [
          {
            variable: helperVariables[index],
            negated: true,
          },
          clause.literals[index + 2],
          {
            variable: helperVariables[index + 1],
          },
        ],
      });
    }

    nextClauses.push({
      ...clause,
      id: `${clause.id}-split-${helperVariables.length + 1}`,
      sourceClauseId: clause.id,
      description: `${clause.description} Split into 3-SAT clauses.`,
      literals: [
        {
          variable: helperVariables[helperVariables.length - 1],
          negated: true,
        },
        clause.literals[clause.literals.length - 2],
        clause.literals[clause.literals.length - 1],
      ],
    });
  }

  return {
    clauses: nextClauses,
    variables: Array.from(new Set(allVariables)),
    auxiliaryVariables,
  };
}

export function createSampleFormula(mode: FormulaMode): CnfFormula {
  if (mode === "3sat") {
    const variables = buildVariableNames(4);

    return {
      variables,
      clauses: [
        makeInputClause(
          "c1",
          [
            { variable: "x_1" },
            { variable: "x_2", negated: true },
            { variable: "x_3" },
          ],
          "Input clause C1.",
        ),
        makeInputClause(
          "c2",
          [
            { variable: "x_1", negated: true },
            { variable: "x_3" },
            { variable: "x_4" },
          ],
          "Input clause C2.",
        ),
        makeInputClause(
          "c3",
          [
            { variable: "x_2" },
            { variable: "x_3", negated: true },
            { variable: "x_4" },
          ],
          "Input clause C3.",
        ),
      ],
    };
  }

  const variables = buildVariableNames(4);

  return {
    variables,
    clauses: [
      makeInputClause(
        "c1",
        [
          { variable: "x_1" },
          { variable: "x_2", negated: true },
          { variable: "x_3" },
          { variable: "x_4" },
        ],
        "Input clause C1.",
      ),
      makeInputClause(
        "c2",
        [
          { variable: "x_1", negated: true },
          { variable: "x_2" },
        ],
        "Input clause C2.",
      ),
      makeInputClause(
        "c3",
        [{ variable: "x_4" }],
        "Input clause C3.",
      ),
    ],
  };
}

export function generateRandomCnfFormula({
  mode,
  variableCount,
  clauseCount,
  maxClauseLength = 5,
}: RandomFormulaOptions): CnfFormula {
  const variables = buildVariableNames(variableCount);
  const plantedAssignment: Assignment = Object.fromEntries(
    variables.map((variable) => [variable, Math.random() >= 0.5]),
  );

  const clauses = Array.from({ length: Math.max(1, clauseCount) }, (_, index) => {
    const clauseSize =
      mode === "3sat"
        ? 3
        : Math.max(1, Math.min(maxClauseLength, 1 + Math.floor(Math.random() * maxClauseLength)));

    const literals = Array.from({ length: clauseSize }, () => {
      const variable = variables[Math.floor(Math.random() * variables.length)];
      return {
        variable,
        negated: Math.random() >= 0.5,
      };
    });

    const clauseSatisfied = literals.some((literal) => {
      const value = plantedAssignment[literal.variable];
      return literal.negated ? !value : value;
    });

    if (!clauseSatisfied) {
      const forcedIndex = Math.floor(Math.random() * literals.length);
      const variable = literals[forcedIndex].variable;
      literals[forcedIndex] = {
        variable,
        negated: !plantedAssignment[variable],
      };
    }

    return makeInputClause(
      `c${index + 1}`,
      literals,
      `Input clause C${index + 1}.`,
    );
  });

  return {
    clauses,
    variables,
  };
}
