/// <reference types="vitest" />
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  resolve: {
    alias: [
      {
        find: "@mesh2cad/mesh-workspace-viewer/styles.css",
        replacement: resolve(here, "src", "styles", "base.css"),
      },
      {
        find: "@mesh2cad/mesh-workspace-viewer",
        replacement: resolve(here, "src", "index.ts"),
      },
    ],
  },
  plugins: [preact()],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: resolve(here, "src", "index.ts"),
      fileName: () => "index.js",
      formats: ["es"],
      name: "MeshWorkspaceViewer",
    },
    rollupOptions: {
      external: [
        "preact",
        "preact/hooks",
        "preact/jsx-runtime",
        "three",
        "three/examples/jsm/controls/OrbitControls.js",
        "three/examples/jsm/controls/TransformControls.js",
      ],
      output: {
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css")
          ? "styles.css"
          : "assets/[name]-[hash][extname]",
      },
    },
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
