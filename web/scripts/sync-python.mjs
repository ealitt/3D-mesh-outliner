import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");
const sourceDir = resolve(repoRoot, "src", "mesh2cad");
const targetDir = resolve(webRoot, "public", "python", "mesh2cad");
const manifestPath = resolve(webRoot, "public", "python", "manifest.json");

await rm(targetDir, { force: true, recursive: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

const files = (await readdir(targetDir))
  .filter((file) => file.endsWith(".py"))
  .sort();

await writeFile(manifestPath, JSON.stringify({ files }, null, 2));
