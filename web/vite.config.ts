/// <reference types="vitest" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/";
const enablePwa = process.env.VITE_ENABLE_PWA === "true";

export default defineConfig({
  base,
  plugins: [
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
