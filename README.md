# SATify

SATify is a small Next.js app for exploring reductions from decision problems to
SAT and 3-SAT.

The first supported problem is `k-clique`. The app includes:

- a homepage with the supported-problem catalog and reduction landscape
- a draggable graph editor with an adjacency-matrix input
- random graph generation with configurable size, target `k`, and edge density
- brute-force clique solving
- reduction from `k-clique` to SAT and then to 3-SAT
- a 3-SAT solver with decoded clique output
- runtime comparison between the reduction pipeline and brute force
- a color-coded explanation of how graph nodes appear in generated clauses

## Development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run lint
npm run build
```
