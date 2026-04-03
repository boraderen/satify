import {
  clamp,
  copyMatrix,
  range,
  shuffle,
  unique,
} from "./common.js";

export const MAX_GRAPH_NODES = 50;
export const GRAPH_VIEWBOX = {
  width: 560,
  height: 320,
  radius: 18,
};

const NODE_COLORS = [
  "#38597c",
  "#7f5539",
  "#52796f",
  "#6d597a",
  "#8c6d1f",
  "#5c677d",
  "#6c584c",
  "#8a5a44",
];

export const CLAUSE_FAMILY_INFO = {
  coverage: {
    title: "Coverage clauses",
    description: "Every clique slot must contain at least one vertex.",
  },
  "unique-node": {
    title: "No reused vertices",
    description: "A single graph vertex cannot fill two clique slots.",
  },
  "unique-slot": {
    title: "No shared slots",
    description: "One slot cannot contain two different vertices.",
  },
  "non-edge": {
    title: "Forbidden non-edges",
    description: "Two chosen vertices must be adjacent in the original graph.",
  },
};

function makeNodeLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  if (index < alphabet.length) {
    return alphabet[index];
  }

  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length)}`;
}

export function createCircularLayout(count) {
  const centerX = GRAPH_VIEWBOX.width / 2;
  const centerY = GRAPH_VIEWBOX.height / 2;
  const radiusX = 200;
  const radiusY = 110;

  return range(count).map((index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      label: makeNodeLabel(index),
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    };
  });
}

function buildAdjacency(nodeCount, edges) {
  const adjacency = Array.from({ length: nodeCount }, () => Array(nodeCount).fill(false));

  edges.forEach(([from, to]) => {
    adjacency[from][to] = true;
    adjacency[to][from] = true;
  });

  return adjacency;
}

function buildGraph(nodeCount, edges, targetSize) {
  const layout = createCircularLayout(nodeCount);

  return {
    nodes: layout.map((node, index) => ({
      id: `v${index + 1}`,
      label: node.label,
      x: node.x,
      y: node.y,
    })),
    adjacency: buildAdjacency(nodeCount, edges),
    targetSize,
  };
}

export function cloneGraph(graph) {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    adjacency: copyMatrix(graph.adjacency),
    targetSize: graph.targetSize,
  };
}

export function buildNodeColorMap(nodes) {
  return Object.fromEntries(
    nodes.map((node, index) => [node.id, NODE_COLORS[index % NODE_COLORS.length]]),
  );
}

export function graphEdges(graph) {
  const edges = [];

  for (let from = 0; from < graph.nodes.length; from += 1) {
    for (let to = from + 1; to < graph.nodes.length; to += 1) {
      if (graph.adjacency[from][to]) {
        edges.push({
          fromIndex: from,
          toIndex: to,
          from: graph.nodes[from],
          to: graph.nodes[to],
        });
      }
    }
  }

  return edges;
}

export function createSampleCliqueGraph() {
  return buildGraph(
    5,
    [
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 4],
      [3, 4],
    ],
    3,
  );
}

export function createSampleIndependentSetGraph() {
  return buildGraph(
    6,
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [1, 4],
    ],
    3,
  );
}

export function createSampleVertexCoverGraph() {
  return buildGraph(
    5,
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
    2,
  );
}

function clampTargetSize(nodeCount, targetSize, minimum = 1) {
  return clamp(Math.trunc(Number(targetSize)) || minimum, minimum, nodeCount);
}

export function addGraphNode(graph) {
  const nextCount = graph.nodes.length + 1;
  const layout = createCircularLayout(nextCount);
  const nodes = layout.map((position, index) => {
    const currentNode = graph.nodes[index];

    return currentNode
      ? {
          ...currentNode,
          x: position.x,
          y: position.y,
          label: position.label,
        }
      : {
          id: `v${index + 1}`,
          label: position.label,
          x: position.x,
          y: position.y,
        };
  });

  const adjacency = graph.adjacency.map((row) => row.concat(false));
  adjacency.push(Array(nextCount).fill(false));

  return {
    nodes,
    adjacency,
    targetSize: Math.min(graph.targetSize, nextCount),
  };
}

export function autoLayoutGraph(graph) {
  const layout = createCircularLayout(graph.nodes.length);

  return {
    ...cloneGraph(graph),
    nodes: graph.nodes.map((node, index) => ({
      ...node,
      x: layout[index].x,
      y: layout[index].y,
      label: layout[index].label,
    })),
  };
}

export function updateGraphNodePosition(graph, nodeId, x, y) {
  const minimumX = GRAPH_VIEWBOX.radius + 10;
  const minimumY = GRAPH_VIEWBOX.radius + 10;
  const maximumX = GRAPH_VIEWBOX.width - GRAPH_VIEWBOX.radius - 10;
  const maximumY = GRAPH_VIEWBOX.height - GRAPH_VIEWBOX.radius - 10;

  return {
    ...cloneGraph(graph),
    nodes: graph.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            x: clamp(x, minimumX, maximumX),
            y: clamp(y, minimumY, maximumY),
          }
        : { ...node },
    ),
  };
}

export function toggleGraphEdge(graph, fromIndex, toIndex) {
  const next = cloneGraph(graph);
  const value = !next.adjacency[fromIndex][toIndex];
  next.adjacency[fromIndex][toIndex] = value;
  next.adjacency[toIndex][fromIndex] = value;
  return next;
}

export function setGraphTarget(graph, targetSize, minimum = 1) {
  return {
    ...cloneGraph(graph),
    targetSize: clampTargetSize(graph.nodes.length, targetSize, minimum),
  };
}

function createEmptyGraph(nodeCount, targetSize) {
  return buildGraph(nodeCount, [], clampTargetSize(nodeCount, targetSize));
}

export function generateRandomCliqueGraph(nodeCount, density, targetSize) {
  const nextGraph = createEmptyGraph(nodeCount, targetSize);
  const plantedClique = shuffle(range(nodeCount)).slice(0, nextGraph.targetSize);
  const plantedSet = new Set(plantedClique);

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const plantedEdge = plantedSet.has(from) && plantedSet.has(to);
      const connected = plantedEdge || Math.random() < density;
      nextGraph.adjacency[from][to] = connected;
      nextGraph.adjacency[to][from] = connected;
    }
  }

  return nextGraph;
}

export function generateRandomIndependentSetGraph(nodeCount, density, targetSize) {
  const nextGraph = createEmptyGraph(nodeCount, targetSize);
  const plantedSet = new Set(shuffle(range(nodeCount)).slice(0, nextGraph.targetSize));

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const bothInside = plantedSet.has(from) && plantedSet.has(to);
      const connected = bothInside ? false : Math.random() < density;
      nextGraph.adjacency[from][to] = connected;
      nextGraph.adjacency[to][from] = connected;
    }
  }

  return nextGraph;
}

export function generateRandomVertexCoverGraph(nodeCount, density, targetSize) {
  const nextGraph = createEmptyGraph(nodeCount, targetSize);
  const coverSet = new Set(shuffle(range(nodeCount)).slice(0, nextGraph.targetSize));

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const bothOutside = !coverSet.has(from) && !coverSet.has(to);
      const connected = bothOutside ? false : Math.random() < density;
      nextGraph.adjacency[from][to] = connected;
      nextGraph.adjacency[to][from] = connected;
    }
  }

  return nextGraph;
}

export function complementIndices(count, indices) {
  const selected = new Set(indices);
  return range(count).filter((index) => !selected.has(index));
}

export function complementGraph(graph, targetSize = graph.targetSize) {
  const size = graph.nodes.length;
  const adjacency = Array.from({ length: size }, () => Array(size).fill(false));

  for (let from = 0; from < size; from += 1) {
    for (let to = from + 1; to < size; to += 1) {
      const connected = !graph.adjacency[from][to];
      adjacency[from][to] = connected;
      adjacency[to][from] = connected;
    }
  }

  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    adjacency,
    targetSize: clamp(Math.trunc(Number(targetSize)) || 0, 0, size),
  };
}

export function reduceIndependentSetToClique(graph) {
  return complementGraph(graph, graph.targetSize);
}

export function reduceVertexCoverToClique(graph) {
  const cliqueTarget = clamp(graph.nodes.length - graph.targetSize, 0, graph.nodes.length);
  return complementGraph(graph, cliqueTarget);
}

function sortCandidatesByDegree(graph, indices) {
  return indices
    .slice()
    .sort((left, right) => {
      const leftDegree = graph.adjacency[left].filter(Boolean).length;
      const rightDegree = graph.adjacency[right].filter(Boolean).length;
      return rightDegree - leftDegree;
    });
}

export function solveCliqueBruteForce(graph) {
  const initialCandidates = sortCandidatesByDegree(graph, range(graph.nodes.length));
  let checkedSubsets = 0;
  let targetClique = [];
  let maximumClique = [];
  let foundTarget = graph.targetSize === 0;

  function search(currentClique, candidates) {
    checkedSubsets += 1;

    if (currentClique.length > maximumClique.length) {
      maximumClique = currentClique.slice();
    }

    if (!foundTarget && currentClique.length >= graph.targetSize) {
      targetClique = currentClique.slice(0, graph.targetSize);
      foundTarget = true;
    }

    if (!candidates.length) {
      return;
    }

    const bestPossible = currentClique.length + candidates.length;
    if (
      bestPossible <= maximumClique.length &&
      (foundTarget || bestPossible < graph.targetSize)
    ) {
      return;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const vertex = candidates[index];
      const nextCandidates = candidates
        .slice(index + 1)
        .filter((candidate) => graph.adjacency[vertex][candidate]);

      search(currentClique.concat(vertex), nextCandidates);
    }
  }

  search([], initialCandidates);

  return {
    hasTargetSolution: foundTarget,
    targetSolution: targetClique,
    optimalSolution: maximumClique,
    checkedSubsets,
  };
}

export function solveIndependentSetBruteForce(graph) {
  const cliqueResult = solveCliqueBruteForce(reduceIndependentSetToClique(graph));

  return {
    hasTargetSolution: cliqueResult.hasTargetSolution,
    targetSolution: cliqueResult.targetSolution,
    optimalSolution: cliqueResult.optimalSolution,
    checkedSubsets: cliqueResult.checkedSubsets,
  };
}

export function solveVertexCoverBruteForce(graph) {
  const cliqueResult = solveCliqueBruteForce(reduceVertexCoverToClique(graph));
  const nodeCount = graph.nodes.length;

  return {
    hasTargetSolution: cliqueResult.hasTargetSolution,
    targetSolution: cliqueResult.hasTargetSolution
      ? complementIndices(nodeCount, cliqueResult.targetSolution)
      : [],
    optimalSolution: complementIndices(nodeCount, cliqueResult.optimalSolution),
    checkedSubsets: cliqueResult.checkedSubsets,
  };
}

function cliqueVariableName(slotIndex, nodeLabel) {
  return `x_${slotIndex + 1}_${nodeLabel}`;
}

export function reduceCliqueToSat(graph) {
  const variableOrder = [];
  const variableMeta = {};
  const clauses = [];
  const familyCounts = {
    coverage: 0,
    "unique-node": 0,
    "unique-slot": 0,
    "non-edge": 0,
  };

  for (let slot = 0; slot < graph.targetSize; slot += 1) {
    for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex += 1) {
      const node = graph.nodes[nodeIndex];
      const variable = cliqueVariableName(slot, node.label);
      variableOrder.push(variable);
      variableMeta[variable] = {
        slot: slot + 1,
        nodeIndex,
        nodeId: node.id,
        nodeLabel: node.label,
      };
    }
  }

  for (let slot = 0; slot < graph.targetSize; slot += 1) {
    clauses.push({
      id: `coverage-${slot + 1}`,
      family: "coverage",
      description: `Choose at least one vertex for clique slot ${slot + 1}.`,
      literals: graph.nodes.map((node) => ({
        variable: cliqueVariableName(slot, node.label),
        nodeId: node.id,
        nodeLabel: node.label,
        slot: slot + 1,
      })),
    });
    familyCounts.coverage += 1;
  }

  for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex += 1) {
    const node = graph.nodes[nodeIndex];

    for (let firstSlot = 0; firstSlot < graph.targetSize; firstSlot += 1) {
      for (let secondSlot = firstSlot + 1; secondSlot < graph.targetSize; secondSlot += 1) {
        clauses.push({
          id: `unique-node-${node.id}-${firstSlot + 1}-${secondSlot + 1}`,
          family: "unique-node",
          description: `Vertex ${node.label} cannot fill slots ${firstSlot + 1} and ${secondSlot + 1}.`,
          literals: [
            {
              variable: cliqueVariableName(firstSlot, node.label),
              negated: true,
              nodeId: node.id,
              nodeLabel: node.label,
              slot: firstSlot + 1,
            },
            {
              variable: cliqueVariableName(secondSlot, node.label),
              negated: true,
              nodeId: node.id,
              nodeLabel: node.label,
              slot: secondSlot + 1,
            },
          ],
        });
        familyCounts["unique-node"] += 1;
      }
    }
  }

  for (let slot = 0; slot < graph.targetSize; slot += 1) {
    for (let firstNode = 0; firstNode < graph.nodes.length; firstNode += 1) {
      for (let secondNode = firstNode + 1; secondNode < graph.nodes.length; secondNode += 1) {
        const left = graph.nodes[firstNode];
        const right = graph.nodes[secondNode];

        clauses.push({
          id: `unique-slot-${slot + 1}-${left.id}-${right.id}`,
          family: "unique-slot",
          description: `Clique slot ${slot + 1} cannot contain both ${left.label} and ${right.label}.`,
          literals: [
            {
              variable: cliqueVariableName(slot, left.label),
              negated: true,
              nodeId: left.id,
              nodeLabel: left.label,
              slot: slot + 1,
            },
            {
              variable: cliqueVariableName(slot, right.label),
              negated: true,
              nodeId: right.id,
              nodeLabel: right.label,
              slot: slot + 1,
            },
          ],
        });
        familyCounts["unique-slot"] += 1;
      }
    }
  }

  for (let firstSlot = 0; firstSlot < graph.targetSize; firstSlot += 1) {
    for (let secondSlot = firstSlot + 1; secondSlot < graph.targetSize; secondSlot += 1) {
      for (let firstNode = 0; firstNode < graph.nodes.length; firstNode += 1) {
        for (let secondNode = 0; secondNode < graph.nodes.length; secondNode += 1) {
          if (
            firstNode === secondNode ||
            graph.adjacency[firstNode][secondNode]
          ) {
            continue;
          }

          const left = graph.nodes[firstNode];
          const right = graph.nodes[secondNode];

          clauses.push({
            id: `non-edge-${firstSlot + 1}-${secondSlot + 1}-${left.id}-${right.id}`,
            family: "non-edge",
            description: `${left.label} and ${right.label} are not adjacent, so they cannot occupy slots ${firstSlot + 1} and ${secondSlot + 1}.`,
            literals: [
              {
                variable: cliqueVariableName(firstSlot, left.label),
                negated: true,
                nodeId: left.id,
                nodeLabel: left.label,
                slot: firstSlot + 1,
              },
              {
                variable: cliqueVariableName(secondSlot, right.label),
                negated: true,
                nodeId: right.id,
                nodeLabel: right.label,
                slot: secondSlot + 1,
              },
            ],
          });
          familyCounts["non-edge"] += 1;
        }
      }
    }
  }

  return {
    k: graph.targetSize,
    variableOrder,
    variableMeta,
    familyCounts,
    formula: {
      variables: variableOrder.slice(),
      clauses,
    },
  };
}

export function decodeCliqueAssignment(assignment, reduction) {
  const selected = [];

  reduction.variableOrder.forEach((variable) => {
    if (!assignment[variable]) {
      return;
    }

    const meta = reduction.variableMeta[variable];

    if (!meta) {
      return;
    }

    selected.push({
      slot: meta.slot,
      nodeIndex: meta.nodeIndex,
    });
  });

  return unique(
    selected
      .sort((left, right) => left.slot - right.slot)
      .map((item) => item.nodeIndex),
  );
}

export function describeNodeSelection(indices, nodes) {
  const labels = indices.map((index) => nodes[index]?.label).filter(Boolean);
  return labels.length ? labels.join(", ") : "None";
}
