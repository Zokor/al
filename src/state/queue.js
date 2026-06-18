import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { readStateFile, safeStatePath, writeStateFile } from "./files.js";

export const QueueStatus = Object.freeze({
  Queued: "queued",
  Active: "active",
  Split: "split",
  Implementing: "implementing",
  Verifying: "verifying",
  Blocked: "blocked",
  Done: "done",
  Deferred: "deferred",
  Cancelled: "cancelled",
});

const QUEUE_SCHEMA_VERSION = 1;
const QUEUE_FILENAME = "goal-queue.json";
const QUEUE_LOCK_FILENAME = "goal-queue.lock";
const TERMINAL_STATUSES = new Set([QueueStatus.Done, QueueStatus.Cancelled]);
const CLEAR_ACTIVE_SLICE_STATUSES = new Set([QueueStatus.Queued, QueueStatus.Deferred, QueueStatus.Cancelled]);
const ACTIVE_RUN_STATUSES = new Set([QueueStatus.Active, QueueStatus.Split, QueueStatus.Implementing, QueueStatus.Verifying]);

export async function readQueue(config) {
  const text = await readStateFile(config, QUEUE_FILENAME);
  if (!text.trim()) {
    return { schema_version: QUEUE_SCHEMA_VERSION, items: [] };
  }
  const value = JSON.parse(text);
  const schemaVersion = value?.schema_version;
  if (schemaVersion === undefined) {
    throw new Error("goal-queue.json missing schema_version");
  }
  if (schemaVersion !== QUEUE_SCHEMA_VERSION) {
    throw new Error(`Unsupported goal-queue.json schema_version ${schemaVersion}; expected ${QUEUE_SCHEMA_VERSION}`);
  }
  return {
    schema_version: QUEUE_SCHEMA_VERSION,
    items: Array.isArray(value.items) ? value.items : [],
  };
}

export async function addQueueItem(config, { objective, sourceFile, priority = 0, dependsOn = [] }) {
  const trimmedObjective = objective.trim();
  if (!trimmedObjective) {
    throw new Error("Queue objective cannot be empty.");
  }

  await touchQueueLock(config);
  const queue = await readQueue(config);
  const now = timestamp(config);
  const item = normalizeQueueItem({
    queue_id: randomUUID(),
    title: titleForQueueItem(trimmedObjective, sourceFile),
    source_file: sourceFile,
    objective: trimmedObjective,
    status: QueueStatus.Queued,
    priority,
    depends_on: normalizeDependencies(dependsOn),
    created_at: now,
    updated_at: now,
  });
  queue.items.push(item);
  await writeQueue(config, queue);
  return item;
}

export async function setQueueItemStatus(config, queueId, status, reason) {
  await touchQueueLock(config);
  const queue = await readQueue(config);
  const index = queue.items.findIndex((item) => item.queue_id === queueId);
  if (index === -1) {
    return null;
  }

  const existing = queue.items[index];
  if (TERMINAL_STATUSES.has(existing.status) && status !== existing.status) {
    throw new Error(`State error: Queue item ${queueId} is ${existing.status}; terminal items cannot be changed.`);
  }

  const updated = {
    ...existing,
    status,
    updated_at: timestamp(config),
  };
  if (reason === undefined || reason === null) {
    delete updated.reason;
  } else {
    updated.reason = reason;
  }
  if (CLEAR_ACTIVE_SLICE_STATUSES.has(status)) {
    delete updated.active_slice_id;
  }
  queue.items[index] = normalizeQueueItem(updated);
  await writeQueue(config, queue);
  return queue.items[index];
}

export async function activateQueueItem(config, queueId) {
  await touchQueueLock(config);
  const queue = await readQueue(config);
  const targetIndex = queue.items.findIndex((item) => item.queue_id === queueId);
  if (targetIndex === -1) {
    throw new Error(`State error: Queue item not found: ${queueId}`);
  }

  return activateQueueItemAtIndex(config, queue, targetIndex);
}

export async function activateNextQueueItem(config) {
  await touchQueueLock(config);
  const queue = await readQueue(config);
  const activeIndex = queue.items.findIndex((item) => ACTIVE_RUN_STATUSES.has(item.status));
  const targetIndex = activeIndex === -1 ? nextEligibleIndex(queue) : activeIndex;
  if (targetIndex === -1) {
    return null;
  }
  return activateQueueItemAtIndex(config, queue, targetIndex);
}

export async function finalizeQueueRunFromGoalStatus(config, queueId, { goalStatus, reason, exitCode }) {
  await touchQueueLock(config);
  const queue = await readQueue(config);
  const index = queue.items.findIndex((item) => item.queue_id === queueId);
  if (index === -1) {
    return null;
  }
  const existing = queue.items[index];
  if (TERMINAL_STATUSES.has(existing.status)) {
    return existing;
  }

  const { status, reason: finalReason } = finalQueueState(goalStatus, reason, exitCode);
  const updated = {
    ...existing,
    status,
    reason: finalReason,
    updated_at: timestamp(config),
  };
  if ([QueueStatus.Done, QueueStatus.Deferred, QueueStatus.Cancelled].includes(status)) {
    delete updated.active_slice_id;
  }
  queue.items[index] = normalizeQueueItem(updated);
  await writeQueue(config, queue);
  return queue.items[index];
}

async function activateQueueItemAtIndex(config, queue, targetIndex) {
  const target = queue.items[targetIndex];
  if (TERMINAL_STATUSES.has(target.status)) {
    throw new Error(`State error: Queue item ${target.queue_id} is ${target.status}; terminal items cannot be activated.`);
  }
  const now = timestamp(config);
  queue.items = queue.items.map((item, index) => {
    if (index === targetIndex) {
      const activated = {
        ...item,
        status: QueueStatus.Active,
        updated_at: now,
      };
      delete activated.reason;
      return normalizeQueueItem(activated);
    }
    if (ACTIVE_RUN_STATUSES.has(item.status)) {
      return normalizeQueueItem({
        ...item,
        status: QueueStatus.Deferred,
        reason: "Deferred because another queue item was activated.",
        updated_at: now,
      });
    }
    return normalizeQueueItem(item);
  });
  await writeQueue(config, queue);
  return queue.items[targetIndex];
}

function nextEligibleIndex(queue) {
  const doneIds = new Set(queue.items.filter((item) => item.status === QueueStatus.Done).map((item) => item.queue_id));
  let bestIndex = -1;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const [index, item] of queue.items.entries()) {
    if (item.status !== QueueStatus.Queued) {
      continue;
    }
    if ((item.depends_on ?? []).some((dependency) => !doneIds.has(dependency))) {
      continue;
    }
    if (item.priority > bestPriority) {
      bestPriority = item.priority;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function finalQueueState(goalStatus, reason, exitCode) {
  if (goalStatus === "complete" || (goalStatus === "active" && exitCode === 0) || (!goalStatus && exitCode === 0)) {
    return { status: QueueStatus.Done, reason: "Queue item completed." };
  }
  if (goalStatus === "paused") {
    return { status: QueueStatus.Deferred, reason: reason ?? "Queue item paused." };
  }
  if (goalStatus === "budget_limited") {
    return { status: QueueStatus.Blocked, reason: reason ?? "Goal budget limit reached." };
  }
  return {
    status: QueueStatus.Blocked,
    reason: reason ?? `Queue run exited with code ${exitCode}.`,
  };
}

export async function writeQueue(config, queue) {
  const normalized = {
    schema_version: QUEUE_SCHEMA_VERSION,
    items: (queue.items ?? []).map(normalizeQueueItem),
  };
  await writeStateFile(config, QUEUE_FILENAME, `${JSON.stringify(normalized, null, 2)}\n`);
}

export function shortQueueId(queueId) {
  return String(queueId ?? "").slice(0, 8);
}

function normalizeQueueItem(item) {
  const normalized = {
    queue_id: item.queue_id,
    title: item.title,
    objective: item.objective,
    status: item.status,
    priority: item.priority,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
  if (item.source_file !== undefined && item.source_file !== null) {
    normalized.source_file = item.source_file;
  }
  if ((item.depends_on ?? []).length > 0) {
    normalized.depends_on = item.depends_on;
  }
  if (item.active_slice_id !== undefined && item.active_slice_id !== null) {
    normalized.active_slice_id = item.active_slice_id;
  }
  if ((item.slice_ids ?? []).length > 0) {
    normalized.slice_ids = item.slice_ids;
  }
  if (item.last_run_id !== undefined && item.last_run_id !== null) {
    normalized.last_run_id = item.last_run_id;
  }
  if (item.reason !== undefined && item.reason !== null) {
    normalized.reason = item.reason;
  }
  return normalized;
}

function titleForQueueItem(objective, sourceFile) {
  const heading = String(objective)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"))
    ?.replace(/^#+/, "")
    .trim();
  if (heading) {
    return truncateTitle(heading);
  }
  if (sourceFile) {
    const name = basename(sourceFile);
    const stem = name.slice(0, name.length - extname(name).length).trim();
    if (stem) {
      return truncateTitle(stem.replaceAll("-", " "));
    }
  }
  const firstLine = String(objective)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "Queued objective";
  return truncateTitle(firstLine);
}

function truncateTitle(value) {
  const chars = Array.from(value.trim());
  if (chars.length <= 96) {
    return chars.join("");
  }
  return `${chars.slice(0, 93).join("")}...`;
}

function normalizeDependencies(dependsOn) {
  const seen = new Set();
  const normalized = [];
  for (const value of dependsOn) {
    for (const rawPart of String(value).split(",")) {
      const part = rawPart.trim();
      if (part && !seen.has(part)) {
        seen.add(part);
        normalized.push(part);
      }
    }
  }
  return normalized;
}

async function touchQueueLock(config) {
  const path = safeStatePath(config, QUEUE_LOCK_FILENAME);
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "a");
  await file.close();
}

function timestamp(config) {
  return (config.now ? config.now() : new Date()).toISOString();
}
