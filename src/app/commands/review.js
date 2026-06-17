import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import { runAgentInvocation } from "../../agent/runtime.js";
import { loadConfig } from "../../config/index.js";
import { appendEvent } from "../../state/events.js";
import { appendStateFile, readJsonStateFile, safeStatePath, writeStateFile } from "../../state/files.js";
import { writeFindings } from "../../state/findings.js";
import { initializeWorkflowState, resetStateDir } from "../../state/initialization.js";
import { writeStatus } from "../../state/status.js";
import { runImplement } from "./implement.js";

const execFileAsync = promisify(execFile);
const DEFAULT_DIFF_MAX_LINES = 500;
const STALE_TIMESTAMP_REASON = "Reviewer exited without writing status.";

export async function runReview(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const contextText = await readReviewContext(context.cwd, cli.commandArgs);

  await resetStateDir(config);
  await initializeWorkflowState(config, { task: contextText, workflow: "review" });
  await appendEvent(config, { type: "command_started", data: { command: "review" } });
  await writeStateFile(config, "changes.md", await reviewChangesContent(config, cli.commandArgs));

  if (cli.commandArgs.plan) {
    await writeStateFile(config, "plan.md", await readReviewPlan(context.cwd, cli.commandArgs.plan));
  }

  let outcome = await runPrimaryReview(config, {
    focus: cli.commandArgs.context,
    runner: context.agentRunner,
  });

  if (outcome.kind === "approved") {
    context.stdout.write("No issues found.\n");
    return 0;
  }
  if (outcome.kind === "error") {
    context.stderr.write(`Review failed: ${outcome.reason}\n`);
    return 1;
  }

  if (config.mode !== "single-agent") {
    const adversarial = await runAdversarialReview(config, {
      focus: cli.commandArgs.context,
      previousFindings: outcome.findings,
      runner: context.agentRunner,
    });
    if (adversarial.kind === "approved") {
      context.stdout.write("No issues found.\n");
      return 0;
    }
    if (adversarial.kind === "error") {
      context.stderr.write(`Review failed: ${adversarial.reason}\n`);
      return 1;
    }
    outcome = adversarial;
  }

  await appendFindingsToTask(config, outcome.findings);
  await writeStateFile(config, "workflow.txt", "implement\n");
  writeHuman(config, context.stdout, "Confirmed findings - transitioning to implementation loop to fix issues.");
  return runImplement(
    {
      ...cli,
      command: "implement",
      commandArgs: {
        resume: true,
        singleAgent: cli.commandArgs.singleAgent,
        flags: {},
      },
    },
    context,
  );
}

async function readReviewContext(projectDir, commandArgs) {
  if (commandArgs.file) {
    try {
      return await readFile(resolve(projectDir, commandArgs.file), "utf8");
    } catch (error) {
      throw new Error(`Failed to read context file '${commandArgs.file}': ${error.message ?? error}`);
    }
  }
  return commandArgs.context ?? "";
}

async function readReviewPlan(projectDir, planPath) {
  try {
    return await readFile(resolve(projectDir, planPath), "utf8");
  } catch (error) {
    throw new Error(`Failed to read plan file '${planPath}': ${error.message ?? error}`);
  }
}

async function reviewChangesContent(config, commandArgs) {
  if ((commandArgs.files ?? []).length > 0) {
    const fileList = commandArgs.files.map((file) => `- ${file}`).join("\n");
    return `# Files to Review\n\n${fileList}\n\nRead each file listed above and review the code.`;
  }
  if (commandArgs.base) {
    const diff = await gitDiffAgainstRef(config, commandArgs.base);
    return `# Diff against \`${commandArgs.base}\`\n\n\`\`\`diff\n${diff}\n\`\`\``;
  }
  const diff = await gitDiffForReview(config);
  return `# Working tree changes\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

async function runPrimaryReview(config, { focus, runner }) {
  await appendLog(config, "Review Phase");
  const reviewing = await writeStatus(
    { status: "REVIEWING", round: 1, reason: "Standalone review in progress", workflow: "review" },
    config,
  );

  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: standaloneReviewPrompt(config, { focus, round: 1 }),
      },
      { runner },
    );
  } catch {
    await writeStatus({ status: "ERROR", round: 1, reason: "Primary reviewer failed", workflow: "review" }, config);
    return { kind: "error", reason: "Primary reviewer failed" };
  }

  const status = (await readJsonStateFile(config, "status.json")) ?? {};
  if (status.status === "REVIEWING" && status.timestamp === reviewing.timestamp) {
    await writeStatus({ status: "ERROR", round: 1, reason: STALE_TIMESTAMP_REASON, workflow: "review" }, config);
    return { kind: "error", reason: "Primary reviewer exited without writing status (protocol failure)" };
  }
  if (status.status === "ERROR") {
    return { kind: "error", reason: status.reason ?? "Primary reviewer failed" };
  }
  if (!["APPROVED", "NEEDS_CHANGES"].includes(status.status)) {
    await writeStatus({ status: "ERROR", round: 1, reason: "Reviewer did not write an APPROVED or NEEDS_CHANGES status.", workflow: "review" }, config);
    return { kind: "error", reason: "Reviewer did not write an APPROVED or NEEDS_CHANGES status." };
  }

  const findings = await reconcileReviewFindings(config, status);
  if (findings.findings.length === 0 && status.status === "APPROVED") {
    await writeStatus({ status: "APPROVED", round: 1, reason: "No findings from primary review.", workflow: "review" }, config);
    return { kind: "approved" };
  }

  if (status.status === "APPROVED") {
    await writeStatus(
      {
        status: "NEEDS_CHANGES",
        round: 1,
        reason: `Cannot approve with unresolved findings: ${findings.findings.map((finding) => finding.id).join(", ")}. See .agent-loop/state/findings.json.`,
        workflow: "review",
      },
      config,
    );
  }

  return { kind: "findings", findings };
}

async function runAdversarialReview(config, { focus, previousFindings, runner }) {
  const before = (await readJsonStateFile(config, "status.json")) ?? {};
  await appendLog(config, "Adversarial Review");

  try {
    await runAgentInvocation(
      {
        config,
        action: "review",
        slot: "reviewer",
        role: "reviewer",
        prompt: standaloneAdversarialReviewPrompt(config, { focus, round: 1, previousFindings }),
      },
      { runner },
    );
  } catch {
    await writeStatus({ status: "ERROR", round: 1, reason: "Adversarial reviewer failed", workflow: "review" }, config);
    return { kind: "error", reason: "Adversarial reviewer failed" };
  }

  const status = (await readJsonStateFile(config, "status.json")) ?? {};
  if (status.status !== "ERROR" && status.timestamp === before.timestamp && ["REVIEWING", "NEEDS_CHANGES"].includes(status.status)) {
    await writeStatus({ status: "ERROR", round: 1, reason: STALE_TIMESTAMP_REASON, workflow: "review" }, config);
    return { kind: "error", reason: "Adversarial reviewer exited without writing status (protocol failure)" };
  }
  if (status.status === "ERROR") {
    return { kind: "error", reason: status.reason ?? "Adversarial reviewer failed" };
  }
  if (!["APPROVED", "NEEDS_CHANGES"].includes(status.status)) {
    await writeStatus({ status: "ERROR", round: 1, reason: "Adversarial reviewer did not write an APPROVED or NEEDS_CHANGES status.", workflow: "review" }, config);
    return { kind: "error", reason: "Adversarial reviewer did not write an APPROVED or NEEDS_CHANGES status." };
  }

  const findings = await reconcileReviewFindings(config, status);
  if (findings.findings.length === 0 && status.status === "APPROVED") {
    await writeStatus({ status: "APPROVED", round: 1, reason: "All findings withdrawn after adversarial review.", workflow: "review" }, config);
    return { kind: "approved" };
  }

  if (status.status === "APPROVED") {
    await writeStatus(
      {
        status: "NEEDS_CHANGES",
        round: 1,
        reason: `Cannot approve with unresolved findings: ${findings.findings.map((finding) => finding.id).join(", ")}. See .agent-loop/state/findings.json.`,
        workflow: "review",
      },
      config,
    );
  }

  return { kind: "findings", findings };
}

async function reconcileReviewFindings(config, status) {
  const current = (await readJsonStateFile(config, "findings.json")) ?? { round: 1, findings: [] };
  let findings = normalizeFindings(current, 1);
  if (status.status === "NEEDS_CHANGES" && findings.findings.length === 0) {
    findings = {
      round: 1,
      findings: [
        {
          id: "F-001",
          severity: "MEDIUM",
          summary: nonEmptyString(status.reason) ?? "Reviewer requested changes but did not provide structured findings.",
          file_refs: [],
        },
      ],
    };
  }
  await writeFindings(findings, config);
  if (status.status === "NEEDS_CHANGES") {
    await writeStatus(
      {
        status: "NEEDS_CHANGES",
        round: 1,
        reason: `Open findings: ${findings.findings.map((finding) => finding.id).join(", ")}. See .agent-loop/state/findings.json.`,
        workflow: "review",
      },
      config,
    );
  }
  return findings;
}

function normalizeFindings(file, round) {
  const findings = Array.isArray(file.findings)
    ? file.findings.map((finding, index) => ({
        id: nonEmptyString(finding?.id) ?? `F-${String(index + 1).padStart(3, "0")}`,
        severity: nonEmptyString(finding?.severity) ?? "MEDIUM",
        summary: nonEmptyString(finding?.summary) ?? "Unspecified review finding.",
        file_refs: Array.isArray(finding?.file_refs) ? finding.file_refs.filter((ref) => typeof ref === "string") : [],
      }))
    : [];
  return { round, findings };
}

async function appendFindingsToTask(config, findingsFile) {
  await appendStateFile(config, "task.md", "\n\n# Review Findings to Fix\n\n");
  for (const finding of findingsFile.findings) {
    const refs = finding.file_refs.length > 0 ? ` (${finding.file_refs.join(", ")})` : "";
    await appendStateFile(config, "task.md", `- ${finding.id} [${finding.severity}] ${finding.summary}${refs}\n`);
  }
}

function standaloneReviewPrompt(config, { focus, round }) {
  const paths = phasePaths(config);
  const focusSection = focus?.trim() ? `\n\nFOCUS AREA: ${focus.trim()}` : "";
  return `You are performing a standalone code review.\n\nRead the diff or file list from ${paths.changesMd}. Read the actual source files to understand the full context.\nIf available, read the task context from ${paths.taskMd} and the plan from ${paths.planMd}.${focusSection}\n\nEvaluate the code for:\n- Correctness and logic errors\n- Edge cases and error handling\n- Security vulnerabilities\n- Code style and maintainability\n- Test coverage gaps\n- Plan alignment: missing or partially implemented plan goals are hard NEEDS_CHANGES blockers, not advisory notes\n\nWrite review to ${paths.reviewMd} and findings to ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "<current timestamp>"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "<current timestamp>"}`;
}

function standaloneAdversarialReviewPrompt(config, { focus, round, previousFindings }) {
  const paths = phasePaths(config);
  const focusSection = focus?.trim() ? `\n\nFOCUS AREA: ${focus.trim()}` : "";
  return `You are performing adversarial validation of a standalone code review.\n\nRead the primary review in ${paths.reviewMd} and the structured findings in ${paths.findingsJson}. Read the diff or file list from ${paths.changesMd}, then inspect the actual source files.\nIf available, read the task context from ${paths.taskMd} and the plan from ${paths.planMd}.${focusSection}\n\nPrimary findings to validate:\n${findingsForPrompt(previousFindings)}\n\nValidate only whether the primary findings are real, actionable, and worth fixing. Withdraw findings that are incorrect, unsupported, duplicate, or merely stylistic.\n\nWrite adversarial review to ${paths.reviewMd} and update findings in ${paths.findingsJson}.\nAPPROVED: {"round": ${round}, "findings": []}\nCHANGES NEEDED: {"round": ${round}, "findings": [{"id": "F-001", "severity": "HIGH", "summary": "...", "file_refs": ["file:line"]}]}\n\nWrite to ${paths.statusJson}:\nAPPROVED: {"status": "APPROVED", "round": ${round}, "timestamp": "<current timestamp>"}\nCHANGES NEEDED: {"status": "NEEDS_CHANGES", "round": ${round}, "reason": "brief summary", "timestamp": "<current timestamp>"}`;
}

function findingsForPrompt(findingsFile) {
  const findings = findingsFile?.findings ?? [];
  if (findings.length === 0) {
    return "- No structured findings were provided.";
  }
  return findings.map((finding) => {
    const refs = finding.file_refs.length > 0 ? ` (${finding.file_refs.join(", ")})` : "";
    return `- ${finding.id} [${finding.severity}] ${finding.summary}${refs}`;
  }).join("\n");
}

function phasePaths(config) {
  return {
    changesMd: displayPath(config, safeStatePath(config, "changes.md")),
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    planMd: displayPath(config, safeStatePath(config, "plan.md")),
    reviewMd: displayPath(config, safeStatePath(config, "review.md")),
    findingsJson: displayPath(config, safeStatePath(config, "findings.json")),
    statusJson: displayPath(config, safeStatePath(config, "status.json")),
  };
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}

async function gitDiffForReview(config) {
  if (!(await isGitRepo(config.projectDir))) {
    return "(no diff available - not a git repo)";
  }

  const head = await gitRevParseHead(config.projectDir);
  if (head) {
    const headDiff = await successfulGitStdout(config.projectDir, ["diff", "HEAD", "--"]);
    const combined = combineDiffs(headDiff, await untrackedFilesDiff(config.projectDir));
    if (combined) {
      return truncateDiff(combined, config.diffMaxLines ?? DEFAULT_DIFF_MAX_LINES);
    }
  }

  const combined = combineDiffs(
    await successfulGitStdout(config.projectDir, ["diff", "--cached", "--"]),
    await successfulGitStdout(config.projectDir, ["diff", "--"]),
    await untrackedFilesDiff(config.projectDir),
  );
  return combined ? truncateDiff(combined, config.diffMaxLines ?? DEFAULT_DIFF_MAX_LINES) : "(no diff available)";
}

async function gitDiffAgainstRef(config, baseRef) {
  if (!(await isGitRepo(config.projectDir))) {
    return "(no diff available - not a git repo)";
  }
  const combined = combineDiffs(
    await successfulGitStdout(config.projectDir, ["diff", baseRef, "--"]),
    await untrackedFilesDiff(config.projectDir),
  );
  return combined ? truncateDiff(combined, config.diffMaxLines ?? DEFAULT_DIFF_MAX_LINES) : "(no diff available)";
}

async function isGitRepo(cwd) {
  const output = await gitOutput(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return output?.status === 0;
}

async function gitRevParseHead(cwd) {
  return nonEmptyString(await successfulGitStdout(cwd, ["rev-parse", "HEAD"]));
}

async function successfulGitStdout(cwd, args) {
  const output = await gitOutput(cwd, args);
  return output?.status === 0 ? output.stdout.trim() : "";
}

async function untrackedFilesDiff(cwd) {
  const list = await successfulGitStdout(cwd, ["ls-files", "--others", "--exclude-standard"]);
  const patches = [];
  for (const file of list.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const output = await gitOutput(cwd, ["diff", "--no-index", "--", "/dev/null", file]);
    if (output && [0, 1].includes(output.status) && output.stdout.trim()) {
      patches.push(output.stdout.trim());
    }
  }
  return patches.join("\n");
}

async function gitOutput(cwd, args) {
  try {
    const output = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return { status: 0, stdout: output.stdout, stderr: output.stderr };
  } catch (error) {
    if (typeof error.code === "number") {
      return { status: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    return null;
  }
}

function combineDiffs(...parts) {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n");
}

function truncateDiff(diff, maxLines) {
  const lines = diff.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return diff;
  }
  return `${lines.slice(0, maxLines).join("\n")}\n\n... [diff truncated at ~${maxLines} lines - ${lines.length} total] ...`;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function writeHuman(config, stdout, message) {
  if (!config.jsonMode) {
    stdout.write(`${message}\n`);
  }
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}
