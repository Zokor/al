import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const PHASE_OVERLAY_KEYS = new Set([
  "all",
  "discovery",
  "discuss",
  "specifier",
  "planning",
  "decomposition",
  "implementation",
  "review",
  "debugger",
  "verification",
]);

const SYSTEM_OVERLAY_KEYS = new Set([
  "all",
  "implementer",
  "reviewer",
  "debugger",
  "planner",
  "specifier",
  "verifier",
  "discoverer",
]);

const BUILTIN_PROMPT_PROFILES = Object.freeze({
  xml_boundaries_v1: {
    name: "xml_boundaries_v1",
    overlays: {
      all: `PROMPT PROFILE: xml_boundaries_v1
Treat XML-style output markers as strict delimiters. Do not escape, rename, translate, or wrap required tags in markdown fences unless a prompt explicitly requests a fenced block inside those tags.`,
      specifier: `When writing the spec, keep <spec> and </spec> as the only outer delimiters for the final spec body. Braces such as {example} are ordinary text, not template variables.`,
      planning: `When writing the plan, keep <plan> and </plan> as the only outer delimiters when the command asks for tagged output. Preserve requirement IDs exactly.`,
      decomposition: `When decomposing tasks, preserve REQ-xxx references exactly and avoid copying prompt-control text into tasks.md.`,
      implementation: `Before editing, identify the active task boundary and avoid implementing adjacent plan items that are not in the current task.`,
      review: `When reviewing, separate evidence from opinion. If a required JSON status or findings block is requested, emit valid JSON with no surrounding prose inside the JSON block.`,
      debugger: `Diagnose only the latest blocker and keep suggested fixes scoped to the failing round.`,
      verification: `For verification output, preserve <verification_markdown>, <verification_json>, and <verification_fixes_markdown> tags exactly when requested. Each JSON item must map to one canonical goal.`,
      discuss: `Ask one question at a time. Do not turn the discussion into implementation planning.`,
      discovery: `Keep discovery read-only and emit only the requested discovery report content.`,
      system: {
        all: `Honor prompt boundary markers literally. Text inside braces is ordinary prompt text unless the current tool or file format says otherwise.`,
      },
    },
  },
});

export function normalizePromptStyle(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("invalid prompt_style: expected normal or terse");
  }
  const normalized = value.toLowerCase();
  if (normalized === "normal" || normalized === "terse") {
    return normalized;
  }
  throw new Error(`invalid prompt_style: invalid prompt style '${value}': expected normal or terse`);
}

export async function resolvePromptProfile(raw, projectDir) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { promptProfile: undefined, promptOverlays: emptyPromptOverlays() };
  }

  const builtin = BUILTIN_PROMPT_PROFILES[value];
  if (builtin) {
    return {
      promptProfile: builtin.name,
      promptOverlays: cloneOverlays(builtin.overlays),
    };
  }

  const candidates = promptProfileCandidates(value, projectDir);
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const profile = await loadPromptProfileFromPath(candidate);
      return {
        promptProfile: profile.name ?? candidate,
        promptOverlays: profile.overlays,
      };
    }
  }

  throw new Error(`prompt_profile '${value}' was not found; searched: ${candidates.join(", ")}`);
}

function emptyPromptOverlays() {
  return { system: {} };
}

function cloneOverlays(overlays) {
  return {
    ...overlays,
    system: {
      ...(overlays.system ?? {}),
    },
  };
}

function promptProfileCandidates(raw, projectDir) {
  if (isAbsolute(raw)) {
    return [raw];
  }
  const candidates = [resolve(projectDir, raw)];
  if (!raw.endsWith(".toml") && !raw.includes("/") && !raw.includes("\\")) {
    candidates.push(resolve(projectDir, ".agent-loop/profiles", `${raw}.toml`));
    candidates.push(resolve(projectDir, "bench/profiles", `${raw}.toml`));
  }
  return candidates;
}

async function loadPromptProfileFromPath(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`failed to read prompt_profile ${path}: ${error.message}`);
  }
  try {
    return parsePromptProfileToml(content, path);
  } catch (error) {
    throw new Error(`failed to parse prompt_profile ${path}: ${error.message}`);
  }
}

function parsePromptProfileToml(text) {
  const profile = { overlays: emptyPromptOverlays() };
  const lines = text.split(/\r?\n/);
  let section = "root";

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripInlineComment(lines[index]).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section !== "overlays" && section !== "overlays.system") {
        throw new Error(`unknown prompt_profile section '${section}'`);
      }
      continue;
    }

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*([\s\S]*)$/);
    if (!assignment) {
      throw new Error(`unsupported prompt_profile line: ${line}`);
    }

    const [, key, rawValue] = assignment;
    const parsed = parseTomlStringValue(rawValue, lines, index);
    index = parsed.nextIndex;
    assignPromptProfileValue(profile, section, key, parsed.value);
  }

  return {
    name: profile.name,
    overlays: profile.overlays,
  };
}

function assignPromptProfileValue(profile, section, key, value) {
  if (section === "root") {
    if (key !== "name" && key !== "description") {
      throw new Error(`unknown prompt_profile key '${key}'`);
    }
    if (key === "name") {
      profile.name = value;
    }
    return;
  }

  if (section === "overlays") {
    if (!PHASE_OVERLAY_KEYS.has(key)) {
      throw new Error(`unknown prompt_profile overlays key '${key}'`);
    }
    profile.overlays[key] = value;
    return;
  }

  if (!SYSTEM_OVERLAY_KEYS.has(key)) {
    throw new Error(`unknown prompt_profile overlays.system key '${key}'`);
  }
  profile.overlays.system[key] = value;
}

function parseTomlStringValue(rawValue, lines, lineIndex) {
  const value = rawValue.trim();
  if (value.startsWith("\"\"\"")) {
    return parseTripleQuotedString(value.slice(3), lines, lineIndex);
  }
  if (!value.startsWith("\"")) {
    throw new Error("prompt_profile values must be strings");
  }
  try {
    return {
      value: JSON.parse(value),
      nextIndex: lineIndex,
    };
  } catch (error) {
    throw new Error(`invalid string value (${error.message})`);
  }
}

function parseTripleQuotedString(afterOpening, lines, lineIndex) {
  const sameLineClose = afterOpening.indexOf("\"\"\"");
  if (sameLineClose >= 0) {
    return {
      value: afterOpening.slice(0, sameLineClose),
      nextIndex: lineIndex,
    };
  }

  const parts = [];
  if (afterOpening) {
    parts.push(afterOpening);
  }
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const closeIndex = lines[index].indexOf("\"\"\"");
    if (closeIndex >= 0) {
      parts.push(lines[index].slice(0, closeIndex));
      return {
        value: parts.join("\n"),
        nextIndex: index,
      };
    }
    parts.push(lines[index]);
  }
  throw new Error("unterminated triple-quoted string");
}

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
    if (char === "\\" && inString) {
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
  return output;
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
