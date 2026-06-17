import { readJsonStateFile, readStateFile } from "../../state/files.js";
import { loadConfig } from "../../config/index.js";
import { hasResumableState, supervisorResumePhasesFromStateDir } from "../../state/resumeState.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { computeNextAction, runResumeWorkflowSelection } from "./next.js";
import { prepareQueueRunGoal } from "./queueRunState.js";
import { pipelineResumeCommand, pipelineResumeStateIsActive, readPipelineResumeState } from "../../workflow/pipelineResumeState.js";

const ATTENTION_QUEUE_STATUSES = new Set(["active", "split", "implementing", "verifying", "blocked", "deferred"]);
const ACTIVE_QUEUE_STATUSES = new Set(["active", "split", "implementing", "verifying"]);
const RESUMABLE_WORKFLOWS = new Set(["spec", "plan", "decompose", "implement", "review", "verify", "discuss"]);

export async function prepareResumeGoalQueueContext(config) {
  const goal = await readJsonStateFile(config, "goal.json");
  const queue = await readJsonStateFile(config, "goal-queue.json");
  if (goal && goal.schema_version !== 1) {
    throw new Error("goal.json has unsupported schema_version");
  }
  if (queue && queue.schema_version !== 1) {
    throw new Error("goal-queue.json has unsupported schema_version");
  }
  const attention = queue?.items?.find((item) => ATTENTION_QUEUE_STATUSES.has(item.status));
  return { goal, queue, attention };
}

export async function hydrateActiveQueueGoalForResume(config) {
  const goalContext = await prepareResumeGoalQueueContext(config);
  const goalAllowsQueueHydration = !goalContext.goal || goalContext.goal.status === "complete";
  if (goalAllowsQueueHydration && ACTIVE_QUEUE_STATUSES.has(goalContext.attention?.status)) {
    await prepareQueueRunGoal(config, goalContext.attention);
  }
}

function interruptedCommand(workflow) {
  return {
    spec: "agent-loop spec --resume",
    plan: "agent-loop plan --resume",
    decompose: "agent-loop tasks --resume",
    implement: "agent-loop implement --resume",
    review: "agent-loop review",
    verify: "agent-loop verify --resume",
    discuss: "agent-loop discuss --resume",
  }[workflow];
}

export async function selectResumeCommand(config) {
  const goalContext = await prepareResumeGoalQueueContext(config);
  if (["paused", "budget_limited"].includes(goalContext.goal?.status)) {
    return {
      command: "agent-loop goal resume --run",
      supervised: true,
      goal_status: goalContext.goal.status,
      actionRequired: goalActionRequiredMessage(goalContext.goal),
    };
  }
  if ((!goalContext.goal || goalContext.goal.status === "complete") && ["deferred", "blocked"].includes(goalContext.attention?.status)) {
    const queueId = goalContext.attention.queue_id;
    return {
      command: `agent-loop queue resume ${queueId} --run`,
      supervised: true,
      queue_status: goalContext.attention.status,
      queue_id: queueId,
      actionRequired: queueActionRequiredMessage(goalContext.attention, queueId),
    };
  }
  const phases = await supervisorResumePhasesFromStateDir(config);
  if (phases) {
    return {
      command: `agent-loop supervise --phases ${phases} --resume`,
      unsupported: "supervise",
      supervised: true,
      preamble: `Resuming supervised workflow: ${phases}`,
    };
  }
  if (await pipelineResumeStateIsActive(config)) {
    const pipelineState = await readPipelineResumeState(config);
    if (pipelineState) {
      return {
        command: pipelineResumeCommand(pipelineState),
        unsupported: "pipeline",
        supervised: false,
        preamble: `No Supervisor checkpoint found; resuming saved pipeline: ${pipelineState.phases}.`,
      };
    }
  }
  const status = await readJsonStateFile(config, "status.json");
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  if (status?.status === "INTERRUPTED" && workflow) {
    const command = interruptedCommand(workflow);
    if (command) {
      return {
        command,
        resumeWorkflow: true,
        workflow,
        supervised: false,
        preamble: `No Supervisor checkpoint found; resuming interrupted ${workflow} workflow.`,
      };
    }
  }
  return {
    command: "agent-loop next",
    fallbackNext: true,
    supervised: false,
    preamble: "No Supervisor checkpoint found; using `agent-loop next` routing.",
  };
}

export async function runResume(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (!cli.commandArgs.dryRun) {
    await hydrateActiveQueueGoalForResume(config);
  }
  const selected = await selectResumeCommand(config);
  if (cli.commandArgs.dryRun) {
    if (config.jsonMode) {
      const data = { command: selected.command, supervised: Boolean(selected.supervised) };
      for (const key of ["goal_status", "queue_status", "queue_id"]) {
        if (selected[key] !== undefined) {
          data[key] = selected[key];
        }
      }
      context.stdout.write(`${JSON.stringify({ type: "resume", data })}\n`);
    } else {
      context.stdout.write(`${selected.command}\n`);
    }
    return 0;
  }
  if (selected.actionRequired) {
    if (!config.jsonMode) {
      context.stderr.write(`${selected.actionRequired}\n`);
    }
    return 1;
  }
  if (!(await hasResumableState(config))) {
    emitJsonCommandStarted(context, config);
    if (!config.jsonMode) {
      context.stderr.write("No resumable state found. Start a new run with `agent-loop supervise --file <task.md>` or another pipeline command.\n");
    }
    return 1;
  }
  const integrityIssue = await resumeStateIntegrityIssue(config);
  if (integrityIssue) {
    emitJsonCommandStarted(context, config);
    if (!config.jsonMode) {
      context.stderr.write(`Cannot resume: ${integrityIssue}.\n`);
      context.stderr.write("Run 'agent-loop reset' to clear the corrupted state, then start a new run.\n");
    }
    return 1;
  }
  if (selected.preamble && !config.jsonMode) {
    context.stdout.write(`${selected.preamble}\n`);
  }
  if (selected.resumeWorkflow) {
    return runResumeWorkflowSelection(selected.workflow, cli, context);
  }
  if (selected.unsupported) {
    return handleUnsupportedCommand(selected.unsupported, context, selected.command);
  }
  if (selected.fallbackNext) {
    const selectedNext = await computeNextAction(config);
    if (["spec", "plan", "tasks"].includes(selectedNext)) {
      context.stdout.write(`agent-loop ${selectedNext}\n`);
      return 0;
    }
    return handleUnsupportedCommand(selectedNext, context);
  }
  context.stdout.write(`${selected.command}\n`);
  return 0;
}

function goalActionRequiredMessage(goal) {
  if (goal.status === "budget_limited") {
    return `Goal is budget-limited: "${goal.objective}". Run 'agent-loop goal resume --run' to continue anyway, or 'agent-loop goal clear' to abandon it.`;
  }
  return `Goal is paused: "${goal.objective}". Run 'agent-loop goal resume --run' to reactivate and continue, or 'agent-loop goal resume' to only mark it active.`;
}

function queueActionRequiredMessage(item, queueId) {
  if (item.status === "blocked") {
    return `Queue item is blocked: "${item.title}". Resolve the blocker, then run 'agent-loop queue resume ${queueId} --run'.`;
  }
  return `Queue item is deferred: "${item.title}". Run 'agent-loop queue resume ${queueId} --run' to reactivate and continue.`;
}

async function resumeStateIntegrityIssue(config) {
  const status = await readJsonStateFile(config, "status.json");
  if (status?.status !== "INTERRUPTED") {
    return null;
  }
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  if (!workflow) {
    return "status.json reports an interrupted run but workflow.txt is missing";
  }
  if (!RESUMABLE_WORKFLOWS.has(workflow)) {
    return "status.json reports an interrupted run but workflow.txt is invalid";
  }
  return null;
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
      command: "resume",
      isPipeline: false,
    },
  })}\n`);
}
