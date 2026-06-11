import { appendEvent } from "./events.js";
import { writeMergedJsonFile } from "./json.js";

export const STATUS_KNOWN_FIELDS = [
  "status",
  "round",
  "implementer",
  "reviewer",
  "planner",
  "verifier",
  "active_role",
  "active_agent",
  "mode",
  "lastRunTask",
  "reason",
  "failure_severity",
  "timestamp",
];

export function summarizeTask(task) {
  const lines = String(task ?? "").split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      const heading = line.match(/^\s*#+\s+(.+?)\s*$/);
      if (heading) {
        return heading[1].trim().slice(0, 500);
      }
    }
  }
  return String(task ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function writeStatus(patch, config) {
  const now = config.now ? config.now() : new Date();
  const known = {
    status: patch.status ?? "PENDING",
    round: patch.round ?? 0,
    implementer: patch.implementer ?? config.roles.implementer,
    reviewer: patch.reviewer ?? config.roles.reviewer,
    planner: patch.planner ?? config.roles.planner,
    verifier: patch.verifier ?? config.roles.verifier,
    active_role: patch.active_role,
    active_agent: patch.active_agent,
    mode: patch.mode ?? config.mode,
    lastRunTask: patch.lastRunTask ? summarizeTask(patch.lastRunTask) : patch.lastRunTask,
    reason: patch.reason ?? "Initialized",
    failure_severity: patch.failure_severity,
    timestamp: patch.timestamp ?? now.toISOString(),
  };
  const merged = await writeMergedJsonFile(config, "status.json", known, STATUS_KNOWN_FIELDS);
  await appendEvent(config, {
    type: "status_changed",
    data: {
      status: merged.status,
      reason: merged.reason,
      workflow: patch.workflow,
    },
  });
  if (["COMPLETED", "VERIFIED", "VERIFICATION_FAILED", "ERROR", "MAX_ROUNDS"].includes(merged.status)) {
    await appendEvent(config, {
      type: "workflow_verdict",
      data: {
        verdict: merged.status,
        reason: merged.reason,
        round: merged.round,
        failure_severity: merged.failure_severity,
      },
    });
  }
  return merged;
}
