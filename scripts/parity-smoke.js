#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = resolve(import.meta.dirname, "..");
const defaultNodeBin = resolve(packageDir, "bin/agent-loop.js");
const defaultRustBin = await resolveDefaultRustBin();
const DYNAMIC_JSON_KEYS = new Set(["chosen_at", "created_at", "timestamp", "ts", "updated_at"]);
const QUEUE_ADD_SHORT_ID_PATTERN = /Queued [0-9a-f]{8}:/g;
const TOO_LONG_SESSION_NAME = "a".repeat(65);
const INIT_CONFIG_FILE_PAIR = Object.freeze({
  label: "canonical config",
  rust: ".agent-loop.toml",
  node: ".agent-loop.json",
});
const INIT_CONFIG_NORMALIZE = Object.freeze({
  outputReplacements: [
    [/\.agent-loop\.(?:toml|json)/g, ".agent-loop.<config>"],
    [/Error: .*\/\.agent-loop\.<config> already exists/g, "Error: <project>/.agent-loop.<config> already exists"],
  ],
});

export const PARITY_SCENARIOS = Object.freeze([
  {
    name: "version",
    args: ["--version"],
  },
  {
    name: "json-version",
    args: ["--json", "--version"],
  },
  {
    name: "init-empty",
    args: ["init"],
    filePairs: [INIT_CONFIG_FILE_PAIR],
    normalize: INIT_CONFIG_NORMALIZE,
  },
  {
    name: "json-init-empty",
    args: ["--json", "init"],
    filePairs: [INIT_CONFIG_FILE_PAIR],
    normalize: INIT_CONFIG_NORMALIZE,
  },
  {
    name: "init-existing-config",
    args: ["init"],
    filePairs: [INIT_CONFIG_FILE_PAIR],
    normalize: INIT_CONFIG_NORMALIZE,
    prepare: prepareExistingInitConfigs,
  },
  {
    name: "init-force-existing-config",
    args: ["init", "--force"],
    filePairs: [INIT_CONFIG_FILE_PAIR],
    normalize: INIT_CONFIG_NORMALIZE,
    prepare: prepareExistingInitConfigs,
  },
  {
    name: "completions-missing-shell",
    args: ["completions"],
  },
  {
    name: "completions-invalid-shell",
    args: ["completions", "nope"],
  },
  {
    name: "completions-extra-argument",
    args: ["completions", "bash", "extra"],
  },
  {
    name: "json-completions-invalid-shell",
    args: ["--json", "completions", "nope"],
  },
  {
    name: "global-requirements-workflow-invalid",
    args: ["--requirements-workflow", "bogus", "status"],
  },
  {
    name: "global-requirements-workflow-missing",
    args: ["--requirements-workflow"],
  },
  {
    name: "global-session-missing",
    args: ["--session"],
  },
  {
    name: "global-implementer-missing",
    args: ["--implementer"],
  },
  {
    name: "global-reviewer-missing",
    args: ["--reviewer"],
  },
  {
    name: "global-plan-approval-conflict",
    args: ["--require-plan-approval", "--no-plan-approval", "status"],
  },
  {
    name: "global-simple-unexpected-value",
    args: ["--simple=true", "status"],
  },
  {
    name: "global-unknown-leading-option",
    args: ["--wat"],
  },
  {
    name: "json-global-requirements-workflow-invalid",
    args: ["--json", "--requirements-workflow", "bogus", "status"],
  },
  {
    name: "global-plan-model-missing",
    args: ["--plan-model"],
  },
  {
    name: "global-plan-effort-missing",
    args: ["--plan-effort"],
  },
  {
    name: "global-plan-effort-invalid",
    args: ["--plan-effort", "wild", "status"],
  },
  {
    name: "global-action-model-missing",
    args: ["--action-model"],
  },
  {
    name: "global-action-model-invalid-shape",
    args: ["--action-model", "plan", "status"],
  },
  {
    name: "global-action-model-unknown-action",
    args: ["--action-model", "bogus=x", "status"],
  },
  {
    name: "global-action-effort-missing",
    args: ["--action-effort"],
  },
  {
    name: "global-action-effort-invalid-shape",
    args: ["--action-effort", "review", "status"],
  },
  {
    name: "global-action-effort-invalid-effort",
    args: ["--action-effort", "review=wild", "status"],
  },
  {
    name: "global-action-effort-unknown-action",
    args: ["--action-effort", "bogus=high", "status"],
  },
  {
    name: "json-global-plan-effort-invalid",
    args: ["--json", "--plan-effort", "wild", "status"],
  },
  {
    name: "command-unknown",
    args: ["wat"],
  },
  {
    name: "json-command-unknown",
    args: ["--json", "wat"],
  },
  {
    name: "command-status-extra",
    args: ["status", "extra"],
  },
  {
    name: "json-command-status-extra",
    args: ["--json", "status", "extra"],
  },
  {
    name: "command-plan-file-missing",
    args: ["plan", "--file"],
  },
  {
    name: "command-review-files-missing",
    args: ["review", "--files"],
  },
  {
    name: "command-queue-unknown-subcommand",
    args: ["queue", "wat"],
  },
  {
    name: "command-approve-missing-phase",
    args: ["approve"],
  },
  {
    name: "json-command-approve-missing-phase",
    args: ["--json", "approve"],
  },
  {
    name: "command-reject-missing-phase",
    args: ["reject", "--reason", "needs scope"],
  },
  {
    name: "command-reject-missing-reason",
    args: ["reject", "plan"],
  },
  {
    name: "command-reject-missing-requireds",
    args: ["reject"],
  },
  {
    name: "command-pipeline-required-phases",
    args: ["pipeline", "--task", "ship it"],
  },
  {
    name: "json-command-pipeline-required-phases",
    args: ["--json", "pipeline", "--task", "ship it"],
  },
  {
    name: "command-init-force-inline-value",
    args: ["init", "--force=true"],
  },
  {
    name: "json-command-init-force-inline-value",
    args: ["--json", "init", "--force=true"],
  },
  {
    name: "command-resume-dry-run-inline-value",
    args: ["resume", "--dry-run=true"],
  },
  {
    name: "command-reset-wave-lock-inline-value",
    args: ["reset", "--wave-lock=true"],
  },
  {
    name: "command-verify-manual-inline-value",
    args: ["verify", "--manual=true"],
  },
  {
    name: "command-plan-resume-inline-value",
    args: ["plan", "--resume=true"],
  },
  {
    name: "command-implement-per-task-inline-value",
    args: ["implement", "--per-task=true"],
  },
  {
    name: "command-review-single-agent-inline-value",
    args: ["review", "--single-agent=true"],
  },
  {
    name: "command-goal-run-inline-value",
    args: ["goal", "resume", "--run=true"],
  },
  {
    name: "command-queue-run-inline-value",
    args: ["queue", "resume", "queue-id", "--run=true"],
  },
  {
    name: "command-implement-task-file-conflict",
    args: ["implement", "--task", "a", "--file", "b.md"],
  },
  {
    name: "json-command-implement-task-file-conflict",
    args: ["--json", "implement", "--task", "a", "--file", "b.md"],
  },
  {
    name: "command-implement-resume-task-conflict",
    args: ["implement", "--resume", "--task", "a"],
  },
  {
    name: "command-implement-wave-per-task-conflict",
    args: ["implement", "--wave", "--per-task"],
  },
  {
    name: "command-implement-continue-failfast-conflict",
    args: ["implement", "--continue-on-fail", "--fail-fast"],
  },
  {
    name: "command-pipeline-wave-per-task-conflict",
    args: ["pipeline", "--phases", "plan,implement", "--wave", "--per-task"],
  },
  {
    name: "command-review-files-base-conflict",
    args: ["review", "--files", "a.js", "--base", "main"],
  },
  {
    name: "command-implement-max-retries-invalid",
    args: ["implement", "--max-retries", "abc"],
  },
  {
    name: "json-command-implement-max-retries-invalid",
    args: ["--json", "implement", "--max-retries", "abc"],
  },
  {
    name: "command-implement-round-step-invalid",
    args: ["implement", "--round-step", "abc"],
  },
  {
    name: "command-implement-round-step-zero",
    args: ["implement", "--round-step", "0"],
  },
  {
    name: "command-implement-max-parallel-invalid",
    args: ["implement", "--max-parallel", "abc"],
  },
  {
    name: "command-implement-max-parallel-zero",
    args: ["implement", "--max-parallel", "0"],
  },
  {
    name: "command-pipeline-max-parallel-invalid",
    args: ["pipeline", "--phases", "plan,implement", "--max-parallel", "abc"],
  },
  {
    name: "command-pipeline-max-parallel-zero",
    args: ["pipeline", "--phases", "plan,implement", "--max-parallel", "0"],
  },
  {
    name: "command-goal-max-retries-invalid",
    args: ["goal", "--max-retries", "abc", "task"],
  },
  {
    name: "command-queue-priority-invalid",
    args: ["queue", "add", "--priority", "abc", "task"],
  },
  {
    name: "list-agents",
    args: ["list-agents"],
  },
  {
    name: "json-list-agents",
    args: ["--json", "list-agents"],
  },
  {
    name: "status-uninitialized",
    args: ["status"],
  },
  {
    name: "json-status-uninitialized",
    args: ["--json", "status"],
  },
  {
    name: "status-initialized-plan",
    args: ["status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "PENDING",
        round: 2,
        timestamp: "2026-01-01T00:00:00Z",
        lastRunTask: "Ship status parity",
      })}\n`);
    },
  },
  {
    name: "json-status-initialized-plan",
    args: ["--json", "status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "PENDING",
        round: 2,
        timestamp: "2026-01-01T00:00:00Z",
        lastRunTask: "Ship status parity",
      })}\n`);
    },
  },
  {
    name: "status-session-initialized-plan",
    args: ["--session", "demo", "status"],
    stateFiles: [".agent-loop/state/demo/status.json"],
    prepare: prepareSessionStatus,
  },
  {
    name: "json-status-session-initialized-plan",
    args: ["--json", "--session", "demo", "status"],
    stateFiles: [".agent-loop/state/demo/status.json"],
    prepare: prepareSessionStatus,
  },
  {
    name: "status-empty-session-name",
    args: ["--session", "", "status"],
  },
  {
    name: "status-invalid-session-name",
    args: ["--session", "../bad", "status"],
  },
  {
    name: "status-too-long-session-name",
    args: ["--session", TOO_LONG_SESSION_NAME, "status"],
  },
  {
    name: "json-status-invalid-session-name",
    args: ["--json", "--session", "../bad", "status"],
  },
  {
    name: "json-status-empty-file",
    args: ["--json", "status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", "");
    },
  },
  {
    name: "next-complete",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "verify\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "VERIFIED", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "json-next-complete",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "verify\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "VERIFIED", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "next-error",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "implement\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ERROR", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "json-next-error",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "implement\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ERROR", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "next-awaiting-plan-approval",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "AWAITING_INPUT", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/plan-pending-approval.flag", `${JSON.stringify({
        decision_id: "decision-plan",
        phase: "plan",
        artifact_path: "/tmp/plan.md",
        created_at: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "json-next-awaiting-plan-approval",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "AWAITING_INPUT", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/plan-pending-approval.flag", `${JSON.stringify({
        decision_id: "decision-plan",
        phase: "plan",
        artifact_path: "/tmp/plan.md",
        created_at: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "spec-missing-task",
    args: ["spec"],
  },
  {
    name: "plan-missing-task",
    args: ["plan"],
  },
  {
    name: "plan-empty-file",
    args: ["plan", "--file", "empty.md"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, "empty.md", " \n");
    },
  },
  {
    name: "implement-empty-state",
    args: ["implement"],
  },
  {
    name: "implement-verify-empty-state",
    args: ["implement-verify"],
  },
  {
    name: "resume-dry-run-empty",
    args: ["resume", "--dry-run"],
  },
  {
    name: "json-resume-dry-run-empty",
    args: ["--json", "resume", "--dry-run"],
  },
  {
    name: "resume-empty",
    args: ["resume"],
  },
  {
    name: "json-resume-empty",
    args: ["--json", "resume"],
  },
  {
    name: "resume-active-goal-complete",
    args: ["resume"],
    stateFiles: [".agent-loop/state/goal.json"],
    prepare: prepareActiveGoalCompleteResume,
  },
  {
    name: "json-resume-active-queue-complete",
    args: ["--json", "resume"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal-queue.json",
    ],
    prepare: prepareActiveQueueCompleteResume,
  },
  {
    name: "resume-active-queue-error",
    args: ["resume"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal-queue.json",
    ],
    prepare: prepareActiveQueueErrorResume,
  },
  {
    name: "resume-interrupted-missing-workflow",
    args: ["resume"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "INTERRUPTED",
        round: 1,
        timestamp: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "json-resume-interrupted-missing-workflow",
    args: ["--json", "resume"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "INTERRUPTED",
        round: 1,
        timestamp: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "resume-dry-run-pipeline-no-status",
    args: ["resume", "--dry-run"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/pipeline.json", `${JSON.stringify({
        schema_version: 1,
        phases: "plan,implement",
        discover: true,
      })}\n`);
    },
  },
  {
    name: "resume-dry-run-deferred-queue",
    args: ["resume", "--dry-run"],
    prepare: prepareDeferredQueueResume,
  },
  {
    name: "json-resume-dry-run-deferred-queue",
    args: ["--json", "resume", "--dry-run"],
    prepare: prepareDeferredQueueResume,
  },
  {
    name: "reset-empty",
    args: ["reset"],
  },
  {
    name: "json-reset-empty",
    args: ["--json", "reset"],
  },
  {
    name: "reset-seeded-state",
    args: ["reset"],
    stateFiles: [
      ".agent-loop/decisions.md",
      ".agent-loop/wave-progress.jsonl",
      ".agent-loop/state/status.json",
      ".agent-loop/state/session-a/status.json",
      ".agent-loop/state/.wave-task-1/status.json",
      ".agent-loop/state/history/event.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/decisions.md", "keep\n");
      await writeProjectFile(projectDir, ".agent-loop/wave-progress.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/session-a/status.json", `${JSON.stringify({ status: "SESSION" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/.wave-task-1/status.json", `${JSON.stringify({ status: "TASK" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/history/event.json", "{}\n");
    },
  },
  {
    name: "reset-session-state",
    args: ["--session", "alpha", "reset"],
    stateFiles: [
      ".agent-loop/wave-progress-alpha.jsonl",
      ".agent-loop/wave-progress.jsonl",
      ".agent-loop/state/status.json",
      ".agent-loop/state/alpha/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave-progress-alpha.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/wave-progress.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ROOT" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/alpha/status.json", `${JSON.stringify({ status: "SESSION" })}\n`);
    },
  },
  {
    name: "reset-wave-lock-missing",
    args: ["reset", "--wave-lock"],
  },
  {
    name: "reset-wave-lock-present",
    args: ["reset", "--wave-lock"],
    stateFiles: [
      ".agent-loop/wave.lock",
      ".agent-loop/state/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave.lock", "locked\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
    },
  },
  {
    name: "json-reset-wave-lock-present",
    args: ["--json", "reset", "--wave-lock"],
    stateFiles: [
      ".agent-loop/wave.lock",
      ".agent-loop/state/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave.lock", "locked\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
    },
  },
  {
    name: "analyze-coverage-complete",
    args: ["analyze-coverage"],
    prepare: prepareAnalyzeCoverageComplete,
  },
  {
    name: "json-analyze-coverage-complete",
    args: ["--json", "analyze-coverage"],
    prepare: prepareAnalyzeCoverageComplete,
  },
  {
    name: "analyze-coverage-missing-spec",
    args: ["analyze-coverage"],
  },
  {
    name: "analyze-coverage-missing-tasks",
    args: ["analyze-coverage"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/spec.md", "- REQ-001: Export data\n");
    },
  },
  {
    name: "analyze-coverage-incomplete",
    args: ["analyze-coverage"],
    prepare: prepareAnalyzeCoverageIncomplete,
  },
  {
    name: "json-analyze-coverage-incomplete",
    args: ["--json", "analyze-coverage"],
    prepare: prepareAnalyzeCoverageIncomplete,
  },
  {
    name: "approve-plan",
    args: ["approve", "plan"],
    stateFiles: [
      ".agent-loop/state/decisions/decision-approve/response.json",
      ".agent-loop/state/decision_response.json",
    ],
    prepare: (projectDir) => preparePendingPlanApproval(projectDir, "decision-approve"),
  },
  {
    name: "json-approve-plan",
    args: ["--json", "approve", "plan"],
    stateFiles: [
      ".agent-loop/state/decisions/decision-json-approve/response.json",
      ".agent-loop/state/decision_response.json",
    ],
    prepare: (projectDir) => preparePendingPlanApproval(projectDir, "decision-json-approve"),
  },
  {
    name: "reject-plan",
    args: ["reject", "plan", "--reason", "needs scope cut"],
    stateFiles: [
      ".agent-loop/state/decisions/decision-reject/response.json",
      ".agent-loop/state/decision_response.json",
    ],
    prepare: (projectDir) => preparePendingPlanApproval(projectDir, "decision-reject"),
  },
  {
    name: "json-reject-plan",
    args: ["--json", "reject", "plan", "--reason", "needs scope cut"],
    stateFiles: [
      ".agent-loop/state/decisions/decision-json-reject/response.json",
      ".agent-loop/state/decision_response.json",
    ],
    prepare: (projectDir) => preparePendingPlanApproval(projectDir, "decision-json-reject"),
  },
  {
    name: "goal-status-empty",
    args: ["goal", "status"],
  },
  {
    name: "goal-status-seeded",
    args: ["goal", "status"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/status.json",
    ],
    prepare: prepareSeededGoalStatus,
  },
  {
    name: "json-goal-status-seeded",
    args: ["--json", "goal", "status"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/status.json",
    ],
    prepare: prepareSeededGoalStatus,
  },
  {
    name: "goal-resume-seeded",
    args: ["goal", "resume"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal.lock",
    ],
    prepare: prepareSeededGoalPaused,
  },
  {
    name: "json-goal-resume-seeded",
    args: ["--json", "goal", "resume"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal.lock",
    ],
    prepare: prepareSeededGoalPaused,
  },
  {
    name: "goal-clear-seeded",
    args: ["goal", "clear"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal.lock",
    ],
    prepare: prepareSeededGoalActive,
  },
  {
    name: "json-goal-clear-seeded",
    args: ["--json", "goal", "clear"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal.lock",
    ],
    prepare: prepareSeededGoalActive,
  },
  {
    name: "queue-status-empty",
    args: ["queue", "status"],
  },
  {
    name: "queue-add",
    args: ["queue", "add", "--priority", "2", "--depends-on", "dep-a, dep-b", "Ship queue add"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    normalize: {
      dynamicJsonKeys: ["queue_id"],
      outputReplacements: [[QUEUE_ADD_SHORT_ID_PATTERN, "Queued <queue-id>:"]],
    },
  },
  {
    name: "json-queue-add",
    args: ["--json", "queue", "add", "--priority", "2", "--depends-on", "dep-a, dep-b", "Ship queue add"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    normalize: {
      dynamicJsonKeys: ["queue_id"],
    },
  },
  {
    name: "queue-list-seeded",
    args: ["queue", "list"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueList,
  },
  {
    name: "json-queue-list-seeded",
    args: ["--json", "queue", "list"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueList,
  },
  {
    name: "queue-status-seeded",
    args: ["queue", "status"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueStatus,
  },
  {
    name: "json-queue-status-seeded",
    args: ["--json", "queue", "status"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueStatus,
  },
  {
    name: "queue-pause-seeded",
    args: ["queue", "pause", "queued-pause-item"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueuePause,
  },
  {
    name: "json-queue-pause-seeded",
    args: ["--json", "queue", "pause", "queued-pause-item"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueuePause,
  },
  {
    name: "queue-resume-seeded",
    args: ["queue", "resume", "deferred-resume-item"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueResume,
  },
  {
    name: "queue-cancel-seeded",
    args: ["queue", "cancel", "queued-cancel-item"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueCancel,
  },
  {
    name: "json-queue-cancel-seeded",
    args: ["--json", "queue", "cancel", "queued-cancel-item"],
    stateFiles: [".agent-loop/state/goal-queue.json"],
    prepare: prepareSeededQueueCancel,
  },
  {
    name: "supervise-queue-empty",
    args: ["supervise", "--queue"],
  },
  {
    name: "inline-missing-task",
    args: ["inline"],
  },
  {
    name: "chain-missing-file",
    args: ["chain", "missing.md"],
  },
  {
    name: "json-goal-status-empty",
    args: ["--json", "goal", "status"],
  },
  {
    name: "json-queue-status-empty",
    args: ["--json", "queue", "status"],
  },
  {
    name: "goal-pause-state",
    args: ["goal", "pause"],
    stateFiles: [
      ".agent-loop/state/goal.json",
      ".agent-loop/state/goal.lock",
    ],
    prepare: prepareSeededGoalActive,
  },
]);

async function preparePendingPlanApproval(projectDir, decisionId) {
  await writeProjectFile(projectDir, ".agent-loop/state/plan-pending-approval.flag", `${JSON.stringify({
    decision_id: decisionId,
    phase: "plan",
    artifact_path: ".agent-loop/state/plan.md",
    created_at: "2026-01-01T00:00:00.000Z",
  })}\n`);
}

async function prepareSessionStatus(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/demo/workflow.txt", "plan\n");
  await writeProjectFile(projectDir, ".agent-loop/state/demo/status.json", `${JSON.stringify({
    status: "PENDING",
    round: 2,
    timestamp: "2026-01-01T00:00:00Z",
    lastRunTask: "Session status parity",
  })}\n`);
}

async function prepareExistingInitConfigs(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop.toml", "implementer = \"codex\"\n");
  await writeProjectFile(projectDir, ".agent-loop.json", `${JSON.stringify({ implementer: "codex" })}\n`);
}

async function prepareAnalyzeCoverageComplete(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/spec.md", "- REQ-002: Keep logs\n- REQ-001: Export data\n");
  await writeProjectFile(projectDir, ".agent-loop/state/tasks.md", "## Task 1\nCovers REQ-001 and REQ-002.\n");
}

async function prepareAnalyzeCoverageIncomplete(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/spec.md", "- REQ-001: Export data\n- REQ-002: Keep audit logs\n");
  await writeProjectFile(projectDir, ".agent-loop/state/tasks.md", "## Task 1\nCovers REQ-001.\n\n## Task 2\nRefactor internal helpers.\n");
}

async function prepareSeededGoalStatus(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal.json", `${JSON.stringify({
    schema_version: 1,
    goal_id: "goal-demo",
    objective: "Ship seeded goal",
    status: "paused",
    source_file: "goal.md",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    reason: "Paused by user.",
  })}\n`);
  await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
    status: "INTERRUPTED",
    round: 2,
    lastRunTask: "Ship seeded goal",
    timestamp: "2026-01-01T00:00:00.000Z",
  })}\n`);
}

async function prepareSeededGoalActive(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal.json", `${JSON.stringify({
    schema_version: 1,
    goal_id: "goal-demo",
    objective: "Ship seeded goal",
    status: "active",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  })}\n`);
}

async function prepareSeededGoalPaused(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal.json", `${JSON.stringify({
    schema_version: 1,
    goal_id: "goal-demo",
    objective: "Ship seeded goal",
    status: "paused",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    reason: "Paused by user.",
  })}\n`);
}

async function prepareDeferredQueueResume(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [{
      queue_id: "deferred-queue-item",
      title: "Deferred queue item",
      objective: "Deferred queue objective",
      status: "deferred",
      priority: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reason: "Deferred by user.",
    }],
  })}\n`);
}

async function prepareSeededQueueList(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [
      {
        queue_id: "listed-first-item",
        title: "Listed first item",
        objective: "Listed first objective",
        status: "queued",
        priority: 5,
        depends_on: ["finished-item"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        queue_id: "listed-second-item",
        title: "Listed second item",
        objective: "Listed second objective",
        status: "deferred",
        priority: -1,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        reason: "Waiting.",
      },
    ],
  })}\n`);
}

async function prepareSeededQueueStatus(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [
      {
        queue_id: "active-status-item",
        title: "Active status item",
        objective: "Active status objective",
        status: "active",
        priority: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        queue_id: "queued-status-item",
        title: "Queued status item",
        objective: "Queued status objective",
        status: "queued",
        priority: 2,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  })}\n`);
}

async function prepareSeededQueuePause(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [{
      queue_id: "queued-pause-item",
      title: "Queued pause item",
      objective: "Queued pause objective",
      status: "queued",
      priority: 3,
      active_slice_id: "slice-to-clear",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
  })}\n`);
}

async function prepareSeededQueueResume(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [{
      queue_id: "deferred-resume-item",
      title: "Deferred resume item",
      objective: "Deferred resume objective",
      status: "deferred",
      priority: 4,
      active_slice_id: "slice-to-clear",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      reason: "Deferred by user.",
    }],
  })}\n`);
}

async function prepareSeededQueueCancel(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [{
      queue_id: "queued-cancel-item",
      title: "Queued cancel item",
      objective: "Queued cancel objective",
      status: "queued",
      priority: 6,
      active_slice_id: "slice-to-clear",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
  })}\n`);
}

async function prepareActiveGoalCompleteResume(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal.json", `${JSON.stringify({
    schema_version: 1,
    goal_id: "active-goal",
    objective: "Active goal objective",
    status: "active",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  })}\n`);
  await prepareCompleteResume(projectDir);
}

async function prepareActiveQueueCompleteResume(projectDir) {
  await prepareActiveQueueGoalAndQueue(projectDir);
  await prepareCompleteResume(projectDir);
}

async function prepareActiveQueueErrorResume(projectDir) {
  await prepareActiveQueueGoalAndQueue(projectDir);
  await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "implement\n");
  await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
    status: "ERROR",
    round: 1,
    timestamp: "2026-01-01T00:00:00Z",
  })}\n`);
}

async function prepareCompleteResume(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "verify\n");
  await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
    status: "VERIFIED",
    round: 1,
    timestamp: "2026-01-01T00:00:00Z",
  })}\n`);
}

async function prepareActiveQueueGoalAndQueue(projectDir) {
  await writeProjectFile(projectDir, ".agent-loop/state/goal.json", `${JSON.stringify({
    schema_version: 1,
    goal_id: "active-goal",
    objective: "Active queue objective",
    status: "active",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  })}\n`);
  await writeProjectFile(projectDir, ".agent-loop/state/goal-queue.json", `${JSON.stringify({
    schema_version: 1,
    items: [{
      queue_id: "active-queue-item",
      title: "Active queue item",
      objective: "Active queue objective",
      status: "active",
      priority: 1,
      active_slice_id: "slice-a",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
  })}\n`);
}

export function normalizeOutput(text, options = {}) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^elapsed:\s/i.test(line))
    .map((line) => applyOutputReplacements(line, options))
    .map((line) => canonicalizeJsonLine(line, options))
    .join("\n")
    .trim();
}

export function normalizeJsonContent(text, options = {}) {
  return `${JSON.stringify(sortJsonValue(scrubDynamicJsonFields(JSON.parse(text), options)))}\n`;
}

export function scrubDynamicJsonFields(value, options = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => scrubDynamicJsonFields(item, options));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const dynamicKeys = new Set([...DYNAMIC_JSON_KEYS, ...(options.dynamicJsonKeys ?? [])]);
  const scrubbed = {};
  for (const [key, entry] of Object.entries(value)) {
    scrubbed[key] = dynamicKeys.has(key) ? `<${key}>` : scrubDynamicJsonFields(entry, options);
  }
  return scrubbed;
}

export function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

export async function runParitySmoke(options = {}) {
  const rustBin = options.rustBin ?? defaultRustBin;
  const nodeBin = options.nodeBin ?? defaultNodeBin;
  const scenarioNames = options.scenarioNames?.length ? new Set(options.scenarioNames) : null;
  const scenarios = scenarioNames
    ? PARITY_SCENARIOS.filter((scenario) => scenarioNames.has(scenario.name))
    : PARITY_SCENARIOS;

  if (scenarioNames && scenarios.length !== scenarioNames.size) {
    const known = new Set(PARITY_SCENARIOS.map((scenario) => scenario.name));
    const missing = [...scenarioNames].filter((name) => !known.has(name));
    throw new Error(`unknown parity scenario(s): ${missing.join(", ")}`);
  }

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, { rustBin, nodeBin, keepTemp: Boolean(options.keepTemp) }));
  }
  return results;
}

async function runScenario(scenario, { rustBin, nodeBin, keepTemp }) {
  const root = await mkdtemp(resolve(tmpdir(), "agent-loop-parity-"));
  const rustProject = resolve(root, "rust");
  const nodeProject = resolve(root, "node");
  await mkdir(rustProject, { recursive: true });
  await mkdir(nodeProject, { recursive: true });
  await scenario.prepare?.(rustProject);
  await scenario.prepare?.(nodeProject);

  try {
    const [rustRun, nodeRun] = await Promise.all([
      runCommand(rustBin, scenario.args, rustProject),
      runCommand(process.execPath, [nodeBin, ...scenario.args], nodeProject),
    ]);
    const checks = [
      compareValue("exit code", rustRun.code, nodeRun.code),
      compareValue("stdout", normalizeOutput(rustRun.stdout, scenario.normalize), normalizeOutput(nodeRun.stdout, scenario.normalize)),
      compareValue("stderr", normalizeOutput(rustRun.stderr, scenario.normalize), normalizeOutput(nodeRun.stderr, scenario.normalize)),
      ...(await compareStateFiles(scenario.stateFiles ?? [], rustProject, nodeProject, scenario.normalize)),
      ...(await compareFilePairs(scenario.filePairs ?? [], rustProject, nodeProject)),
    ];
    return {
      name: scenario.name,
      ok: checks.every((check) => check.ok),
      checks,
      tempDir: keepTemp ? root : undefined,
    };
  } finally {
    if (!keepTemp) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function compareStateFiles(stateFiles, rustProject, nodeProject, normalizeOptions) {
  const comparisons = [];
  for (const fileName of stateFiles) {
    const [rustContent, nodeContent] = await Promise.all([
      readProjectFile(rustProject, fileName),
      readProjectFile(nodeProject, fileName),
    ]);
    comparisons.push(compareValue(`state ${fileName}`, normalizeStateContent(rustContent, normalizeOptions), normalizeStateContent(nodeContent, normalizeOptions)));
  }
  return comparisons;
}

async function compareFilePairs(filePairs, rustProject, nodeProject) {
  const comparisons = [];
  for (const pair of filePairs) {
    const [rustContent, nodeContent] = await Promise.all([
      readProjectFile(rustProject, pair.rust),
      readProjectFile(nodeProject, pair.node),
    ]);
    const status = `rust:${rustContent === null ? "missing" : "present"};node:${nodeContent === null ? "missing" : "present"}`;
    comparisons.push(compareValue(`file ${pair.label}`, "rust:present;node:present", status));
  }
  return comparisons;
}

function normalizeStateContent(content, options = {}) {
  if (content === null) {
    return "<missing>";
  }
  try {
    return normalizeJsonContent(content, options);
  } catch {
    return normalizeOutput(content, options);
  }
}

function compareValue(label, rust, node) {
  return {
    label,
    ok: rust === node,
    rust,
    node,
  };
}

function canonicalizeJsonLine(line, options = {}) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return line;
  }
  try {
    return JSON.stringify(sortJsonValue(scrubDynamicJsonFields(JSON.parse(trimmed), options)));
  } catch {
    return line;
  }
}

function applyOutputReplacements(line, options = {}) {
  return (options.outputReplacements ?? []).reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    line,
  );
}

function runCommand(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function writeProjectFile(projectDir, fileName, content) {
  const path = resolve(projectDir, fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function readProjectFile(projectDir, fileName) {
  try {
    return await readFile(resolve(projectDir, fileName), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function resolveDefaultRustBin() {
  const envBin = process.env.AGENT_LOOP_RUST_BIN ?? process.env.RUST_AGENT_LOOP_BIN;
  if (envBin) {
    return envBin;
  }
  const cargoBin = "/Users/brunogomes/.cargo/bin/agent-loop";
  try {
    await access(cargoBin);
    return cargoBin;
  } catch {
    return "agent-loop";
  }
}

function parseArgs(argv) {
  const options = {
    scenarioNames: [],
    keepTemp: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--list") {
      options.list = true;
      continue;
    }
    if (token === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }
    if (token === "--rust-bin" || token === "--node-bin" || token === "--scenario") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${token}`);
      }
      index += 1;
      if (token === "--rust-bin") {
        options.rustBin = value;
      } else if (token === "--node-bin") {
        options.nodeBin = value;
      } else {
        options.scenarioNames.push(...value.split(",").map((name) => name.trim()).filter(Boolean));
      }
      continue;
    }
    throw new Error(`unknown argument '${token}'`);
  }
  return options;
}

function printResults(results) {
  for (const result of results) {
    const marker = result.ok ? "PASS" : "FAIL";
    console.log(`${marker} ${result.name}`);
    for (const check of result.checks) {
      if (check.ok) {
        continue;
      }
      console.log(`  ${check.label}`);
      console.log(`    rust: ${JSON.stringify(check.rust)}`);
      console.log(`    node: ${JSON.stringify(check.node)}`);
    }
    if (result.tempDir) {
      console.log(`  temp: ${result.tempDir}`);
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.list) {
    for (const scenario of PARITY_SCENARIOS) {
      console.log(scenario.name);
    }
    return 0;
  }
  const results = await runParitySmoke(options);
  printResults(results);
  return results.every((result) => result.ok) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}
