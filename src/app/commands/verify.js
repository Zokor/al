import { stat } from "node:fs/promises";
import { relative } from "node:path";
import { createInterface } from "node:readline";
import { runAgentInvocation } from "../../agent/runtime.js";
import { runCheckCommands } from "../checkCommands.js";
import { canonicalGoalLintShouldBlock, formatCanonicalGoalList, loadOrRefreshAcceptanceGoals, normalizeGoalAlias } from "../acceptanceGoals.js";
import { BROWSER_EVIDENCE_GATE_FILENAME, browserEvidenceGateAssessment, browserEvidenceGateReport, browserEvidenceGateSummary } from "../browserEvidence.js";
import { loadConfig } from "../../config/index.js";
import { resolveRuntimeBrowserTestCommands, resolveRuntimeQualityCommands } from "../../config/qualityCommands.js";
import { appendEvent } from "../../state/events.js";
import { appendStateFile, readJsonStateFile, readStateFile, removeStateFile, safeStatePath, writeStateFile } from "../../state/files.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { writeStatus } from "../../state/status.js";
import { writePipelineResumeState } from "../../workflow/pipelineResumeState.js";
import { readTaskInput } from "../../workflow/plan.js";
import { requireResumeWorkflow } from "./phases.js";

const PASSING_VERIFICATION_STATUSES = new Set(["passed"]);
const FAILING_VERIFICATION_STATUSES = new Set(["failed", "blocked", "skipped", "pending"]);

export async function runVerify(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);

  if (cli.commandArgs.resume) {
    await appendEvent(config, { type: "command_started", data: { command: "verify" } });
    await requireResumeWorkflow(config, "verify");
    if (cli.commandArgs.manual) {
      const success = await runManualVerify(config, { context, resume: true });
      return success ? 0 : 1;
    }
    const success = await runAutomatedVerifyRound(config, { runner: context.agentRunner, resume: true });
    return finishVerifyCommand(config, success);
  }

  if (cli.commandArgs.pipelineStart) {
    return runPipelineVerifyStart(cli, context, config);
  }
  if (cli.commandArgs.pipelineContinue) {
    return runPipelineVerifyContinue(context, config);
  }

  await appendEvent(config, { type: "command_started", data: { command: "verify" } });
  const entryError = await verifyEntryError(config);
  if (entryError) {
    context.stderr.write(`${entryError}\n`);
    context.stderr.write("Run `agent-loop implement` first, or use `agent-loop status` to check state.\n");
    return 1;
  }

  if (cli.commandArgs.manual) {
    const success = await runManualVerify(config, { context, resume: false });
    return success ? 0 : 1;
  }

  await prepareFreshVerification(config);
  const success = await runAutomatedVerifyRound(config, { runner: context.agentRunner, resume: false });
  return finishVerifyCommand(config, success);
}

async function runPipelineVerifyStart(cli, context, config) {
  const task = await readTaskInput(context.cwd, cli.commandArgs);
  await resetStateDir(config);
  await appendEvent(config, { type: "command_started", data: { command: "verify" } });
  await initializeWorkflowState(config, { task, workflow: "verify" });
  if (cli.commandArgs.pipelineResumeStateArgs) {
    await writePipelineResumeState(config, cli.commandArgs.pipelineResumeStateArgs);
  }

  if (cli.commandArgs.manual) {
    const success = await runManualVerify(config, { context, resume: false });
    return success ? 0 : 1;
  }

  await prepareFreshVerification(config);
  const success = await runAutomatedVerifyRound(config, { runner: context.agentRunner, resume: false });
  return finishVerifyCommand(config, success);
}

async function runPipelineVerifyContinue(context, config) {
  await appendEvent(config, { type: "command_started", data: { command: "verify" } });
  await prepareFreshVerification(config);
  const success = await runAutomatedVerifyRound(config, { runner: context.agentRunner, resume: false });
  return finishVerifyCommand(config, success);
}

async function finishVerifyCommand(config, success) {
  if (success && !(await runCompletionInvariants(config))) {
    return 1;
  }
  return success ? 0 : 1;
}

async function verifyEntryError(config) {
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  const status = (await readJsonStateFile(config, "status.json")) ?? {};
  const validWorkflow = workflow === "implement" || workflow === "review";
  if (validWorkflow && status.status === "CONSENSUS") {
    return undefined;
  }
  return `Cannot verify: status is ${status.status ?? "PENDING"} (expected implementation Consensus).`;
}

async function prepareFreshVerification(config) {
  await writeStateFile(config, "workflow.txt", "verify\n");
  await removeStateFile(config, "verification.json");
  await removeStateFile(config, "verification.md");
  await removeStateFile(config, "verification-fixes.md");
  await removeStateFile(config, "verification-recovery.json");
  await removeStateFile(config, "recovery-slice.json");
  await removeStateFile(config, "verification-progress.md");
}

async function runAutomatedVerifyRound(config, { runner, resume }) {
  const round = 1;
  const mode = verificationMode(config);
  const goalSetup = await prepareCanonicalGoals(config, round);
  if (goalSetup.blocked) {
    return false;
  }
  const canonicalGoals = goalSetup.goals;
  const qualityOutcome = await runQualityChecks(config);
  const browserOutcome = await runBrowserChecks(config);
  const deterministicIssues = collectDeterministicIssues(config, { qualityOutcome, browserOutcome });
  await appendLog(config, "Verification Phase");
  await writeStatus({ status: "VERIFYING", round, reason: "Verification in progress", workflow: "verify" }, config);
  await appendVerificationProgress(config, round, `Started: mode=${mode} resume=${resume} max_rounds=1`);
  await appendVerificationProgress(config, round, qualityProgressSummary(qualityOutcome, countIssues(deterministicIssues, "QualityCheck")));
  await appendVerificationProgress(config, round, browserProgressSummary(browserOutcome, countIssues(deterministicIssues, "BrowserTest")));
  if (await applyBrowserEvidenceGate(config, browserOutcome, round)) {
    return false;
  }

  let output;
  try {
    const result = await runAgentInvocation(
      {
        config,
        action: "verify",
        slot: "verifier",
        role: "verifier",
        prompt: verificationPrompt(config, {
          mode,
          resume,
          qualityOutcome,
          browserOutcome,
          canonicalGoalList: canonicalGoals ? formatCanonicalGoalList(canonicalGoals) : undefined,
        }),
      },
      { runner },
    );
    output = result.output;
  } catch {
    await appendVerificationProgress(config, round, "Agent call failed: verification agent returned an error");
    await writeStatus({ status: "ERROR", round, reason: "Verification agent call failed", workflow: "verify" }, config);
    return false;
  }

  const artifacts = parseVerificationArtifacts(output);
  if (!artifacts.ok) {
    await writeStructuralVerificationFailure(config, round, artifacts.issue);
    return false;
  }

  await persistVerificationArtifacts(config, round, artifacts);
  const coverageGate = validateVerificationCoverage(artifacts.report, canonicalGoals);
  if (!coverageGate.passed) {
    await writeVerificationGateFailure(config, round, coverageGate, artifacts);
    return false;
  }
  const secondGate = await runVerificationSecondGate(config, {
    runner,
    round,
    canonicalGoals,
  });
  if (!secondGate.ok) {
    return false;
  }
  if (deterministicIssues.length > 0) {
    await writeDeterministicFailure(config, round, deterministicIssues, secondGate.fixes ?? artifacts.fixes);
    return false;
  }
  const finalReport = secondGate.report ?? artifacts.report;
  if (verificationReportPassed(finalReport)) {
    await removeStateFile(config, "verification-fixes.md");
    await removeStateFile(config, "recovery-slice.json");
    await appendVerificationProgress(config, round, `Verified: all verification items passed with full plan coverage (mode: ${mode})`);
    await writeStatus({ status: "VERIFIED", round, reason: `All verification items passed (mode: ${mode})`, workflow: "verify" }, config);
    return true;
  }

  await writeVerificationFailure(config, round, artifacts);
  return false;
}

async function runManualVerify(config, { context, resume }) {
  await appendLog(config, "Manual Verification");
  await writeStatus({ status: "VERIFYING", round: 1, reason: "Manual verification in progress", workflow: "verify" }, config);
  await writeStateFile(config, "workflow.txt", "verify\n");
  if (!resume) {
    await removeStateFile(config, "verification-progress.md");
  }
  await appendVerificationProgress(
    config,
    1,
    resume ? "Manual verification resume started" : "Manual verification started: generating checklist",
  );

  const setup = resume
    ? await loadPersistedManualChecklist(config)
    : await generateManualChecklist(config, { runner: context.agentRunner });
  if (!setup.ok) {
    return false;
  }

  const reportItems = [];
  let anyFailure = false;
  let incomplete = false;

  for (const item of setup.items) {
    if (resume && item.status === "passed") {
      reportItems.push(item);
      continue;
    }

    if (!config.jsonMode) {
      context.stdout.write(`\n[${item.id}] ${item.description}\n`);
      context.stdout.write("  [p]ass / [f]ail / [b]locked / [s]kip: ");
    }

    let input;
    try {
      input = await readManualAnswer(context);
    } catch {
      incomplete = true;
      break;
    }

    const status = manualAnswerStatus(input);
    if (status === "failed" || status === "blocked") {
      anyFailure = true;
    }
    if (status === "skipped") {
      incomplete = true;
    }

    const updatedItem = {
      id: item.id,
      description: item.description,
      status,
      detail: null,
      plan_ref: null,
      evidence: null,
      artifact_exists: null,
      artifact_substantive: null,
      artifact_wired: null,
    };
    reportItems.push(updatedItem);
    await appendVerificationProgress(config, 1, `Manual item ${item.id}: ${titleCaseStatus(status)} - ${item.description}`);
    await persistManualReport(config, [
      ...reportItems,
      ...setup.items.slice(reportItems.length),
    ]);
  }

  const hasSkippedOrPending = incomplete || reportItems.some((item) => item.status === "skipped" || item.status === "pending");
  if (anyFailure || hasSkippedOrPending) {
    await writeStateFile(config, "verification-fixes.md", manualVerificationFixes(reportItems, setup.items));
    const reason = anyFailure
      ? "Manual verification found failures or blocked items"
      : "Manual verification incomplete: skipped items or checklist not fully answered";
    await appendLog(config, reason);
    await appendVerificationProgress(config, 1, `Manual verification failed: ${reason}`);
    await writeStatus({ status: "VERIFICATION_FAILED", round: 1, reason, workflow: "verify" }, config);
    return false;
  }

  await removeStateFile(config, "verification-fixes.md");
  await removeStateFile(config, "verification-recovery.json");
  await appendLog(config, "Manual verification passed");
  await appendVerificationProgress(config, 1, "Manual verification passed");
  await writeStatus({ status: "VERIFIED", round: 1, reason: "Manual verification passed", workflow: "verify" }, config);
  return true;
}

async function loadPersistedManualChecklist(config) {
  const raw = await readStateFile(config, "verification.json");
  let report;
  if (raw.trim()) {
    try {
      report = parseVerificationReport(raw);
    } catch {
      report = undefined;
    }
  }

  if (report?.items?.length > 0 && report.checklist_source === "manual") {
    await appendLog(config, `Resuming manual verification with ${report.items.length} items`);
    await appendVerificationProgress(config, 1, `Resumed manual verification with ${report.items.length} item(s)`);
    return { ok: true, items: report.items };
  }

  if (report) {
    await appendLog(config, "Persisted verification report is not a manual checklist - run `verify --manual` first");
    await appendVerificationProgress(config, 1, "Manual verification resume failed: persisted report is from automated verify");
    await writeStatus({
      status: "ERROR",
      round: 1,
      reason: "Cannot resume: persisted report is from automated verify, not manual checklist",
      workflow: "verify",
    }, config);
    return { ok: false };
  }

  await appendLog(config, "No persisted manual verification report found - run `verify --manual` first");
  await appendVerificationProgress(config, 1, "Manual verification resume failed: no persisted manual report");
  await writeStatus({
    status: "ERROR",
    round: 1,
    reason: "Cannot resume: no persisted manual verification report",
    workflow: "verify",
  }, config);
  return { ok: false };
}

async function generateManualChecklist(config, { runner }) {
  await removeStateFile(config, "verification.json");
  await removeStateFile(config, "verification.md");
  await removeStateFile(config, "verification-fixes.md");

  let output;
  try {
    const result = await runAgentInvocation(
      {
        config,
        action: "verify",
        slot: "verifier",
        role: "verifier",
        prompt: manualChecklistPrompt(config),
      },
      { runner },
    );
    output = result.output;
  } catch {
    await appendLog(config, "Failed to generate verification checklist");
    await appendVerificationProgress(config, 1, "Manual verification failed: checklist generation agent returned an error");
    await writeStatus({ status: "ERROR", round: 1, reason: "Failed to generate checklist", workflow: "verify" }, config);
    return { ok: false };
  }

  const descriptions = parseChecklistItemDescriptions(output);
  if (descriptions.length === 0) {
    await appendLog(config, "No checklist items parsed from agent output");
    await appendVerificationProgress(config, 1, "Manual verification failed: no checklist items parsed from agent output");
    await writeStatus({ status: "ERROR", round: 1, reason: "No checklist items generated", workflow: "verify" }, config);
    return { ok: false };
  }

  const items = descriptions.map((description, index) => manualVerificationItem(index, description));
  await persistManualReport(config, items);
  await appendVerificationProgress(config, 1, `Generated manual checklist: ${items.length} item(s)`);
  return { ok: true, items };
}

function parseChecklistItemDescriptions(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      const separator = trimmed.indexOf(". ");
      return separator > 0 && /^\d+$/.test(trimmed.slice(0, separator));
    })
    .map((line) => line.trim().split(/\.\s+(.+)/, 2)[1]?.trim())
    .filter(Boolean);
}

function manualVerificationItem(index, description) {
  return {
    id: `M${index + 1}`,
    description,
    status: "pending",
    detail: null,
    plan_ref: null,
    evidence: null,
    artifact_exists: null,
    artifact_substantive: null,
    artifact_wired: null,
  };
}

async function persistManualReport(config, items) {
  await writeStateFile(config, "verification.json", `${JSON.stringify({
    items,
    summary: null,
    checklist_source: "manual",
  }, null, 2)}\n`);
}

function manualAnswerStatus(input) {
  switch (String(input ?? "").trim().toLowerCase()) {
    case "p":
    case "pass":
      return "passed";
    case "f":
    case "fail":
      return "failed";
    case "b":
    case "blocked":
      return "blocked";
    case "s":
    case "skip":
    default:
      return "skipped";
  }
}

async function readManualAnswer(context) {
  if (context.readAnswer) {
    const answer = await context.readAnswer();
    if (answer === null || answer === undefined) {
      throw new Error("Manual verification input ended before an answer was provided.");
    }
    return String(answer);
  }
  const input = context.stdin ?? process.stdin;
  const reader = createInterface({ input, terminal: false });
  try {
    const iterator = reader[Symbol.asyncIterator]();
    const { value, done } = await iterator.next();
    if (done) {
      throw new Error("Manual verification input ended before an answer was provided.");
    }
    return value;
  } finally {
    reader.close();
  }
}

function manualVerificationFixes(reportItems, checklistItems) {
  const lines = ["# Manual Verification Fixes", ""];
  const answeredIds = new Set(reportItems.map((item) => item.id));
  for (const item of reportItems) {
    if (["failed", "blocked", "skipped"].includes(item.status)) {
      const detail = item.detail ? `: ${item.detail}` : "";
      lines.push(`- [${item.id}] ${item.description} - ${item.status}${detail}`);
    }
  }
  for (const item of checklistItems) {
    if (!answeredIds.has(item.id)) {
      lines.push(`- [${item.id}] ${item.description} - pending (not answered)`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function manualChecklistPrompt(config) {
  const paths = phasePaths(config);
  const biasWarning = verificationMode(config) === "IndependentReviewer"
    ? ""
    : "IMPORTANT: You are reviewing your own implementation. Counteract confirmation bias: do not assume things work because you remember writing them. Re-read the plan and code carefully, as if seeing them for the first time.\n\n";
  return `Read the plan from ${paths.planMd}. If it is missing or empty, fall back to the task/spec in ${paths.taskMd} and use any embedded plan section or numbered goals there. Read the tasks from ${paths.tasksMd}.\n\n${biasWarning}This checklist is for read-only verification only. Produce things a human should verify; do not edit code or suggest direct code rewrites.\n\nGenerate a concise verification checklist of 3-7 items that a human reviewer should manually check. Each item should be a single sentence describing what to verify.\n\nFormat your output as a numbered list, one item per line:\n1. Check that ...\n2. Verify that ...\n3. Confirm that ...`;
}

async function runCompletionInvariants(config) {
  const issues = await validateCompletionInvariants(config);
  if (issues.length === 0) {
    return true;
  }

  await appendLog(config, `Command-final completion validation failed: ${issues.length} invariant(s) violated`);
  for (const issue of issues) {
    await appendLog(config, `  ${issue.source}: ${issue.description}`);
  }

  await writeStatus({
    status: "VERIFICATION_FAILED",
    reason: "Command-final completion invariants failed",
    workflow: "verify",
  }, config);
  const existingFixes = await readStateFile(config, "verification-fixes.md");
  await writeStateFile(config, "verification-fixes.md", deterministicFixes(issues, existingFixes.trim() ? existingFixes : undefined));
  return false;
}

export async function validateCompletionInvariants(config) {
  const issues = [];
  const status = await readCompletionStatus(config);
  if (status !== "VERIFIED") {
    issues.push(commandInvariant(`Terminal status is ${status} but must be VERIFIED for a successful verify-containing run`));
  }

  const verificationJson = await readStateFile(config, "verification.json");
  if (!verificationJson.trim()) {
    issues.push(commandInvariant("verification.json is missing or empty on a successful verified run"));
  } else {
    try {
      parseVerificationReport(verificationJson);
    } catch {
      issues.push(commandInvariant("verification.json exists but contains invalid JSON"));
    }
  }

  const verificationMarkdown = await readStateFile(config, "verification.md");
  if (!verificationMarkdown.trim()) {
    issues.push(commandInvariant("verification.md is missing or empty on a successful verified run"));
  }

  if (await stateFileExists(config, "handoff.json")) {
    issues.push(commandInvariant("Unconsumed handoff.json checkpoint remains on a successful verified run"));
  }
  if (await stateFileExists(config, "handoff.md")) {
    issues.push(commandInvariant("Unconsumed handoff.md checkpoint remains on a successful verified run"));
  }
  if (status === "CONTEXT_LIMIT") {
    issues.push(commandInvariant("Status is CONTEXT_LIMIT, which is incompatible with a verified terminal state"));
  }

  return issues;
}

async function readCompletionStatus(config) {
  const statusText = await readStateFile(config, "status.json");
  if (!statusText.trim()) {
    return "PENDING";
  }
  try {
    const status = JSON.parse(statusText).status;
    return typeof status === "string" && status.trim() ? status.trim() : "PENDING";
  } catch {
    return "INVALID_STATUS_JSON";
  }
}

function commandInvariant(description) {
  return {
    source: "CommandInvariant",
    heading: "INVARIANT",
    description,
  };
}

async function runQualityChecks(config) {
  if (!config.verifyAutoTest) {
    return undefined;
  }
  const commands = await resolveRuntimeQualityCommands(config);
  return runCheckCommands(config, commands, {
    startLog: "Running quality checks",
    itemLog: "Quality check",
    header: "QUALITY CHECKS:",
  });
}

async function runBrowserChecks(config) {
  const commands = resolveRuntimeBrowserTestCommands(config);
  return runCheckCommands(config, commands, {
    startLog: "Running browser/E2E checks",
    itemLog: "Browser/E2E check",
    header: "BROWSER/E2E CHECKS:",
  });
}

async function runVerificationSecondGate(config, { runner, round, canonicalGoals }) {
  if (!verificationSecondGateEnabled(config)) {
    await appendVerificationProgress(config, round, "Gate B skipped: verification is already single-agent or reviewer and implementer are the same");
    return { ok: true };
  }
  const canonicalGoalList = canonicalGoals ? formatCanonicalGoalList(canonicalGoals) : undefined;
  await appendLog(config, `Verification Gate B: ${config.roles.implementer} second verifier`);
  await appendVerificationProgress(config, round, `Gate B started: second verifier=${config.roles.implementer} after primary verifier=${config.roles.verifier} passed`);

  let output;
  try {
    const result = await runAgentInvocation(
      {
        config,
        action: "verify",
        slot: "implementer",
        role: "verifier",
        prompt: verificationSecondGatePrompt(config, { canonicalGoalList }),
      },
      { runner },
    );
    output = result.output;
  } catch {
    await appendVerificationProgress(config, round, "Gate B agent call failed: second verifier returned an error");
    await writeStatus({ status: "ERROR", round, reason: "Verification Gate B agent call failed", workflow: "verify" }, config);
    return { ok: false };
  }

  const artifacts = parseVerificationArtifacts(output);
  if (!artifacts.ok) {
    await writeGateBStructuralFailure(config, round, artifacts.issue);
    return { ok: false };
  }
  artifacts.report = { ...artifacts.report, checklist_source: "automated-gate-b" };
  await persistGateBVerificationArtifacts(config, round, artifacts);
  const gate = validateVerificationCoverage(artifacts.report, canonicalGoals);
  if (!gate.passed) {
    await writeGateBVerificationGateFailure(config, round, gate, artifacts);
    return { ok: false };
  }

  await appendVerificationProgress(config, round, "Gate B passed: second verifier accepted full plan coverage");
  return { ok: true, report: artifacts.report, fixes: artifacts.fixes };
}

function qualityProgressSummary(outcome, deterministicCount) {
  if (!outcome) {
    return "Quality checks skipped or no commands detected";
  }
  if (outcome.anyFailed) {
    return `Quality checks failed before verifier round: ${deterministicCount} deterministic issue(s)`;
  }
  return "Quality checks passed before verifier round";
}

function browserProgressSummary(outcome, deterministicCount) {
  if (!outcome) {
    return "Browser/E2E checks skipped or no commands configured";
  }
  if (outcome.anyFailed) {
    return `Browser/E2E checks failed before verifier round: ${deterministicCount} deterministic issue(s)`;
  }
  return "Browser/E2E checks passed before verifier round";
}

function parseVerificationArtifacts(output) {
  const markdown = extractTaggedBlock(output, "verification_markdown");
  const jsonBlock = extractTaggedBlock(output, "verification_json");
  if (!markdown) {
    return { ok: false, issue: "Verifier output must include both <verification_json> and <verification_markdown> blocks" };
  }
  if (!jsonBlock) {
    return { ok: false, issue: "Verifier output did not contain a valid <verification_json> block" };
  }
  try {
    const report = parseVerificationReport(jsonBlock);
    return {
      ok: true,
      markdown,
      report: { ...report, checklist_source: "automated" },
      fixes: extractTaggedBlock(output, "verification_fixes_markdown"),
      recoverySlice: extractTaggedBlock(output, "recovery_slice_json"),
    };
  } catch (error) {
    return { ok: false, issue: `Verifier output contained <verification_json> but JSON is invalid: ${error.message ?? error}` };
  }
}

function parseVerificationReport(jsonBlock) {
  const value = JSON.parse(jsonBlock);
  const items = parseVerificationItems(value);
  if (!items) {
    throw new Error("verification report must contain verification items");
  }
  return {
    items,
    summary: typeof value?.summary === "string" ? value.summary : undefined,
    checklist_source: typeof value?.checklist_source === "string" ? value.checklist_source : undefined,
  };
}

function parseVerificationItems(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeVerificationItem(item, `V${index + 1}`));
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const key of ["items", "verification_items", "results", "checks"]) {
    if (Array.isArray(value[key])) {
      return value[key].map((item, index) => normalizeVerificationItem(item, `V${index + 1}`));
    }
    if (value[key] && typeof value[key] === "object") {
      return Object.entries(value[key]).map(([id, item]) => normalizeVerificationItem(item, id));
    }
  }
  const entries = Object.entries(value).filter(([key]) => !["summary", "checklist_source", "metadata", "notes", "overall_status"].includes(key));
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([id, item]) => normalizeVerificationItem(item, id));
}

function normalizeVerificationItem(item, fallbackId) {
  if (!item || typeof item !== "object") {
    throw new Error("verification item must be an object");
  }
  const status = String(item.status ?? "").toLowerCase();
  if (!PASSING_VERIFICATION_STATUSES.has(status) && !FAILING_VERIFICATION_STATUSES.has(status)) {
    throw new Error(`invalid verification item status '${item.status ?? ""}'`);
  }
  return {
    id: stringOr(item.id, fallbackId),
    description: stringOr(item.description, item.title, ""),
    status,
    detail: optionalString(item.detail),
    plan_ref: optionalString(item.plan_ref),
    evidence: optionalString(item.evidence),
    artifact_exists: optionalBoolean(item.artifact_exists),
    artifact_substantive: optionalBoolean(item.artifact_substantive),
    artifact_wired: optionalBoolean(item.artifact_wired),
  };
}

async function persistVerificationArtifacts(config, round, artifacts) {
  await writeStateFile(config, "verification.md", artifacts.markdown);
  await writeStateFile(config, "verification.json", `${JSON.stringify(artifacts.report, null, 2)}\n`);
  if (artifacts.recoverySlice) {
    await writeStateFile(config, "recovery-slice.json", `${artifacts.recoverySlice.trim()}\n`);
  }
  await appendVerificationProgress(config, round, verificationReportProgressSummary(artifacts.report));
}

async function writeVerificationFailure(config, round, artifacts) {
  const fixes = artifacts.fixes?.trim() || synthesizeVerificationFixes(artifacts.report);
  await writeStateFile(config, "verification-fixes.md", fixes);
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

async function writeDeterministicFailure(config, round, issues, existingFixes) {
  await writeStateFile(config, "verification-fixes.md", deterministicFixes(issues, existingFixes));
  await appendVerificationProgress(config, round, deterministicProgress(issues));
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

async function writeVerificationGateFailure(config, round, gate, artifacts) {
  const fixes = artifacts.fixes?.trim() || verificationGateFixes(gate.issues, artifacts.report);
  await writeStateFile(config, "verification-fixes.md", fixes);
  const progress = gate.missingGoals
    ? `Gate rejected: ${gate.issues[0]}`
    : verificationIssueProgressSummary("Gate rejected", gate.issues);
  await appendVerificationProgress(config, round, progress);
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

async function writeGateBVerificationGateFailure(config, round, gate, artifacts) {
  const fixes = artifacts.fixes?.trim() || verificationGateFixes(gate.issues, artifacts.report);
  await writeStateFile(config, "verification-fixes.md", fixes);
  await appendVerificationProgress(config, round, verificationIssueProgressSummary("Gate B rejected", gate.issues));
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

async function writeGateBStructuralFailure(config, round, issue) {
  await writeStateFile(config, "verification-fixes.md", structuralFixes(issue));
  await appendVerificationProgress(config, round, `Gate B structural failure: ${issue}`);
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

async function writeStructuralVerificationFailure(config, round, issue) {
  await writeStateFile(config, "verification-fixes.md", structuralFixes(issue));
  await appendVerificationProgress(config, round, `Structural failure: ${issue}`);
  await appendVerificationProgress(config, round, "Failed: verification failed after max rounds");
  await writeStatus({ status: "VERIFICATION_FAILED", round, reason: "Verification failed after max rounds", workflow: "verify" }, config);
}

function verificationReportPassed(report) {
  return report.items.length > 0 && report.items.every((item) => item.status === "passed");
}

function verificationReportProgressSummary(report) {
  const passed = report.items.filter((item) => item.status === "passed").length;
  const failed = report.items.filter((item) => item.status === "failed").length;
  const blocked = report.items.filter((item) => item.status === "blocked").length;
  const skipped = report.items.filter((item) => item.status === "skipped").length;
  const pending = report.items.filter((item) => item.status === "pending").length;
  const summary = [`Parsed report: ${report.items.length} item(s) (${passed} passed)`];
  if (failed || blocked || skipped || pending) {
    summary.push(`${failed} failed, ${blocked} blocked, ${skipped} skipped, ${pending} pending`);
  }
  if (report.summary) {
    summary.push(`Summary: ${report.summary}`);
  }
  return summary.join("\n");
}

function synthesizeVerificationFixes(report) {
  const failed = report.items.filter((item) => item.status !== "passed");
  const lines = ["# Verification Fixes Required", "", "## Failed/Blocked Items", ""];
  for (const item of failed) {
    const planRef = item.plan_ref ?? "(no plan_ref)";
    const detail = item.detail ?? item.description;
    lines.push(`- [${item.id}] ${planRef} - ${item.status}: ${detail}`);
  }
  return `${lines.join("\n")}\n`;
}

function structuralFixes(issue) {
  return `# Verification Fixes Required\n\n## Structural Issues\n\n- ${issue}\n`;
}

function verificationGateFixes(issues, report) {
  const lines = ["# Verification Fixes Required", "", "## Structural Issues", ""];
  for (const issue of issues) {
    lines.push(`- ${issue}`);
  }
  const failedItems = report.items.filter((item) => item.status === "failed" || item.status === "blocked");
  if (failedItems.length > 0) {
    lines.push("", "## Failed/Blocked Items", "");
    for (const item of failedItems) {
      lines.push(`- [${item.id}] ${item.plan_ref ?? "(no plan_ref)"} - ${item.status}: ${item.detail ?? item.description}`);
    }
  }
  lines.push("", "## Required Tagged Output Template", "", "```text", "<verification_markdown>", "# Verification Report", "- goal-1: passed|failed|blocked - evidence", "</verification_markdown>", "", "<verification_json>", "{\"items\":[{\"id\":\"V1\",\"plan_ref\":\"goal-1\",\"description\":\"what was verified\",\"status\":\"passed|failed|blocked\",\"evidence\":\"file:line or test name\",\"artifact_exists\":true,\"artifact_substantive\":true,\"artifact_wired\":true}],\"summary\":\"X of Y plan goals verified\"}", "</verification_json>", "```");
  return `${lines.join("\n")}\n`;
}

function deterministicFixes(issues, existingFixes) {
  const prefix = existingFixes?.trim() ? `${existingFixes.trim()}\n\n` : "# Verification Fixes Required\n\n";
  const sections = issues.map((issue) => `### [${issue.heading}]\n\n${issue.description.trim()}`).join("\n\n");
  return `${prefix}## Deterministic Failures\n\nThe following failures were detected by automated checks and must be resolved. These are independent of the LLM verifier and will block verification until fixed.\n\n${sections}\n`;
}

function deterministicProgress(issues) {
  const lines = [`Deterministic gate rejected: ${issues.length} issue(s)`];
  for (const issue of issues) {
    lines.push(`- [${issue.source}] ${issue.description.trim()}`);
  }
  return lines.join("\n");
}

function collectDeterministicIssues(config, { qualityOutcome, browserOutcome }) {
  const issues = [];
  if (qualityOutcome?.anyFailed) {
    issues.push({
      source: "QualityCheck",
      heading: "QUALITY CHECK",
      description: `Quality checks failed:\n${qualityOutcome.output.trim()}`,
    });
  }
  if (browserOutcome?.anyFailed && config.browserEvidencePolicy === "block") {
    issues.push({
      source: "BrowserTest",
      heading: "BROWSER/E2E CHECK",
      description: `Browser/E2E checks failed:\n${browserOutcome.output.trim()}`,
    });
  }
  return issues;
}

function countIssues(issues, source) {
  return issues.filter((issue) => issue.source === source).length;
}

function verificationSecondGateEnabled(config) {
  return config.mode !== "single-agent" && config.roles.verifier !== config.roles.implementer;
}

async function prepareCanonicalGoals(config, round) {
  const extracted = await loadOrRefreshAcceptanceGoals(config);
  if (!extracted) {
    await appendLog(config, "Could not extract canonical goals from plan.md or task.md - automated verify will fail closed");
    return { goals: undefined };
  }
  if (extracted.sourceWarning) {
    await appendLog(config, extracted.sourceWarning);
  }
  if (extracted.lintIssues.length > 0 && canonicalGoalLintShouldBlock(extracted.sourceKind)) {
    const lintSummary = extracted.lintIssues.slice(0, 3).join(" | ");
    const reason = `Canonical acceptance goals need revision before verification can continue: ${lintSummary}`;
    await appendLog(config, reason);
    await appendVerificationProgress(config, round, reason);
    await writeStatus({
      status: "NEEDS_REVISION",
      round,
      reason,
      failure_severity: "plan_revision_required",
      workflow: "verify",
    }, config);
    return { blocked: true };
  }
  if (extracted.lintIssues.length > 0) {
    await appendLog(config, `Inferred acceptance goals contain non-canonical detail, continuing because the goals came from heuristic extraction: ${extracted.lintIssues.slice(0, 3).join(" | ")}`);
  }
  return { goals: extracted.goals };
}

function validateVerificationCoverage(report, goals) {
  if (!goals || goals.length === 0) {
    return {
      passed: false,
      missingGoals: true,
      issues: ["Cannot verify plan coverage: no extractable goals found in plan.md or task.md"],
    };
  }

  const issues = [];
  const missingRefs = [];
  const aliasMap = new Map();
  const resolvedCoverage = new Map();
  for (const goal of goals) {
    for (const alias of goal.aliases) {
      const existing = aliasMap.get(alias) ?? [];
      aliasMap.set(alias, [...existing, goal.canonicalId]);
    }
  }

  for (const item of report.items) {
    collectItemShapeIssues(item, issues, missingRefs);
  }

  if (missingRefs.length === 0) {
    for (const item of report.items) {
      const matchingIds = resolvePlanRefToGoalIds(normalizeGoalAlias(item.plan_ref), aliasMap, goals);
      if (matchingIds.length === 0) {
        issues.push(`Item ${item.id} plan_ref '${item.plan_ref}' does not resolve to any canonical plan goal (fabricated ref)`);
      } else if (matchingIds.length === 1) {
        const current = resolvedCoverage.get(matchingIds[0]) ?? [];
        resolvedCoverage.set(matchingIds[0], [...current, item.id]);
      } else {
        issues.push(`Item ${item.id} plan_ref '${item.plan_ref}' resolves to multiple canonical goals: ${JSON.stringify(matchingIds)} (ambiguous)`);
      }
    }

    for (const [canonicalId, itemIds] of resolvedCoverage.entries()) {
      if (itemIds.length > 1) {
        const goal = goals.find((candidate) => candidate.canonicalId === canonicalId);
        issues.push(`Canonical goal '${canonicalId}' (${goal?.displayText ?? "?"}) is covered by multiple items: ${JSON.stringify(itemIds)} - each goal needs exactly one item`);
      }
    }

    for (const goal of goals) {
      if (!resolvedCoverage.has(goal.canonicalId)) {
        issues.push(`Canonical goal '${goal.canonicalId}' (${goal.displayText}) has no verification item covering it`);
      }
    }

    if (report.items.length > goals.length && issues.every((issue) => !issue.includes("fabricated"))) {
      const coveredCount = resolvedCoverage.size;
      if (coveredCount === goals.length) {
        issues.push(`Report has ${report.items.length} items but plan has ${goals.length} canonical goals - extra items may be invented goals`);
      }
    }
  }

  return { passed: issues.length === 0, missingGoals: false, issues };
}

function collectItemShapeIssues(item, issues, missingRefs) {
  if (item.status === "failed" || item.status === "blocked") {
    issues.push(`Item ${item.id} (${titleCaseStatus(item.status)}): ${item.description}`);
  }
  if (item.status === "pending" || item.status === "skipped") {
    issues.push(`Item ${item.id} has status ${titleCaseStatus(item.status)} - automated verify requires passed/failed/blocked`);
  }
  if (!item.plan_ref?.trim()) {
    issues.push(`Item ${item.id} is missing plan_ref`);
    missingRefs.push(item.id);
  }
  if (!item.evidence?.trim()) {
    issues.push(`Item ${item.id} is missing evidence`);
  }
  if (item.status === "passed") {
    const missingParts = [
      item.artifact_exists === false ? "exists" : undefined,
      item.artifact_substantive === false ? "substantive" : undefined,
      item.artifact_wired === false ? "wired" : undefined,
    ].filter(Boolean);
    if (missingParts.length > 0) {
      issues.push(`Item ${item.id} (Passed) has failed artifact checks: ${missingParts.join(", ")}`);
    }
  }
}

function resolvePlanRefToGoalIds(normalizedPlanRef, aliasMap, goals) {
  const exactMatches = aliasMap.get(normalizedPlanRef) ?? [];
  if (exactMatches.length > 0) {
    return uniqueValues(exactMatches).sort();
  }
  const fuzzyMatches = [];
  for (const goal of goals) {
    if (goal.aliases.some((alias) => alias && (normalizedPlanRef.startsWith(alias) || normalizedPlanRef.endsWith(alias)))) {
      fuzzyMatches.push(goal.canonicalId);
    }
  }
  return uniqueValues(fuzzyMatches).sort();
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function verificationIssueProgressSummary(prefix, issues) {
  const lines = [`${prefix}: ${issues.length} issue(s)`];
  for (const issue of issues.slice(0, 20)) {
    lines.push(`- ${issue.trim()}`);
  }
  if (issues.length > 20) {
    lines.push(`- ... ${issues.length - 20} more`);
  }
  return lines.join("\n");
}

function titleCaseStatus(status) {
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

async function applyBrowserEvidenceGate(config, browserOutcome, round) {
  const assessment = await browserEvidenceGateAssessment(config, browserOutcome);
  if (!assessment) {
    return false;
  }
  const summary = browserEvidenceGateSummary(assessment);
  await writeStateFile(config, BROWSER_EVIDENCE_GATE_FILENAME, browserEvidenceGateReport(config, assessment, "verification"));
  if (config.browserEvidencePolicy === "warn") {
    await appendLog(config, `Browser evidence gate warning before verification: ${summary}. See ${BROWSER_EVIDENCE_GATE_FILENAME}.`);
    await appendVerificationProgress(config, round, `WARN - browser evidence gate: ${summary}.`);
    return false;
  }

  const reason = `browser evidence gate paused before verification: ${summary}. See ${BROWSER_EVIDENCE_GATE_FILENAME}.`;
  await appendLog(config, `Paused: ${reason}`);
  await writeStatus({
    status: "AWAITING_INPUT",
    round,
    reason,
    failure_severity: "missing_feature",
    workflow: "verify",
  }, config);
  await appendVerificationProgress(config, round, `AWAITING_INPUT - browser evidence gate: ${summary}`);
  return true;
}

function verificationPrompt(config, { mode, resume, qualityOutcome, browserOutcome, canonicalGoalList }) {
  const paths = phasePaths(config);
  const independent = mode === "IndependentReviewer";
  const modeFraming = independent
    ? "You are an independent verifier. You did NOT write this code - evaluate it objectively against the plan."
    : "The verifier is not independent for this run. Use a fresh read of the plan, task, code, tests, and state artifacts; do not rely on memory.";
  const qualitySection = verificationCheckPromptSection(config, { qualityOutcome, browserOutcome });
  const canonicalGoalSection = canonicalGoalList
    ? `\n\nCanonical acceptance goals to cover exactly once:\n${canonicalGoalList}`
    : "";
  if (resume) {
    return `Continue re-verification using the plan, implementation, and code. Your previous attempt had structural issues or failed verification items documented in ${paths.verificationFixesMd}.\n\n${modeFraming}\n\nVerification is read-only. Produce evidence and remediation guidance only - do NOT edit code.\n\nRead prior verifier output from ${paths.verificationMd} and ${paths.verificationJson} when present. Repair and reuse it if useful, or start fresh if that is clearer.\n\nRead the plan from ${paths.planMd}. If it is missing or empty, fall back to the task/spec in ${paths.taskMd}. Read tasks from ${paths.tasksMd}, implementation progress from ${paths.implementProgressMd}, the latest review from ${paths.reviewMd}, and the codebase state.${canonicalGoalSection}${qualitySection}\n\nReturn tagged blocks exactly in this format:\n\n<verification_markdown>\n# Verification Report\n</verification_markdown>\n\n<verification_json>\n{"items":[{"id":"V1","plan_ref":"goal-1","description":"what was verified","status":"passed|failed|blocked","evidence":"file:line or test name","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"X of Y plan goals verified"}\n</verification_json>\n\nIf any items failed or are blocked, also include <verification_fixes_markdown>.`;
  }
  return `You are performing acceptance verification against the original plan.\n\n${modeFraming}\n\nVerification is read-only. Produce evidence and remediation guidance only - do NOT edit code.\n\nRead the plan from ${paths.planMd}. If it is missing or empty, fall back to the task/spec in ${paths.taskMd}. Read tasks from ${paths.tasksMd}, implementation progress from ${paths.implementProgressMd}, the latest review from ${paths.reviewMd}, and the codebase state.${canonicalGoalSection}${qualitySection}\n\nFor each plan goal, verify that required artifacts exist, are substantive, and are wired. Use only statuses: passed, failed, blocked.\n\nReturn tagged blocks exactly in this format:\n\n<verification_markdown>\n# Verification Report\n</verification_markdown>\n\n<verification_json>\n{"items":[{"id":"V1","plan_ref":"goal-1","description":"what was verified","status":"passed|failed|blocked","evidence":"file:line or test name","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"X of Y plan goals verified"}\n</verification_json>\n\nIf any items failed or are blocked, also include <verification_fixes_markdown>.`;
}

function verificationSecondGatePrompt(config, { canonicalGoalList }) {
  const paths = phasePaths(config);
  const canonicalGoalSection = canonicalGoalList
    ? `\n\nCanonical acceptance goals to cover exactly once:\n${canonicalGoalList}`
    : "";
  return `You are Gate B, the second-model verification gate. A first verifier report has already passed structural coverage, but you must re-verify from the repository state before the run can be accepted.\n\nYou may be the same agent that implemented the work. Counteract confirmation bias: do not rely on prior intent, memory, or the first verifier's conclusion. Re-read the plan, inspect the code, and verify concrete evidence.\n\nVerification is read-only. Produce evidence and remediation guidance only - do NOT edit code, propose patches, or make implementation changes.\n\nRead the plan from ${paths.planMd}. If it is missing or empty, fall back to the task/spec in ${paths.taskMd}. Read the prior verifier report from ${paths.verificationMd} and ${paths.verificationJson} as context only; do not copy it unless you independently confirm the evidence. Read tasks from ${paths.tasksMd}, implementation progress from ${paths.implementProgressMd}, the latest review from ${paths.reviewMd}, and the current codebase state.${canonicalGoalSection}\n\nFor each canonical goal, verify artifact existence, substance, and wiring when a code/config artifact applies. For operational, command-only, test-only, deployment, SSH, browser, or staging goals where no code artifact applies, set artifact fields to null and explain the operational evidence. If any goal is missing, incomplete, unwired, untested where tests are required, or not supported by concrete evidence, mark it failed or blocked.\n\nReturn tagged blocks exactly in this format:\n\n<verification_markdown>\n# Verification Report\n</verification_markdown>\n\n<verification_json>\n{"items":[{"id":"V1","plan_ref":"goal-1","description":"what was verified","status":"passed|failed|blocked","evidence":"file:line or test name or observation","detail":"optional extra context","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"X of Y plan goals verified by Gate B"}\n</verification_json>\n\nIf any items failed or are blocked, also include <verification_fixes_markdown>.`;
}

function verificationCheckPromptSection(config, { qualityOutcome, browserOutcome }) {
  const sections = [];
  if (!config.verifyAutoTest) {
    sections.push("IMPORTANT: Do NOT run tests or execute any test commands. Perform verification through code review and static analysis only.");
  }
  if (qualityOutcome) {
    const label = qualityOutcome.anyFailed ? "some failures detected" : "all passed";
    sections.push(`Quality check results (${label}):\n${qualityOutcome.output}`);
  }
  if (browserOutcome) {
    const label = browserOutcome.anyFailed ? "failures detected" : "all passed";
    sections.push(`Browser/E2E check results (${label}):\n${browserOutcome.output}`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

async function stateFileExists(config, fileName) {
  try {
    await stat(safeStatePath(config, fileName));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function phasePaths(config) {
  return {
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    planMd: displayPath(config, safeStatePath(config, "plan.md")),
    tasksMd: displayPath(config, safeStatePath(config, "tasks.md")),
    implementProgressMd: displayPath(config, safeStatePath(config, "implement-progress.md")),
    reviewMd: displayPath(config, safeStatePath(config, "review.md")),
    verificationMd: displayPath(config, safeStatePath(config, "verification.md")),
    verificationJson: displayPath(config, safeStatePath(config, "verification.json")),
    verificationFixesMd: displayPath(config, safeStatePath(config, "verification-fixes.md")),
  };
}

function verificationMode(config) {
  return config.mode !== "single-agent" && config.roles.verifier !== config.roles.implementer
    ? "IndependentReviewer"
    : "FreshContextSelfCheck";
}

function extractTaggedBlock(output, tag) {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = pattern.exec(output);
  const value = match?.[1]?.trim();
  return value || undefined;
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}

function stringOr(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function optionalString(value) {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

async function appendVerificationProgress(config, round, summary) {
  const existing = await readStateFile(config, "verification-progress.md");
  const heading = `## Round ${round}`;
  const prefix = existing.includes(`${heading}\n`) ? "" : `${heading}\n`;
  await appendStateFile(config, "verification-progress.md", `${prefix}${summary.trim()}\n`);
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}

async function persistGateBVerificationArtifacts(config, round, artifacts) {
  await writeStateFile(config, "verification.md", artifacts.markdown);
  await writeStateFile(config, "verification.json", `${JSON.stringify(artifacts.report, null, 2)}\n`);
  if (artifacts.recoverySlice) {
    await writeStateFile(config, "recovery-slice.json", `${artifacts.recoverySlice.trim()}\n`);
  }
  await appendVerificationProgress(config, round, `Gate B ${verificationReportProgressSummary(artifacts.report)}`);
}
