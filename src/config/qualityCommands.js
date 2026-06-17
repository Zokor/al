import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const AUTO_DETECTED_NPM_SCRIPTS = ["build", "test", "lint"];

export async function resolveRuntimeQualityCommands(config) {
  if (config.qualityCommands.length > 0) {
    return resolveConfiguredCheckCommands(config.qualityCommands);
  }
  if (config.autoTestCmd) {
    return [qualityCommand("custom", config.autoTestCmd)];
  }
  if (await fileExists(resolve(config.projectDir, "Cargo.toml"))) {
    return resolveRustQualityCommands();
  }
  const packageJson = await readPackageJson(config.projectDir);
  if (packageJson) {
    return resolveJsTsQualityCommands(packageJson);
  }
  return [];
}

export function resolveRuntimeBrowserTestCommands(config) {
  if (!config.verifyBrowserTest || config.browserTestCommands.length === 0) {
    return [];
  }
  return resolveConfiguredCheckCommands(config.browserTestCommands);
}

function resolveConfiguredCheckCommands(entries) {
  return entries.map((entry) => qualityCommand(entry.command, entry.command, entry.remediation));
}

function qualityCommand(label, command, remediation) {
  return { label, command, remediation };
}

async function resolveRustQualityCommands() {
  const commands = [
    qualityCommand("cargo build", "cargo build"),
    qualityCommand("cargo test", "cargo test"),
  ];
  if (await commandSucceeds("cargo", ["clippy", "--version"])) {
    commands.push(qualityCommand("cargo clippy", "cargo clippy -- -D warnings"));
  }
  return commands;
}

function resolveJsTsQualityCommands(packageJson) {
  const scripts = packageJson.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }
  return AUTO_DETECTED_NPM_SCRIPTS
    .filter((scriptName) => typeof scripts[scriptName] === "string" && !isNpmScriptStub(scripts[scriptName]))
    .map((scriptName) => qualityCommand(`npm run ${scriptName}`, `npm run ${scriptName}`));
}

function isNpmScriptStub(scriptValue) {
  const trimmed = scriptValue.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.includes("no test specified") || trimmed.includes("no test command")) {
    return true;
  }
  return trimmed.startsWith("echo ") && trimmed.includes("&& exit");
}

async function readPackageJson(projectDir) {
  try {
    return JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function commandSucceeds(command, args) {
  try {
    await execFileAsync(command, args, { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
