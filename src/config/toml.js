import { readFile } from "node:fs/promises";

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

export async function readTomlSubset(path) {
  try {
    return parseTomlSubset(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
