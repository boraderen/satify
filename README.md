# SATify

SATify is now a plain HTML, CSS, and JavaScript project for experimenting with reductions to SAT and 3-SAT.

Supported problems:

- k-Clique
- Independent Set
- Vertex Cover
- SAT
- 3-SAT

## Project layout

- `index.html` renders the home page.
- `problems/*/index.html` renders the individual workbenches.
- `src/js/` contains the application logic, reductions, solvers, and rendering code.
- `src/styles/site.css` contains the shared old-school UI styling.
- `scripts/build.mjs` copies the static site into `out/`.
- `scripts/dev.mjs` serves either the source tree or `out/`.

## Local development

```bash
npm run dev
```

Then open [http://localhost:4173](http://localhost:4173).

## Checks

```bash
npm run lint
npm run build
```

## Deployment

GitHub Pages still deploys from the workflow in `.github/workflows/deploy-pages.yml`, and the generated static site is published from `out/`.
