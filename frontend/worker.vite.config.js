import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  build: {
    ssr: fileURLToPath(new URL("../worker/index.js", import.meta.url)),
    outDir: "../.worker-build", emptyOutDir: true, minify: false,
    rollupOptions: { output: { entryFileNames: "index.js" } },
  },
  ssr: { target: "webworker", noExternal: true },
});
