import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { safeStatePath, writeStateFile } from "./files.js";

const PLAN_PENDING_APPROVAL_FILENAME = "plan-pending-approval.flag";
const LEGACY_DECISION_RESPONSE_FILENAME = "decision_response.json";

export async function initializeDecisions(config) {
  const decisionsPath = resolve(config.projectDir, ".agent-loop", "decisions.md");
  if (!config.decisionsEnabled) {
    return;
  }
  await mkdir(resolve(config.projectDir, ".agent-loop"), { recursive: true });
  try {
    await writeFile(decisionsPath, "# Decisions\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

export async function readPendingPlanApproval(config) {
  let raw;
  try {
    raw = await readFile(safeStatePath(config, PLAN_PENDING_APPROVAL_FILENAME), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  let marker;
  try {
    marker = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid ${PLAN_PENDING_APPROVAL_FILENAME}: ${error.message}`);
  }
  validatePlanApprovalMarker(marker);
  return marker;
}

export async function writePlanApprovalResponse(config, { chosen, reason }) {
  if (!["approve", "reject"].includes(chosen)) {
    throw new Error("approval response must be approve or reject");
  }
  const marker = await readPendingPlanApproval(config);
  if (!marker) {
    throw new Error("no pending plan approval found");
  }
  const response = decisionResponse(config, {
    decisionId: marker.decision_id,
    chosen,
    reason,
  });
  const body = `${JSON.stringify(response, null, 2)}\n`;
  await writeStateFile(config, `decisions/${marker.decision_id}/response.json`, body);
  await writeStateFile(config, LEGACY_DECISION_RESPONSE_FILENAME, body);
  return { marker, response };
}

function validatePlanApprovalMarker(marker) {
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    throw new Error(`invalid ${PLAN_PENDING_APPROVAL_FILENAME}: expected object`);
  }
  for (const field of ["decision_id", "phase", "artifact_path", "created_at"]) {
    if (typeof marker[field] !== "string" || !marker[field].trim()) {
      throw new Error(`invalid ${PLAN_PENDING_APPROVAL_FILENAME}: missing ${field}`);
    }
  }
}

function decisionResponse(config, { decisionId, chosen, reason }) {
  const trimmedReason = reason?.trim() || null;
  return {
    decision_id: decisionId,
    chosen,
    reason: trimmedReason,
    free_text: trimmedReason,
    chosen_at: (config.now ? config.now() : new Date()).toISOString(),
    responder: "cli",
  };
}
