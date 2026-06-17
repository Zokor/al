import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { readPendingPlanApproval } from "../../state/decisions.js";
import { readStateFile } from "../../state/files.js";

const STATUS_VALUES = new Set([
  "PENDING",
  "PLANNING",
  "IMPLEMENTING",
  "REVIEWING",
  "APPROVED",
  "CONSENSUS",
  "DISPUTED",
  "NEEDS_CHANGES",
  "NEEDS_REVISION",
  "MAX_ROUNDS",
  "STUCK",
  "ERROR",
  "INTERRUPTED",
  "COMPLETED",
  "CONTEXT_LIMIT",
  "DISCUSSING",
  "AWAITING_INPUT",
  "VERIFYING",
  "VERIFIED",
  "VERIFICATION_FAILED",
]);

const TERMINAL_STATUS_VALUES = new Set([
  "MAX_ROUNDS",
  "STUCK",
  "ERROR",
  "INTERRUPTED",
  "VERIFICATION_FAILED",
  "CONTEXT_LIMIT",
]);

const HARD_FAILURE_STATUS_VALUES = new Set(["ERROR", "STUCK", "MAX_ROUNDS", "INTERRUPTED"]);
const SUPERVISOR_ARTIFACTS = ["decisions", "history", "plan-details", "partial", "event-summaries"];

const ARTIFACT_SECTIONS = [
  {
    heading: "Request artifact:",
    files: ["original-request.md"],
  },
  {
    heading: "Planning artifacts:",
    files: ["planning-progress.md", "tasks_findings.json"],
  },
  {
    heading: "Tasks artifacts:",
    files: ["tasks-progress.md"],
  },
  {
    heading: "Implementation artifacts:",
    files: ["implement-progress.md", "conversation.md", "findings.json", "task_status.json", "task_metrics.json"],
    includeWaveTaskProgress: true,
  },
  {
    heading: "Verification artifacts:",
    files: ["verification-progress.md", "verification.md", "verification.json", "verification-fixes.md"],
  },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function toStatusEvent(status) {
  return {
    type: "status",
    data: {
      initialized: true,
      status: status.status,
      round: status.round,
      implementer: status.implementer,
      reviewer: status.reviewer,
      planner: status.planner,
      verifier: status.verifier,
      activeRole: status.active_role,
      activeAgent: status.active_agent,
      mode: status.mode,
      lastRunTask: status.lastRunTask,
      reason: status.reason,
      timestamp: status.timestamp,
      warnings: status.warnings,
      nextAction: status.nextAction,
    },
  };
}

export async function runStatus(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const statusPath = resolve(config.stateDir, "status.json");
  if (!(await exists(statusPath))) {
    if (config.jsonMode) {
      context.stdout.write(`${JSON.stringify({ type: "status", data: { initialized: false } })}\n`);
    } else {
      context.stdout.write("not initialized\n");
    }
    return 0;
  }

  const status = await readNormalizedStatus(config, statusPath);
  for (const warning of status.warnings) {
    context.stderr.write(`⚠ status.json: ${warning}\n`);
  }
  status.workflow = normalizeWorkflow((await readStateFile(config, "workflow.txt")).trim());
  status.nextAction = await computeStatusNextAction(config, status);

  if (config.jsonMode) {
    context.stdout.write(`${JSON.stringify(toStatusEvent(status))}\n`);
    return 0;
  }

  printStatusText(context, config, status);
  await printWaveLock(context, config);
  await printArtifactSections(context, config);
  await printRecentWaveEvents(context, config);
  return 0;
}

async function readNormalizedStatus(config, statusPath) {
  const fallback = await defaultStatus(config);
  const warnings = [];
  const text = await readFile(statusPath, "utf8");
  if (!text.trim()) {
    return { ...fallback, warnings };
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ...fallback,
      status: "ERROR",
      reason: `Invalid status.json: ${error.message}`,
      warnings: [`invalid JSON: ${error.message}`],
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ...fallback,
      warnings: ["root is not a JSON object; using defaults"],
    };
  }

  const status = normalizeStatusField(raw.status, fallback.status, warnings);
  const round = normalizeRound(raw.round, fallback.round, warnings);
  const timestamp = normalizeTimestamp(raw.timestamp, fallback.timestamp, warnings);
  const lastRunTask = await resolveLastRunTask(config, raw.lastRunTask, warnings);
  const reason = normalizeOptionalString(raw.reason, "reason", warnings);
  const failureSeverity = raw.failure_severity === undefined || raw.failure_severity === null
    ? undefined
    : String(raw.failure_severity);

  return {
    status,
    round,
    implementer: stringOrFallback(raw.implementer, fallback.implementer),
    reviewer: stringOrFallback(raw.reviewer, fallback.reviewer),
    planner: stringOrFallback(raw.planner, fallback.planner),
    verifier: stringOrFallback(raw.verifier, fallback.verifier),
    active_role: normalizeOptionalString(raw.active_role, "active_role", warnings),
    active_agent: normalizeOptionalString(raw.active_agent, "active_agent", warnings),
    mode: ["single-agent", "dual-agent"].includes(raw.mode) ? raw.mode : fallback.mode,
    lastRunTask,
    reason,
    failure_severity: failureSeverity,
    timestamp,
    warnings,
  };
}

async function defaultStatus(config) {
  return {
    status: "PENDING",
    round: 0,
    implementer: config.roles.implementer,
    reviewer: config.roles.reviewer,
    planner: config.roles.planner,
    verifier: config.roles.verifier,
    active_role: null,
    active_agent: null,
    mode: config.mode,
    lastRunTask: await resolveLastRunTask(config),
    reason: null,
    failure_severity: undefined,
    timestamp: (config.now ? config.now() : new Date()).toISOString(),
    warnings: [],
  };
}

function normalizeStatusField(value, fallback, warnings) {
  if (typeof value === "string" && STATUS_VALUES.has(value)) {
    return value;
  }
  if (value === undefined) {
    warnings.push(`field 'status': missing; falling back to ${fallback}`);
  } else {
    warnings.push(`field 'status': invalid value ${JSON.stringify(value)}; falling back to ${fallback}`);
  }
  return fallback;
}

function normalizeRound(value, fallback, warnings) {
  if (Number.isInteger(value) && value >= 0 && value <= 4294967295) {
    return value;
  }
  if (value === undefined) {
    warnings.push(`field 'round': missing; falling back to ${fallback}`);
  } else {
    warnings.push(`field 'round': expected number, got ${JSON.stringify(value)}; falling back to ${fallback}`);
  }
  return fallback;
}

function normalizeTimestamp(value, fallback, warnings) {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    warnings.push("field 'timestamp': missing; falling back to current time");
  } else {
    warnings.push(`field 'timestamp': expected string, got ${JSON.stringify(value)}; falling back to current time`);
  }
  return fallback;
}

async function resolveLastRunTask(config, explicit, warnings = []) {
  if (explicit !== undefined && explicit !== null && typeof explicit !== "string") {
    warnings.push(`field 'lastRunTask': expected string, got ${JSON.stringify(explicit)}; ignoring`);
  }
  if (typeof explicit === "string" && explicit.trim()) {
    return extractTaskTitle(explicit);
  }
  const task = await readStateFile(config, "task.md");
  return task.trim() ? extractTaskTitle(task) : "";
}

function normalizeOptionalString(value, field, warnings) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  warnings.push(`field '${field}': expected string, got ${JSON.stringify(value)}; ignoring`);
  return null;
}

function stringOrFallback(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function extractTaskTitle(value) {
  let inFence = false;
  for (const line of String(value).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      return normalizeTaskText(trimmed.replace(/^#+/, ""));
    }
  }
  return normalizeTaskText(value);
}

function normalizeTaskText(value) {
  return String(value).split(/\s+/).filter(Boolean).join(" ");
}

async function computeStatusNextAction(config, status) {
  const workflow = status.workflow;
  const hasSpec = Boolean((await readStateFile(config, "spec.md")).trim());
  const hasPlan = Boolean((await readStateFile(config, "plan.md")).trim());
  const hasTasks = Boolean((await readStateFile(config, "tasks.md")).trim());
  const hasPreferences = await exists(resolve(config.projectDir, ".agent-loop", "preferences.md"));
  const hasVerification = await hasUsableVerification(config, workflow, status.status);
  const pendingPlanApproval = await readPlanApprovalArtifactPath(config);
  const strictSpecMode = config.requirementsWorkflow === "spec";

  if (["COMPLETED", "VERIFIED"].includes(status.status)) {
    return "complete";
  }
  if (status.status === "AWAITING_INPUT" && pendingPlanApproval) {
    return `awaiting plan approval (${pendingPlanApproval})`;
  }
  if (workflow === "review" && status.status === "APPROVED") {
    return "complete";
  }
  if (HARD_FAILURE_STATUS_VALUES.has(status.status)) {
    return "error";
  }
  if (status.status === "CONTEXT_LIMIT") {
    return workflow ? `${workflow} --resume` : "error";
  }
  if (status.status === "VERIFICATION_FAILED") {
    return "plan --file verification-fixes.md";
  }
  if (workflow === "discuss" && status.status === "CONSENSUS") {
    return strictSpecMode ? "spec" : "plan";
  }
  if (workflow === "spec" && status.status === "CONSENSUS") {
    return "plan";
  }
  if (workflow === "plan" && status.status === "CONSENSUS") {
    return "tasks";
  }
  if (workflow === "decompose" && status.status === "CONSENSUS") {
    return "implement";
  }
  if (["implement", "review"].includes(workflow) && status.status === "CONSENSUS" && !hasVerification) {
    return "verify";
  }
  if (workflow === "implement" && status.status !== "CONSENSUS") {
    return "implement --resume";
  }
  if (workflow && !["CONSENSUS", "APPROVED"].includes(status.status)) {
    return `${workflow} --resume`;
  }
  if (!config.nextSkipDiscuss && !hasPreferences) {
    return "discuss";
  }
  if (strictSpecMode && !hasSpec) {
    return "spec";
  }
  if (!hasPlan) {
    return "plan";
  }
  if (!hasTasks) {
    return "tasks";
  }
  return "implement";
}

function normalizeWorkflow(value) {
  if (value === "specify") {
    return "spec";
  }
  return ["spec", "plan", "decompose", "implement", "review", "verify", "discuss"].includes(value)
    ? value
    : null;
}

async function hasUsableVerification(config, workflow, status) {
  if (!(await exists(resolve(config.stateDir, "verification.json")))) {
    return false;
  }
  return !(["implement", "review"].includes(workflow) && status === "CONSENSUS");
}

async function readPlanApprovalArtifactPath(config) {
  try {
    return (await readPendingPlanApproval(config))?.artifact_path ?? null;
  } catch {
    return null;
  }
}

function printStatusText(context, config, status) {
  context.stdout.write(`status: ${status.status}\n`);
  context.stdout.write(`round: ${status.round}\n`);
  context.stdout.write(`implementer: ${status.implementer}\n`);
  context.stdout.write(`reviewer: ${status.reviewer}\n`);
  if (status.planner) {
    context.stdout.write(`planner: ${status.planner}\n`);
  }
  if (status.verifier) {
    context.stdout.write(`verifier: ${status.verifier}\n`);
  }
  if (status.active_role) {
    context.stdout.write(`activeRole: ${status.active_role}\n`);
  }
  if (status.active_agent) {
    context.stdout.write(`activeAgent: ${status.active_agent}\n`);
  }
  context.stdout.write(`mode: ${status.mode}\n`);
  context.stdout.write(`lastRunTask: ${status.lastRunTask}\n`);
  printReason(context, status.reason);
  context.stdout.write(`timestamp: ${status.timestamp}\n`);
  context.stdout.write(`nextAction: ${status.nextAction}\n`);
  printStatusWarnings(context, status.warnings);
  printResumeHint(context, config, status);
}

function printReason(context, reason) {
  if (typeof reason !== "string" || !reason.trim()) {
    return;
  }
  const gate = reason.match(/^\[gate:([^\]]+)\](.*)$/);
  if (gate) {
    context.stdout.write(`gate: ${gate[1]}\n`);
    const rest = gate[2].trim();
    if (rest) {
      context.stdout.write(`reason: ${rest}\n`);
    }
    return;
  }
  context.stdout.write(`reason: ${reason}\n`);
}

function printStatusWarnings(context, warnings) {
  if (!warnings.length) {
    return;
  }
  context.stdout.write("\nWarnings:\n");
  for (const warning of warnings) {
    context.stdout.write(`  - ${warning}\n`);
  }
  context.stdout.write("\nHint: status.json may be corrupted. Run `agent-loop reset` to reset state.\n");
}

function printResumeHint(context, config, status) {
  if (!TERMINAL_STATUS_VALUES.has(status.status) && !hasStaleReason(status.reason)) {
    return;
  }
  if (!status.warnings.length) {
    context.stdout.write("\n");
  }
  context.stdout.write(`${resumeHintForWorkflow(config, status)}\n`);
}

function hasStaleReason(reason) {
  if (typeof reason !== "string") {
    return false;
  }
  const lower = reason.toLowerCase();
  return lower.includes("stale") || lower.includes("timestamp");
}

function resumeHintForWorkflow(_config, status) {
  return {
    spec: "Hint: run `agent-loop spec --resume` or a spec pipeline with `--resume` to continue.",
    plan: "Hint: run `agent-loop plan --resume`, `agent-loop plan-tasks-implement --resume`, or `agent-loop plan-implement --resume` to continue.",
    decompose: "Hint: run `agent-loop tasks --resume`, `agent-loop plan-tasks-implement --resume`, or `agent-loop tasks-implement --resume` to continue.",
    implement: "Hint: run `agent-loop implement --resume`, `agent-loop plan-tasks-implement --resume`, `agent-loop plan-implement --resume`, or `agent-loop tasks-implement --resume` to continue.",
    review: "Hint: run `agent-loop review` to start a new review.",
    verify: "Hint: run `agent-loop verify --resume` to continue verification.",
    discuss: "Hint: run `agent-loop discuss --resume` to continue the discussion.",
  }[status.workflow] ?? "Hint: run `agent-loop implement --resume`, `agent-loop tasks --resume`, or `agent-loop reset` to continue.";
}

async function printArtifactSections(context, config) {
  for (const section of ARTIFACT_SECTIONS) {
    const paths = [];
    for (const fileName of section.files) {
      const path = resolve(config.stateDir, fileName);
      if (await exists(path)) {
        paths.push(path);
      }
    }
    if (section.includeWaveTaskProgress) {
      paths.splice(1, 0, ...(await taskLocalImplementProgressPaths(config)));
    }
    if (!paths.length) {
      continue;
    }
    context.stdout.write(`\n${section.heading}\n`);
    for (const path of paths) {
      context.stdout.write(`  - ${path}\n`);
    }
  }
}

async function taskLocalImplementProgressPaths(config) {
  let entries;
  try {
    entries = await readdir(config.stateDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const paths = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(".wave-task-") || SUPERVISOR_ARTIFACTS.includes(entry.name)) {
      continue;
    }
    const path = resolve(config.stateDir, entry.name, "implement-progress.md");
    if (await exists(path)) {
      paths.push(path);
    }
  }
  return paths.sort();
}

async function printWaveLock(context, config) {
  const waveLock = resolve(config.projectDir, ".agent-loop", config.session ? `wave-${config.session}.lock` : "wave.lock");
  const lock = await readJsonFile(waveLock);
  if (!lock || !Number.isInteger(lock.pid) || typeof lock.started_at !== "string" || typeof lock.mode !== "string" || !Number.isInteger(lock.max_parallel)) {
    return;
  }
  context.stdout.write(`\nwave lock: PID ${lock.pid} since ${lock.started_at} (mode=${lock.mode}, parallel=${lock.max_parallel})\n`);
  if (!isPidAlive(lock.pid)) {
    context.stdout.write(`  ⚠ Lock holder (PID ${lock.pid}) is dead. Run \`agent-loop reset --wave-lock\` to clear.\n`);
  }
}

async function printRecentWaveEvents(context, config) {
  const journal = resolve(config.projectDir, ".agent-loop", config.session ? `wave-progress-${config.session}.jsonl` : "wave-progress.jsonl");
  const events = await readRecentWaveEvents(journal, 5);
  if (!events.length) {
    return;
  }
  context.stdout.write("\nRecent wave events:\n");
  for (const event of events) {
    const line = formatWaveEvent(event);
    if (line) {
      context.stdout.write(`  ${line}\n`);
    }
  }
}

async function readRecentWaveEvents(path, maxEvents) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (event?.type) {
        events.push(event);
      }
    } catch {
      // Rust skips invalid journal lines.
    }
  }
  return events.slice(-maxEvents);
}

function formatWaveEvent(event) {
  switch (event.type) {
    case "RunStart":
      return `[${event.timestamp}] RunStart: ${event.total_tasks} tasks, ${event.total_waves} waves, parallel=${event.max_parallel}`;
    case "WaveStart":
      return `[${event.timestamp}] WaveStart: wave ${event.wave_index + 1}, ${event.task_count} tasks`;
    case "TaskEnd":
      return `[${event.timestamp}] TaskEnd: task ${event.task_index + 1} '${event.title}' — ${event.success ? "ok" : "FAIL"}`;
    case "WaveEnd":
      return `[${event.timestamp}] WaveEnd: wave ${event.wave_index + 1} — ${event.passed} passed, ${event.failed} failed`;
    case "RunEnd":
      return `[${event.timestamp}] RunEnd: ${event.total_passed} passed, ${event.total_failed} failed, ${event.total_skipped} skipped`;
    case "RunInterrupted":
      return `[${event.timestamp}] RunInterrupted: ${event.reason}`;
    case "TaskStart":
      return `[${event.timestamp}] TaskStart: task ${event.task_index + 1} '${event.title}'`;
    default:
      return null;
  }
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
