import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const crateRoot = resolve(webRoot, "..", "mesh2cad-wasm");
const outDir = resolve(webRoot, "src", "wasm", "pkg");
const release = process.argv.includes("--release");

const args = [
  "build",
  crateRoot,
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  "mesh2cad_wasm",
];

if (release) {
  args.push("--release");
} else {
  args.push("--dev");
}

await new Promise((resolvePromise, reject) => {
  const child = spawn("wasm-pack", args, {
    cwd: webRoot,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code === 0) {
      resolvePromise(undefined);
      return;
    }
    reject(new Error(`wasm-pack exited with code ${code ?? 1}`));
  });

  child.on("error", reject);
});
