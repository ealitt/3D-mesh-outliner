/// <reference types="vitest" />
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/";
const enablePwa = process.env.VITE_ENABLE_PWA === "true";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const wasmSourceDir = resolve(repoRoot, "mesh2cad-wasm");

async function buildWasmDev() {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "wasm-pack",
      [
        "build",
        wasmSourceDir,
        "--target",
        "web",
        "--out-dir",
        resolve(here, "src", "wasm", "pkg"),
        "--out-name",
        "mesh2cad_wasm",
        "--dev",
      ],
      {
        cwd: here,
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`wasm-pack exited with code ${code ?? 1}`));
    });
    child.on("error", reject);
  });
}

function mesh2cadWasmWatchPlugin(): Plugin {
  let buildInFlight: Promise<void> | null = null;

  const runBuild = async () => {
    buildInFlight ??= buildWasmDev().finally(() => {
      buildInFlight = null;
    });
    await buildInFlight;
  };

  return {
    name: "mesh2cad-wasm-watch",
    configureServer(server) {
      const isWasmSource = (file: string) =>
        file.startsWith(wasmSourceDir)
        && (file.endsWith(".rs") || file.endsWith("Cargo.toml") || file.endsWith("Cargo.lock"));

      const handleWasmChange = async (file: string) => {
        if (!isWasmSource(file)) {
          return;
        }
        await runBuild();
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.add(wasmSourceDir);
      server.watcher.on("add", (file) => void handleWasmChange(file));
      server.watcher.on("change", (file) => void handleWasmChange(file));
      server.watcher.on("unlink", (file) => void handleWasmChange(file));
    },
  };
}

export default defineConfig({
  base,
  resolve: {
    alias: [
      {
        find: "@mesh2cad/mesh-workspace-viewer/styles.css",
        replacement: resolve(
          here,
          "packages",
          "mesh-workspace-viewer",
          "src",
          "styles",
          "base.css",
        ),
      },
      {
        find: "@mesh2cad/mesh-workspace-viewer",
        replacement: resolve(
          here,
          "packages",
          "mesh-workspace-viewer",
          "src",
          "index.ts",
        ),
      },
    ],
  },
  plugins: [
    mesh2cadWasmWatchPlugin(),
    preact(),
    tailwindcss(),
    VitePWA({
      disabled: !enablePwa,
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "mesh2cad Studio",
        short_name: "mesh2cad",
        description:
          "Browser-side mesh projection studio with 3D viewing and 2D SVG/DXF output.",
        theme_color: "#1e1915",
        background_color: "#f5efe4",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base.replace(/\/$/, "")}/pwa-192.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${base.replace(/\/$/, "")}/pwa-512.png`,
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: `${base.replace(/\/$/, "")}/pwa-512-maskable.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  worker: {
    format: "es",
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
