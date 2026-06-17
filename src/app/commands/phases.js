import { access } from "node:fs/promises";
import { relative } from "node:path";
import { runAgentInvocation } from "../../agent/runtime.js";
import { appendEvent } from "../../state/events.js";
import { appendStateFile, readJsonStateFile, readStateFile, removeStateFile, safeStatePath, writeStateFile } from "../../state/files.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { writeStatus } from "../../state/status.js";
import { assertNoActiveWaveLock } from "../../state/waveLock.js";
import { loadConfig } from "../../config/index.js";
import { DiscoveryPhase, runDiscoveryPrepass, shouldRunDiscoveryPrepass } from "../discoveryPrepass.js";
import { appendPromptOverlay } from "../promptOverlays.js";
import { loadPlanForTasksPhase, preserveOrDeriveTask, readTaskInput, selectPipelineTasksTask } from "../../workflow/plan.js";

async function stateFileExists(config, fileName) {
  try {
    await access(safeStatePath(config, fileName));
    return true;
  } catch {
    return false;
  }
}

export async function requireResumeWorkflow(config, workflow, requiredFile) {
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
  if (await shouldRunDiscoveryPrepass(config, {
    explicit: Boolean(cli.commandArgs.discover),
    phase: DiscoveryPhase.Plan,
  }) && !(await runDiscoveryPrepass(config, { runner: context.agentRunner }))) {
    return 1;
  }
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
  if (await shouldRunDiscoveryPrepass(config, {
    explicit: Boolean(cli.commandArgs.discover),
    phase: DiscoveryPhase.Plan,
  }) && !(await runDiscoveryPrepass(config, { runner: context.agentRunner }))) {
    return 1;
  }
  await writeStateFile(config, "plan.md", "");
  await removeStateFile(config, "tasks.md");
  context.stdout.write("Plan state initialized. Runtime execution is unsupported in node-cli first pass.\n");
  return 0;
}

export async function runPipelinePlanRuntime(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  await assertNoActiveWaveLock(config);
  const task = cli.commandArgs.pipelineContinue
    ? (await readStateFile(config, "task.md"))
    : await readTaskInput(context.cwd, cli.commandArgs);
  if (!task.trim()) {
    throw new Error("Task cannot be empty.");
  }

  if (!cli.commandArgs.pipelineContinue) {
    await resetStateDir(config);
    await initializeWorkflowState(config, { task, workflow: "plan" });
  } else {
    await writeStateFile(config, "workflow.txt", "plan\n");
    await writeStatus({ status: "PENDING", round: 0, workflow: "plan" }, config);
  }
  await appendEvent(config, { type: "command_started", data: { command: "plan" } });

  if (await shouldRunDiscoveryPrepass(config, {
    explicit: Boolean(cli.commandArgs.discover),
    phase: DiscoveryPhase.Plan,
  }) && !(await runDiscoveryPrepass(config, { runner: context.agentRunner }))) {
    return 1;
  }

  if (!(await runInitialPlan(config, { runner: context.agentRunner }))) {
    return 1;
  }
  const review = await runPlanReview(config, { runner: context.agentRunner, round: 1 });
  if (review.status === "APPROVED") {
    await appendPlanningProgress(config, 1, "Reviewer: APPROVED");
    await writeStatus({ status: "CONSENSUS", round: 1, reason: "Planning complete", workflow: "plan" }, config);
    return 0;
  }
  if (review.status === "NEEDS_REVISION") {
    await appendPlanningProgress(config, 1, `Reviewer: NEEDS_REVISION${review.reason ? ` - ${review.reason}` : ""}`);
    await writeStatus({ status: "MAX_ROUNDS", round: 1, reason: review.reason ?? "Planning needs revision; revision loop is not ported in node-cli first pass", workflow: "plan" }, config);
    return 1;
  }
  await writeStatus({ status: "ERROR", round: 1, reason: `Planning reviewer status '${review.status}' is not supported`, workflow: "plan" }, config);
  return 1;
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
  const task = cli.commandArgs.pipelineStart
    ? await selectPipelineTasksTask(config, plan, cli.commandArgs)
    : await preserveOrDeriveTask(config, plan);
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

async function runInitialPlan(config, { runner }) {
  await appendStateFile(config, "log.txt", "Planning Phase\n");
  await writeStatus({ status: "PLANNING", round: 0, reason: "Planner writing initial plan", workflow: "plan" }, config);
  try {
    const result = await runAgentInvocation(
      {
        config,
        action: "plan",
        slot: "planner",
        role: "planner",
        prompt: initialPlanPrompt(config),
        outputFile: safeStatePath(config, "plan.md"),
      },
      { runner },
    );
    const planText = extractPlanText(result.output);
    if (planText.trim() && planText !== result.output) {
      await writeStateFile(config, "plan.md", planText);
    }
    if (!(await readStateFile(config, "plan.md")).trim()) {
      await writeStatus({ status: "ERROR", round: 0, reason: "Planner did not produce plan.md", workflow: "plan" }, config);
      return false;
    }
    await appendPlanningProgress(config, 0, "Planner: wrote plan.md");
    return true;
  } catch (error) {
    await writeStatus({ status: "ERROR", round: 0, reason: `Planner failed: ${error.message ?? error}`, workflow: "plan" }, config);
    return false;
  }
}

async function runPlanReview(config, { runner, round }) {
  await writeStatus({ status: "REVIEWING", round, reason: "Reviewer evaluating plan", workflow: "plan" }, config);
  try {
    const result = await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: planReviewPrompt(config, round),
        outputFile: safeStatePath(config, "review.md"),
      },
      { runner },
    );
    const status = await readPlanReviewStatus(config);
    if (status) {
      return status;
    }
    return planReviewStatusFromText(result.output);
  } catch (error) {
    return { status: "ERROR", reason: `Reviewer failed: ${error.message ?? error}` };
  }
}

async function readPlanReviewStatus(config) {
  const status = await readJsonStateFile(config, "status.json");
  if (!status || !["APPROVED", "NEEDS_REVISION", "NEEDS_CHANGES", "CONSENSUS"].includes(status.status)) {
    return null;
  }
  if (status.status === "CONSENSUS") {
    return { status: "APPROVED", reason: status.reason };
  }
  if (status.status === "NEEDS_CHANGES") {
    return { status: "NEEDS_REVISION", reason: status.reason };
  }
  return { status: status.status, reason: status.reason };
}

function planReviewStatusFromText(output) {
  if (/NEEDS_REVISION|NEEDS_CHANGES/i.test(output)) {
    return { status: "NEEDS_REVISION", reason: "see review.md" };
  }
  if (/APPROVED|CONSENSUS/i.test(output)) {
    return { status: "APPROVED" };
  }
  return { status: "ERROR", reason: "Reviewer did not approve or request revision" };
}

function extractPlanText(output) {
  const match = output.match(/<plan>\s*([\s\S]*?)\s*<\/plan>/i);
  return match ? match[1].trim() : output;
}

function initialPlanPrompt(config) {
  const paths = phasePaths(config);
  return appendPromptOverlay(
    `Read the task from ${paths.taskMd}.\n\nCreate an implementation plan and write the final plan to ${paths.planMd}. The plan must be concrete enough for an implementer to execute without extra context.\n\nReturn only the plan markdown, or wrap it in <plan>...</plan>.`,
    config,
    "planning",
  );
}

function planReviewPrompt(config, round) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  return appendPromptOverlay(
    `Read the task from ${paths.taskMd} and the proposed plan from ${paths.planMd}.\n\nReview whether the plan is actionable, scoped to the request, and complete enough for implementation.\n\nWrite review notes to ${paths.reviewMd}.\nAPPROVED: {"round": ${round}, "findings": []}\nNEEDS_REVISION: {"round": ${round}, "findings": [{"id": "P-001", "severity": "HIGH", "summary": "..."}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "${timestamp}"}\nNEEDS_REVISION: {"status": "NEEDS_REVISION", "round": ${round}, "reason": "brief summary", "timestamp": "${timestamp}"}`,
    config,
    "planning",
  );
}

async function appendPlanningProgress(config, round, summary) {
  await appendStateFile(config, "planning-progress.md", `Round ${round}: ${summary}\n`);
}

function phasePaths(config) {
  return {
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    planMd: displayPath(config, safeStatePath(config, "plan.md")),
    reviewMd: displayPath(config, safeStatePath(config, "review.md")),
    statusJson: displayPath(config, safeStatePath(config, "status.json")),
  };
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}
