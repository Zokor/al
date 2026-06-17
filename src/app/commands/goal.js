import { loadConfig } from "../../config/index.js";
import { readStateFile } from "../../state/files.js";
import { clearGoal, GoalStatus, readGoal, setGoalStatus } from "../../state/goal.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";

const DEFAULT_IMPLEMENT_FLAGS = Object.freeze({
  perTask: false,
  wave: false,
  maxRetries: 2,
  roundStep: 2,
  continueOnFail: false,
  failFast: false,
  maxParallel: undefined,
});

export async function runGoal(cli, context) {
  if (!cli.commandArgs.goalCommand) {
    return handleUnsupportedCommand("goal", context);
  }
  if (cli.commandArgs.goalCommand === "resume" && cli.commandArgs.run) {
    return handleUnsupportedCommand("goal resume --run", context);
  }

  const config = await loadConfig(context.cwd, cli, context);
  validateGoalLifecycleArgs(cli.commandArgs);

  switch (cli.commandArgs.goalCommand) {
    case "status":
      return printGoalStatus(config, context);
    case "pause":
      return pauseGoal(config, context);
    case "resume":
      return resumeGoal(config, context);
    case "clear":
      return clearActiveGoal(config, context);
    default:
      throw new Error(`unsupported goal command: ${cli.commandArgs.goalCommand}`);
  }
}

async function printGoalStatus(config, context) {
  const goal = await readGoal(config);
  const workflow = await readWorkflowStatus(config);
  if (config.jsonMode) {
    context.stdout.write(`${JSON.stringify({ type: "goal_status", data: { goal, workflow } })}\n`);
    return 0;
  }

  if (goal) {
    context.stdout.write(`Goal: ${goal.objective}\n`);
    context.stdout.write(`Status: ${goal.status}\n`);
    context.stdout.write(`Phases: ${(goal.phases ?? []).join(",")}\n`);
    if (goal.source_file) {
      context.stdout.write(`Source file: ${goal.source_file}\n`);
    }
    if (goal.reason) {
      context.stdout.write(`Reason: ${goal.reason}\n`);
    }
  } else {
    context.stdout.write("No active goal.\n");
  }
  context.stdout.write(`Workflow: ${workflow.status ?? "PENDING"}\n`);
  return 0;
}

async function pauseGoal(config, context) {
  const goal = await setGoalStatus(config, GoalStatus.Paused, "Paused by user.");
  if (!config.jsonMode) {
    context.stdout.write(goal ? `Goal paused: "${goal.objective}"\n` : "No goal to pause.\n");
  }
  return 0;
}

async function resumeGoal(config, context) {
  const goal = await setGoalStatus(config, GoalStatus.Active);
  if (!goal) {
    if (!config.jsonMode) {
      context.stdout.write("No goal to resume.\n");
    }
    return 1;
  }
  if (!config.jsonMode) {
    context.stdout.write(`Goal active: "${goal.objective}"\n`);
  }
  return 0;
}

async function clearActiveGoal(config, context) {
  const removed = await clearGoal(config);
  if (!config.jsonMode) {
    context.stdout.write(removed ? "Goal cleared.\n" : "No goal to clear.\n");
  }
  return 0;
}

function validateGoalLifecycleArgs(args) {
  if (
    args.objectiveWords.length > 0
    || args.objectiveText !== undefined
    || args.file !== undefined
    || args.replace
    || args.discover
    || args.singleAgent
    || !isDefaultImplementFlags(args.flags)
  ) {
    throw new Error(
      `\`agent-loop goal ${args.goalCommand}\` does not accept objective, file, replace, discovery, or implementation flags`,
    );
  }
}

function isDefaultImplementFlags(flags) {
  if (!flags) {
    return true;
  }
  return Object.entries(DEFAULT_IMPLEMENT_FLAGS).every(([key, value]) => flags[key] === value);
}

async function readWorkflowStatus(config) {
  const text = await readStateFile(config, "status.json");
  if (!text.trim()) {
    return defaultWorkflowStatus(config);
  }
  try {
    return {
      ...defaultWorkflowStatus(config),
      ...JSON.parse(text),
    };
  } catch (error) {
    return {
      ...defaultWorkflowStatus(config),
      status: "ERROR",
      reason: `Invalid status.json: ${error.message}`,
    };
  }
}

function defaultWorkflowStatus(config) {
  return {
    status: "PENDING",
    round: 0,
    implementer: config.roles.implementer,
    reviewer: config.roles.reviewer,
    planner: config.roles.planner,
    verifier: config.roles.verifier,
    mode: config.mode,
    lastRunTask: "",
    reason: null,
    timestamp: (config.now ? config.now() : new Date()).toISOString(),
  };
}
