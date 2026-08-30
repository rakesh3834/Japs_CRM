import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "frontend", "dist");
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "server"), { recursive: true });
await cp(source, output, { recursive: true });

const mimeTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2" };
const assets = {};
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(path, relative);
    else assets[relative] = { type: mimeTypes[entry.name.slice(entry.name.lastIndexOf("."))] || "application/octet-stream", body: (await readFile(path)).toString("base64") };
  }
}
await collect(source);
const workerSource = await readFile(resolve(root, "worker", "index.js"), "utf8");
const generatedWorker = workerSource.replace("const STATIC_ASSETS = {};", `const STATIC_ASSETS = ${JSON.stringify(assets)};`);
await writeFile(resolve(output, "server", "index.js"), generatedWorker);
console.log(`Prepared ${output} for Sites hosting.`);
