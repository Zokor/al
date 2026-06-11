import { resolve } from "node:path";
import { RUST_KNOWN_FILE_CONFIG_KEYS } from "./fileConfigSchema.js";
import { REGISTERED_PROVIDERS, assertRegisteredProvider, defaultReviewerFor } from "./agentRegistry.js";
import { parseSlotProfile } from "./slotProfiles.js";
import { readTomlSubset } from "./toml.js";
import { stateDirForSession } from "../state/paths.js";

const ROLE_SLOTS = ["implementer", "reviewer", "planner", "discoverer", "verifier", "supervisor_agent"];
const ACTION_KEYS = new Set(["plan", "tasks", "implement", "review", "discuss", "discover", "verify", "debugger", "compound", "supervisor"]);
const MODEL_ENTRY_KEYS = new Set(["model", "effort"]);
const EFFORTS = new Set(["minimal", "low", "medium", "high", "max", "xhigh"]);

function validateKnownRootKeys(fileConfig) {
  for (const key of Object.keys(fileConfig)) {
    if (!RUST_KNOWN_FILE_CONFIG_KEYS.has(key)) {
      throw new Error(`unknown .agent-loop.toml key '${key}'`);
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

function providerFromEnv(name, env) {
  const value = env[name.toUpperCase()];
  return value ? { provider: value, profile: { primary: { provider: value } } } : undefined;
}

function resolveRoles(fileConfig, cliGlobals, env) {
  const slotProfiles = {};
  for (const slot of ROLE_SLOTS) {
    const parsed = parseSlotProfile(fileConfig[slot], slot, ".agent-loop.toml");
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

export async function loadConfig(projectDir, cli = {}, { env = process.env, now, stderr } = {}) {
  const cliGlobals = cli.globals ?? {};
  const fileConfig = await readTomlSubset(resolve(projectDir, ".agent-loop.toml"));
  validateKnownRootKeys(fileConfig);
  const actionProviders = validateActionProviders(fileConfig.action_providers);
  const modelResolution = validateModels(fileConfig.models);
  const roleResolution = resolveRoles(fileConfig, { ...cliGlobals, ...cli.commandArgs }, env);
  emitConfigWarnings(modelResolution.warnings, { jsonMode: Boolean(cliGlobals.json), stderr });
  return {
    projectDir,
    stateDir: stateDirForSession(projectDir, cliGlobals.session),
    session: cliGlobals.session,
    jsonMode: Boolean(cliGlobals.json),
    newContext: Boolean(cliGlobals.newContext),
    requirementsWorkflow: cliGlobals.requirementsWorkflow ?? fileConfig.requirements_workflow ?? "legacy",
    nextSkipDiscuss: env.NEXT_SKIP_DISCUSS === "true" || Boolean(fileConfig.next_skip_discuss),
    planRequiresApproval: cliGlobals.requirePlanApproval || (!cliGlobals.noPlanApproval && Boolean(fileConfig.plan_requires_approval)),
    decisionsEnabled: fileConfig.decisions_enabled !== false,
    actionProviders,
    models: modelResolution.models,
    warnings: modelResolution.warnings,
    actionOverrides: cliGlobals.actionOverrides ?? [],
    eventsEnabled: true,
    now,
    ...roleResolution,
  };
}
