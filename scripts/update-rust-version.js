import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoDir = resolve(packageDir, "..");
const rustCargoPath = resolve(repoDir, "cli/Cargo.toml");

const cargoText = await readFile(rustCargoPath, "utf8");
const match = cargoText.match(/^\s*version\s*=\s*"([^"]+)"/m);
if (!match) {
  throw new Error(`No package version found in ${rustCargoPath}`);
}

const version = match[1];
await mkdir(resolve(packageDir, "src/generated"), { recursive: true });
await mkdir(resolve(packageDir, "test/fixtures/rust"), { recursive: true });
await writeFile(
  resolve(packageDir, "src/generated/rustVersion.js"),
  `export const RUST_AGENT_LOOP_VERSION = ${JSON.stringify(version)};\n`,
);
await writeFile(
  resolve(packageDir, "test/fixtures/rust/Cargo.toml"),
  `[package]\nname = "agent-loop"\nversion = ${JSON.stringify(version)}\nedition = "2024"\n`,
);

console.log(`Updated Rust version fixture to ${version}`);
