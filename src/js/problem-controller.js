import { clamp, clampInteger, measureOperation, nextFrame, now } from "./common.js";
import {
  MAX_GRAPH_NODES,
  GRAPH_VIEWBOX,
  addGraphNode,
  autoLayoutGraph,
  cloneGraph,
  createSampleCliqueGraph,
  createSampleIndependentSetGraph,
  createSampleVertexCoverGraph,
  decodeCliqueAssignment,
  generateRandomCliqueGraph,
  generateRandomIndependentSetGraph,
  generateRandomVertexCoverGraph,
  reduceCliqueToSat,
  reduceIndependentSetToClique,
  reduceVertexCoverToClique,
  setGraphTarget,
  solveCliqueBruteForce,
  solveIndependentSetBruteForce,
  solveVertexCoverBruteForce,
  toggleGraphEdge,
  updateGraphNodePosition,
  complementIndices,
} from "./graph-logic.js";
import { renderProblemPage } from "./render.js";
import { PAGE_COPY } from "./site-data.js";
import {
  FORMULA_LIMITS,
  buildFormulaFromDraft,
  buildVariableNames,
  convertToThreeSat,
  createDefaultDraftClause,
  createDraftClauses,
  createSampleFormula,
  formatAssignmentPreview,
  generateRandomFormula,
  normalizeDraftClauses,
  projectAssignment,
  solveSat,
  solveSatBruteForce,
} from "./sat-logic.js";

const GRAPH_CONFIG = {
  "k-clique": {
    sample: createSampleCliqueGraph,
    random: generateRandomCliqueGraph,
    bruteForce: solveCliqueBruteForce,
    toClique: (graph) => cloneGraph(graph),
    fromCliqueSelection: (indices) => indices,
    targetLabel: "Target clique size k",
    recoveredLabel: "Recovered clique",
    optimalLabel: "Maximum clique",
    reductionLabel: "k-clique -> SAT -> 3-SAT",
    randomMessage: (nodeCount, targetSize) =>
      `Generated a random graph with ${nodeCount} vertices containing a clique of size at least ${targetSize}.`,
    maxNodes: MAX_GRAPH_NODES,
    targetMinimum: 1,
  },
  "independent-set": {
    sample: createSampleIndependentSetGraph,
    random: generateRandomIndependentSetGraph,
    bruteForce: solveIndependentSetBruteForce,
    toClique: reduceIndependentSetToClique,
    fromCliqueSelection: (indices) => indices,
    targetLabel: "Target independent set size k",
    recoveredLabel: "Recovered independent set",
    optimalLabel: "Maximum independent set",
    reductionLabel: "independent set -> clique -> SAT -> 3-SAT",
    randomMessage: (nodeCount, targetSize) =>
      `Generated a random graph with ${nodeCount} vertices containing an independent set of size at least ${targetSize}.`,
    maxNodes: MAX_GRAPH_NODES,
    targetMinimum: 1,
  },
  "vertex-cover": {
    sample: createSampleVertexCoverGraph,
    random: generateRandomVertexCoverGraph,
    bruteForce: solveVertexCoverBruteForce,
    toClique: reduceVertexCoverToClique,
    fromCliqueSelection: (indices, nodeCount) => complementIndices(nodeCount, indices),
    targetLabel: "Target vertex cover size k",
    recoveredLabel: "Recovered vertex cover",
    optimalLabel: "Minimum vertex cover",
    reductionLabel: "vertex cover -> independent set -> clique -> SAT -> 3-SAT",
    randomMessage: (nodeCount, targetSize) =>
      `Generated a random graph with ${nodeCount} vertices admitting a vertex cover of size at most ${targetSize}.`,
    maxNodes: MAX_GRAPH_NODES,
    targetMinimum: 0,
  },
};

const FORMULA_CONFIG = {
  sat: {
    mode: "sat",
    maxVariables: FORMULA_LIMITS.maxVariables,
    maxClauses: FORMULA_LIMITS.maxClauses,
    maxClauseLength: FORMULA_LIMITS.maxClauseLength,
    reductionLabel: "SAT -> 3-SAT",
  },
  "3-sat": {
    mode: "3sat",
    maxVariables: FORMULA_LIMITS.maxVariables,
    maxClauses: FORMULA_LIMITS.maxClauses,
    maxClauseLength: 3,
    reductionLabel: "3-SAT -> 3-SAT",
  },
};

export class ProblemController {
  constructor(root, rootPath, pageKey) {
    this.root = root;
    this.rootPath = rootPath;
    this.pageKey = pageKey;
    this.copy = PAGE_COPY[pageKey];
    this.dragState = null;

    if (!this.copy) {
      throw new Error(`Unknown page key: ${pageKey}`);
    }

    this.state =
      this.copy.kind === "graph"
        ? this.createGraphState(pageKey)
        : this.createFormulaState(pageKey);

    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("change", this.handleChange);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);

    this.render();
  }

  createGraphState(pageKey) {
    const config = GRAPH_CONFIG[pageKey];
    const graph = config.sample();

    return {
      kind: "graph",
      pageKey,
      config,
      graph,
      random: {
        nodeCount: graph.nodes.length,
        targetSize: graph.targetSize,
        density: 0.55,
      },
      status: "Start from the sample instance or generate a new graph.",
      busyAction: null,
      reductionRun: null,
      bruteForceRun: null,
      satRun: null,
    };
  }

  createFormulaState(pageKey) {
    const config = FORMULA_CONFIG[pageKey];
    const sampleFormula = createSampleFormula(config.mode);

    return {
      kind: "formula",
      pageKey,
      config,
      variableCount: sampleFormula.variables.length,
      variableNames: sampleFormula.variables.slice(),
      draftClauses: createDraftClauses(sampleFormula),
      random: {
        variableCount: sampleFormula.variables.length,
        clauseCount: sampleFormula.clauses.length,
        maxClauseLength: 4,
      },
      status: "Edit the sample formula or generate a new instance.",
      busyAction: null,
      reductionRun: null,
      bruteForceRun: null,
      satRun: null,
    };
  }

  render() {
    this.root.innerHTML = renderProblemPage({
      rootPath: this.rootPath,
      state: this.state,
      copy: this.copy,
    });
  }

  clearComputed(message) {
    this.state.reductionRun = null;
    this.state.bruteForceRun = null;
    this.state.satRun = null;

    if (message) {
      this.state.status = message;
    }
  }

  setGraph(nextGraph, message) {
    this.state.graph = nextGraph;
    this.clearComputed(message);
  }

  setFormula(nextVariableCount, nextDraftClauses, message) {
    this.state.variableCount = nextVariableCount;
    this.state.variableNames = buildVariableNames(nextVariableCount);
    this.state.draftClauses = nextDraftClauses;
    this.clearComputed(message);
  }

  buildGraphReduction() {
    const cliqueGraph = this.state.config.toClique(this.state.graph);
    const satStart = now();
    const satReduction = reduceCliqueToSat(cliqueGraph);
    const satEnd = now();
    const threeSat = convertToThreeSat(satReduction.formula);
    const threeSatEnd = now();

    return {
      cliqueGraph,
      satReduction,
      threeSat,
      satMs: satEnd - satStart,
      threeSatMs: threeSatEnd - satEnd,
      totalMs: threeSatEnd - satStart,
    };
  }

  buildCurrentFormula() {
    return buildFormulaFromDraft(this.state.variableCount, this.state.draftClauses);
  }

  buildFormulaReduction(formula) {
    const start = now();
    const threeSat = convertToThreeSat(formula);
    const end = now();

    return {
      inputFormula: formula,
      threeSat,
      totalMs: end - start,
    };
  }

  async runBusyAction(action, status, callback) {
    if (this.state.busyAction) {
      return;
    }

    this.state.busyAction = action;
    this.state.status = status;
    this.render();
    await nextFrame();

    try {
      callback();
    } catch (error) {
      console.error(error);
      this.state.status = error instanceof Error ? error.message : "Something went wrong.";
    } finally {
      this.state.busyAction = null;
      this.render();
    }
  }

  handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");

    if (!actionTarget || this.state.busyAction) {
      return;
    }

    const { action } = actionTarget.dataset;

    switch (action) {
      case "graph-add-node":
        this.handleAddGraphNode();
        break;
      case "graph-auto-layout":
        this.handleAutoLayout();
        break;
      case "graph-generate-random":
        this.handleGenerateRandomGraph();
        break;
      case "run-reduce":
        if (this.state.kind === "graph") {
          this.handleReduceGraph();
        } else {
          this.handleReduceFormula();
        }
        break;
      case "run-brute":
        if (this.state.kind === "graph") {
          this.handleBruteGraph();
        } else {
          this.handleBruteFormula();
        }
        break;
      case "run-sat":
        if (this.state.kind === "graph") {
          this.handleSolveGraphViaSat();
        } else {
          this.handleSolveFormulaViaSat();
        }
        break;
      case "formula-add-clause":
        this.handleAddClause();
        break;
      case "formula-remove-clause":
        this.handleRemoveClause(actionTarget.dataset.clauseId);
        break;
      case "formula-toggle-negation":
        this.handleToggleLiteralNegation(
          actionTarget.dataset.clauseId,
          Number(actionTarget.dataset.literalIndex),
        );
        break;
      case "formula-add-literal":
        this.handleAddLiteral(actionTarget.dataset.clauseId);
        break;
      case "formula-remove-literal":
        this.handleRemoveLiteral(
          actionTarget.dataset.clauseId,
          Number(actionTarget.dataset.literalIndex),
        );
        break;
      case "formula-generate-random":
        this.handleGenerateRandomFormula();
        break;
      default:
        break;
    }
  }

  handleChange(event) {
    const actionTarget = event.target.closest("[data-action]");

    if (!actionTarget || this.state.busyAction) {
      return;
    }

    const { action } = actionTarget.dataset;

    switch (action) {
      case "graph-target":
        this.handleGraphTargetChange(actionTarget.value);
        break;
      case "graph-random-node-count":
        this.state.random.nodeCount = clampInteger(
          actionTarget.value,
          3,
          this.state.config.maxNodes,
          this.state.random.nodeCount,
        );
        this.render();
        break;
      case "graph-random-target":
        this.state.random.targetSize = clampInteger(
          actionTarget.value,
          this.state.config.targetMinimum,
          this.state.random.nodeCount,
          this.state.random.targetSize,
        );
        this.render();
        break;
      case "toggle-edge":
        this.handleToggleEdge(Number(actionTarget.dataset.from), Number(actionTarget.dataset.to));
        break;
      case "formula-variable-count":
        this.handleVariableCountChange(actionTarget.value);
        break;
      case "formula-random-variable-count":
        this.state.random.variableCount = clampInteger(
          actionTarget.value,
          1,
          this.state.config.maxVariables,
          this.state.random.variableCount,
        );
        this.render();
        break;
      case "formula-random-clause-count":
        this.state.random.clauseCount = clampInteger(
          actionTarget.value,
          1,
          this.state.config.maxClauses,
          this.state.random.clauseCount,
        );
        this.render();
        break;
      case "formula-random-max-length":
        this.state.random.maxClauseLength = clampInteger(
          actionTarget.value,
          1,
          FORMULA_LIMITS.maxClauseLength,
          this.state.random.maxClauseLength,
        );
        this.render();
        break;
      case "formula-select-variable":
        this.handleSelectLiteralVariable(
          actionTarget.dataset.clauseId,
          Number(actionTarget.dataset.literalIndex),
          actionTarget.value,
        );
        break;
      default:
        break;
    }
  }

  handleInput(event) {
    const actionTarget = event.target.closest("[data-action]");

    if (!actionTarget || this.state.busyAction) {
      return;
    }

    if (actionTarget.dataset.action === "graph-random-density") {
      this.state.random.density = clamp(Number(actionTarget.value), 0.15, 0.95);
      this.render();
    }
  }

  handlePointerDown(event) {
    if (this.state.kind !== "graph" || this.state.busyAction) {
      return;
    }

    const nodeTarget = event.target.closest("[data-node-id]");

    if (!nodeTarget) {
      return;
    }

    this.dragState = {
      nodeId: nodeTarget.dataset.nodeId,
    };

    event.preventDefault();
  }

  handlePointerMove(event) {
    if (!this.dragState || this.state.kind !== "graph") {
      return;
    }

    const svg = this.root.querySelector("[data-graph-canvas]");

    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * GRAPH_VIEWBOX.width;
    const y = ((event.clientY - rect.top) / rect.height) * GRAPH_VIEWBOX.height;

    this.state.graph = updateGraphNodePosition(this.state.graph, this.dragState.nodeId, x, y);
    this.updateGraphCanvas();
  }

  handlePointerUp() {
    if (!this.dragState || this.state.kind !== "graph") {
      return;
    }

    const movedNode = this.state.graph.nodes.find((node) => node.id === this.dragState.nodeId);
    this.dragState = null;
    this.clearComputed(
      movedNode
        ? `Moved vertex ${movedNode.label}. Re-run the reduction to refresh the formulas.`
        : "Moved a vertex.",
    );
    this.render();
  }

  updateGraphCanvas() {
    const graph = this.state.graph;
    const svg = this.root.querySelector("[data-graph-canvas]");

    if (!svg) {
      return;
    }

    graph.nodes.forEach((node) => {
      const group = svg.querySelector(`[data-node-id="${node.id}"]`);

      if (group) {
        group.setAttribute("transform", `translate(${node.x}, ${node.y})`);
      }
    });

    svg.querySelectorAll("[data-edge-from]").forEach((line) => {
      const fromIndex = Number(line.getAttribute("data-edge-from"));
      const toIndex = Number(line.getAttribute("data-edge-to"));
      const from = graph.nodes[fromIndex];
      const to = graph.nodes[toIndex];

      if (!from || !to) {
        return;
      }

      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
    });
  }

  handleAddGraphNode() {
    if (this.state.graph.nodes.length >= this.state.config.maxNodes) {
      this.state.status = `The interactive demo is capped at ${this.state.config.maxNodes} vertices.`;
      this.render();
      return;
    }

    const nextGraph = addGraphNode(this.state.graph);
    this.state.random.nodeCount = nextGraph.nodes.length;
    this.state.random.targetSize = Math.min(this.state.random.targetSize, nextGraph.nodes.length);
    this.setGraph(nextGraph, `Added vertex ${nextGraph.nodes[nextGraph.nodes.length - 1].label}.`);
    this.render();
  }

  handleAutoLayout() {
    this.setGraph(autoLayoutGraph(this.state.graph), "Applied a circular layout to the current graph.");
    this.render();
  }

  handleGraphTargetChange(value) {
    const minimum = this.state.config.targetMinimum;
    this.setGraph(
      setGraphTarget(this.state.graph, value, minimum),
      `Updated the target to ${clampInteger(value, minimum, this.state.graph.nodes.length, this.state.graph.targetSize)}.`,
    );
    this.render();
  }

  handleToggleEdge(fromIndex, toIndex) {
    this.setGraph(toggleGraphEdge(this.state.graph, fromIndex, toIndex), "Updated the graph edges.");
    this.render();
  }

  handleGenerateRandomGraph() {
    const nodeCount = clampInteger(this.state.random.nodeCount, 3, this.state.config.maxNodes, 5);
    const minimum = Math.max(1, this.state.config.targetMinimum);
    const targetSize = clampInteger(
      this.state.random.targetSize,
      minimum,
      nodeCount,
      Math.min(3, nodeCount),
    );

    const nextGraph = this.state.config.random(nodeCount, this.state.random.density, targetSize);
    this.state.random.nodeCount = nodeCount;
    this.state.random.targetSize = targetSize;
    this.setGraph(nextGraph, this.state.config.randomMessage(nodeCount, targetSize));
    this.render();
  }

  handleReduceGraph() {
    this.runBusyAction("reduce", "Reducing the current graph problem to SAT and 3-SAT.", () => {
      this.state.reductionRun = this.buildGraphReduction();
      this.state.status = "Reduction completed. Inspect the transformed clauses below.";
    });
  }

  handleBruteGraph() {
    this.runBusyAction("brute", "Searching the graph exhaustively for a witness.", () => {
      const measurement = measureOperation(() => this.state.config.bruteForce(this.state.graph));
      this.state.bruteForceRun = {
        result: measurement.result,
        runtimeMs: measurement.runtimeMs,
      };
      this.state.status = "Brute-force search finished.";
    });
  }

  handleSolveGraphViaSat() {
    this.runBusyAction(
      "sat",
      "Running the reduction, solving the 3-SAT instance, and checking the result against brute force.",
      () => {
        const reduction = this.buildGraphReduction();
        const solverStart = now();
        const satResult = solveSat(reduction.threeSat);
        const solverEnd = now();
        const bruteMeasurement = measureOperation(() => this.state.config.bruteForce(this.state.graph));
        const cliqueIndices =
          satResult.satisfiable && satResult.assignment
            ? decodeCliqueAssignment(satResult.assignment, reduction.satReduction)
            : [];
        const solutionIndices = this.state.config.fromCliqueSelection(
          cliqueIndices,
          this.state.graph.nodes.length,
        );
        const bruteForce = {
          result: bruteMeasurement.result,
          runtimeMs: bruteMeasurement.runtimeMs,
        };

        this.state.reductionRun = reduction;
        this.state.bruteForceRun = bruteForce;
        this.state.satRun = {
          reduction,
          satisfiable: satResult.satisfiable,
          solutionIndices,
          bruteForce,
          solverMs: solverEnd - solverStart,
          totalPipelineMs: reduction.totalMs + (solverEnd - solverStart),
          solutionsAgree: satResult.satisfiable === bruteForce.result.hasTargetSolution,
          isOptimal: satResult.satisfiable
            ? solutionIndices.length === bruteForce.result.optimalSolution.length
            : null,
        };
        this.state.status = "3-SAT solving completed.";
      },
    );
  }

  handleVariableCountChange(value) {
    const nextVariableCount = clampInteger(
      value,
      1,
      this.state.config.maxVariables,
      this.state.variableCount,
    );
    const nextVariables = buildVariableNames(nextVariableCount);
    const nextDraftClauses = normalizeDraftClauses(
      this.state.draftClauses,
      nextVariables,
      this.state.config.mode,
    );

    this.setFormula(nextVariableCount, nextDraftClauses, `Using ${nextVariableCount} variables in the current formula.`);
    this.render();
  }

  handleAddClause() {
    if (this.state.draftClauses.length >= this.state.config.maxClauses) {
      this.state.status = `This demo stays responsive up to ${this.state.config.maxClauses} clauses.`;
      this.render();
      return;
    }

    this.setFormula(
      this.state.variableCount,
      this.state.draftClauses.concat(
        createDefaultDraftClause(this.state.config.mode, this.state.variableNames),
      ),
      "Added a new clause.",
    );
    this.render();
  }

  handleRemoveClause(clauseId) {
    if (!clauseId || this.state.draftClauses.length <= 1) {
      return;
    }

    this.setFormula(
      this.state.variableCount,
      this.state.draftClauses.filter((clause) => clause.id !== clauseId),
      "Removed a clause.",
    );
    this.render();
  }

  updateDraftClause(clauseId, literalIndex, updater, message = "Updated the formula.") {
    this.setFormula(
      this.state.variableCount,
      this.state.draftClauses.map((clause) =>
        clause.id === clauseId
          ? {
              ...clause,
              literals: clause.literals.map((literal, index) =>
                index === literalIndex ? updater(literal) : literal,
              ),
            }
          : clause,
      ),
      message,
    );
    this.render();
  }

  handleToggleLiteralNegation(clauseId, literalIndex) {
    this.updateDraftClause(
      clauseId,
      literalIndex,
      (literal) => ({
        ...literal,
        negated: !literal.negated,
      }),
      "Toggled a literal.",
    );
  }

  handleSelectLiteralVariable(clauseId, literalIndex, variable) {
    this.updateDraftClause(
      clauseId,
      literalIndex,
      (literal) => ({
        ...literal,
        variable,
      }),
      "Changed a literal variable.",
    );
  }

  handleAddLiteral(clauseId) {
    this.setFormula(
      this.state.variableCount,
      this.state.draftClauses.map((clause) =>
        clause.id === clauseId
          ? {
              ...clause,
              literals:
                clause.literals.length >= this.state.config.maxClauseLength
                  ? clause.literals
                  : clause.literals.concat({
                      variable:
                        this.state.variableNames[clause.literals.length % this.state.variableNames.length],
                      negated: false,
                    }),
            }
          : clause,
      ),
      "Added a literal.",
    );
    this.render();
  }

  handleRemoveLiteral(clauseId, literalIndex) {
    this.setFormula(
      this.state.variableCount,
      this.state.draftClauses.map((clause) =>
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
      "Removed a literal.",
    );
    this.render();
  }

  handleGenerateRandomFormula() {
    const nextVariableCount = clampInteger(
      this.state.random.variableCount,
      1,
      this.state.config.maxVariables,
      this.state.random.variableCount,
    );
    const nextClauseCount = clampInteger(
      this.state.random.clauseCount,
      1,
      this.state.config.maxClauses,
      this.state.random.clauseCount,
    );
    const formula = generateRandomFormula({
      mode: this.state.config.mode,
      variableCount: nextVariableCount,
      clauseCount: nextClauseCount,
      maxClauseLength: this.state.random.maxClauseLength,
    });

    this.state.random.variableCount = nextVariableCount;
    this.state.random.clauseCount = nextClauseCount;
    this.setFormula(nextVariableCount, createDraftClauses(formula), `Generated a random satisfiable ${this.state.config.mode === "sat" ? "CNF" : "3-CNF"} formula.`);
    this.render();
  }

  handleReduceFormula() {
    this.runBusyAction("reduce", "Reducing the current formula to 3-SAT.", () => {
      this.state.reductionRun = this.buildFormulaReduction(this.buildCurrentFormula());
      this.state.status = "Reduction completed. Inspect the clause mapping below.";
    });
  }

  handleBruteFormula() {
    this.runBusyAction("brute", "Checking the formula with exhaustive assignment search.", () => {
      const formula = this.buildCurrentFormula();
      const measurement = measureOperation(() => solveSatBruteForce(formula));
      this.state.bruteForceRun = {
        ...measurement.result,
        assignment: projectAssignment(measurement.result.assignment, formula.variables),
        runtimeMs: measurement.runtimeMs,
      };
      this.state.status = "Brute-force solving finished.";
    });
  }

  handleSolveFormulaViaSat() {
    this.runBusyAction(
      "sat",
      "Reducing the formula, solving the 3-SAT instance, and comparing with brute force.",
      () => {
        const formula = this.buildCurrentFormula();
        const reduction = this.buildFormulaReduction(formula);
        const solverStart = now();
        const satResult = solveSat(reduction.threeSat);
        const solverEnd = now();
        const bruteMeasurement = measureOperation(() => solveSatBruteForce(formula));
        const bruteForce = {
          ...bruteMeasurement.result,
          assignment: projectAssignment(bruteMeasurement.result.assignment, formula.variables),
          runtimeMs: bruteMeasurement.runtimeMs,
        };

        this.state.reductionRun = reduction;
        this.state.bruteForceRun = bruteForce;
        this.state.satRun = {
          reduction,
          satisfiable: satResult.satisfiable,
          assignment: projectAssignment(satResult.assignment, formula.variables),
          bruteForce,
          solverMs: solverEnd - solverStart,
          totalPipelineMs: reduction.totalMs + (solverEnd - solverStart),
          solutionsAgree: satResult.satisfiable === bruteForce.satisfiable,
          summary: formatAssignmentPreview(projectAssignment(satResult.assignment, formula.variables), formula.variables),
        };
        this.state.status = "3-SAT solving completed.";
      },
    );
  }
}
