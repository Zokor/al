import { mkdir, rm } from "node:fs/promises";
import { appendEvent, ensureEventStream } from "./events.js";
import { initializeDecisions } from "./decisions.js";
import { writeStateFile } from "./files.js";
import { writeFindings } from "./findings.js";
import { summarizeTask, writeStatus } from "./status.js";

const STALE_ARTIFACTS = [
  "quality_checks.md",
  "acceptance-goals.json",
  "discovery.md",
  "debugger-diagnosis.md",
  "spec.md",
  "spec-progress.md",
  "clarifications.json",
  "verification.md",
  "verification.json",
  "verification-fixes.md",
  "verification-recovery.json",
  "goal-task-map.json",
  "recovery-slice.json",
  "verification-progress.md",
  "tasks.md",
  "tasks-progress.md",
  "tasks_findings.json",
];

export async function resetStateDir(config) {
  await rm(config.stateDir, { recursive: true, force: true });
  await mkdir(config.stateDir, { recursive: true });
}

export async function initializeWorkflowState(config, { task, workflow }) {
  await mkdir(config.stateDir, { recursive: true });
  await initializeDecisions(config);
  for (const fileName of STALE_ARTIFACTS) {
    await rm(`${config.stateDir}/${fileName}`, { force: true, recursive: true });
  }
  await ensureEventStream(config);
  await writeStateFile(config, "original-request.md", task);
  await writeStateFile(config, "task.md", task);
  await writeStateFile(config, "plan.md", "");
  await writeStateFile(config, "review.md", "");
  await writeStateFile(config, "conversation.md", "");
  await writeStateFile(config, "workflow.txt", `${workflow}\n`);
  await writeStateFile(config, "log.txt", `Agent loop initialized\nTask: ${summarizeTask(task)}\nMode: ${config.mode}\n`);
  await writeFindings({ round: 0, findings: [] }, config);
  await appendEvent(config, { type: "transcript_history_complete", data: {} });
  await writeStatus({ status: "PENDING", round: 0, lastRunTask: task, workflow }, config);
}
