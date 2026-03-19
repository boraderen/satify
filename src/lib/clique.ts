import { ClauseFamilyKey, type CnfFormula, type Clause } from "@/lib/sat";

export type GraphNode = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type GraphInstance = {
  nodes: GraphNode[];
  adjacency: boolean[][];
  targetCliqueSize: number;
};

export type BruteForceCliqueResult = {
  hasCliqueAtTargetSize: boolean;
  targetClique: number[];
  maximumClique: number[];
  checkedSubsets: number;
};

export type CliqueSatReduction = {
  k: number;
  variableOrder: string[];
  variableMetadata: Record<
    string,
    {
      nodeId?: string;
      nodeIndex?: number;
      nodeLabel?: string;
      position?: number;
      auxiliary?: boolean;
    }
  >;
  formula: CnfFormula;
  familyCounts: Record<ClauseFamilyKey, number>;
};

export const MAX_INTERACTIVE_NODES = 50;

const NODE_COLORS = [
  "#26547c",
  "#ef476f",
  "#f4a261",
  "#2a9d8f",
  "#8e5a9b",
  "#e76f51",
  "#06a77d",
  "#b56576",
];

export const CLAUSE_FAMILY_INFO: Record<
  ClauseFamilyKey,
  { title: string; description: string; accent: string }
> = {
  coverage: {
    title: "C1. Cover each clique position",
    description:
      "For every position i, at least one graph vertex must be selected.",
    accent: "#26547c",
  },
  "unique-vertex": {
    title: "C2. Reuse no vertex",
    description:
      "A single graph vertex cannot occupy two different clique positions.",
    accent: "#ef476f",
  },
  "unique-position": {
    title: "C3. Keep each position unique",
    description:
      "Every clique slot contains at most one selected graph vertex.",
    accent: "#2a9d8f",
  },
  "non-edge": {
    title: "C4. Forbid missing edges",
    description:
      "Two chosen positions cannot be assigned to non-adjacent vertices.",
    accent: "#e76f51",
  },
};

function createNodeLabel(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  if (index < alphabet.length) {
    return alphabet[index];
  }

  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length)}`;
}

export function createCircularLayout(count: number) {
  const centerX = 310;
  const centerY = 180;
  const radiusX = 190;
  const radiusY = 120;

  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return {
      label: createNodeLabel(index),
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    };
  });
}

function buildAdjacency(size: number, edges: Array<[number, number]>) {
  const adjacency = Array.from({ length: size }, () => Array(size).fill(false));

  for (const [from, to] of edges) {
    adjacency[from][to] = true;
    adjacency[to][from] = true;
  }

  return adjacency;
}

export function createSampleCliqueInstance(): GraphInstance {
  const layout = createCircularLayout(5);
  const nodes = layout.map((node, index) => ({
    id: `v${index + 1}`,
    label: node.label,
    x: node.x,
    y: node.y,
  }));

  return {
    nodes,
    adjacency: buildAdjacency(5, [
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 4],
      [3, 4],
    ]),
    targetCliqueSize: 3,
  };
}

export function buildNodeColorMap(nodes: GraphNode[]) {
  return Object.fromEntries(
    nodes.map((node, index) => [node.id, NODE_COLORS[index % NODE_COLORS.length]]),
  );
}

export function getGraphEdges(instance: GraphInstance) {
  const edges: Array<{ from: GraphNode; to: GraphNode }> = [];

  for (let from = 0; from < instance.nodes.length; from += 1) {
    for (let to = from + 1; to < instance.nodes.length; to += 1) {
      if (instance.adjacency[from][to]) {
        edges.push({
          from: instance.nodes[from],
          to: instance.nodes[to],
        });
      }
    }
  }

  return edges;
}

export function solveCliqueBruteForce(instance: GraphInstance): BruteForceCliqueResult {
  const count = instance.nodes.length;
  let maximumClique: number[] = [];
  let targetClique: number[] = [];
  let checkedSubsets = 0;

  function search(currentClique: number[], candidates: number[]) {
    checkedSubsets += 1;

    if (currentClique.length > maximumClique.length) {
      maximumClique = [...currentClique];
    }

    if (
      targetClique.length === 0 &&
      currentClique.length >= instance.targetCliqueSize
    ) {
      targetClique = currentClique.slice(0, instance.targetCliqueSize);
    }

    if (candidates.length === 0) {
      return;
    }

    const bestPossibleSize = currentClique.length + candidates.length;
    if (
      bestPossibleSize <= maximumClique.length &&
      (targetClique.length > 0 ||
        bestPossibleSize < instance.targetCliqueSize)
    ) {
      return;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const vertex = candidates[index];
      const remainingCandidates = candidates
        .slice(index + 1)
        .filter((candidate) => instance.adjacency[vertex][candidate]);

      search([...currentClique, vertex], remainingCandidates);
    }
  }

  search(
    [],
    Array.from({ length: count }, (_, index) => index),
  );

  return {
    hasCliqueAtTargetSize: targetClique.length > 0,
    targetClique,
    maximumClique,
    checkedSubsets,
  };
}

function variableName(position: number, nodeLabel: string) {
  return `x_${position + 1},${nodeLabel}`;
}

export function reduceCliqueToSat(instance: GraphInstance): CliqueSatReduction {
  const variableOrder: string[] = [];
  const variableMetadata: CliqueSatReduction["variableMetadata"] = {};
  const clauses: Clause[] = [];
  const familyCounts: Record<ClauseFamilyKey, number> = {
    coverage: 0,
    "unique-vertex": 0,
    "unique-position": 0,
    "non-edge": 0,
  };

  for (let position = 0; position < instance.targetCliqueSize; position += 1) {
    for (let nodeIndex = 0; nodeIndex < instance.nodes.length; nodeIndex += 1) {
      const node = instance.nodes[nodeIndex];
      const variable = variableName(position, node.label);
      variableOrder.push(variable);
      variableMetadata[variable] = {
        nodeId: node.id,
        nodeIndex,
        nodeLabel: node.label,
        position: position + 1,
      };
    }
  }

  for (let position = 0; position < instance.targetCliqueSize; position += 1) {
    const literals = instance.nodes.map((node) => {
      const variable = variableName(position, node.label);
      return {
        variable,
        nodeId: node.id,
        nodeLabel: node.label,
        position: position + 1,
      };
    });

    clauses.push({
      id: `coverage-${position + 1}`,
      family: "coverage",
      description: `Choose at least one vertex for clique position ${position + 1}.`,
      literals,
    });
    familyCounts.coverage += 1;
  }

  for (let nodeIndex = 0; nodeIndex < instance.nodes.length; nodeIndex += 1) {
    const node = instance.nodes[nodeIndex];

    for (let first = 0; first < instance.targetCliqueSize; first += 1) {
      for (let second = first + 1; second < instance.targetCliqueSize; second += 1) {
        clauses.push({
          id: `unique-vertex-${node.id}-${first + 1}-${second + 1}`,
          family: "unique-vertex",
          description: `Vertex ${node.label} cannot fill both positions ${first + 1} and ${second + 1}.`,
          literals: [
            {
              variable: variableName(first, node.label),
              negated: true,
              nodeId: node.id,
              nodeLabel: node.label,
              position: first + 1,
            },
            {
              variable: variableName(second, node.label),
              negated: true,
              nodeId: node.id,
              nodeLabel: node.label,
              position: second + 1,
            },
          ],
        });
        familyCounts["unique-vertex"] += 1;
      }
    }
  }

  for (let position = 0; position < instance.targetCliqueSize; position += 1) {
    for (let first = 0; first < instance.nodes.length; first += 1) {
      for (let second = first + 1; second < instance.nodes.length; second += 1) {
        const firstNode = instance.nodes[first];
        const secondNode = instance.nodes[second];

        clauses.push({
          id: `unique-position-${position + 1}-${firstNode.id}-${secondNode.id}`,
          family: "unique-position",
          description: `Position ${position + 1} cannot contain both ${firstNode.label} and ${secondNode.label}.`,
          literals: [
            {
              variable: variableName(position, firstNode.label),
              negated: true,
              nodeId: firstNode.id,
              nodeLabel: firstNode.label,
              position: position + 1,
            },
            {
              variable: variableName(position, secondNode.label),
              negated: true,
              nodeId: secondNode.id,
              nodeLabel: secondNode.label,
              position: position + 1,
            },
          ],
        });
        familyCounts["unique-position"] += 1;
      }
    }
  }

  for (let firstPosition = 0; firstPosition < instance.targetCliqueSize; firstPosition += 1) {
    for (
      let secondPosition = firstPosition + 1;
      secondPosition < instance.targetCliqueSize;
      secondPosition += 1
    ) {
      for (let firstNodeIndex = 0; firstNodeIndex < instance.nodes.length; firstNodeIndex += 1) {
        for (
          let secondNodeIndex = 0;
          secondNodeIndex < instance.nodes.length;
          secondNodeIndex += 1
        ) {
          if (
            firstNodeIndex === secondNodeIndex ||
            instance.adjacency[firstNodeIndex][secondNodeIndex]
          ) {
            continue;
          }

          const firstNode = instance.nodes[firstNodeIndex];
          const secondNode = instance.nodes[secondNodeIndex];

          clauses.push({
            id: `non-edge-${firstPosition + 1}-${secondPosition + 1}-${firstNode.id}-${secondNode.id}`,
            family: "non-edge",
            description: `${firstNode.label} and ${secondNode.label} are not adjacent, so they cannot occupy clique positions ${firstPosition + 1} and ${secondPosition + 1}.`,
            literals: [
              {
                variable: variableName(firstPosition, firstNode.label),
                negated: true,
                nodeId: firstNode.id,
                nodeLabel: firstNode.label,
                position: firstPosition + 1,
              },
              {
                variable: variableName(secondPosition, secondNode.label),
                negated: true,
                nodeId: secondNode.id,
                nodeLabel: secondNode.label,
                position: secondPosition + 1,
              },
            ],
          });
          familyCounts["non-edge"] += 1;
        }
      }
    }
  }

  return {
    k: instance.targetCliqueSize,
    variableOrder,
    variableMetadata,
    formula: {
      clauses,
      variables: variableOrder,
    },
    familyCounts,
  };
}

export function decodeCliqueAssignment(
  assignment: Record<string, boolean>,
  reduction: CliqueSatReduction,
) {
  const orderedSelection: Array<{ position: number; nodeIndex: number }> = [];

  for (const variable of reduction.variableOrder) {
    if (!assignment[variable]) {
      continue;
    }

    const metadata = reduction.variableMetadata[variable];

    if (
      metadata.position !== undefined &&
      metadata.nodeIndex !== undefined
    ) {
      orderedSelection.push({
        position: metadata.position,
        nodeIndex: metadata.nodeIndex,
      });
    }
  }

  orderedSelection.sort((left, right) => left.position - right.position);

  return Array.from(new Set(orderedSelection.map((item) => item.nodeIndex)));
}

export function describeClique(indices: number[], nodes: GraphNode[]) {
  return indices.map((index) => nodes[index]?.label).filter(Boolean).join(", ");
}

export function generateRandomCliqueInstance(
  nodeCount: number,
  density: number,
  targetCliqueSize: number,
): GraphInstance {
  const layout = createCircularLayout(nodeCount);
  const nodes = layout.map((node, index) => ({
    id: `v${index + 1}`,
    label: node.label,
    x: node.x,
    y: node.y,
  }));

  const adjacency = Array.from({ length: nodeCount }, () =>
    Array(nodeCount).fill(false),
  );

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const connected = Math.random() < density;
      adjacency[from][to] = connected;
      adjacency[to][from] = connected;
    }
  }

  const guaranteedCliqueSize = Math.min(targetCliqueSize, nodeCount);
  const shuffledVertices = Array.from({ length: nodeCount }, (_, index) => index)
    .sort(() => Math.random() - 0.5);
  const cliqueVertices = shuffledVertices.slice(0, guaranteedCliqueSize);

  for (let first = 0; first < cliqueVertices.length; first += 1) {
    for (let second = first + 1; second < cliqueVertices.length; second += 1) {
      const from = cliqueVertices[first];
      const to = cliqueVertices[second];
      adjacency[from][to] = true;
      adjacency[to][from] = true;
    }
  }

  return {
    nodes,
    adjacency,
    targetCliqueSize: guaranteedCliqueSize,
  };
}
