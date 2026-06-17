import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RUST_KNOWN_FILE_CONFIG_KEYS } from "./fileConfigSchema.js";
import { REGISTERED_PROVIDERS, assertRegisteredProvider, defaultReviewerFor } from "./agentRegistry.js";
import { parseSlotProfile } from "./slotProfiles.js";
import { normalizePromptStyle, resolvePromptProfile } from "./promptProfile.js";
import { readJsonConfig } from "./json.js";
import { stateDirForSession } from "../state/paths.js";

const MIGRATE_SCRIPT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/migrate-config.js");

const ROLE_SLOTS = ["implementer", "reviewer", "planner", "discoverer", "verifier", "supervisor_agent"];
const ACTION_NAMES = Object.freeze(["plan", "tasks", "implement", "review", "discuss", "discover", "verify", "debugger", "compound", "supervisor"]);
const ACTION_KEYS = new Set(ACTION_NAMES);
const MODEL_ENTRY_KEYS = new Set(["model", "effort"]);
const EFFORTS = new Set(["minimal", "low", "medium", "high", "max", "xhigh"]);
const BROWSER_EVIDENCE_POLICIES = new Set(["off", "warn", "block"]);
const PLANNER_PERMISSION_MODES = new Set(["default", "plan"]);
const DEFAULT_CLAUDE_ALLOWED_TOOLS = "Bash,Read,Edit,Write,Grep,Glob,WebFetch";
const DEFAULT_REVIEWER_ALLOWED_TOOLS = "Read,Grep,Glob,WebFetch";

function validateKnownRootKeys(fileConfig) {
  for (const key of Object.keys(fileConfig)) {
    if (!RUST_KNOWN_FILE_CONFIG_KEYS.has(key)) {
      throw new Error(`unknown .agent-loop.json key '${key}'`);
    }
  }
}

function validateActionProviders(actionProviders) {
  if (!actionProviders) {
    return {};
  }
  const result = {};
  for (const [action, provider] of Object.entries(actionProviders)) {
    if (!ACTION_KEYS.has(action)) {
      throw new Error(`action_providers.${action}: unknown action`);
    }
    assertRegisteredProvider(provider, `action_providers.${action}`);
    result[action] = provider;
  }
  return result;
}

function validateModels(models) {
  if (!models) {
    return { models: {}, warnings: [] };
  }
  const result = {};
  const warnings = [];
  for (const [provider, actionMap] of Object.entries(models)) {
    if (!REGISTERED_PROVIDERS.includes(provider)) {
      warnings.push(`Unknown provider '${provider}' in [models.${provider}.*]; preserving config for forward compatibility.`);
    }
    result[provider] = {};
    for (const [action, entry] of Object.entries(actionMap ?? {})) {
      if (!ACTION_KEYS.has(action)) {
        throw new Error(`models.${provider}.${action}: unknown action`);
      }
      const normalizedEntry = {};
      for (const [key, value] of Object.entries(entry ?? {})) {
        if (!MODEL_ENTRY_KEYS.has(key)) {
          throw new Error(`models.${provider}.${action}.${key}: unknown model config key`);
        }
        if (key === "effort" && value !== undefined && !EFFORTS.has(value)) {
          throw new Error(`models.${provider}.${action}.effort: unknown effort '${value}'`);
        }
        normalizedEntry[key] = value;
      }
      result[provider][action] = normalizedEntry;
    }
  }
  return { models: result, warnings };
}

export function validateFileConfig(fileConfig) {
  validateKnownRootKeys(fileConfig);
  normalizePromptStyle(fileConfig.prompt_style);
  for (const slot of ROLE_SLOTS) {
    parseSlotProfile(fileConfig[slot], slot, ".agent-loop.json");
  }
  const actionProviders = validateActionProviders(fileConfig.action_providers);
  const { models, warnings } = validateModels(fileConfig.models);
  return { actionProviders, models, warnings };
}

function providerFromEnv(name, env) {
  const value = env[name.toUpperCase()];
  return value ? { provider: value, profile: { primary: { provider: value } } } : undefined;
}

function envBool(name, env) {
  if (env[name] === undefined) {
    return undefined;
  }
  const value = String(env[name]).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return undefined;
}

function envUnsignedInteger(name, env) {
  if (env[name] === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(env[name])) {
    throw new Error(`invalid value '${env[name]}' for ${name}: expected a non-negative integer`);
  }
  return Number.parseInt(env[name], 10);
}

function fileUnsignedInteger(value, key) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value;
}

function requirePositiveInteger(value, key) {
  if (value === undefined) {
    return undefined;
  }
  if (value < 1) {
    throw new Error(`${key} must be >= 1. Set ${key.toUpperCase()} or ${key} in .agent-loop.json to a positive value.`);
  }
  return value;
}

function envTrimmedString(name, env) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fileTrimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value, key) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizePlannerPermissionMode(value) {
  if (value === undefined) {
    return "default";
  }
  if (!PLANNER_PERMISSION_MODES.has(value)) {
    throw new Error(`planner_permission_mode must be one of ["default", "plan"], got "${value}"`);
  }
  return value;
}

function sessionPersistenceEnabled({ newContext, envName, env, fileValue, defaultValue }) {
  if (newContext) {
    return false;
  }
  return envBool(envName, env) ?? fileValue ?? defaultValue;
}

function loadEnvActionOverrides(env) {
  const result = {};
  for (const action of ACTION_NAMES) {
    const upper = action.toUpperCase();
    const model = envTrimmedString(`AGENT_LOOP_${upper}_MODEL`, env);
    const effort = envTrimmedString(`AGENT_LOOP_${upper}_EFFORT`, env);
    if (effort !== undefined && !EFFORTS.has(effort)) {
      throw new Error(`unknown effort level '${effort}': expected one of ${Array.from(EFFORTS).join(", ")}`);
    }
    if (model !== undefined || effort !== undefined) {
      result[action] = {};
      if (model !== undefined) {
        result[action].model = model;
      }
      if (effort !== undefined) {
        result[action].effort = effort;
      }
    }
  }
  return result;
}

function normalizeQualityCommands(value, key) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${key}[${index}] must be an object`);
    }
    if (typeof entry.command !== "string" || !entry.command.trim()) {
      throw new Error(`${key}[${index}].command must be a non-empty string`);
    }
    if (entry.remediation !== undefined && typeof entry.remediation !== "string") {
      throw new Error(`${key}[${index}].remediation must be a string`);
    }
    return {
      command: entry.command.trim(),
      remediation: entry.remediation?.trim() || undefined,
    };
  });
}

function normalizeBrowserEvidencePolicy(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("browser_evidence_policy must be one of: off, warn, or block");
  }
  const normalized = value.trim().toLowerCase();
  if (!BROWSER_EVIDENCE_POLICIES.has(normalized)) {
    throw new Error(`invalid browser evidence policy '${value}': expected off, warn, or block`);
  }
  return normalized;
}

function resolveRoles(fileConfig, cliGlobals, env) {
  const slotProfiles = {};
  for (const slot of ROLE_SLOTS) {
    const parsed = parseSlotProfile(fileConfig[slot], slot, ".agent-loop.json");
    if (parsed) {
      slotProfiles[slot] = parsed;
    }
  }
  const implementer = providerFromEnv("implementer", env) ?? (cliGlobals.implementer ? parseSlotProfile(cliGlobals.implementer, "implementer", "cli") : undefined) ?? slotProfiles.implementer ?? { provider: "claude" };
  const reviewer = providerFromEnv("reviewer", env) ?? (cliGlobals.reviewer ? parseSlotProfile(cliGlobals.reviewer, "reviewer", "cli") : undefined) ?? slotProfiles.reviewer ?? { provider: defaultReviewerFor(implementer.provider) };
  const planner = providerFromEnv("planner", env) ?? slotProfiles.planner ?? { provider: implementer.provider };
  const discoverer = providerFromEnv("discoverer", env) ?? slotProfiles.discoverer ?? { provider: planner.provider };
  const verifier = providerFromEnv("verifier", env) ?? slotProfiles.verifier ?? { provider: reviewer.provider };

  let singleAgent = Boolean(fileConfig.single_agent);
  if (env.SINGLE_AGENT !== undefined) {
    singleAgent = env.SINGLE_AGENT === "true";
  }
  if (cliGlobals.singleAgent || cliGlobals.simple) {
    singleAgent = true;
  }

  const roles = singleAgent
    ? {
        implementer: implementer.provider,
        reviewer: implementer.provider,
        planner: implementer.provider,
        discoverer: implementer.provider,
        verifier: implementer.provider,
      }
    : {
        implementer: implementer.provider,
        reviewer: reviewer.provider,
        planner: planner.provider,
        discoverer: discoverer.provider,
        verifier: verifier.provider,
      };

  return {
    roles,
    slotProfiles,
    mode: singleAgent ? "single-agent" : "dual-agent",
  };
}

export function emitConfigWarnings(warnings, { jsonMode = false, stderr } = {}) {
  if (!stderr) {
    return;
  }
  for (const message of warnings ?? []) {
    if (jsonMode) {
      stderr.write(`${JSON.stringify({ type: "warning", data: { message } })}\n`);
    } else {
      stderr.write(`warning: ${message}\n`);
    }
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

export async function loadConfig(projectDir, cli = {}, { env = process.env, now, stderr } = {}) {
  const cliGlobals = cli.globals ?? {};
  const jsonPath = resolve(projectDir, ".agent-loop.json");
  const fileConfig = await readJsonConfig(jsonPath);
  const { actionProviders, models, warnings } = validateFileConfig(fileConfig);
  const roleResolution = resolveRoles(fileConfig, { ...cliGlobals, ...cli.commandArgs }, env);
  if (await fileExists(resolve(projectDir, ".agent-loop.toml"))) {
    if (await fileExists(jsonPath)) {
      warnings.push(".agent-loop.toml is ignored by the Node CLI; .agent-loop.json takes precedence.");
    } else {
      warnings.push(`found .agent-loop.toml, but the Node CLI now reads .agent-loop.json; run 'node "${MIGRATE_SCRIPT_PATH}" "${resolve(projectDir)}"' to convert it.`);
    }
  }
  emitConfigWarnings(warnings, { jsonMode: Boolean(cliGlobals.json), stderr });
  const qualityCommands = normalizeQualityCommands(fileConfig.quality_commands, "quality_commands");
  const browserTestCommands = normalizeQualityCommands(fileConfig.browser_test_commands, "browser_test_commands");
  const browserEvidencePolicy = normalizeBrowserEvidencePolicy(envTrimmedString("BROWSER_EVIDENCE_POLICY", env) ?? fileConfig.browser_evidence_policy ?? "block");
  const promptStyle = normalizePromptStyle(envTrimmedString("AGENT_LOOP_PROMPT_STYLE", env) ?? fileConfig.prompt_style ?? "normal");
  const { promptProfile, promptOverlays } = await resolvePromptProfile(
    envTrimmedString("PROMPT_PROFILE", env) ?? fileConfig.prompt_profile,
    projectDir,
  );
  const newContext = Boolean(cliGlobals.newContext) || (envBool("NEW_CONTEXT", env) ?? fileConfig.new_context ?? false);
  return {
    projectDir,
    stateDir: stateDirForSession(projectDir, cliGlobals.session),
    session: cliGlobals.session,
    jsonMode: Boolean(cliGlobals.json),
    newContext,
    simpleMode: Boolean(cliGlobals.simple),
    requirementsWorkflow: cliGlobals.requirementsWorkflow ?? fileConfig.requirements_workflow ?? "legacy",
    promptStyle,
    promptProfile,
    promptOverlays,
    progressiveContext: envBool("PROGRESSIVE_CONTEXT", env) ?? fileConfig.progressive_context ?? false,
    nextSkipDiscuss: env.NEXT_SKIP_DISCUSS === "true" || Boolean(fileConfig.next_skip_discuss),
    reviewMaxRounds: envUnsignedInteger("REVIEW_MAX_ROUNDS", env) ?? fileUnsignedInteger(fileConfig.review_max_rounds, "review_max_rounds") ?? 0,
    discoverEnabled: envBool("DISCOVER_ENABLED", env) ?? fileConfig.discover_enabled ?? false,
    discoverMaxRounds: requirePositiveInteger(
      envUnsignedInteger("DISCOVER_MAX_ROUNDS", env) ?? fileUnsignedInteger(fileConfig.discover_max_rounds, "discover_max_rounds"),
      "discover_max_rounds",
    ) ?? 1,
    discoverBeforeDiscuss: envBool("DISCOVER_BEFORE_DISCUSS", env) ?? fileConfig.discover_before_discuss ?? false,
    discoverBeforePlan: envBool("DISCOVER_BEFORE_PLAN", env) ?? fileConfig.discover_before_plan ?? true,
    discussMaxRounds: envUnsignedInteger("DISCUSS_MAX_ROUNDS", env) ?? fileConfig.discuss_max_rounds ?? 0,
    diffMaxLines: envUnsignedInteger("DIFF_MAX_LINES", env) ?? fileConfig.diff_max_lines ?? 500,
    batchImplement: envBool("BATCH_IMPLEMENT", env) ?? fileConfig.batch_implement ?? true,
    autoCommit: envBool("AUTO_COMMIT", env) ?? fileConfig.auto_commit ?? false,
    autoPush: envBool("AUTO_PUSH", env) ?? fileConfig.auto_push ?? false,
    autoTest: envBool("AUTO_TEST", env) ?? fileConfig.auto_test ?? false,
    verifyAutoTest: envBool("VERIFY_AUTO_TEST", env) ?? fileConfig.verify_auto_test ?? true,
    verifyBrowserTest: envBool("VERIFY_BROWSER_TEST", env) ?? fileConfig.verify_browser_test ?? browserTestCommands.length > 0,
    chainDefaultCommand: envTrimmedString("CHAIN_DEFAULT_COMMAND", env) ?? (typeof fileConfig.chain_default_command === "string" && fileConfig.chain_default_command.trim() ? fileConfig.chain_default_command.trim() : "plan-tasks-implement"),
    autoTestCmd: envTrimmedString("AUTO_TEST_CMD", env) ?? (typeof fileConfig.auto_test_cmd === "string" && fileConfig.auto_test_cmd.trim() ? fileConfig.auto_test_cmd.trim() : undefined),
    qualityCommands,
    browserTestCommands,
    browserEvidencePolicy,
    inlineQualityCheck: envBool("INLINE_QUALITY_CHECK", env) ?? fileConfig.inline_quality_check ?? true,
    inlineAutoCommit: envBool("INLINE_AUTO_COMMIT", env) ?? fileConfig.inline_auto_commit ?? false,
    plannerPermissionMode: normalizePlannerPermissionMode(envTrimmedString("PLANNER_PERMISSION_MODE", env) ?? fileTrimmedString(fileConfig.planner_permission_mode)),
    skillsEnabled: envBool("SKILLS_ENABLED", env) ?? fileConfig.skills_enabled ?? true,
    blockedSkills: normalizeStringList(fileConfig.blocked_skills, "blocked_skills"),
    claudeFullAccess: envBool("CLAUDE_FULL_ACCESS", env) ?? fileConfig.claude_full_access ?? true,
    claudeAllowedTools: envTrimmedString("CLAUDE_ALLOWED_TOOLS", env) ?? fileTrimmedString(fileConfig.claude_allowed_tools) ?? DEFAULT_CLAUDE_ALLOWED_TOOLS,
    reviewerAllowedTools: envTrimmedString("REVIEWER_ALLOWED_TOOLS", env) ?? fileTrimmedString(fileConfig.reviewer_allowed_tools) ?? DEFAULT_REVIEWER_ALLOWED_TOOLS,
    claudeSessionPersistence: sessionPersistenceEnabled({
      newContext,
      envName: "CLAUDE_SESSION_PERSISTENCE",
      env,
      fileValue: fileConfig.claude_session_persistence,
      defaultValue: true,
    }),
    claudeMaxOutputTokens: envUnsignedInteger("CLAUDE_MAX_OUTPUT_TOKENS", env) ?? fileUnsignedInteger(fileConfig.claude_max_output_tokens, "claude_max_output_tokens"),
    claudeMaxThinkingTokens: envUnsignedInteger("CLAUDE_MAX_THINKING_TOKENS", env) ?? fileUnsignedInteger(fileConfig.claude_max_thinking_tokens, "claude_max_thinking_tokens"),
    codexFullAccess: envBool("CODEX_FULL_ACCESS", env) ?? fileConfig.codex_full_access ?? true,
    codexSessionPersistence: sessionPersistenceEnabled({
      newContext,
      envName: "CODEX_SESSION_PERSISTENCE",
      env,
      fileValue: fileConfig.codex_session_persistence,
      defaultValue: true,
    }),
    cursorFullAccess: envBool("CURSOR_FULL_ACCESS", env) ?? fileConfig.cursor_full_access ?? false,
    cursorSessionPersistence: sessionPersistenceEnabled({
      newContext,
      envName: "CURSOR_SESSION_PERSISTENCE",
      env,
      fileValue: fileConfig.cursor_session_persistence,
      defaultValue: false,
    }),
    discussMultiAgent: envBool("DISCUSS_MULTI_AGENT", env) ?? fileConfig.discuss_multi_agent ?? true,
    freshContextReview: cliGlobals.simple ? false : (envBool("FRESH_CONTEXT_REVIEW", env) ?? fileConfig.fresh_context_review ?? true),
    severityClassificationEnabled: cliGlobals.simple ? false : (fileConfig.severity_classification_enabled ?? true),
    planRequiresApproval: cliGlobals.requirePlanApproval || (!cliGlobals.noPlanApproval && Boolean(fileConfig.plan_requires_approval)),
    decisionsEnabled: envBool("DECISIONS_ENABLED", env) ?? fileConfig.decisions_enabled ?? false,
    actionProviders,
    models,
    envActionOverrides: loadEnvActionOverrides(env),
    warnings,
    actionOverrides: cliGlobals.actionOverrides ?? [],
    eventsEnabled: true,
    now,
    ...roleResolution,
  };
}
