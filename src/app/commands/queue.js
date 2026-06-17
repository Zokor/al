import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import {
  addQueueItem,
  activateQueueItem,
  QueueStatus,
  readQueue,
  setQueueItemStatus,
  shortQueueId,
} from "../../state/queue.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { prepareQueueRunGoal } from "./queueRunState.js";

export async function runQueue(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  switch (cli.commandArgs.queueCommand) {
    case "add":
      return addQueue(cli, config, context);
    case "list":
      return listQueue(config, context);
    case "status":
      return statusQueue(config, context);
    case "pause":
      return mutateQueueItem(config, context, cli.commandArgs.queueId, QueueStatus.Deferred, "Deferred by user.", "deferred");
    case "resume":
      return resumeQueueItem(config, context, cli.commandArgs.queueId, { run: cli.commandArgs.run });
    case "cancel":
      return mutateQueueItem(config, context, cli.commandArgs.queueId, QueueStatus.Cancelled, "Cancelled by user.", "cancelled");
    default:
      throw new Error(`unsupported queue command: ${cli.commandArgs.queueCommand}`);
  }
}

async function addQueue(cli, config, context) {
  const { objective, sourceFile } = await resolveQueueObjective(config, cli.commandArgs);
  const item = await addQueueItem(config, {
    objective,
    sourceFile,
    priority: cli.commandArgs.priority,
    dependsOn: cli.commandArgs.dependsOn,
  });
  writeQueueItemOutput(context, config.jsonMode, item);
  return 0;
}

async function listQueue(config, context) {
  const queue = await readQueue(config);
  if (config.jsonMode) {
    context.stdout.write(`${JSON.stringify({ type: "queue", data: queue })}\n`);
    return 0;
  }
  if (queue.items.length === 0) {
    context.stdout.write("Queue is empty.\n");
    return 0;
  }
  for (const item of queue.items) {
    context.stdout.write(`${shortQueueId(item.queue_id)} [${item.status}] p${item.priority} ${item.title}\n`);
  }
  return 0;
}

async function statusQueue(config, context) {
  const queue = await readQueue(config);
  const active = queue.items.find((item) => [
    QueueStatus.Active,
    QueueStatus.Split,
    QueueStatus.Implementing,
    QueueStatus.Verifying,
    QueueStatus.Blocked,
    QueueStatus.Deferred,
  ].includes(item.status)) ?? null;
  const next = queue.items.find((item) => item.status === QueueStatus.Queued) ?? null;

  if (config.jsonMode) {
    context.stdout.write(`${JSON.stringify({ type: "queue_status", data: { active, next, queue } })}\n`);
    return 0;
  }
  context.stdout.write(active
    ? `Active: ${shortQueueId(active.queue_id)} [${active.status}] ${active.title}\n`
    : "Active: none\n");
  context.stdout.write(next
    ? `Next: ${shortQueueId(next.queue_id)} [${next.status}] ${next.title}\n`
    : "Next: none\n");
  return 0;
}

async function mutateQueueItem(config, context, queueId, status, reason, verb) {
  const item = await setQueueItemStatus(config, queueId, status, reason);
  writeMutationOutput(context, config.jsonMode, item, verb);
  return 0;
}

async function resumeQueueItem(config, context, queueId, { run = false } = {}) {
  const item = await setQueueItemStatus(config, queueId, QueueStatus.Queued);
  if (!item) {
    if (!config.jsonMode) {
      context.stdout.write(`Queue item not found: ${queueId}\n`);
    }
    return 1;
  }
  if (!config.jsonMode) {
    context.stdout.write(`Queue item runnable: ${shortQueueId(item.queue_id)} ${item.title}\n`);
  }
  if (run) {
    return prepareQueueRunAndReportUnsupported(config, context, item);
  }
  return 0;
}

async function prepareQueueRunAndReportUnsupported(config, context, item) {
  const activated = await activateQueueItem(config, item.queue_id);
  await prepareQueueRunGoal(config, activated);
  if (!config.jsonMode) {
    context.stdout.write(`Resuming queue item ${shortQueueId(activated.queue_id)}: ${activated.title}\n`);
  }
  return handleUnsupportedCommand("queue resume --run", context);
}

function writeQueueItemOutput(context, jsonMode, item) {
  if (jsonMode) {
    context.stdout.write(`${JSON.stringify({ type: "queue_item", data: item })}\n`);
    return;
  }
  context.stdout.write(`Queued ${shortQueueId(item.queue_id)}: ${item.title}\n`);
}

function writeMutationOutput(context, jsonMode, item, verb) {
  if (jsonMode) {
    context.stdout.write(`${JSON.stringify({ type: "queue_item", data: item })}\n`);
    return;
  }
  if (item) {
    context.stdout.write(`Queue item ${verb}: ${shortQueueId(item.queue_id)} ${item.title}\n`);
  } else {
    context.stdout.write("Queue item not found.\n");
  }
}

async function resolveQueueObjective(config, args) {
  const hasWords = args.objectiveWords.length > 0;
  const hasObjective = Boolean(args.objectiveText?.trim());
  const hasFile = args.file !== undefined;
  const sourceCount = Number(hasWords) + Number(hasObjective) + Number(hasFile);
  if (sourceCount !== 1) {
    throw new Error("Provide exactly one queue objective via text, --objective, or --file.");
  }

  if (args.file !== undefined) {
    try {
      return {
        objective: await readFile(resolve(config.projectDir, args.file), "utf8"),
        sourceFile: args.file,
      };
    } catch (error) {
      throw new Error(`Failed to read queue file ${args.file}: ${error.message}`);
    }
  }
  if (hasObjective) {
    return { objective: args.objectiveText, sourceFile: undefined };
  }
  return { objective: args.objectiveWords.join(" "), sourceFile: undefined };
}
