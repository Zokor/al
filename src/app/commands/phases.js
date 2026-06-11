import { access } from "node:fs/promises";
import { appendEvent } from "../../state/events.js";
import { readStateFile, removeStateFile, safeStatePath, writeStateFile } from "../../state/files.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { assertNoActiveWaveLock } from "../../state/waveLock.js";
import { loadConfig } from "../../config/index.js";
import { loadPlanForTasksPhase, preserveOrDeriveTask, readTaskInput } from "../../workflow/plan.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";

async function stateFileExists(config, fileName) {
  try {
    await access(safeStatePath(config, fileName));
    return true;
  } catch {
    return false;
  }
}

async function requireResumeWorkflow(config, workflow, requiredFile) {
  const existingWorkflow = (await readStateFile(config, "workflow.txt")).trim();
  if (!existingWorkflow) {
    const cause = (await stateFileExists(config, "workflow.txt")) ? "workflow.txt is empty" : "workflow.txt is missing";
    throw new Error(`Cannot resume ${workflow}: ${cause}.`);
  }
  if (existingWorkflow !== workflow) {
    throw new Error(`Cannot resume ${workflow}: state belongs to workflow '${existingWorkflow}' (expected '${workflow}').`);
  }
  if (!(await readStateFile(config, "status.json")).trim()) {
    throw new Error(`Cannot resume ${workflow}: status.json is missing or empty.`);
  }
  if (requiredFile && !(await readStateFile(config, requiredFile)).trim()) {
    throw new Error(`Cannot resume ${workflow}: ${requiredFile} is empty.`);
  }
}

export async function runSpec(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (cli.commandArgs.resume) {
    await requireResumeWorkflow(config, "spec");
    context.stdout.write("Spec resume shell is unsupported in node-cli first pass.\n");
    return 2;
  }
  await assertNoActiveWaveLock(config);
  const task = await readTaskInput(context.cwd, cli.commandArgs);
  await resetStateDir(config);
  await appendEvent(config, { type: "command_started", data: { command: "spec" } });
  await initializeWorkflowState(config, { task, workflow: "spec" });
  await writeStateFile(config, "spec.md", "");
  context.stdout.write("Spec state initialized. Runtime execution is unsupported in node-cli first pass.\n");
  return 0;
}

export async function runPlan(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (cli.commandArgs.resume) {
    await requireResumeWorkflow(config, "plan", "plan.md");
    context.stdout.write("Plan resume shell is unsupported in node-cli first pass.\n");
    return 2;
  }
  await assertNoActiveWaveLock(config);
  const task = await readTaskInput(context.cwd, cli.commandArgs);
  await resetStateDir(config);
  await appendEvent(config, { type: "command_started", data: { command: "plan" } });
  await initializeWorkflowState(config, { task, workflow: "plan" });
  await writeStateFile(config, "plan.md", "");
  await removeStateFile(config, "tasks.md");
  context.stdout.write("Plan state initialized. Runtime execution is unsupported in node-cli first pass.\n");
  return 0;
}

export async function runTasks(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (cli.commandArgs.resume) {
    await requireResumeWorkflow(config, "decompose");
    context.stdout.write("Tasks resume shell is unsupported in node-cli first pass.\n");
    return 2;
  }
  await assertNoActiveWaveLock(config);
  const plan = await loadPlanForTasksPhase(config, cli.commandArgs);
  const task = await preserveOrDeriveTask(config, plan);
  await resetStateDir(config);
  await appendEvent(config, { type: "command_started", data: { command: "tasks" } });
  await initializeWorkflowState(config, { task, workflow: "decompose" });
  await writeStateFile(config, "plan.md", plan);
  await removeStateFile(config, "tasks.md");
  await removeStateFile(config, "tasks-progress.md");
  await removeStateFile(config, "tasks_findings.json");
  context.stdout.write("Tasks state initialized. Runtime decomposition is unsupported in node-cli first pass.\n");
  return 0;
}

export async function runVerify(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  if (cli.commandArgs.resume && workflow !== "verify") {
    if (!workflow) {
      throw new Error("Cannot resume verify: workflow.txt is missing or empty.");
    }
    throw new Error(`Cannot resume verify: state belongs to workflow '${workflow}' (expected 'verify').`);
  }
  return handleUnsupportedCommand("verify", context);
}
