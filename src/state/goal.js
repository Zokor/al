import { access, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { readStateFile, removeStateFile, safeStatePath, writeStateFile } from "./files.js";

export const DEFAULT_GOAL_PHASES = Object.freeze(["spec", "plan", "tasks", "implement", "verify"]);
export const GoalStatus = Object.freeze({
  Active: "active",
  Paused: "paused",
  BudgetLimited: "budget_limited",
  Complete: "complete",
});

const GOAL_SCHEMA_VERSION = 1;
const GOAL_FILENAME = "goal.json";
const GOAL_LOCK_FILENAME = "goal.lock";

export async function readGoal(config) {
  const text = await readStateFile(config, GOAL_FILENAME);
  if (!text.trim()) {
    return null;
  }
  const value = JSON.parse(text);
  const schemaVersion = value?.schema_version;
  if (schemaVersion === undefined) {
    throw new Error("goal.json missing schema_version");
  }
  if (schemaVersion !== GOAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported goal.json schema_version ${schemaVersion}; expected ${GOAL_SCHEMA_VERSION}`);
  }
  return value;
}

export async function setGoalStatus(config, status, reason) {
  await touchGoalLock(config);
  const goal = await readGoal(config);
  if (!goal) {
    return null;
  }
  const updated = {
    ...goal,
    status,
    updated_at: timestamp(config),
  };
  if (reason === undefined || reason === null) {
    delete updated.reason;
  } else {
    updated.reason = reason;
  }
  await writeGoal(config, updated);
  return updated;
}

export async function clearGoal(config) {
  await touchGoalLock(config);
  const existed = await goalFileExists(config);
  await removeStateFile(config, GOAL_FILENAME);
  return existed;
}

export async function writeGoal(config, goal) {
  const normalized = normalizeGoal(goal);
  await writeStateFile(config, GOAL_FILENAME, `${JSON.stringify(normalized, null, 2)}\n`);
}

function normalizeGoal(goal) {
  const normalized = {
    schema_version: GOAL_SCHEMA_VERSION,
    goal_id: goal.goal_id,
    objective: goal.objective,
    status: goal.status,
    phases: Array.isArray(goal.phases) ? goal.phases : [...DEFAULT_GOAL_PHASES],
    created_at: goal.created_at,
    updated_at: goal.updated_at,
  };
  if (goal.source_file !== undefined && goal.source_file !== null) {
    normalized.source_file = goal.source_file;
  }
  if (goal.reason !== undefined && goal.reason !== null) {
    normalized.reason = goal.reason;
  }
  return normalized;
}

async function goalFileExists(config) {
  try {
    await access(safeStatePath(config, GOAL_FILENAME));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function touchGoalLock(config) {
  const path = safeStatePath(config, GOAL_LOCK_FILENAME);
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "a");
  await file.close();
}

function timestamp(config) {
  return (config.now ? config.now() : new Date()).toISOString();
}
