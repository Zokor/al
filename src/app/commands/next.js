import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { readPendingPlanApproval } from "../../state/decisions.js";
import { readJsonStateFile, readStateFile, removeStateFile } from "../../state/files.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { runDiscuss } from "./discuss.js";
import { runImplement } from "./implement.js";
import { runPlan, runSpec, runTasks } from "./phases.js";
import { runReview } from "./review.js";
import { runVerify } from "./verify.js";

const HARD_FAILURE_STATUSES = new Set(["ERROR", "STUCK", "MAX_ROUNDS", "INTERRUPTED"]);

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function computeNextAction(config) {
  return (await computeNextSelection(config)).action;
}

async function computeNextSelection(config) {
  const status = await readJsonStateFile(config, "status.json");
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  const hasSpec = Boolean((await readStateFile(config, "spec.md")).trim());
  const hasPlan = Boolean((await readStateFile(config, "plan.md")).trim());
  const hasTasks = Boolean((await readStateFile(config, "tasks.md")).trim());
  const hasPreferences = await fileExists(resolve(config.projectDir, ".agent-loop", "preferences.md"));
  const hasVerification = await hasUsableVerification(config, workflow, status?.status);
  const strictSpecMode = config.requirementsWorkflow === "spec";

  if (["COMPLETED", "VERIFIED"].includes(status?.status) || (workflow === "review" && status?.status === "APPROVED")) {
    return { action: "complete" };
  }
  if (status?.status === "AWAITING_INPUT") {
    const pendingApproval = await readPendingPlanApproval(config);
    if (pendingApproval) {
      return { action: "awaiting_plan_approval", artifactPath: pendingApproval.artifact_path };
    }
  }
  if (HARD_FAILURE_STATUSES.has(status?.status)) {
    return { action: "error", message: `Previous run failed with ${status.status}. Resume or reset.` };
  }
  if (status?.status === "CONTEXT_LIMIT") {
    return workflow ? { action: "resume_workflow", workflow } : { action: "error", message: "Context limit with no workflow. Reset." };
  }
  if (status?.status === "VERIFICATION_FAILED") {
    return { action: "plan_from_fixes" };
  }
  if (workflow === "discuss" && status?.status === "CONSENSUS") {
    return { action: strictSpecMode ? "spec" : "plan" };
  }
  if (workflow === "spec" && status?.status === "CONSENSUS") {
    return { action: "plan" };
  }
  if (workflow === "plan" && status?.status === "CONSENSUS") {
    return { action: "tasks" };
  }
  if (workflow === "decompose" && status?.status === "CONSENSUS") {
    return { action: "implement", resume: false };
  }
  if (["implement", "review"].includes(workflow) && status?.status === "CONSENSUS" && !hasVerification) {
    return { action: "verify" };
  }
  if (workflow === "implement" && status?.status && status.status !== "CONSENSUS") {
    return { action: "implement", resume: true };
  }
  if (workflow && status?.status && !["CONSENSUS", "APPROVED"].includes(status.status)) {
    return { action: "resume_workflow", workflow };
  }
  if (!config.nextSkipDiscuss && !hasPreferences) {
    return { action: "discuss" };
  }
  if (strictSpecMode && !hasSpec) {
    return { action: "spec" };
  }
  if (!hasPlan) {
    return { action: "plan" };
  }
  if (!hasTasks) {
    return { action: "tasks" };
  }
  return { action: "implement", resume: false };
}

async function hasUsableVerification(config, workflow, status) {
  if (!(await fileExists(resolve(config.stateDir, "verification.json")))) {
    return false;
  }
  if (["implement", "review"].includes(workflow) && status === "CONSENSUS") {
    await removeStateFile(config, "verification.json");
    await removeStateFile(config, "verification.md");
    await removeStateFile(config, "verification-fixes.md");
    return false;
  }
  return true;
}

export async function runNext(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const selected = await computeNextSelection(config);
  if (selected.action === "complete") {
    emitJsonCommandStarted(context, config);
    if (!config.jsonMode) {
      context.stdout.write("Pipeline complete. Nothing to do.\n");
    }
    return 0;
  }
  if (selected.action === "error") {
    emitJsonCommandStarted(context, config);
    if (!config.jsonMode) {
      context.stderr.write(`${selected.message}\n`);
    }
    return 1;
  }
  if (selected.action === "awaiting_plan_approval") {
    emitJsonCommandStarted(context, config);
    if (config.jsonMode) {
      context.stdout.write(`${JSON.stringify({ type: "next", data: { action: "awaiting_plan_approval", artifactPath: selected.artifactPath } })}\n`);
    } else {
      context.stdout.write(`Awaiting plan approval (${selected.artifactPath}). Run \`agent-loop approve plan\` or \`agent-loop reject plan --reason <reason>\`.\n`);
    }
    return 1;
  }
  const { action } = selected;
  if (hasFreshNextInput(cli.commandArgs)) {
    const delegated = await runSelectedFreshInputAction(action, cli, context);
    if (delegated !== null) {
      return delegated;
    }
  }
  const noInputDelegated = await runSelectedNoInputAction(action, cli, context, config);
  if (noInputDelegated !== null) {
    return noInputDelegated;
  }
  if (action === "plan_from_fixes") {
    return runPlan({ ...cli, command: "plan", commandArgs: { positional: [], file: resolve(config.stateDir, "verification-fixes.md") } }, context);
  }
  if (action === "verify") {
    return runVerify({ ...cli, command: "verify", commandArgs: {} }, context);
  }
  if (action === "resume_workflow") {
    return runResumeWorkflowSelection(selected.workflow, cli, context);
  }
  if (action === "implement" && selected.resume) {
    return runImplement({ ...cli, command: "implement", commandArgs: implementArgsFromNext({ resume: true }) }, context);
  }
  if (["spec", "plan", "tasks", "discuss"].includes(action)) {
    context.stdout.write(`agent-loop ${action}\n`);
    return 0;
  }
  return handleUnsupportedCommand(action, context);
}

export function runResumeWorkflowSelection(workflow, cli, context) {
  if (workflow === "spec") {
    return runSpec({ ...cli, command: "spec", commandArgs: { resume: true } }, context);
  }
  if (workflow === "plan") {
    return runPlan({ ...cli, command: "plan", commandArgs: { resume: true } }, context);
  }
  if (workflow === "decompose") {
    return runTasks({ ...cli, command: "tasks", commandArgs: { resume: true } }, context);
  }
  if (workflow === "implement") {
    return runImplement({ ...cli, command: "implement", commandArgs: implementArgsFromNext({ resume: true }) }, context);
  }
  if (workflow === "review") {
    return runReview({ ...cli, command: "review", commandArgs: { positional: [] } }, context);
  }
  if (workflow === "verify") {
    return runVerify({ ...cli, command: "verify", commandArgs: { resume: true } }, context);
  }
  if (workflow === "discuss") {
    return runDiscuss({ ...cli, command: "discuss", commandArgs: { resume: true } }, context);
  }
  return handleUnsupportedCommand(`${workflow} --resume`, context);
}

function hasFreshNextInput(commandArgs) {
  return commandArgs.task !== undefined || commandArgs.file !== undefined;
}

async function runSelectedFreshInputAction(action, cli, context) {
  if (action === "discuss") {
    return runDiscuss({ ...cli, command: "discuss", commandArgs: discussArgsFromNext(cli.commandArgs) }, context);
  }
  if (action === "spec") {
    return runSpec({ ...cli, command: "spec", commandArgs: phaseArgsFromNext(cli.commandArgs) }, context);
  }
  if (action === "plan") {
    return runPlan({ ...cli, command: "plan", commandArgs: phaseArgsFromNext(cli.commandArgs) }, context);
  }
  if (action === "tasks") {
    return runTasks({ ...cli, command: "tasks", commandArgs: {} }, context);
  }
  if (action === "implement") {
    return runImplement({ ...cli, command: "implement", commandArgs: implementArgsFromNext(cli.commandArgs) }, context);
  }
  return null;
}

async function runSelectedNoInputAction(action, cli, context, config) {
  if (action === "spec" || action === "plan") {
    const existingTask = await readStateFile(config, "task.md");
    if (!existingTask.trim()) {
      return null;
    }
    const commandArgs = {
      positional: [existingTask],
      discover: false,
      resume: false,
      singleAgent: false,
    };
    if (action === "spec") {
      return runSpec({ ...cli, command: "spec", commandArgs }, context);
    }
    return runPlan({ ...cli, command: "plan", commandArgs }, context);
  }
  if (action === "tasks") {
    return runTasks({ ...cli, command: "tasks", commandArgs: {} }, context);
  }
  if (action === "implement") {
    return runImplement({ ...cli, command: "implement", commandArgs: implementArgsFromNext({}) }, context);
  }
  return null;
}

function discussArgsFromNext(commandArgs) {
  return {
    task: commandArgs.task,
    file: commandArgs.file,
    discover: false,
    resume: false,
  };
}

function phaseArgsFromNext(commandArgs) {
  return {
    positional: commandArgs.task === undefined ? [] : [commandArgs.task],
    file: commandArgs.file,
    discover: false,
    resume: false,
    singleAgent: false,
  };
}

function implementArgsFromNext(commandArgs) {
  return {
    task: commandArgs.task,
    file: commandArgs.file,
    resume: Boolean(commandArgs.resume),
    singleAgent: false,
    flags: {
      perTask: false,
      wave: false,
      maxRetries: 2,
      roundStep: 2,
      continueOnFail: false,
      failFast: false,
      maxParallel: undefined,
    },
  };
}

function emitJsonCommandStarted(context, config) {
  if (!config.jsonMode) {
    return;
  }
  const ts = (config.now ? config.now() : new Date()).toISOString();
  context.stdout.write(`${JSON.stringify({
    type: "command_started",
    protocol_version: 1,
    seq: 1,
    ts,
    data: {
      command: "next",
      isPipeline: false,
    },
  })}\n`);
}
