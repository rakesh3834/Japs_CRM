import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "frontend", "dist");
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "server"), { recursive: true });
await cp(source, output, { recursive: true });
await cp(resolve(root, "worker", "index.js"), resolve(output, "server", "index.js"));
console.log(`Prepared ${output} for Sites hosting.`);
