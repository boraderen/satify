import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outDir = path.join(projectRoot, "out");

const buildEntries = ["index.html", "problems", "assets", "src"];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of buildEntries) {
  await cp(path.join(projectRoot, entry), path.join(outDir, entry), {
    recursive: true,
  });
}

await writeFile(path.join(outDir, ".nojekyll"), "");

console.log(`Built static site in ${outDir}`);
