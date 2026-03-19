export type SupportedProblem = {
  slug: string;
  name: string;
  summary: string;
  category: string;
  decisionText: string;
  inputMode: string;
  isNpComplete: boolean;
  isStronglyNpComplete: boolean;
  reductionPath: string[];
  href?: string;
};

export const supportedProblems: SupportedProblem[] = [
  {
    slug: "k-clique",
    name: "k-Clique",
    summary:
      "Interactive graph input, reduction to SAT and 3-SAT, brute-force search, and runtime comparison.",
    category: "Graph problem",
    decisionText: "Does G contain a clique of size at least k?",
    inputMode: "Graph editor",
    isNpComplete: true,
    isStronglyNpComplete: true,
    reductionPath: ["k-Clique", "SAT", "3-SAT"],
    href: "/problems/k-clique",
  },
  {
    slug: "sat",
    name: "SAT",
    summary: "Boolean satisfiability in conjunctive normal form.",
    category: "Logic problem",
    decisionText: "Is the given Boolean formula satisfiable?",
    inputMode: "Formula input",
    isNpComplete: true,
    isStronglyNpComplete: true,
    reductionPath: ["SAT", "3-SAT"],
    href: "/problems/sat",
  },
  {
    slug: "3-sat",
    name: "3-SAT",
    summary: "SAT restricted to clauses of exactly three literals.",
    category: "Logic problem",
    decisionText: "Is the given 3-CNF formula satisfiable?",
    inputMode: "Clause input",
    isNpComplete: true,
    isStronglyNpComplete: true,
    reductionPath: ["3-SAT"],
    href: "/problems/3-sat",
  },
  {
    slug: "independent-set",
    name: "Independent Set",
    summary:
      "Interactive graph input, reduction through clique to SAT and 3-SAT, brute-force search, and runtime comparison.",
    category: "Graph problem",
    decisionText: "Does G contain an independent set of size at least k?",
    inputMode: "Graph editor",
    isNpComplete: true,
    isStronglyNpComplete: true,
    reductionPath: ["Independent Set", "k-Clique", "SAT", "3-SAT"],
    href: "/problems/independent-set",
  },
  {
    slug: "vertex-cover",
    name: "Vertex Cover",
    summary:
      "Interactive graph input, reduction through independent set and clique to SAT and 3-SAT, brute-force search, and runtime comparison.",
    category: "Graph problem",
    decisionText: "Does G contain a vertex cover of size at most k?",
    inputMode: "Graph editor",
    isNpComplete: true,
    isStronglyNpComplete: true,
    reductionPath: ["Vertex Cover", "Independent Set", "k-Clique", "SAT", "3-SAT"],
    href: "/problems/vertex-cover",
  },
];
