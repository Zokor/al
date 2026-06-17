import { readJsonStateFile, readStateFile, writeStateFile } from "../state/files.js";

const PIPELINE_RESUME_SCHEMA_VERSION = 1;
const TERMINAL_PIPELINE_STATUSES = new Set(["COMPLETED", "VERIFIED"]);
const DEFAULT_FLAGS = Object.freeze({
  per_task: false,
  wave: false,
  max_retries: 2,
  round_step: 2,
  continue_on_fail: false,
  fail_fast: false,
  max_parallel: undefined,
});

export async function readPipelineResumeState(config) {
  const state = await readJsonStateFile(config, "pipeline.json");
  if (!state) {
    return null;
  }
  const schemaVersion = state.schema_version ?? PIPELINE_RESUME_SCHEMA_VERSION;
  const phases = typeof state.phases === "string" ? state.phases.trim() : "";
  if (schemaVersion !== PIPELINE_RESUME_SCHEMA_VERSION || !phases) {
    return null;
  }
  return {
    schema_version: schemaVersion,
    phases,
    discover: Boolean(state.discover),
    single_agent: Boolean(state.single_agent),
    simple_mode: Boolean(state.simple_mode),
    flags: { ...DEFAULT_FLAGS, ...(state.flags ?? {}) },
  };
}

export async function pipelineResumeStateIsActive(config) {
  if (!(await readStateFile(config, "workflow.txt")).trim()) {
    return false;
  }
  const status = await readJsonStateFile(config, "status.json");
  if (!status) {
    return true;
  }
  return !TERMINAL_PIPELINE_STATUSES.has(status?.status);
}

export function pipelineResumeCommand(state) {
  const parts = ["agent-loop", "pipeline", "--phases", state.phases, "--resume"];
  if (state.simple_mode) {
    parts.splice(1, 0, "--simple");
  }
  if (state.discover) {
    parts.push("--discover");
  }
  if (state.single_agent) {
    parts.push("--single-agent");
  }
  appendImplementFlagParts(parts, state.flags);
  return parts.join(" ");
}

export async function writePipelineResumeState(config, commandArgs) {
  const state = {
    schema_version: PIPELINE_RESUME_SCHEMA_VERSION,
    phases: commandArgs.phases,
    discover: Boolean(commandArgs.discover),
    single_agent: Boolean(commandArgs.singleAgent),
    simple_mode: Boolean(config.simpleMode),
    flags: flagsForState(commandArgs.flags),
  };
  await writeStateFile(config, "pipeline.json", JSON.stringify(state, null, 2));
  return state;
}

function flagsForState(flags = {}) {
  return {
    per_task: Boolean(flags.perTask),
    wave: Boolean(flags.wave),
    max_retries: flags.maxRetries ?? DEFAULT_FLAGS.max_retries,
    round_step: flags.roundStep ?? DEFAULT_FLAGS.round_step,
    continue_on_fail: Boolean(flags.continueOnFail),
    fail_fast: Boolean(flags.failFast),
    max_parallel: flags.maxParallel ?? null,
  };
}

function appendImplementFlagParts(parts, flags) {
  if (flags.per_task) {
    parts.push("--per-task");
  }
  if (flags.wave) {
    parts.push("--wave");
  }
  if (flags.max_retries !== DEFAULT_FLAGS.max_retries) {
    parts.push("--max-retries", String(flags.max_retries));
  }
  if (flags.round_step !== DEFAULT_FLAGS.round_step) {
    parts.push("--round-step", String(flags.round_step));
  }
  if (flags.continue_on_fail) {
    parts.push("--continue-on-fail");
  }
  if (flags.fail_fast) {
    parts.push("--fail-fast");
  }
  if (flags.max_parallel !== undefined && flags.max_parallel !== null) {
    parts.push("--max-parallel", String(flags.max_parallel));
  }
}
