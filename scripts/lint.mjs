import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const targets = ["scripts", "src/js"];
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const entryPath = path.join(directory, entry);
    const entryStat = statSync(entryPath);

    if (entryStat.isDirectory()) {
      collect(entryPath);
      continue;
    }

    if (entryPath.endsWith(".js") || entryPath.endsWith(".mjs")) {
      files.push(entryPath);
    }
  }
}

targets.forEach((target) => collect(path.join(projectRoot, target)));

for (const filePath of files) {
  execFileSync(process.execPath, ["--check", filePath], {
    stdio: "inherit",
  });
}

console.log(`Syntax-checked ${files.length} JavaScript files.`);
