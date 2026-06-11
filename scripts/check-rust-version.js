import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoDir = resolve(packageDir, "..");

async function readVersionFromCargoToml(path) {
  const text = await readFile(path, "utf8");
  const match = text.match(/^\s*version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`No package version found in ${path}`);
  }
  return match[1];
}

async function readGeneratedVersion(path) {
  const text = await readFile(path, "utf8");
  const match = text.match(/RUST_AGENT_LOOP_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`No generated Rust version found in ${path}`);
  }
  return match[1];
}

const generatedPath = resolve(packageDir, "src/generated/rustVersion.js");
const fixturePath = resolve(packageDir, "test/fixtures/rust/Cargo.toml");
const siblingRustPath = resolve(repoDir, "cli/Cargo.toml");

const generatedVersion = await readGeneratedVersion(generatedPath);
const fixtureVersion = await readVersionFromCargoToml(fixturePath);

if (generatedVersion !== fixtureVersion) {
  throw new Error(`Generated Rust version ${generatedVersion} does not match fixture ${fixtureVersion}`);
}

try {
  const siblingVersion = await readVersionFromCargoToml(siblingRustPath);
  if (generatedVersion !== siblingVersion) {
    throw new Error(`Generated Rust version ${generatedVersion} does not match sibling Rust CLI ${siblingVersion}`);
  }
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

console.log(`Rust version OK: ${generatedVersion}`);
