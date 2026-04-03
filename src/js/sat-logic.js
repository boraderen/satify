(function () {
  const {
    clampInteger,
    createId,
    range,
    shuffle,
    unique,
  } = window.SATifyCommon;

  const FORMULA_LIMITS = {
    maxVariables: 12,
    maxClauses: 18,
    maxClauseLength: 6,
  };

  function buildVariableNames(count) {
    const variableCount = Math.max(1, Math.trunc(Number(count)) || 1);
    return range(variableCount).map(function (index) {
      return `x_${index + 1}`;
    });
  }

  function makeClause(id, literals, description, family, sourceClauseId) {
    return {
      id,
      family: family || "input",
      description,
      sourceClauseId: sourceClauseId || null,
      literals,
    };
  }

  function createSampleFormula(mode) {
    if (mode === "3sat") {
      return {
        variables: buildVariableNames(4),
        clauses: [
          makeClause(
            "c1",
            [
              { variable: "x_1" },
              { variable: "x_2", negated: true },
              { variable: "x_3" },
            ],
            "Input clause C1.",
          ),
          makeClause(
            "c2",
            [
              { variable: "x_1", negated: true },
              { variable: "x_3" },
              { variable: "x_4" },
            ],
            "Input clause C2.",
          ),
          makeClause(
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

    return {
      variables: buildVariableNames(4),
      clauses: [
        makeClause(
          "c1",
          [
            { variable: "x_1" },
            { variable: "x_2", negated: true },
            { variable: "x_3" },
            { variable: "x_4" },
          ],
          "Input clause C1.",
        ),
        makeClause(
          "c2",
          [
            { variable: "x_1", negated: true },
            { variable: "x_2" },
          ],
          "Input clause C2.",
        ),
        makeClause(
          "c3",
          [{ variable: "x_4" }],
          "Input clause C3.",
        ),
      ],
    };
  }

  function createDraftClauses(formula) {
    return formula.clauses.map(function (clause) {
      return {
        id: clause.id,
        literals: clause.literals.map(function (literal) {
          return {
            variable: literal.variable,
            negated: Boolean(literal.negated),
          };
        }),
      };
    });
  }

  function createDefaultDraftClause(mode, variableNames) {
    const length = mode === "3sat" ? 3 : Math.min(3, FORMULA_LIMITS.maxClauseLength);
    const fallbackVariable = variableNames[0] ?? "x_1";

    return {
      id: createId("clause"),
      literals: range(length).map(function (index) {
        return {
          variable: variableNames[index % variableNames.length] ?? fallbackVariable,
          negated: false,
        };
      }),
    };
  }

  function normalizeDraftClauses(draftClauses, variableNames, mode) {
    const allowedVariables = new Set(variableNames);
    const fallbackVariable =
      variableNames[variableNames.length - 1] ?? variableNames[0] ?? "x_1";

    return draftClauses.map(function (clause) {
      let literals = clause.literals.map(function (literal) {
        return {
          variable: allowedVariables.has(literal.variable)
            ? literal.variable
            : fallbackVariable,
          negated: Boolean(literal.negated),
        };
      });

      if (mode === "3sat") {
        if (!literals.length) {
          literals = [{ variable: fallbackVariable, negated: false }];
        }

        while (literals.length < 3) {
          literals.push({ ...literals[literals.length - 1] });
        }

        literals = literals.slice(0, 3);
      } else {
        if (!literals.length) {
          literals = [{ variable: fallbackVariable, negated: false }];
        }

        literals = literals.slice(0, FORMULA_LIMITS.maxClauseLength);
      }

      return {
        ...clause,
        literals,
      };
    });
  }

  function buildFormulaFromDraft(variableCount, draftClauses) {
    const variables = buildVariableNames(variableCount);

    return {
      variables,
      clauses: draftClauses.map(function (draftClause, index) {
        return makeClause(
          `c${index + 1}`,
          draftClause.literals.map(function (literal) {
            return {
              variable: literal.variable,
              negated: Boolean(literal.negated),
            };
          }),
          `Input clause C${index + 1}.`,
        );
      }),
    };
  }

  function literalValue(literal, assignment) {
    const raw = assignment[literal.variable];

    if (raw === undefined) {
      return undefined;
    }

    return literal.negated ? !raw : raw;
  }

  function simplifyClauses(clauses, assignment) {
    const nextClauses = [];

    for (const clause of clauses) {
      let satisfied = false;
      const undecided = [];

      for (const literal of clause.literals) {
        const value = literalValue(literal, assignment);

        if (value === true) {
          satisfied = true;
          break;
        }

        if (value === undefined) {
          undecided.push(literal);
        }
      }

      if (satisfied) {
        continue;
      }

      if (!undecided.length) {
        return {
          conflict: true,
          clauses: [],
        };
      }

      nextClauses.push({
        ...clause,
        literals: undecided,
      });
    }

    return {
      conflict: false,
      clauses: nextClauses,
    };
  }

  function findUnitLiteral(clauses) {
    const unitClause = clauses.find(function (clause) {
      return clause.literals.length === 1;
    });
    return unitClause ? unitClause.literals[0] : null;
  }

  function findPureAssignment(clauses, assignment) {
    const signsByVariable = new Map();

    for (const clause of clauses) {
      for (const literal of clause.literals) {
        if (assignment[literal.variable] !== undefined) {
          continue;
        }

        const signs = signsByVariable.get(literal.variable) ?? new Set();
        signs.add(Boolean(literal.negated));
        signsByVariable.set(literal.variable, signs);
      }
    }

    for (const [variable, signs] of signsByVariable.entries()) {
      if (signs.size === 1) {
        return {
          variable,
          value: !signs.has(true),
        };
      }
    }

    return null;
  }

  function chooseBranchVariable(clauses, variables, assignment) {
    const shortestClause = clauses.reduce(function (best, clause) {
      if (!best || clause.literals.length < best.literals.length) {
        return clause;
      }

      return best;
    }, null);

    if (shortestClause) {
      const fromClause = shortestClause.literals.find(function (literal) {
        return assignment[literal.variable] === undefined;
      });

      if (fromClause) {
        return fromClause.variable;
      }
    }

    return (
      variables.find(function (variable) {
        return assignment[variable] === undefined;
      }) ?? null
    );
  }

  function dpll(clauses, variables, assignment, stats) {
    let workingClauses = clauses;
    let workingAssignment = assignment;

    while (true) {
      const simplified = simplifyClauses(workingClauses, workingAssignment);

      if (simplified.conflict) {
        return null;
      }

      if (!simplified.clauses.length) {
        return workingAssignment;
      }

      workingClauses = simplified.clauses;

      const unitLiteral = findUnitLiteral(workingClauses);
      if (unitLiteral) {
        stats.unitPropagations += 1;
        workingAssignment = {
          ...workingAssignment,
          [unitLiteral.variable]: !unitLiteral.negated,
        };
        continue;
      }

      const pureAssignment = findPureAssignment(workingClauses, workingAssignment);
      if (pureAssignment) {
        stats.pureAssignments += 1;
        workingAssignment = {
          ...workingAssignment,
          [pureAssignment.variable]: pureAssignment.value,
        };
        continue;
      }

      break;
    }

    const branchVariable = chooseBranchVariable(
      workingClauses,
      variables,
      workingAssignment,
    );

    if (!branchVariable) {
      return workingAssignment;
    }

    stats.branches += 1;

    for (const guess of [true, false]) {
      stats.decisions += 1;
      const result = dpll(
        workingClauses,
        variables,
        {
          ...workingAssignment,
          [branchVariable]: guess,
        },
        stats,
      );

      if (result) {
        return result;
      }
    }

    return null;
  }

  function solveSat(formula) {
    const variables = unique(formula.variables);
    const stats = {
      decisions: 0,
      unitPropagations: 0,
      pureAssignments: 0,
      branches: 0,
    };

    const assignment = dpll(formula.clauses, variables, {}, stats);

    return {
      satisfiable: assignment !== null,
      assignment,
      stats,
    };
  }

  function clauseSatisfied(clause, assignment) {
    return clause.literals.some(function (literal) {
      return literalValue(literal, assignment) === true;
    });
  }

  function formulaSatisfied(clauses, assignment) {
    return clauses.every(function (clause) {
      return clauseSatisfied(clause, assignment);
    });
  }

  function solveSatBruteForce(formula) {
    const variables = unique(formula.variables);
    let checkedAssignments = 0;

    function search(index, assignment) {
      if (index >= variables.length) {
        checkedAssignments += 1;
        return formulaSatisfied(formula.clauses, assignment) ? assignment : null;
      }

      const variable = variables[index];

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

  function projectAssignment(assignment, variables) {
    if (!assignment) {
      return null;
    }

    return Object.fromEntries(
      variables.map(function (variable) {
        return [variable, Boolean(assignment[variable])];
      }),
    );
  }

  function convertToThreeSat(formula) {
    const variables = formula.variables.slice();
    const clauses = [];
    const auxiliaryVariables = [];

    for (const clause of formula.clauses) {
      if (clause.literals.length === 3) {
        clauses.push({
          ...clause,
        });
        continue;
      }

      if (clause.literals.length === 1) {
        clauses.push(
          makeClause(
            `${clause.id}-3sat`,
            [clause.literals[0], clause.literals[0], clause.literals[0]],
            `${clause.description} Padded to length 3.`,
            clause.family,
            clause.id,
          ),
        );
        continue;
      }

      if (clause.literals.length === 2) {
        clauses.push(
          makeClause(
            `${clause.id}-3sat`,
            [clause.literals[0], clause.literals[1], clause.literals[1]],
            `${clause.description} Padded to length 3.`,
            clause.family,
            clause.id,
          ),
        );
        continue;
      }

      const helperCount = clause.literals.length - 3;
      const helpers = range(helperCount).map(function (index) {
        const variable = `y_${clause.id}_${index + 1}`;
        auxiliaryVariables.push(variable);
        variables.push(variable);
        return variable;
      });

      clauses.push(
        makeClause(
          `${clause.id}-split-1`,
          [
            clause.literals[0],
            clause.literals[1],
            { variable: helpers[0] },
          ],
          `${clause.description} Split into 3-SAT clauses.`,
          clause.family,
          clause.id,
        ),
      );

      for (let index = 0; index < helpers.length - 1; index += 1) {
        clauses.push(
          makeClause(
            `${clause.id}-split-${index + 2}`,
            [
              { variable: helpers[index], negated: true },
              clause.literals[index + 2],
              { variable: helpers[index + 1] },
            ],
            `${clause.description} Split into 3-SAT clauses.`,
            clause.family,
            clause.id,
          ),
        );
      }

      clauses.push(
        makeClause(
          `${clause.id}-split-${helpers.length + 1}`,
          [
            { variable: helpers[helpers.length - 1], negated: true },
            clause.literals[clause.literals.length - 2],
            clause.literals[clause.literals.length - 1],
          ],
          `${clause.description} Split into 3-SAT clauses.`,
          clause.family,
          clause.id,
        ),
      );
    }

    return {
      variables: unique(variables),
      clauses,
      auxiliaryVariables,
    };
  }

  function generateRandomFormula(options) {
    const variables = buildVariableNames(options.variableCount);
    const plantedAssignment = Object.fromEntries(
      shuffle(variables).map(function (variable) {
        return [variable, Math.random() >= 0.5];
      }),
    );

    const clauses = range(Math.max(1, options.clauseCount)).map(function (index) {
      const literalCount =
        options.mode === "3sat"
          ? 3
          : clampInteger(
              1 + Math.floor(Math.random() * options.maxClauseLength),
              1,
              FORMULA_LIMITS.maxClauseLength,
              3,
            );

      const literals = range(literalCount).map(function () {
        const variable = variables[Math.floor(Math.random() * variables.length)];
        return {
          variable,
          negated: Math.random() >= 0.5,
        };
      });

      const satisfied = literals.some(function (literal) {
        const variableValue = plantedAssignment[literal.variable];
        return literal.negated ? !variableValue : variableValue;
      });

      if (!satisfied) {
        const forcedIndex = Math.floor(Math.random() * literals.length);
        const variable = literals[forcedIndex].variable;
        literals[forcedIndex] = {
          variable,
          negated: !plantedAssignment[variable],
        };
      }

      return makeClause(
        `c${index + 1}`,
        literals,
        `Input clause C${index + 1}.`,
      );
    });

    return {
      variables,
      clauses,
    };
  }

  function formatAssignmentPreview(assignment, variables) {
    if (!assignment) {
      return "None";
    }

    const preview = variables.slice(0, 8).map(function (variable) {
      const printable = variable.replace("_", "");
      return `${printable}=${assignment[variable] ? 1 : 0}`;
    });

    if (variables.length > 8) {
      preview.push(`+${variables.length - 8} more`);
    }

    return preview.join(", ");
  }

  window.SATifySat = {
    FORMULA_LIMITS,
    buildVariableNames,
    createSampleFormula,
    createDraftClauses,
    createDefaultDraftClause,
    normalizeDraftClauses,
    buildFormulaFromDraft,
    solveSat,
    solveSatBruteForce,
    projectAssignment,
    convertToThreeSat,
    generateRandomFormula,
    formatAssignmentPreview,
  };
})();
