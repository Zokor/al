import { access, readFile, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { runAgentInvocation } from "../../agent/runtime.js";
import { resolveRuntimeBrowserTestCommands, resolveRuntimeQualityCommands } from "../../config/qualityCommands.js";
import { BROWSER_EVIDENCE_GATE_FILENAME, browserEvidenceGateAssessment, browserEvidenceGateReport, browserEvidenceGateSummary } from "../browserEvidence.js";
import { runCheckCommands } from "../checkCommands.js";
import { loadConfig } from "../../config/index.js";
import { appendEvent } from "../../state/events.js";
import { appendStateFile, readJsonStateFile, readStateFile, removeStateFile, safeStatePath, writeStateFile } from "../../state/files.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { writeStatus } from "../../state/status.js";
import { assertNoActiveWaveLock } from "../../state/waveLock.js";
import { writePipelineResumeState } from "../../workflow/pipelineResumeState.js";

const CONTINUE_IMPLEMENTATION = Symbol("continue implementation");
const IMPLEMENTATION_HIGH_WATERMARK_LOG = "⚠ High round count in unlimited mode — timeout and stuck detection remain active safeguards";

export async function runImplement(cli, context) {
  const started = Date.now();
  const config = await loadConfig(context.cwd, cli, context);
  const unsupported = unsupportedImplementMode(cli.commandArgs, config);
  if (unsupported) {
    return reportPartialImplementSupport(context, unsupported);
  }

  try {
    await assertNoActiveWaveLock(config);
    if (cli.commandArgs.resume) {
      return runImplementResume(cli, context, config);
    }
    if (cli.commandArgs.pipelineContinue) {
      return runPipelineImplementContinue(cli, context, config);
    }

    const existingPlan = await readStateFile(config, "plan.md");
    const task = await resolveImplementTask(context.cwd, cli.commandArgs, config, {
      stdout: context.stdout,
      existingPlan,
    });

    await appendEvent(config, { type: "command_started", data: { command: "implement" } });
    await resetStateDir(config);
    await initializeWorkflowState(config, { task, workflow: "implement" });
    await writeStateFile(config, "implement-mode.txt", "batch\n");
    await writeStateFile(config, "implement-flags.json", `${JSON.stringify(implementFlagsForState(cli.commandArgs.flags), null, 2)}\n`);
    if (existingPlan.trim()) {
      await writeStateFile(config, "plan.md", existingPlan);
    }
    if (cli.commandArgs.pipelineResumeStateArgs) {
      await writePipelineResumeState(config, cli.commandArgs.pipelineResumeStateArgs);
    }

    const outcome = await runImplementRoundOne(config, {
      runner: context.agentRunner,
      stderr: context.stderr,
    });
    return outcome;
  } finally {
    if (!cli.commandArgs.pipelineStart && !cli.commandArgs.pipelineContinue) {
      emitImplementElapsed(config, context.stdout, Date.now() - started);
    }
  }
}

function unsupportedImplementMode(commandArgs, config) {
  if (commandArgs.resume) {
    if (commandArgs.flags?.perTask) {
      return "implement --resume --per-task";
    }
    if (commandArgs.flags?.wave) {
      return "implement --resume --wave";
    }
    return undefined;
  }
  if (commandArgs.flags?.perTask) {
    return "implement --per-task";
  }
  if (commandArgs.flags?.wave) {
    return "implement --wave";
  }
  if (!commandArgs.task && !commandArgs.file && config.batchImplement === false) {
    return "implement with batch_implement=false";
  }
  if (!commandArgs.task && !commandArgs.file && perTaskLifecycleFlagsPresent(commandArgs.flags)) {
    return "implement per-task lifecycle flags without --per-task";
  }
  return undefined;
}

function perTaskLifecycleFlagsPresent(flags = {}) {
  return Boolean(flags.continueOnFail)
    || Boolean(flags.failFast)
    || flags.maxParallel !== undefined
    || (flags.maxRetries !== undefined && flags.maxRetries !== 2)
    || (flags.roundStep !== undefined && flags.roundStep !== 2);
}

function reportPartialImplementSupport(context, target) {
  context.stderr.write(`Unsupported in node-cli first pass: ${target}\n`);
  context.stderr.write("See node-cli/docs/unsupported.md for supported first-pass behavior.\n");
  return 2;
}

async function runImplementResume(cli, context, config) {
  await requireImplementResumeState(config);
  const unsupported = await unsupportedResumeImplementMode(cli.commandArgs, config);
  if (unsupported) {
    return reportPartialImplementSupport(context, unsupported);
  }

  await appendEvent(config, { type: "command_started", data: { command: "implement" } });
  return runImplementRoundOne(config, {
    runner: context.agentRunner,
    stderr: context.stderr,
  });
}

async function runPipelineImplementContinue(cli, context, config) {
  await writeStateFile(config, "workflow.txt", "implement\n");
  await writeStatus({ status: "PENDING", round: 0, workflow: "implement" }, config);
  await removeStateFile(config, "quality_checks.md");
  await appendEvent(config, { type: "command_started", data: { command: "implement" } });
  await writeStateFile(config, "implement-mode.txt", "batch\n");
  await writeStateFile(config, "implement-flags.json", `${JSON.stringify(implementFlagsForState(cli.commandArgs.flags), null, 2)}\n`);
  return runImplementRoundOne(config, {
    runner: context.agentRunner,
    stderr: context.stderr,
  });
}

async function requireImplementResumeState(config) {
  if (!(await pathExists(config.stateDir))) {
    throw new Error(`State error: Cannot resume: ${config.stateDir} does not exist. Run a command first.`);
  }
  if (!(await stateFileExists(config, "status.json"))) {
    throw new Error(`State error: Cannot resume: '${safeStatePath(config, "status.json")}' is missing.`);
  }
  if ((await readStateFile(config, "workflow.txt")).trim() !== "implement") {
    throw new Error("State error: Cannot resume implementation: workflow is not 'implement'.");
  }
  if (!(await stateFileExists(config, "task.md"))) {
    throw new Error(`State error: Cannot resume: failed to read '${safeStatePath(config, "task.md")}': file is missing.`);
  }
  if (!(await readStateFile(config, "task.md")).trim()) {
    throw new Error(`State error: Cannot resume: '${safeStatePath(config, "task.md")}' is empty.`);
  }
}

async function unsupportedResumeImplementMode(commandArgs, config) {
  const persistedMode = persistedResumeMode(await readStateFile(config, "implement-mode.txt"));
  if (persistedMode === "per-task") {
    return "implement --resume per-task mode";
  }
  if (persistedMode === "wave") {
    return "implement --resume wave mode";
  }
  if (!persistedMode && config.batchImplement === false) {
    throw new Error("Config error: Cannot resume implementation in per-task mode without persisted mode metadata. Re-run without --resume.");
  }
  return undefined;
}

function persistedResumeMode(rawMode) {
  const mode = rawMode.trim();
  if (["batch", "per-task", "wave"].includes(mode)) {
    return mode;
  }
  return undefined;
}

async function stateFileExists(config, fileName) {
  return pathExists(safeStatePath(config, fileName));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImplementTask(projectDir, commandArgs, config, { stdout, existingPlan }) {
  if (commandArgs.task !== undefined || commandArgs.file) {
    return readImplementTask(projectDir, commandArgs);
  }
  if (commandArgs.pipelineStart) {
    throw new Error("Config error: Task is required. Provide task text or --file <path>.");
  }
  return readImplementTaskFromState(config, { stdout, existingPlan });
}

async function readImplementTask(projectDir, commandArgs) {
  if (commandArgs.file) {
    const path = resolve(projectDir, commandArgs.file);
    const content = await readFile(path, "utf8");
    if (!content.trim()) {
      throw new Error(`Task file '${commandArgs.file}' is empty.`);
    }
    return `# Implementation Task (source: ${commandArgs.file})\nImplement the changes described below in the project codebase. The source file is a specification - do not treat it as the deliverable. Write the actual code, schema changes, tests, and other artifacts it describes.\n\n${content.trimEnd()}`;
  }
  if (commandArgs.task !== undefined) {
    if (!commandArgs.task.trim()) {
      throw new Error("Task cannot be empty.");
    }
    return commandArgs.task;
  }
  throw new Error("Task is required. Provide --task <text> or --file <path>.");
}

async function readImplementTaskFromState(config, { stdout, existingPlan }) {
  const rawTasks = await readStateFile(config, "tasks.md");
  if (rawTasks.trim()) {
    const taskCount = countParsedTasks(rawTasks);
    writeHuman(config, stdout, `Found ${taskCount} tasks in ${displayPath(config, safeStatePath(config, "tasks.md"))}`);
    writeHuman(config, stdout, "Running batch implementation for all tasks in a single loop.");
    return buildBatchImplementationTask(rawTasks);
  }

  if (existingPlan.trim()) {
    const originalTask = await readStateFile(config, "task.md");
    writeHuman(config, stdout, "No tasks found; falling back to plan.md for batch implementation.");
    return buildPlanImplementationTask(originalTask, existingPlan);
  }

  throw new Error("State error: No tasks found and no plan found. Run 'agent-loop plan' first, or generate tasks with 'agent-loop tasks'.");
}

function writeHuman(config, stdout, message) {
  if (!config.jsonMode) {
    stdout.write(`${message}\n`);
  }
}

function buildBatchImplementationTask(rawTasks) {
  return `Implement ALL tasks below as one cohesive change set.\nTreat cross-task dependencies holistically and ensure every task is fully satisfied.\n\nTASKS:\n${rawTasks.trim()}`;
}

function buildPlanImplementationTask(originalTask, plan) {
  const trimmedTask = originalTask.trim();
  const trimmedPlan = plan.trim();
  const prefix = "Implement the approved plan below as one cohesive change set.\nTreat dependencies across steps holistically and ensure all plan outcomes are satisfied.";
  if (!trimmedTask) {
    return `${prefix}\n\nPLAN:\n${trimmedPlan}`;
  }
  return `${prefix}\n\nORIGINAL TASK:\n${trimmedTask}\n\nPLAN:\n${trimmedPlan}`;
}

function countParsedTasks(rawTasks) {
  const count = rawTasks
    .split(/\r?\n/)
    .filter((line) => taskHeading(line) !== null)
    .length;
  if (count === 0) {
    throw new Error("Config error: No tasks found in tasks.md. Expected headings like '### Task 1: ...' or '## 1. ...'.");
  }
  return count;
}

function taskHeading(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
    return null;
  }
  const withoutHashes = trimmed.replace(/^#+/, "").trim();
  if (withoutHashes.startsWith("Task ")) {
    return /^Task \d+/.test(withoutHashes) ? withoutHashes : null;
  }
  const match = withoutHashes.match(/^(\d+)\s*([.)])\s*(.+)$/);
  if (!match || !match[3].trim()) {
    return null;
  }
  return `Task ${match[1]}: ${match[3].trim()}`;
}

function implementFlagsForState(flags = {}) {
  return {
    per_task: Boolean(flags.perTask),
    wave: Boolean(flags.wave),
    max_retries: flags.maxRetries ?? 2,
    round_step: flags.roundStep ?? 2,
    continue_on_fail: Boolean(flags.continueOnFail),
    fail_fast: Boolean(flags.failFast),
    max_parallel: flags.maxParallel ?? null,
  };
}

async function runImplementRoundOne(config, { runner, stderr }) {
  const maxRounds = config.reviewMaxRounds ?? 0;
  for (let round = 1; ; round += 1) {
    const outcome = await runImplementRound(config, { runner, round, maxRounds });
    if (outcome.kind === "exit") {
      return outcome.code;
    }

    const { status } = outcome;
    if (status.status === "APPROVED") {
      const approved = await handleApprovedImplementation(config, round, { runner, stderr, maxRounds, qualityEvidenceAvailable: outcome.qualityEvidenceAvailable });
      if (approved === CONTINUE_IMPLEMENTATION) {
        continue;
      }
      return approved;
    }
    if (status.status === "NEEDS_CHANGES") {
      const retry = await handleRetryableNeedsChanges(config, round, status, { maxRounds });
      if (retry === CONTINUE_IMPLEMENTATION) {
        continue;
      }
      return retry;
    }
    if (status.status === "ERROR") {
      return 1;
    }
    stderr.write(`Implementation reviewer status '${status.status}' is not yet supported in node-cli first pass.\n`);
    return 2;
  }
}

async function runImplementRound(config, { runner, round, maxRounds }) {
  if (round === 1) {
    await appendLog(config, "Implementation Phase");
  }
  if (shouldEmitHighWatermark(round, maxRounds)) {
    await appendLog(config, IMPLEMENTATION_HIGH_WATERMARK_LOG);
  }
  await appendLog(config, `Round ${round}`);
  await writeStatus({ status: "IMPLEMENTING", round, reason: "Implementation in progress", workflow: "implement" }, config);

  try {
    await runAgentInvocation(
      {
        config,
        action: "implement",
        slot: "implementer",
        role: "implementer",
        prompt: implementationPrompt(config, round),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return { kind: "exit", code: 1 };
  }

  await appendRoundProgress(config, round, `Implementation: Round ${round} complete`);
  const qualityGates = await runImplementationQualityGates(config, round);
  if (qualityGates.kind === "exit") {
    return { kind: "exit", code: qualityGates.code };
  }
  if (qualityGates.status) {
    return { kind: "status", status: qualityGates.status, qualityEvidenceAvailable: qualityGates.qualityEvidenceAvailable };
  }
  const { qualityEvidenceAvailable } = qualityGates;
  await writeStatus(
    { status: "REVIEWING", round, reason: "Gate A: Awaiting same-context reviewer gate", workflow: "implement" },
    config,
  );

  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: reviewerPrompt(config, round, { qualityEvidenceAvailable }),
        outputFile: safeStatePath(config, "review.md"),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return { kind: "exit", code: 1 };
  }

  const status = await readReviewerStatus(config, round);
  await appendRoundProgress(config, round, reviewProgressSummary(status));
  return { kind: "status", status, qualityEvidenceAvailable };
}

function shouldEmitHighWatermark(round, maxRounds) {
  return maxRounds <= 0 && round >= 50 && (round - 50) % 25 === 0;
}

async function readReviewerStatus(config, round) {
  const status = (await readJsonStateFile(config, "status.json")) ?? {};
  if (["APPROVED", "NEEDS_CHANGES", "ERROR"].includes(status.status)) {
    return status;
  }
  const fallback = {
    status: "NEEDS_CHANGES",
    round,
    reason: "Reviewer did not write an APPROVED or NEEDS_CHANGES status.",
  };
  await writeStatus({ ...fallback, workflow: "implement" }, config);
  return fallback;
}

async function handleApprovedImplementation(config, round, { runner, stderr, maxRounds, qualityEvidenceAvailable }) {
  if (config.simpleMode || (config.mode === "single-agent" && config.freshContextReview === false)) {
    const reason = config.simpleMode ? "simple mode" : "single-agent";
    await writeStatus({ status: "CONSENSUS", round, reason: `AUTO-CONSENSUS (${reason})`, workflow: "implement" }, config);
    await appendRoundProgress(config, round, `Consensus: AUTO-CONSENSUS (${reason})`);
    return 0;
  }

  const gateBStatus = await runFreshContextReview(config, { runner, round, qualityEvidenceAvailable });
  if (gateBStatus.status === "APPROVED") {
    return handleGateBApproved(config, round, { runner, stderr, maxRounds });
  }
  if (gateBStatus.status === "NEEDS_CHANGES") {
    const verifyStatus = await runGateBVerification(config, { runner, round });
    if (verifyStatus.status === "APPROVED") {
      return handleGateBApproved(config, round, { runner, stderr, maxRounds });
    }
    if (verifyStatus.status === "NEEDS_CHANGES") {
      return handleRetryableNeedsChanges(config, round, verifyStatus, { maxRounds });
    }
    if (verifyStatus.status === "ERROR") {
      return 1;
    }
    stderr.write(`Implementation Gate B verification status '${verifyStatus.status}' is not yet supported in node-cli first pass.\n`);
    return 2;
  }
  if (gateBStatus.status === "ERROR") {
    return 1;
  }
  stderr.write(`Implementation fresh-context reviewer status '${gateBStatus.status}' is not yet supported in node-cli first pass.\n`);
  return 2;
}

async function handleGateBApproved(config, round, { runner, stderr, maxRounds }) {
  if (config.mode === "single-agent") {
    await writeStatus({ status: "CONSENSUS", round, reason: "AUTO-CONSENSUS (single-agent, fresh-context approved)", workflow: "implement" }, config);
    await appendRoundProgress(config, round, "Consensus: AUTO-CONSENSUS (single-agent, fresh-context approved)");
    return 0;
  }
  return runImplementationSignoff(config, { runner, round, stderr, maxRounds });
}

async function handleRetryableNeedsChanges(config, round, status, { maxRounds }) {
  if (maxRounds > 0 && round >= maxRounds) {
    return handleMaxRounds(config, round, status);
  }
  await appendRoundProgress(config, round, `Retry: continuing to round ${round + 1}`);
  return CONTINUE_IMPLEMENTATION;
}

async function runFreshContextReview(config, { runner, round, qualityEvidenceAvailable }) {
  await writeStatus(
    { status: "REVIEWING", round, reason: "[gate:fresh-context] Awaiting fresh-context reviewer gate", workflow: "implement" },
    config,
  );
  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: freshContextReviewerPrompt(config, round, { qualityEvidenceAvailable }),
        outputFile: safeStatePath(config, "review.md"),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return { status: "ERROR", round, reason };
  }

  const status = await readReviewerStatus(config, round);
  await appendRoundProgress(config, round, freshContextProgressSummary(status));
  return status;
}

async function runImplementationQualityGates(config, round) {
  const qualityOutcome = await runImplementationQualityChecks(config);
  const browserOutcome = await runImplementationBrowserChecks(config);
  const qualityEvidenceAvailable = Boolean(qualityOutcome || browserOutcome);
  await persistImplementationQualityEvidence(config, { qualityOutcome, browserOutcome });

  const blockedBrowserStatus = await handleImplementationBrowserFailures(config, { browserOutcome, round });
  if (blockedBrowserStatus) {
    return { kind: "continue", status: blockedBrowserStatus, qualityEvidenceAvailable };
  }
  if (await applyImplementationBrowserEvidenceGate(config, { browserOutcome, round })) {
    return { kind: "exit", code: 1, qualityEvidenceAvailable };
  }
  return { kind: "continue", qualityEvidenceAvailable };
}

async function runImplementationQualityChecks(config) {
  if (!config.autoTest) {
    return undefined;
  }
  const commands = await resolveRuntimeQualityCommands(config);
  return runCheckCommands(config, commands, {
    startLog: "Running quality checks",
    itemLog: "Quality check",
    header: "QUALITY CHECKS:",
  });
}

async function runImplementationBrowserChecks(config) {
  const commands = resolveRuntimeBrowserTestCommands(config);
  return runCheckCommands(config, commands, {
    startLog: "Running browser/E2E checks",
    itemLog: "Browser/E2E check",
    header: "BROWSER/E2E CHECKS:",
  });
}

async function persistImplementationQualityEvidence(config, { qualityOutcome, browserOutcome }) {
  const sections = [qualityOutcome, browserOutcome]
    .filter(Boolean)
    .map((outcome) => outcome.output.trim())
    .filter(Boolean);
  if (sections.length === 0) {
    await rm(safeStatePath(config, "quality_checks.md"), { force: true });
    return;
  }
  await writeStateFile(config, "quality_checks.md", sections.join("\n\n"));
}

async function handleImplementationBrowserFailures(config, { browserOutcome, round }) {
  if (!browserOutcome?.anyFailed) {
    return undefined;
  }
  if (config.browserEvidencePolicy !== "block") {
    await appendLog(config, `Browser/E2E checks failed before review; continuing because browser_evidence_policy=${config.browserEvidencePolicy}`);
    await appendRoundProgress(config, round, `WARN - browser/E2E checks failed before review; continuing because browser_evidence_policy=${config.browserEvidencePolicy}`);
    return undefined;
  }

  await appendLog(config, "Browser/E2E checks failed before review; returning to implementation");
  await writeStateFile(config, "review.md", browserReviewBlockerMarkdown(browserOutcome));
  const findings = browserReviewBlockerFindings(round);
  await writeStateFile(config, "findings.json", `${JSON.stringify(findings, null, 2)}\n`);
  const status = {
    status: "NEEDS_CHANGES",
    round,
    reason: "Browser/E2E checks failed before implementation review",
    failure_severity: "missing_feature",
  };
  await writeStatus({ ...status, workflow: "implement" }, config);
  await appendRoundProgress(config, round, "NEEDS_CHANGES - browser/E2E checks failed before review");
  return status;
}

async function applyImplementationBrowserEvidenceGate(config, { browserOutcome, round }) {
  const assessment = await browserEvidenceGateAssessment(config, browserOutcome);
  if (!assessment) {
    return false;
  }
  const summary = browserEvidenceGateSummary(assessment);
  await writeStateFile(config, BROWSER_EVIDENCE_GATE_FILENAME, browserEvidenceGateReport(config, assessment, "implementation review"));
  if (config.browserEvidencePolicy === "warn") {
    await appendLog(config, `Browser evidence gate warning before implementation review: ${summary}. See ${BROWSER_EVIDENCE_GATE_FILENAME}.`);
    await appendRoundProgress(config, round, `WARN - browser evidence gate: ${summary}.`);
    return false;
  }

  const reason = `browser evidence gate paused before implementation review: ${summary}. See ${BROWSER_EVIDENCE_GATE_FILENAME}.`;
  await appendLog(config, `Paused: ${reason}`);
  await writeStatus({
    status: "AWAITING_INPUT",
    round,
    reason,
    failure_severity: "missing_feature",
    workflow: "implement",
  }, config);
  await appendRoundProgress(config, round, `AWAITING_INPUT - browser evidence gate: ${summary}`);
  return true;
}

function browserReviewBlockerMarkdown(outcome) {
  return `# Review Blocked By Browser/E2E Checks\n\nBrowser/E2E checks failed before implementation review. The reviewer cannot approve until these failures are fixed or the configured command is corrected.\n\n\`\`\`text\n${outcome.output.trim()}\n\`\`\``;
}

function browserReviewBlockerFindings(round) {
  return {
    round,
    findings: [{
      id: "BROWSER-E2E-001",
      severity: "HIGH",
      summary: "Browser/E2E checks failed before implementation review",
      file_refs: ["quality_checks.md:1"],
    }],
  };
}

async function runGateBVerification(config, { runner, round }) {
  await writeStatus(
    { status: "REVIEWING", round, reason: "[gate:fresh-context] Awaiting gate-B findings verification", workflow: "implement" },
    config,
  );
  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: gateBVerificationPrompt(config, round),
        outputFile: safeStatePath(config, "review.md"),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return { status: "ERROR", round, reason };
  }

  const status = await readReviewerStatus(config, round);
  await appendRoundProgress(config, round, gateBVerificationProgressSummary(status));
  return status;
}

async function runImplementationSignoff(config, { runner, round, stderr, maxRounds }) {
  await writeStatus(
    { status: "REVIEWING", round, reason: "[gate:implementer-signoff] Awaiting implementer signoff", workflow: "implement" },
    config,
  );
  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "implementer",
        role: "implementer",
        prompt: signoffPrompt(config, round),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return 1;
  }

  const status = await readSignoffStatus(config, round);
  await appendRoundProgress(config, round, signoffProgressSummary(status));
  if (status.status === "CONSENSUS") {
    return 0;
  }
  if (status.status === "DISPUTED") {
    return runGateCBounce(config, {
      runner,
      round,
      stderr,
      maxRounds,
      disputeReason: status.reason ?? "see status.json",
    });
  }
  if (status.status === "ERROR") {
    return 1;
  }
  stderr.write(`Implementation signoff status '${status.status}' is not yet supported in node-cli first pass.\n`);
  return 2;
}

async function runGateCBounce(config, { runner, round, stderr, maxRounds, disputeReason }) {
  await writeStatus(
    { status: "REVIEWING", round, reason: "[gate:gate-c-bounce] Verifying late findings from implementer dispute", workflow: "implement" },
    config,
  );
  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: gateCBouncePrompt(config, round, disputeReason),
        outputFile: safeStatePath(config, "review.md"),
      },
      { runner },
    );
  } catch (error) {
    const reason = error.message ?? String(error);
    await appendRoundProgress(config, round, `Error: ${reason}`);
    await writeStatus({ status: "ERROR", round, reason, workflow: "implement" }, config);
    return 1;
  }

  const status = await readReviewerStatus(config, round);
  await appendRoundProgress(config, round, gateCBounceProgressSummary(status));
  if (status.status === "APPROVED") {
    await writeStatus(
      { status: "CONSENSUS", round, reason: "CONSENSUS: late findings rejected by reviewer", workflow: "implement" },
      config,
    );
    await appendRoundProgress(config, round, "Consensus: CONSENSUS (late findings rejected)");
    return 0;
  }
  if (status.status === "NEEDS_CHANGES") {
    return handleRetryableNeedsChanges(config, round, status, { maxRounds });
  }
  if (status.status === "ERROR") {
    return 1;
  }
  stderr.write(`Implementation Gate C bounce status '${status.status}' is not yet supported in node-cli first pass.\n`);
  return 2;
}

async function readSignoffStatus(config, round) {
  const status = (await readJsonStateFile(config, "status.json")) ?? {};
  if (["CONSENSUS", "DISPUTED", "ERROR"].includes(status.status)) {
    return status;
  }
  const fallback = {
    status: "DISPUTED",
    round,
    reason: "Implementer signoff did not write a CONSENSUS or DISPUTED status.",
  };
  await writeStatus({ ...fallback, workflow: "implement" }, config);
  return fallback;
}

async function handleMaxRounds(config, round, status) {
  const reason = status.reason ?? "max rounds reached without consensus";
  await writeStatus({ status: "MAX_ROUNDS", round, reason, workflow: "implement" }, config);
  await appendRoundProgress(config, round, `MAX_ROUNDS - ${reason}`);
  return 1;
}

function implementationPrompt(config, round) {
  const paths = phasePaths(config);
  const reviewInstruction = round <= 1
    ? "This is the first implementation round."
    : `Address the reviewer's feedback in ${paths.reviewMd}.`;
  return `Read the task from ${paths.taskMd} and the plan from ${paths.planMd}.\n${reviewInstruction}\n\nImplement ONLY the task in ${paths.taskMd}.\nUse ${paths.planMd} strictly as supporting context; do not implement unrelated plan items.`;
}

function reviewerPrompt(config, round, { qualityEvidenceAvailable = false } = {}) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  const qualityLine = qualityEvidenceAvailable ? `\nReview automated check output from ${paths.qualityChecksMd}.` : "";
  return `Read the task from ${paths.taskMd} and the plan from ${paths.planMd}.\nRead the changed files directly and Review implementation.${qualityLine}\n\nWrite review to ${paths.reviewMd} and findings to ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "${timestamp}"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "${timestamp}"}`;
}

function freshContextReviewerPrompt(config, round, { qualityEvidenceAvailable = false } = {}) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  const qualityLine = qualityEvidenceAvailable ? `\nReview check output from ${paths.qualityChecksMd}.` : "";
  return `You are the fresh-context reviewer for Gate B.\nRead the task from ${paths.taskMd} and the plan from ${paths.planMd}.\nReview the implementation independently from the same-context reviewer.${qualityLine}\n\nWrite review to ${paths.reviewMd} and findings to ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "${timestamp}"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "${timestamp}"}`;
}

function gateBVerificationPrompt(config, round) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  return `You are the SAME fresh-context reviewer from Gate B (round ${round}).\n\nYou previously found issues. Re-examine each finding against the actual code.\nRead the task from ${paths.taskMd}, your findings from ${paths.findingsJson}, and your review from ${paths.reviewMd}.\nFor each finding, CONFIRM it is real or WITHDRAW it if mistaken.\n\nIf ALL withdrawn: write APPROVED. If ANY confirmed: write NEEDS_CHANGES.\n\nWrite review to ${paths.reviewMd} and findings to ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "${timestamp}"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "${timestamp}"}`;
}

function signoffPrompt(config, round) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  return `Read the task from ${paths.taskMd}, the plan from ${paths.planMd}, and the review from ${paths.reviewMd}.\nReview the implementation and the fresh-context reviewer result.\n\nWrite to ${paths.statusJson}:\nIf you agree: {"status": "CONSENSUS", "round": ${round}, "timestamp": "${timestamp}"}\nIf you disagree: {"status": "DISPUTED", "round": ${round}, "reason": "your concerns", "timestamp": "${timestamp}"}`;
}

function gateCBouncePrompt(config, round, disputeReason) {
  const paths = phasePaths(config);
  const timestamp = (config.now ? config.now() : new Date()).toISOString();
  return `You are the SAME fresh-context reviewer from Gate B (round ${round}).\n\nThe implementer has DISPUTED the consensus with late findings.\nRead the task from ${paths.taskMd}, findings from ${paths.findingsJson}, and review from ${paths.reviewMd}.\n\nIMPLEMENTER'S DISPUTE REASON:\n${disputeReason}\n\nVerify each late finding against the code. If REJECTED: write APPROVED. If CONFIRMED: write NEEDS_CHANGES.\n\nWrite review to ${paths.reviewMd} and findings to ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "${timestamp}"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "${timestamp}"}`;
}

function phasePaths(config) {
  return {
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    planMd: displayPath(config, safeStatePath(config, "plan.md")),
    reviewMd: displayPath(config, safeStatePath(config, "review.md")),
    findingsJson: displayPath(config, safeStatePath(config, "findings.json")),
    statusJson: displayPath(config, safeStatePath(config, "status.json")),
    qualityChecksMd: displayPath(config, safeStatePath(config, "quality_checks.md")),
  };
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}

function reviewProgressSummary(status) {
  const reason = status.reason ? `: ${status.reason}` : "";
  return `Gate A: ${status.status}${reason}`;
}

function freshContextProgressSummary(status) {
  const reason = status.reason ? ` - ${status.reason}` : "";
  return `Gate B: ${status.status} (fresh-context)${reason}`;
}

function gateBVerificationProgressSummary(status) {
  const reason = status.reason ? ` - ${status.reason}` : "";
  return `Gate B verification: ${status.status}${reason}`;
}

function signoffProgressSummary(status) {
  const reason = status.reason ? ` - ${status.reason}` : "";
  return `Implementer signoff: ${status.status}${reason}`;
}

function gateCBounceProgressSummary(status) {
  const reason = status.reason ? ` - ${status.reason}` : "";
  return `Gate C bounce: ${status.status} (late findings verification)${reason}`;
}

async function appendRoundProgress(config, round, summary) {
  if (!summary.trim()) {
    return;
  }
  const existing = await readStateFile(config, "implement-progress.md");
  const heading = `## Round ${round}`;
  if (!existing.trim()) {
    await writeStateFile(config, "implement-progress.md", `${heading}\n${summary.trim()}\n`);
    return;
  }
  const separator = existing.trimEnd().endsWith(heading) || existing.includes(`${heading}\n`) ? "" : `\n\n${heading}\n`;
  await appendStateFile(config, "implement-progress.md", `${separator}${summary.trim()}\n`);
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}

function emitImplementElapsed(config, stdout, elapsedMs) {
  if (config.jsonMode) {
    return;
  }
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  stdout.write(`Elapsed: ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}\n`);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
