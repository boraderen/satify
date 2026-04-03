import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const rootArg = process.argv[2] ?? ".";
const portArg = Number(process.argv[3] ?? "4173");
const serverRoot = path.resolve(projectRoot, rootArg);

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}

async function resolveFile(requestPath) {
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  let candidate = path.join(serverRoot, safePath);

  if (!candidate.startsWith(serverRoot)) {
    return null;
  }

  try {
    const fileStat = await stat(candidate);

    if (fileStat.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }
  } catch {
    if (!path.extname(candidate)) {
      candidate = path.join(candidate, "index.html");
    }
  }

  try {
    await access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = await resolveFile(url.pathname);

  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
});

server.listen(portArg, () => {
  console.log(`Serving ${serverRoot} at http://localhost:${portArg}`);
});
