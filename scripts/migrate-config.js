#!/usr/bin/env node
// Standalone .agent-loop.toml -> .agent-loop.json converter. The TOML-subset
// parser below was moved verbatim from the retired src/config/toml.js; the
// runtime config path reads JSON only (see src/config/json.js).
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function stripInlineComment(line) {
  let inString = false;
  let escaped = false;
  let output = "";
  for (const char of line) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      output += char;
      continue;
    }
    if (char === "#" && !inString) {
      break;
    }
    output += char;
  }
  return output.trim();
}

function parseValue(raw) {
  const value = raw.trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "[]") {
    return [];
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return splitArrayItems(inner).map((part) => parseValue(part.trim()));
  }
  return value;
}

function splitArrayItems(inner) {
  const items = [];
  let current = "";
  let inString = false;
  let escaped = false;
  for (const char of inner) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      current += char;
      continue;
    }
    if (char === "," && !inString) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    items.push(current);
  }
  return items;
}

function setNested(root, path, key, value) {
  let current = root;
  for (const segment of path) {
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[key] = value;
}

export function parseTomlSubset(text) {
  const root = {};
  let currentPath = [];
  let currentArrayTable = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine);
    if (!line) {
      continue;
    }
    const arrayMatch = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
    if (arrayMatch) {
      currentPath = [];
      const key = arrayMatch[1];
      if (!Array.isArray(root[key])) {
        root[key] = [];
      }
      currentArrayTable = {};
      root[key].push(currentArrayTable);
      continue;
    }
    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      currentPath = sectionMatch[1].split(".");
      currentArrayTable = null;
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!assignment) {
      continue;
    }
    const [, key, rawValue] = assignment;
    const value = parseValue(rawValue);
    if (currentArrayTable) {
      currentArrayTable[key] = value;
    } else {
      setNested(root, currentPath, key, value);
    }
  }
  return root;
}

// The script must stay runnable as a single copied file, so the Node CLI's
// schema validator is loaded lazily and its absence is non-fatal: when src/
// is not alongside this script, validation is skipped with a notice.
async function loadValidator() {
  try {
    const module = await import(new URL("../src/config/index.js", import.meta.url).href);
    return module.validateFileConfig;
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
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

export async function main(argv = process.argv.slice(2)) {
  const force = argv.includes("--force");
  const positional = argv.filter((arg) => arg !== "--force");
  const projectDir = resolve(positional[0] ?? process.cwd());
  const tomlPath = resolve(projectDir, ".agent-loop.toml");
  const jsonPath = resolve(projectDir, ".agent-loop.json");
  let text;
  try {
    text = await readFile(tomlPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      process.stderr.write(`No .agent-loop.toml found in ${projectDir}; nothing to migrate.\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (!force && await fileExists(jsonPath)) {
    process.stderr.write(`${jsonPath} already exists; re-run with --force to overwrite it.\n`);
    process.exitCode = 1;
    return;
  }
  const config = parseTomlSubset(text);
  await writeFile(jsonPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stderr.write(`Wrote ${jsonPath} from ${tomlPath}\n`);
  // Post-conversion validation: a key that was harmlessly ignored in the
  // TOML-only state becomes a hard error once the JSON file exists, so warn
  // now instead of letting the next CLI invocation fail cold.
  const validateFileConfig = await loadValidator();
  if (!validateFileConfig) {
    process.stderr.write(`note: skipping post-conversion validation (the node-cli src/ modules are not available next to this script); run the CLI once to check ${jsonPath}.\n`);
    return;
  }
  try {
    const { warnings } = validateFileConfig(config);
    for (const message of warnings) {
      process.stderr.write(`warning: ${message}\n`);
    }
  } catch (error) {
    process.stderr.write(`warning: the Node CLI will reject this config (${error.message}); edit ${jsonPath} to fix it before running the CLI.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
