import { renderHomePage } from "./render.js";
import { ProblemController } from "./problem-controller.js";

const root = document.querySelector("#app");
const view = document.body.dataset.view;
const rootPath = document.body.dataset.root || "./";

if (!root) {
  throw new Error("Missing #app root element.");
}

if (view === "home") {
  root.innerHTML = renderHomePage(rootPath);
} else if (view === "problem") {
  const pageKey = document.body.dataset.problem;

  if (!pageKey) {
    throw new Error("Problem pages must define data-problem.");
  }

  new ProblemController(root, rootPath, pageKey);
} else {
  throw new Error(`Unsupported view: ${view}`);
}
