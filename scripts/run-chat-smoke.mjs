import { build } from "vite";
import { runSmoke } from "./run-smoke.mjs";

await runSmoke("chat", (directory) => build({ configFile: false, build: {
  ssr: "src/main/ipc/registerHandlers.ts", outDir: directory, emptyOutDir: false,
  rollupOptions: { external: ["electron"], output: { format: "es", entryFileNames: "handlers.mjs" } }
} }));
