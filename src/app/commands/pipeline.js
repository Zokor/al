import { loadConfig } from "../../config/index.js";
import { readStateFile } from "../../state/files.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { writePipelineResumeState } from "../../workflow/pipelineResumeState.js";
import { PIPELINE_ALIAS_COMMANDS, pipelineAliasDeprecationNote } from "../pipelineAliases.js";
import { runDiscuss } from "./discuss.js";
import { runImplement } from "./implement.js";
import { runResumeWorkflowSelection } from "./next.js";
import { runPipelinePlanRuntime, runPlan, runSpec, runTasks } from "./phases.js";
import { runVerify } from "./verify.js";

const PIPELINE_PHASES = Object.freeze(["discuss", "spec", "plan", "tasks", "implement", "verify"]);
const PIPELINE_PHASE_SET = new Set(PIPELINE_PHASES);
const FRESH_RUNTIME_PIPELINE_PHASE_SET = new Set(["discuss", "implement", "verify"]);
const FRESH_RUNTIME_PIPELINE_SEQUENCES = new Set([
  "plan,implement",
  "plan,implement,verify",
  "plan,tasks,implement",
  "tasks,implement",
  "tasks,implement,verify",
]);

export async function runPipeline(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const phaseNames = parsePipelinePhaseNames(cli.commandArgs.phases);
  await validatePipelinePhases(config, cli.commandArgs, phaseNames);
  if (PIPELINE_ALIAS_COMMANDS.has(cli.command)) {
    context.stderr.write(`${pipelineAliasDeprecationNote(cli.commandArgs.phases)}\n`);
  }

  if (!cli.commandArgs.resume) {
    const freshExit = await runFreshPipelineShell(config, cli, context, phaseNames);
    if (freshExit !== null) {
      return freshExit;
    }
    return handleUnsupportedCommand("pipeline", context);
  }

  await writePipelineResumeState(config, cli.commandArgs);
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  const activePhase = pipelineActivePhaseForWorkflow(workflow);
  if (!activePhase) {
    throw new Error("State error: No active workflow to resume");
  }
  if (!phaseNames.includes(activePhase)) {
    throw new Error(`State error: Current workflow '${activePhase}' is not in requested phases: ${cli.commandArgs.phases}`);
  }
  return runResumeWorkflowSelection(workflow, cli, context);
}

async function runFreshPipelineShell(config, cli, context, phaseNames) {
  if (phaseNames.length > 1 && freshRuntimePipelineSupported(phaseNames)) {
    return runFreshRuntimePipeline(config, cli, context, phaseNames);
  }

  if (phaseNames.length !== 1) {
    return null;
  }
  return runFreshPipelinePhase(config, cli, context, phaseNames[0]);
}

async function runFreshRuntimePipeline(config, cli, context, phaseNames) {
  for (let index = 0; index < phaseNames.length; index += 1) {
    const phaseName = phaseNames[index];
    const exitCode = await runFreshPipelinePhase(
      config,
      cli,
      context,
      phaseName,
      index === 0 ? { pipelineRuntime: phaseName === "plan" } : { pipelineContinue: true },
    );
    if (exitCode !== 0) {
      return exitCode;
    }
  }
  return 0;
}

async function runFreshPipelinePhase(config, cli, context, phaseName, extraCommandArgs = {}) {
  const runner = {
    discuss: runDiscuss,
    spec: runSpec,
    plan: extraCommandArgs.pipelineRuntime ? runPipelinePlanRuntime : runPlan,
    tasks: runTasks,
    implement: runImplement,
    verify: runVerify,
  }[phaseName];
  if (!runner) {
    return null;
  }
  const writesPipelineStateDuringRun = phaseName === "discuss" || phaseName === "implement" || phaseName === "verify";
  const pipelineStart = !extraCommandArgs.pipelineContinue && (phaseName === "tasks" || writesPipelineStateDuringRun);

  const exitCode = await runner({
    ...cli,
    command: phaseName,
    commandArgs: {
      positional: cli.commandArgs.task === undefined ? [] : [cli.commandArgs.task],
      file: cli.commandArgs.file,
      discover: Boolean(cli.commandArgs.discover),
      flags: cli.commandArgs.flags,
      pipelineResumeStateArgs: writesPipelineStateDuringRun ? cli.commandArgs : undefined,
      pipelineStart,
      pipelineRuntime: extraCommandArgs.pipelineRuntime,
      resume: false,
      singleAgent: Boolean(cli.commandArgs.singleAgent),
      task: cli.commandArgs.task,
      ...extraCommandArgs,
    },
  }, context);

  if (exitCode === 0 && !writesPipelineStateDuringRun) {
    await writePipelineResumeState(config, cli.commandArgs);
  }
  return exitCode;
}

function parsePipelinePhaseNames(phases) {
  return String(phases ?? "")
    .split(",")
    .map((phase) => phase.trim())
    .filter(Boolean);
}

function freshRuntimePipelineSupported(phaseNames) {
  return phaseNames.every((phaseName) => FRESH_RUNTIME_PIPELINE_PHASE_SET.has(phaseName))
    || FRESH_RUNTIME_PIPELINE_SEQUENCES.has(phaseNames.join(","));
}

async function validatePipelinePhases(config, commandArgs, phaseNames) {
  if (phaseNames.length === 0) {
    throw new Error("Config error: no pipeline phases specified. Valid phases: discuss, spec, plan, tasks, implement, verify");
  }

  const seen = new Set();
  for (const phase of phaseNames) {
    if (!PIPELINE_PHASE_SET.has(phase)) {
      throw new Error(`Config error: unknown pipeline phase: '${phase}'. Valid phases: discuss, spec, plan, tasks, implement, verify`);
    }
    if (seen.has(phase)) {
      throw new Error(`Config error: duplicate pipeline phase: '${phase}'`);
    }
    seen.add(phase);
  }

  for (let index = 1; index < phaseNames.length; index += 1) {
    if (phaseOrder(phaseNames[index - 1]) > phaseOrder(phaseNames[index])) {
      throw new Error(`Config error: invalid pipeline phase order: ${commandArgs.phases}. Expected order: discuss, spec, plan, tasks, implement, verify`);
    }
  }

  const tasksIndex = phaseNames.indexOf("tasks");
  const hasPriorPlan = tasksIndex > 0 && phaseNames.slice(0, tasksIndex).includes("plan");
  if (tasksIndex !== -1 && !hasPriorPlan && !commandArgs.file && !(await readStateFile(config, "plan.md")).trim()) {
    throw new Error("State error: No plan found. Run 'agent-loop plan' first.");
  }
}

function phaseOrder(phase) {
  return PIPELINE_PHASES.indexOf(phase);
}

function pipelineActivePhaseForWorkflow(workflow) {
  return {
    discuss: "discuss",
    spec: "spec",
    plan: "plan",
    decompose: "tasks",
    implement: "implement",
    review: "implement",
    verify: "verify",
  }[workflow];
}
