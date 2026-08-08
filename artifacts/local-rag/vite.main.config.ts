import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    outDir: "dist/main",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        "electron",
        "better-sqlite3",
        "node-llama-cpp",
        "pdf-parse",
        "mammoth",
        "xlsx",
        /^node:/,
        "path",
        "fs",
        "os",
        "crypto",
        "child_process",
      ],
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
