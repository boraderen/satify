(function () {
  const HOME_INTRO =
    "Build decision problem instances, reduce them to SAT and 3-SAT, compare brute force and SAT-based solving, and inspect the reduction steps along the way.";

  const SUPPORTED_PROBLEMS = [
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
      href: "problems/k-clique/index.html",
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
      href: "problems/sat/index.html",
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
      href: "problems/3-sat/index.html",
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
      href: "problems/independent-set/index.html",
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
      href: "problems/vertex-cover/index.html",
    },
  ];

  const LANDSCAPE_NODES = [
    { id: "vertex-cover", label: "Vertex Cover", x: 84, y: 56 },
    { id: "independent-set", label: "Independent Set", x: 244, y: 56 },
    { id: "k-clique", label: "k-Clique", x: 404, y: 56 },
    { id: "sat", label: "SAT", x: 564, y: 56 },
    { id: "3-sat", label: "3-SAT", x: 684, y: 56 },
  ];

  const LANDSCAPE_EDGES = [
    ["vertex-cover", "independent-set"],
    ["independent-set", "k-clique"],
    ["k-clique", "sat"],
    ["sat", "3-sat"],
  ];

  const PAGE_COPY = {
    "k-clique": {
      title: "k-Clique",
      sectionTitle: "Reduction to SAT and 3-SAT",
      kind: "graph",
      definition: [
        {
          label: "Input",
          text: "An undirected graph G = (V, E) and a target size k.",
        },
        {
          label: "Question",
          text: "Does G contain a clique of size at least k?",
        },
        {
          label: "Clique",
          text: "A clique is a subset of vertices in which every two distinct vertices are adjacent.",
        },
      ],
      statement:
        "Exists C subseteq V such that |C| >= k and every distinct u, v in C satisfy {u, v} in E.",
      reductionSteps: [
        {
          title: "1. Create one variable per slot and vertex",
          text: "For each clique position i and each vertex v, add a Boolean variable x(i, v).",
          formula: "x(i, v) = 1 means vertex v is used in clique slot i.",
        },
        {
          title: "2. Force every slot to be filled",
          text: "Each of the k positions must choose at least one vertex.",
          formula: "For every i: OR over all v of x(i, v).",
        },
        {
          title: "3. Prevent a vertex from being reused",
          text: "The same graph vertex cannot occupy two different clique positions.",
          formula: "For every v and i < j: (not x(i, v) or not x(j, v)).",
        },
        {
          title: "4. Prevent two vertices in one slot",
          text: "A clique position can contain at most one chosen vertex.",
          formula: "For every i and u < v: (not x(i, u) or not x(i, v)).",
        },
        {
          title: "5. Forbid missing edges",
          text: "If two vertices are not adjacent, they cannot be chosen for two clique positions.",
          formula: "For every non-edge {u, v} and i < j: (not x(i, u) or not x(j, v)).",
        },
        {
          title: "6. Convert the CNF formula to 3-SAT",
          text: "Short clauses are padded and long clauses are split with helper variables.",
          formula: "G has a k-clique iff the resulting 3-SAT formula is satisfiable.",
        },
      ],
    },
    "independent-set": {
      title: "Independent Set",
      sectionTitle: "Reduction to SAT and 3-SAT",
      kind: "graph",
      definition: [
        {
          label: "Input",
          text: "An undirected graph G = (V, E) and a target size k.",
        },
        {
          label: "Question",
          text: "Does G contain an independent set of size at least k?",
        },
        {
          label: "Independent set",
          text: "A set is independent when no two chosen vertices are adjacent.",
        },
      ],
      statement:
        "Exists S subseteq V such that |S| >= k and every distinct u, v in S satisfy {u, v} notin E.",
      reductionSteps: [
        {
          title: "1. Keep the same vertex set",
          text: "Start with the original graph and the same target k.",
          formula: "(G, k)",
        },
        {
          title: "2. Complement the graph",
          text: "Replace every missing edge by an edge, and every edge by a non-edge.",
          formula: "Build G-bar with the same vertices and the opposite non-diagonal edges.",
        },
        {
          title: "3. Reuse the same target",
          text: "A size-k independent set in G becomes a size-k clique in G-bar.",
          formula: "S is independent in G iff S is a clique in G-bar.",
        },
        {
          title: "4. Reduce the clique instance",
          text: "Run the clique-to-SAT reduction and then the SAT-to-3-SAT conversion.",
          formula: "(G, k) -> (G-bar, k) -> SAT -> 3-SAT",
        },
      ],
    },
    "vertex-cover": {
      title: "Vertex Cover",
      sectionTitle: "Reduction to SAT and 3-SAT",
      kind: "graph",
      definition: [
        {
          label: "Input",
          text: "An undirected graph G = (V, E) and a target size k.",
        },
        {
          label: "Question",
          text: "Does G contain a vertex cover of size at most k?",
        },
        {
          label: "Vertex cover",
          text: "A vertex cover is a set of vertices that touches every edge in the graph.",
        },
      ],
      statement:
        "Exists C subseteq V such that |C| <= k and every edge {u, v} has u in C or v in C.",
      reductionSteps: [
        {
          title: "1. Switch to an independent-set target",
          text: "A set C is a vertex cover exactly when V minus C is an independent set.",
          formula: "C is a cover in G iff V \\ C is independent in G.",
        },
        {
          title: "2. Convert the bound",
          text: "The equivalent independent-set target is |V| - k.",
          formula: "k' = |V| - k",
        },
        {
          title: "3. Complement the graph",
          text: "The independent-set instance becomes a clique instance on the complement graph.",
          formula: "(G, k) -> (G, |V| - k) -> (G-bar, |V| - k)",
        },
        {
          title: "4. Reduce the clique instance",
          text: "Use the clique-to-SAT reduction and then the 3-SAT conversion.",
          formula: "Vertex Cover -> Independent Set -> Clique -> SAT -> 3-SAT",
        },
      ],
    },
    sat: {
      title: "SAT",
      sectionTitle: "Reduction to 3-SAT",
      kind: "formula",
      definition: [
        {
          label: "Input",
          text: "A Boolean formula Phi in conjunctive normal form.",
        },
        {
          label: "Question",
          text: "Is Phi satisfiable?",
        },
        {
          label: "CNF",
          text: "A CNF formula is an AND of clauses, and each clause is an OR of literals.",
        },
      ],
      statement: "Phi = AND over clauses C_i, where each C_i is an OR of literals.",
      reductionSteps: [
        {
          title: "1. Keep 3-literal clauses as they are",
          text: "Any clause that already has three literals needs no structural change.",
          formula: "(a or b or c) stays unchanged.",
        },
        {
          title: "2. Pad short clauses",
          text: "One- and two-literal clauses are expanded by repeating literals.",
          formula: "(a) -> (a or a or a), (a or b) -> (a or b or b)",
        },
        {
          title: "3. Split long clauses",
          text: "Clauses with four or more literals are broken into a chain of 3-literal clauses with helper variables.",
          formula: "(l1 or l2 or l3 or ... or lt) becomes a chain with y1, y2, ...",
        },
        {
          title: "4. Preserve satisfiability",
          text: "The transformed 3-SAT formula is satisfiable exactly when the original CNF formula is.",
          formula: "SAT(Phi) iff SAT(Phi_3SAT)",
        },
      ],
    },
    "3-sat": {
      title: "3-SAT",
      sectionTitle: "Reduction to 3-SAT",
      kind: "formula",
      definition: [
        {
          label: "Input",
          text: "A Boolean formula Phi in 3-CNF.",
        },
        {
          label: "Question",
          text: "Is Phi satisfiable?",
        },
        {
          label: "3-CNF",
          text: "Every clause already contains exactly three literals.",
        },
      ],
      statement: "Phi is already a conjunction of clauses with exactly three literals each.",
      reductionSteps: [
        {
          title: "1. Start with a 3-CNF formula",
          text: "Every clause already matches the target clause size.",
          formula: "Each clause has exactly three literals.",
        },
        {
          title: "2. Use the identity reduction",
          text: "No structural conversion is needed.",
          formula: "Phi_3SAT = Phi",
        },
        {
          title: "3. Keep the same satisfying assignments",
          text: "The original variables keep the same truth assignments.",
          formula: "SAT(Phi) iff SAT(Phi_3SAT)",
        },
      ],
    },
  };

  window.SATifyData = {
    HOME_INTRO,
    SUPPORTED_PROBLEMS,
    LANDSCAPE_NODES,
    LANDSCAPE_EDGES,
    PAGE_COPY,
  };
})();
