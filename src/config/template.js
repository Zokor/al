import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const JS_BROWSER_SCRIPT_NAMES = ["test:e2e", "e2e", "test:browser", "browser:test", "playwright", "cypress"];
const WEB_SURFACE_FILES = [
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "nuxt.config.ts",
  "nuxt.config.js",
  "astro.config.mjs",
  "svelte.config.js",
  "angular.json",
];
const PLAYWRIGHT_CONFIG_FILES = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
];
const CYPRESS_CONFIG_FILES = [
  "cypress.config.ts",
  "cypress.config.js",
  "cypress.config.mjs",
  "cypress.config.cjs",
];
const WEB_SURFACE_PACKAGES = ["vite", "next", "nuxt", "react", "vue", "svelte", "astro", "@angular/core"];

export function defaultJsonConfig() {
  return {
    requirements_workflow: "legacy",
    implementer: "claude",
    reviewer: "codex",
    planner: "claude",
    discoverer: "claude",
    verifier: "codex",
    supervisor_agent: "codex",
    single_agent: false,
    plan_requires_approval: false,
    decisions_enabled: true,
    next_skip_discuss: false,
  };
}

export function formatDefaultJsonConfig() {
  return `${JSON.stringify(defaultJsonConfig(), null, 2)}\n`;
}

export async function formatProjectJsonConfig(projectDir) {
  const profile = await detectProjectProfile(projectDir);
  return {
    content: `${JSON.stringify(projectJsonConfig(profile), null, 2)}\n`,
    detectedLanguage: profile.language,
  };
}

async function detectProjectProfile(projectDir) {
  const languages = [];
  const qualityCommands = [];

  if (await fileExists(projectDir, "Cargo.toml")) {
    languages.push("Rust");
    qualityCommands.push(...await resolveRustCommands());
  }

  const composerJson = await readJsonFile(projectDir, "composer.json");
  const hasComposer = Boolean(composerJson);
  const isLaravel = await detectLaravelProject(projectDir, composerJson);
  if (isLaravel || hasComposer) {
    languages.push(isLaravel ? "Laravel/PHP" : "PHP");
    qualityCommands.push(...await resolvePhpCommands(projectDir, composerJson, isLaravel));
  }

  const packageJson = await readJsonFile(projectDir, "package.json");
  if (packageJson) {
    languages.push("JavaScript/TypeScript");
    qualityCommands.push(...resolveJsTsCommands(packageJson));
  }

  const browserTestCommands = await resolveProjectBrowserTestCommands(projectDir, packageJson, composerJson);
  return {
    language: joinLabels(languages),
    qualityCommands: dedupeCommands(qualityCommands),
    browserTestCommands: dedupeCommands(browserTestCommands),
    webSurfaceDetected: await detectWebSurface(projectDir, packageJson, isLaravel),
  };
}

function projectJsonConfig(profile) {
  const config = defaultJsonConfig();
  if (!profile.language) {
    return config;
  }

  config.auto_test = true;
  if (profile.qualityCommands.length > 0) {
    config.quality_commands = profile.qualityCommands;
  }
  if (profile.browserTestCommands.length > 0) {
    config.verify_browser_test = true;
    config.browser_evidence_policy = "block";
    config.browser_test_commands = profile.browserTestCommands;
  } else if (profile.webSurfaceDetected) {
    config.browser_evidence_policy = "warn";
  }

  return config;
}

function checkCommand(command) {
  return { command };
}

async function resolveRustCommands() {
  const commands = [checkCommand("cargo build"), checkCommand("cargo test")];
  if (await commandSucceeds("cargo", ["clippy", "--version"])) {
    commands.push(checkCommand("cargo clippy -- -D warnings"));
  }
  return commands;
}

async function resolvePhpCommands(projectDir, composerJson, isLaravel) {
  const commands = [];
  if ((await fileExists(projectDir, "vendor/bin/pint")) || composerHasPackage(composerJson, "laravel/pint")) {
    commands.push(checkCommand("vendor/bin/pint --dirty --format agent"));
  }

  if (composerScriptExists(composerJson, "test")) {
    commands.push(checkCommand("composer test"));
  } else if (isLaravel && (await fileExists(projectDir, "artisan"))) {
    commands.push(checkCommand("php artisan test --compact"));
  } else if ((await fileExists(projectDir, "vendor/bin/pest")) || composerHasPackage(composerJson, "pestphp/pest")) {
    commands.push(checkCommand("vendor/bin/pest"));
  } else if (
    (await fileExists(projectDir, "vendor/bin/phpunit")) ||
    (await fileExists(projectDir, "phpunit.xml")) ||
    composerHasPackage(composerJson, "phpunit/phpunit")
  ) {
    commands.push(checkCommand("vendor/bin/phpunit"));
  }

  return commands;
}

function resolveJsTsCommands(packageJson) {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== "object") {
    return [];
  }
  return ["build", "test", "lint"]
    .filter((name) => typeof scripts[name] === "string" && !isNpmScriptStub(scripts[name]))
    .map((name) => checkCommand(`npm run ${name}`));
}

async function resolveProjectBrowserTestCommands(projectDir, packageJson, composerJson) {
  const commands = [];
  for (const scriptName of JS_BROWSER_SCRIPT_NAMES) {
    const command = packageScript(packageJson, scriptName);
    if (command) {
      commands.push(checkCommand(command));
      break;
    }
  }

  if (
    commands.length === 0 &&
    (await hasAnyFile(projectDir, PLAYWRIGHT_CONFIG_FILES)) &&
    packageHasDependency(packageJson, "@playwright/test")
  ) {
    commands.push(checkCommand("npx playwright test"));
  }

  if (
    commands.length === 0 &&
    (await hasAnyFile(projectDir, CYPRESS_CONFIG_FILES)) &&
    packageHasDependency(packageJson, "cypress")
  ) {
    commands.push(checkCommand("npx cypress run"));
  }

  if (
    (await hasPhpTestFiles(resolve(projectDir, "tests/Browser"))) &&
    (composerHasPackage(composerJson, "laravel/dusk") || (await fileExists(projectDir, "vendor/bin/dusk")))
  ) {
    commands.push(checkCommand("php artisan dusk"));
  }

  return commands;
}

async function detectWebSurface(projectDir, packageJson, isLaravel) {
  if (isLaravel && (await directoryExists(projectDir, "resources/views"))) {
    return true;
  }
  if (await hasAnyFile(projectDir, WEB_SURFACE_FILES)) {
    return true;
  }
  return WEB_SURFACE_PACKAGES.some((name) => packageHasDependency(packageJson, name));
}

async function detectLaravelProject(projectDir, composerJson) {
  return (await fileExists(projectDir, "artisan")) || composerHasPackage(composerJson, "laravel/framework");
}

function packageScript(packageJson, scriptName) {
  const scriptValue = packageJson?.scripts?.[scriptName];
  if (typeof scriptValue !== "string" || isNpmScriptStub(scriptValue)) {
    return undefined;
  }
  return `npm run ${scriptName}`;
}

function isNpmScriptStub(scriptValue) {
  const trimmed = scriptValue.trim();
  return (
    trimmed === "" ||
    trimmed.includes("no test specified") ||
    trimmed.includes("no test command") ||
    (trimmed.startsWith("echo ") && trimmed.includes("&& exit"))
  );
}

function composerHasPackage(composerJson, packageName) {
  return objectContainsKey(composerJson, "require", packageName) || objectContainsKey(composerJson, "require-dev", packageName);
}

function composerScriptExists(composerJson, scriptName) {
  return objectContainsKey(composerJson, "scripts", scriptName);
}

function packageHasDependency(packageJson, packageName) {
  return objectContainsKey(packageJson, "dependencies", packageName) || objectContainsKey(packageJson, "devDependencies", packageName);
}

function objectContainsKey(root, objectName, key) {
  const object = root?.[objectName];
  return Boolean(object && typeof object === "object" && !Array.isArray(object) && Object.hasOwn(object, key));
}

async function readJsonFile(projectDir, relativePath) {
  try {
    return JSON.parse(await readFile(resolve(projectDir, relativePath), "utf8"));
  } catch {
    return undefined;
  }
}

async function hasAnyFile(projectDir, relativePaths) {
  for (const relativePath of relativePaths) {
    if (await fileExists(projectDir, relativePath)) {
      return true;
    }
  }
  return false;
}

async function fileExists(projectDir, relativePath) {
  try {
    return (await stat(resolve(projectDir, relativePath))).isFile();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

async function directoryExists(projectDir, relativePath) {
  try {
    return (await stat(resolve(projectDir, relativePath))).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

async function hasPhpTestFiles(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    if ((entry.isDirectory() && (await hasPhpTestFiles(entryPath))) || (entry.isFile() && entry.name.endsWith(".php"))) {
      return true;
    }
  }
  return false;
}

async function commandSucceeds(binary, args) {
  try {
    await execFileAsync(binary, args, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function dedupeCommands(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    if (seen.has(command.command)) {
      return false;
    }
    seen.add(command.command);
    return true;
  });
}

function joinLabels(labels) {
  return labels.length > 0 ? labels.join(" + ") : undefined;
}
