const nodes = [
  {
    id: "vertex-cover",
    label: "Vertex Cover",
    x: 94,
    y: 96,
    fill: "#5f0f40",
  },
  {
    id: "independent-set",
    label: "Indep. Set",
    x: 238,
    y: 96,
    fill: "#2a9d8f",
  },
  {
    id: "clique",
    label: "k-Clique",
    x: 382,
    y: 96,
    fill: "#1f3c88",
  },
  {
    id: "sat",
    label: "SAT",
    x: 526,
    y: 96,
    fill: "#d86243",
  },
  {
    id: "three-sat",
    label: "3-SAT",
    x: 648,
    y: 96,
    fill: "#e7a23d",
  },
];

const edges = [
  {
    from: "vertex-cover",
    to: "independent-set",
  },
  {
    from: "independent-set",
    to: "clique",
  },
  {
    from: "clique",
    to: "sat",
  },
  {
    from: "sat",
    to: "three-sat",
  },
];

const NODE_HALF_WIDTH = 40;
const EDGE_PADDING = 14;

function getNodePosition(id: string) {
  return nodes.find((node) => node.id === id);
}

function getEdgeEndpoints(fromId: string, toId: string) {
  const from = getNodePosition(fromId);
  const to = getNodePosition(toId);

  if (!from || !to) {
    return null;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return null;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const inset = NODE_HALF_WIDTH + EDGE_PADDING;

  return {
    x1: from.x + ux * inset,
    y1: from.y + uy * inset,
    x2: to.x - ux * inset,
    y2: to.y - uy * inset,
  };
}

export function ReductionLandscape() {
  return (
    <div className="landscape-panel">
      <svg
        className="landscape-svg"
        viewBox="0 0 720 170"
        role="img"
        aria-label="Reduction map from vertex cover to independent set to k-clique to SAT to 3-SAT"
      >
        <defs>
          <marker
            id="landscape-arrow"
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L12,6 L0,12 Z" fill="#42546e" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const edgeLine = getEdgeEndpoints(edge.from, edge.to);

          if (!edgeLine) {
            return null;
          }

          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={edgeLine.x1}
              y1={edgeLine.y1}
              x2={edgeLine.x2}
              y2={edgeLine.y2}
              stroke="#42546e"
              strokeWidth="1.7"
              markerEnd="url(#landscape-arrow)"
            />
          );
        })}

        {nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <rect
              x={-40}
              y={-14}
              width="80"
              height="28"
              rx="6"
              fill={node.fill}
            />
            <text
              x="0"
              y="3.5"
              textAnchor="middle"
              className="landscape-node-title"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
