import { escapeHtml, formatMs } from "./common.js";
import {
  CLAUSE_FAMILY_INFO,
  buildNodeColorMap,
  describeNodeSelection,
  graphEdges,
} from "./graph-logic.js";
import {
  HOME_INTRO,
  LANDSCAPE_EDGES,
  LANDSCAPE_NODES,
  SUPPORTED_PROBLEMS,
} from "./site-data.js";
import { formatAssignmentPreview } from "./sat-logic.js";

function pageLink(rootPath, path = "") {
  return `${rootPath}${path}`;
}

function renderBrand(rootPath) {
  return `
    <div class="masthead">
      <a class="brand-link" href="${pageLink(rootPath)}">
        <img src="${pageLink(rootPath, "assets/satify.png")}" alt="SATify icon" width="32" height="32">
        <span>SATify</span>
      </a>
      <div class="masthead-note">Static HTML / CSS / JS edition</div>
    </div>
  `;
}

function renderWindow(title, body, extraClass = "") {
  return `
    <section class="window ${extraClass}">
      <div class="window-title">${escapeHtml(title)}</div>
      <div class="window-body">
        ${body}
      </div>
    </section>
  `;
}

function printableVariable(variable) {
  const parts = String(variable).split("_");

  if (parts.length === 1) {
    return variable;
  }

  if (parts.length === 2) {
    return `${parts[0]}${parts[1]}`;
  }

  return `${parts[0]}(${parts.slice(1).join(", ")})`;
}

function renderLiteral(literal) {
  const prefix = literal.negated ? "not " : "";
  return `<span class="literal">${escapeHtml(prefix + printableVariable(literal.variable))}</span>`;
}

function renderClause(clause) {
  return `
    <span class="clause">
      (
      ${clause.literals.map(renderLiteral).join('<span class="logic-join">or</span>')}
      )
    </span>
  `;
}

function renderFormulaPreview(clauses) {
  if (!clauses.length) {
    return `<div class="formula-box"><span class="empty-formula">Empty conjunction (always true).</span></div>`;
  }

  return `
    <div class="formula-box">
      ${clauses
        .map((clause, index) => `
          <span class="formula-piece">
            ${renderClause(clause)}
            ${index < clauses.length - 1 ? '<span class="logic-join logic-join-strong">and</span>' : ""}
          </span>
        `)
        .join("")}
    </div>
  `;
}

function renderRows(rows) {
  return rows
    .map(
      (row) => `
        <tr>
          <th>${escapeHtml(row.label)}</th>
          <td>${row.value === null || row.value === undefined || row.value === "" ? "-" : row.value}</td>
        </tr>
      `,
    )
    .join("");
}

function renderResultCard(title, rows, note = "") {
  return `
    <article class="result-card">
      <h3>${escapeHtml(title)}</h3>
      <table class="mini-table">
        <tbody>
          ${renderRows(rows)}
        </tbody>
      </table>
      ${note ? `<p class="result-note">${escapeHtml(note)}</p>` : ""}
    </article>
  `;
}

function renderDefinition(copy) {
  return `
    <div class="definition-block">
      ${copy.definition
        .map(
          (item) => `
            <p><strong>${escapeHtml(item.label)}.</strong> ${escapeHtml(item.text)}</p>
          `,
        )
        .join("")}
      <div class="equation-box">${escapeHtml(copy.statement)}</div>
    </div>
  `;
}

function renderReductionSteps(copy) {
  return `
    <div class="step-list">
      ${copy.reductionSteps
        .map(
          (step) => `
            <article class="step-card">
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.text)}</p>
              <div class="equation-box">${escapeHtml(step.formula)}</div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderLandscape() {
  const nodeMap = Object.fromEntries(LANDSCAPE_NODES.map((node) => [node.id, node]));

  function edgeLine([fromId, toId]) {
    const from = nodeMap[fromId];
    const to = nodeMap[toId];

    if (!from || !to) {
      return "";
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const inset = 46;

    return `
      <line
        x1="${from.x + (dx / distance) * inset}"
        y1="${from.y}"
        x2="${to.x - (dx / distance) * inset}"
        y2="${to.y}"
        class="landscape-edge"
        marker-end="url(#arrow-head)"
      />
    `;
  }

  return `
    <div class="landscape-wrap">
      <svg viewBox="0 0 760 112" class="landscape-svg" aria-label="Reduction landscape">
        <defs>
          <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
          </marker>
        </defs>
        ${LANDSCAPE_EDGES.map(edgeLine).join("")}
        ${LANDSCAPE_NODES.map(
          (node) => `
            <g transform="translate(${node.x}, ${node.y})">
              <rect x="-42" y="-16" width="84" height="32" rx="4" class="landscape-node"></rect>
              <text text-anchor="middle" y="5" class="landscape-label">${escapeHtml(node.label)}</text>
            </g>
          `,
        ).join("")}
      </svg>
    </div>
  `;
}

export function renderHomePage(rootPath) {
  return `
    <div class="page-shell">
      ${renderBrand(rootPath)}
      ${renderWindow(
        "Home",
        `
          <div class="intro-block">
            <h1>SATify</h1>
            <p>${escapeHtml(HOME_INTRO)}</p>
          </div>
        `,
      )}
      ${renderWindow(
        "Available Problems",
        `
          <table class="problem-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>NP-complete</th>
                <th>Strongly NP-complete</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              ${SUPPORTED_PROBLEMS.map(
                (problem) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(problem.name)}</strong>
                      <div class="table-note">${escapeHtml(problem.summary)}</div>
                    </td>
                    <td>${problem.isNpComplete ? "Yes" : "No"}</td>
                    <td>${problem.isStronglyNpComplete ? "Yes" : "No"}</td>
                    <td><a href="${pageLink(rootPath, problem.href)}">Explore</a></td>
                  </tr>
                `,
              ).join("")}
            </tbody>
          </table>
        `,
      )}
      ${renderWindow("Problem Landscape", renderLandscape())}
    </div>
  `;
}

function renderGraphEditor(state) {
  const graph = state.graph;
  const nodeColors = buildNodeColorMap(graph.nodes);

  return renderWindow(
    "Graph Editor",
    `
      <div class="split-layout">
        <div class="pane">
          <div class="toolbar-row">
            <button data-action="graph-auto-layout" ${state.busyAction ? "disabled" : ""}>Auto layout</button>
            <button data-action="graph-add-node" ${state.busyAction || graph.nodes.length >= state.config.maxNodes ? "disabled" : ""}>Add vertex</button>
          </div>
          <div class="control-grid">
            <label>
              <span>Random vertices</span>
              <input type="number" min="3" max="${state.config.maxNodes}" step="1" value="${state.random.nodeCount}" data-action="graph-random-node-count">
            </label>
            <label>
              <span>Random k</span>
              <input type="number" min="${state.config.targetMinimum}" max="${graph.nodes.length}" step="1" value="${state.random.targetSize}" data-action="graph-random-target">
            </label>
            <label class="range-field">
              <span>Density</span>
              <input type="range" min="0.15" max="0.95" step="0.05" value="${state.random.density}" data-action="graph-random-density">
              <small>${Math.round(state.random.density * 100)}%</small>
            </label>
            <label>
              <span>${escapeHtml(state.config.targetLabel)}</span>
              <input type="number" min="${state.config.targetMinimum}" max="${graph.nodes.length}" step="1" value="${graph.targetSize}" data-action="graph-target">
            </label>
            <button data-action="graph-generate-random" ${state.busyAction ? "disabled" : ""}>Random instance</button>
          </div>
          <div class="graph-stage">
            <svg viewBox="0 0 560 320" class="graph-canvas" data-graph-canvas aria-label="Interactive graph canvas">
              ${graphEdges(graph)
                .map(
                  (edge) => `
                    <line
                      data-edge-from="${edge.fromIndex}"
                      data-edge-to="${edge.toIndex}"
                      x1="${edge.from.x}"
                      y1="${edge.from.y}"
                      x2="${edge.to.x}"
                      y2="${edge.to.y}"
                      class="graph-edge"
                    ></line>
                  `,
                )
                .join("")}
              ${graph.nodes
                .map(
                  (node) => `
                    <g
                      class="graph-node"
                      transform="translate(${node.x}, ${node.y})"
                      data-node-id="${escapeHtml(node.id)}"
                    >
                      <circle r="18" fill="${nodeColors[node.id]}" class="graph-node-circle"></circle>
                      <text text-anchor="middle" dy="5" class="graph-node-label">${escapeHtml(node.label)}</text>
                    </g>
                  `,
                )
                .join("")}
            </svg>
          </div>
          <p class="field-note">Drag vertices on the canvas. Edge toggles stay in the matrix on the right.</p>
        </div>
        <div class="pane">
          <h3>Adjacency Matrix</h3>
          <div class="matrix-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th></th>
                  ${graph.nodes.map((node) => `<th>${escapeHtml(node.label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${graph.nodes
                  .map(
                    (rowNode, rowIndex) => `
                      <tr>
                        <th>${escapeHtml(rowNode.label)}</th>
                        ${graph.nodes
                          .map((columnNode, columnIndex) => {
                            if (rowIndex === columnIndex) {
                              return `<td class="matrix-diagonal">-</td>`;
                            }

                            return `
                              <td>
                                <input
                                  type="checkbox"
                                  ${graph.adjacency[rowIndex][columnIndex] ? "checked" : ""}
                                  data-action="toggle-edge"
                                  data-from="${rowIndex}"
                                  data-to="${columnIndex}"
                                  aria-label="Toggle edge ${escapeHtml(rowNode.label)}-${escapeHtml(columnNode.label)}"
                                >
                              </td>
                            `;
                          })
                          .join("")}
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `,
  );
}

function renderFormulaEditor(state) {
  const variableNames = state.variableNames;
  const isThreeSat = state.config.mode === "3sat";

  return renderWindow(
    isThreeSat ? "3-CNF Formula" : "CNF Formula",
    `
      <div class="toolbar-row">
        <button data-action="formula-add-clause" ${state.busyAction || state.draftClauses.length >= state.config.maxClauses ? "disabled" : ""}>Add clause</button>
      </div>
      <div class="control-grid">
        <label>
          <span>Variables</span>
          <input type="number" min="1" max="${state.config.maxVariables}" step="1" value="${state.variableCount}" data-action="formula-variable-count">
        </label>
        <label>
          <span>Random vars</span>
          <input type="number" min="1" max="${state.config.maxVariables}" step="1" value="${state.random.variableCount}" data-action="formula-random-variable-count">
        </label>
        <label>
          <span>Random clauses</span>
          <input type="number" min="1" max="${state.config.maxClauses}" step="1" value="${state.random.clauseCount}" data-action="formula-random-clause-count">
        </label>
        ${
          isThreeSat
            ? `<div class="inline-note">3-SAT keeps every clause at exactly 3 literals.</div>`
            : `
              <label>
                <span>Max clause size</span>
                <input type="number" min="1" max="${state.config.maxClauseLength}" step="1" value="${state.random.maxClauseLength}" data-action="formula-random-max-length">
              </label>
            `
        }
        <button data-action="formula-generate-random" ${state.busyAction ? "disabled" : ""}>Random instance</button>
      </div>
      <div class="formula-editor">
        ${state.draftClauses
          .map(
            (clause, clauseIndex) => `
              <article class="clause-editor-card">
                <div class="clause-editor-head">
                  <strong>C${clauseIndex + 1}</strong>
                  <button
                    data-action="formula-remove-clause"
                    data-clause-id="${escapeHtml(clause.id)}"
                    ${state.draftClauses.length <= 1 || state.busyAction ? "disabled" : ""}
                  >
                    Remove
                  </button>
                </div>
                <div class="literal-row">
                  <span>(</span>
                  ${clause.literals
                    .map(
                      (literal, literalIndex) => `
                        <div class="literal-editor">
                          <button
                            class="${literal.negated ? "negation-toggle negation-toggle-active" : "negation-toggle"}"
                            data-action="formula-toggle-negation"
                            data-clause-id="${escapeHtml(clause.id)}"
                            data-literal-index="${literalIndex}"
                            ${state.busyAction ? "disabled" : ""}
                          >
                            not
                          </button>
                          <select
                            data-action="formula-select-variable"
                            data-clause-id="${escapeHtml(clause.id)}"
                            data-literal-index="${literalIndex}"
                            ${state.busyAction ? "disabled" : ""}
                          >
                            ${variableNames
                              .map(
                                (variable) => `
                                  <option value="${escapeHtml(variable)}" ${variable === literal.variable ? "selected" : ""}>
                                    ${escapeHtml(printableVariable(variable))}
                                  </option>
                                `,
                              )
                              .join("")}
                          </select>
                          ${
                            !isThreeSat
                              ? `
                                <button
                                  data-action="formula-remove-literal"
                                  data-clause-id="${escapeHtml(clause.id)}"
                                  data-literal-index="${literalIndex}"
                                  ${clause.literals.length <= 1 || state.busyAction ? "disabled" : ""}
                                >
                                  -
                                </button>
                              `
                              : ""
                          }
                        </div>
                        ${literalIndex < clause.literals.length - 1 ? '<span class="logic-join">or</span>' : ""}
                      `,
                    )
                    .join("")}
                  <span>)</span>
                </div>
                ${
                  !isThreeSat
                    ? `
                      <div class="toolbar-row">
                        <button
                          data-action="formula-add-literal"
                          data-clause-id="${escapeHtml(clause.id)}"
                          ${clause.literals.length >= state.config.maxClauseLength || state.busyAction ? "disabled" : ""}
                        >
                          Add literal
                        </button>
                      </div>
                    `
                    : ""
                }
              </article>
            `,
          )
          .join("")}
      </div>
    `,
  );
}

function renderControlStrip(state) {
  return renderWindow(
    "Actions",
    `
      <div class="action-strip">
        <p class="status-line">${escapeHtml(state.status)}</p>
        <div class="toolbar-row">
          <button data-action="run-reduce" ${state.busyAction ? "disabled" : ""}>
            ${state.busyAction === "reduce" ? "Reducing..." : "Reduce to 3-SAT"}
          </button>
          <button data-action="run-brute" ${state.busyAction ? "disabled" : ""}>
            ${state.busyAction === "brute" ? "Running..." : "Solve with brute force"}
          </button>
          <button data-action="run-sat" ${state.busyAction ? "disabled" : ""}>
            ${state.busyAction === "sat" ? "Solving..." : "Solve using 3-SAT"}
          </button>
        </div>
      </div>
    `,
  );
}

function renderGraphTransformation(pageKey, activeReduction) {
  if (!activeReduction || pageKey === "k-clique") {
    return "";
  }

  if (pageKey === "independent-set") {
    return `
      <div class="info-grid">
        <article class="info-card">
          <h3>Input</h3>
          <p>Independent Set on the current graph.</p>
          <div class="equation-box">(G, k)</div>
        </article>
        <article class="info-card">
          <h3>Complement graph</h3>
          <p>Every missing non-diagonal edge becomes an edge.</p>
          <div class="equation-box">(G-bar, k)</div>
        </article>
        <article class="info-card">
          <h3>Clique instance</h3>
          <p>The SAT reduction runs on a clique target of ${activeReduction.cliqueGraph.targetSize}.</p>
          <div class="equation-box">S independent in G iff S clique in G-bar</div>
        </article>
      </div>
    `;
  }

  return `
    <div class="info-grid">
      <article class="info-card">
        <h3>Input</h3>
        <p>Vertex Cover on the current graph.</p>
        <div class="equation-box">(G, k)</div>
      </article>
      <article class="info-card">
        <h3>Independent Set view</h3>
        <p>The intermediate target becomes |V| - k.</p>
        <div class="equation-box">(G, |V| - k)</div>
      </article>
      <article class="info-card">
        <h3>Clique instance</h3>
        <p>The final SAT reduction uses the complement graph with clique target ${activeReduction.cliqueGraph.targetSize}.</p>
        <div class="equation-box">C cover in G iff V \\ C clique in G-bar</div>
      </article>
    </div>
  `;
}

function renderGraphVisualization(pageKey, graph, activeReduction) {
  if (!activeReduction) {
    return "";
  }

  const nodeColors = buildNodeColorMap(graph.nodes);
  const slotCount = activeReduction.cliqueGraph.targetSize;

  return `
    ${renderWindow(
      "Reduction Visualisation",
      `
        ${renderGraphTransformation(pageKey, activeReduction)}
        <div class="legend-grid">
          ${graph.nodes
            .map(
              (node) => `
                <article class="legend-card">
                  <div class="legend-head">
                    <span class="legend-dot" style="background:${nodeColors[node.id]}"></span>
                    <strong>${escapeHtml(node.label)}</strong>
                  </div>
                  ${
                    slotCount
                      ? `
                        <div class="legend-values">
                          ${Array.from({ length: slotCount }, (_, index) => printableVariable(`x_${index + 1}_${node.label}`))
                            .map((variable) => `<span class="token-chip">${escapeHtml(variable)}</span>`)
                            .join("")}
                        </div>
                      `
                      : `<p class="field-note">No clique slots are required for this boundary case.</p>`
                  }
                </article>
              `,
            )
            .join("")}
        </div>
        <div class="info-grid">
          ${Object.entries(CLAUSE_FAMILY_INFO)
            .map(([family, info]) => {
              const previewClauses = activeReduction.satReduction.formula.clauses
                .filter((clause) => clause.family === family)
                .slice(0, 3);

              return `
                <article class="info-card">
                  <h3>${escapeHtml(info.title)}</h3>
                  <p>${escapeHtml(info.description)}</p>
                  ${
                    previewClauses.length
                      ? previewClauses
                          .map(
                            (clause) => `
                              <div class="preview-box">
                                <div class="preview-text">${escapeHtml(clause.description)}</div>
                                <div>${renderClause(clause)}</div>
                              </div>
                            `,
                          )
                          .join("")
                      : `<p class="field-note">No clauses from this family were needed.</p>`
                  }
                </article>
              `;
            })
            .join("")}
        </div>
      `,
    )}
    ${renderWindow("Final 3-SAT Formula", renderFormulaPreview(activeReduction.threeSat.clauses))}
  `;
}

function renderFormulaVisualization(activeReduction) {
  if (!activeReduction) {
    return "";
  }

  return `
    ${renderWindow(
      "Reduction Visualisation",
      `
        <div class="mapping-grid">
          ${activeReduction.inputFormula.clauses
            .map((clause) => {
              const mappedClauses = activeReduction.threeSat.clauses.filter(
                (candidate) => (candidate.sourceClauseId ?? candidate.id) === clause.id,
              );

              return `
                <article class="mapping-card">
                  <h3>${escapeHtml(clause.id.toUpperCase())}</h3>
                  <div class="mapping-row">
                    <strong>Original</strong>
                    <div>${renderClause(clause)}</div>
                  </div>
                  <div class="mapping-row">
                    <strong>${mappedClauses.length === 1 ? "3-SAT clause" : "3-SAT clauses"}</strong>
                    <div class="mapping-output">
                      ${mappedClauses.map(renderClause).join('<span class="logic-join logic-join-strong">and</span>')}
                    </div>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      `,
    )}
    ${renderWindow("Final 3-SAT Formula", renderFormulaPreview(activeReduction.threeSat.clauses))}
  `;
}

function renderGraphResults(state) {
  const activeReduction = state.satRun?.reduction ?? state.reductionRun;
  const displayedBruteForce = state.satRun?.bruteForce ?? state.bruteForceRun;
  const satNote = state.satRun
    ? `Matches brute force: ${state.satRun.solutionsAgree ? "yes" : "no"}.${state.satRun.isOptimal === null ? "" : ` Optimal: ${state.satRun.isOptimal ? "yes" : "no"}.`}`
    : "";

  return `
    ${renderWindow(
      "Results",
      `
        <div class="results-grid">
          ${renderResultCard("Reduction", [
            {
              label: "3-SAT variables",
              value: activeReduction ? activeReduction.threeSat.variables.length : null,
            },
            {
              label: "3-SAT clauses",
              value: activeReduction ? activeReduction.threeSat.clauses.length : null,
            },
            {
              label: state.config.reductionLabel,
              value: activeReduction ? formatMs(activeReduction.totalMs) : null,
            },
          ])}
          ${renderResultCard("Brute force", [
            {
              label: "Answer",
              value: displayedBruteForce ? (displayedBruteForce.result.hasTargetSolution ? "Yes" : "No") : null,
            },
            {
              label: state.config.optimalLabel,
              value: displayedBruteForce
                ? describeNodeSelection(displayedBruteForce.result.optimalSolution, state.graph.nodes)
                : null,
            },
            {
              label: "Time",
              value: displayedBruteForce ? formatMs(displayedBruteForce.runtimeMs) : null,
            },
          ])}
          ${renderResultCard(
            "3-SAT",
            [
              {
                label: "Answer",
                value: state.satRun ? (state.satRun.satisfiable ? "Yes" : "No") : null,
              },
              {
                label: state.config.recoveredLabel,
                value: state.satRun
                  ? describeNodeSelection(state.satRun.solutionIndices, state.graph.nodes)
                  : null,
              },
              {
                label: "Solver time",
                value: state.satRun ? formatMs(state.satRun.solverMs) : null,
              },
            ],
            satNote,
          )}
        </div>
      `,
    )}
    ${renderGraphVisualization(state.pageKey, state.graph, activeReduction)}
  `;
}

function renderFormulaResults(state) {
  const activeReduction = state.satRun?.reduction ?? state.reductionRun;
  const displayedBruteForce = state.satRun?.bruteForce ?? state.bruteForceRun;
  const satNote = state.satRun
    ? `Matches brute force: ${state.satRun.solutionsAgree ? "yes" : "no"}. Optimality is not applicable here.`
    : "";

  return `
    ${renderWindow(
      "Results",
      `
        <div class="results-grid">
          ${renderResultCard("Reduction", [
            {
              label: "3-SAT variables",
              value: activeReduction ? activeReduction.threeSat.variables.length : null,
            },
            {
              label: "3-SAT clauses",
              value: activeReduction ? activeReduction.threeSat.clauses.length : null,
            },
            {
              label: state.config.reductionLabel,
              value: activeReduction ? formatMs(activeReduction.totalMs) : null,
            },
          ])}
          ${renderResultCard("Brute force", [
            {
              label: "Answer",
              value: displayedBruteForce ? (displayedBruteForce.satisfiable ? "Yes" : "No") : null,
            },
            {
              label: "Assignment",
              value: displayedBruteForce
                ? escapeHtml(formatAssignmentPreview(displayedBruteForce.assignment, state.variableNames))
                : null,
            },
            {
              label: "Time",
              value: displayedBruteForce ? formatMs(displayedBruteForce.runtimeMs) : null,
            },
          ])}
          ${renderResultCard(
            "3-SAT",
            [
              {
                label: "Answer",
                value: state.satRun ? (state.satRun.satisfiable ? "Yes" : "No") : null,
              },
              {
                label: "Assignment",
                value: state.satRun
                  ? escapeHtml(formatAssignmentPreview(state.satRun.assignment, state.variableNames))
                  : null,
              },
              {
                label: "Solver time",
                value: state.satRun ? formatMs(state.satRun.solverMs) : null,
              },
            ],
            satNote,
          )}
        </div>
      `,
    )}
    ${renderFormulaVisualization(activeReduction)}
  `;
}

export function renderProblemPage({ rootPath, state, copy }) {
  const editor = state.kind === "graph" ? renderGraphEditor(state) : renderFormulaEditor(state);
  const results = state.kind === "graph" ? renderGraphResults(state) : renderFormulaResults(state);

  return `
    <div class="page-shell">
      ${renderBrand(rootPath)}
      ${renderWindow(
        `${copy.title}`,
        `
          <div class="crumb-row">
            <a href="${pageLink(rootPath)}">Home</a>
            <span>/</span>
            <span>${escapeHtml(state.pageKey)}</span>
          </div>
          <h1>${escapeHtml(copy.title)}</h1>
          ${renderDefinition(copy)}
        `,
      )}
      ${renderWindow(copy.sectionTitle, renderReductionSteps(copy))}
      ${editor}
      ${renderControlStrip(state)}
      ${results}
    </div>
  `;
}
