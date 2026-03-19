import {
  createCircularLayout,
  solveCliqueBruteForce,
  type GraphInstance,
} from "@/lib/clique";

export type GraphProblemKey = "clique" | "independent-set" | "vertex-cover";

export type GraphProblemBruteForceResult = {
  hasTargetSolution: boolean;
  targetSolution: number[];
  optimalSolution: number[];
  checkedSubsets: number;
};

function buildGraphInstance(
  nodeCount: number,
  edges: Array<[number, number]>,
  targetSize: number,
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

  for (const [from, to] of edges) {
    adjacency[from][to] = true;
    adjacency[to][from] = true;
  }

  return {
    nodes,
    adjacency,
    targetCliqueSize: targetSize,
  };
}

function clampTargetSize(nodeCount: number, targetSize: number) {
  return Math.min(nodeCount, Math.max(0, targetSize));
}

function allIndices(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

export function complementIndices(count: number, indices: number[]) {
  const selected = new Set(indices);
  return allIndices(count).filter((index) => !selected.has(index));
}

export function complementGraph(
  instance: GraphInstance,
  targetSize = instance.targetCliqueSize,
): GraphInstance {
  const size = instance.nodes.length;
  const adjacency = Array.from({ length: size }, () => Array(size).fill(false));

  for (let from = 0; from < size; from += 1) {
    for (let to = from + 1; to < size; to += 1) {
      const connected = !instance.adjacency[from][to];
      adjacency[from][to] = connected;
      adjacency[to][from] = connected;
    }
  }

  return {
    nodes: instance.nodes.map((node) => ({ ...node })),
    adjacency,
    targetCliqueSize: clampTargetSize(size, targetSize),
  };
}

export function createSampleIndependentSetInstance() {
  return buildGraphInstance(
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

export function createSampleVertexCoverInstance() {
  return buildGraphInstance(
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

export function generateRandomIndependentSetInstance(
  nodeCount: number,
  density: number,
  targetSize: number,
) {
  const instance = buildGraphInstance(nodeCount, [], clampTargetSize(nodeCount, targetSize));
  const independentSet = allIndices(nodeCount)
    .sort(() => Math.random() - 0.5)
    .slice(0, instance.targetCliqueSize);
  const independentLookup = new Set(independentSet);

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const bothInIndependentSet =
        independentLookup.has(from) && independentLookup.has(to);
      const connected = bothInIndependentSet ? false : Math.random() < density;
      instance.adjacency[from][to] = connected;
      instance.adjacency[to][from] = connected;
    }
  }

  return instance;
}

export function generateRandomVertexCoverInstance(
  nodeCount: number,
  density: number,
  targetSize: number,
) {
  const instance = buildGraphInstance(nodeCount, [], clampTargetSize(nodeCount, targetSize));
  const coverVertices = allIndices(nodeCount)
    .sort(() => Math.random() - 0.5)
    .slice(0, instance.targetCliqueSize);
  const coverLookup = new Set(coverVertices);

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) {
      const bothOutsideCover =
        !coverLookup.has(from) && !coverLookup.has(to);
      const connected = bothOutsideCover ? false : Math.random() < density;
      instance.adjacency[from][to] = connected;
      instance.adjacency[to][from] = connected;
    }
  }

  return instance;
}

export function reduceIndependentSetToClique(instance: GraphInstance) {
  return complementGraph(instance, instance.targetCliqueSize);
}

export function reduceVertexCoverToClique(instance: GraphInstance) {
  const independentSetTarget = clampTargetSize(
    instance.nodes.length,
    instance.nodes.length - instance.targetCliqueSize,
  );

  return complementGraph(instance, independentSetTarget);
}

export function solveIndependentSetBruteForce(
  instance: GraphInstance,
): GraphProblemBruteForceResult {
  const cliqueResult = solveCliqueBruteForce(
    reduceIndependentSetToClique(instance),
  );

  return {
    hasTargetSolution: cliqueResult.hasCliqueAtTargetSize,
    targetSolution: cliqueResult.targetClique,
    optimalSolution: cliqueResult.maximumClique,
    checkedSubsets: cliqueResult.checkedSubsets,
  };
}

export function solveVertexCoverBruteForce(
  instance: GraphInstance,
): GraphProblemBruteForceResult {
  const cliqueResult = solveCliqueBruteForce(
    reduceVertexCoverToClique(instance),
  );
  const nodeCount = instance.nodes.length;

  return {
    hasTargetSolution: cliqueResult.hasCliqueAtTargetSize,
    targetSolution: cliqueResult.hasCliqueAtTargetSize
      ? complementIndices(nodeCount, cliqueResult.targetClique)
      : [],
    optimalSolution: complementIndices(nodeCount, cliqueResult.maximumClique),
    checkedSubsets: cliqueResult.checkedSubsets,
  };
}
