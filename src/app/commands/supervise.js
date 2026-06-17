import { loadConfig } from "../../config/index.js";
import { hasResumableState } from "../../state/resumeState.js";
import { activateNextQueueItem, shortQueueId } from "../../state/queue.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { prepareQueueRunGoal } from "./queueRunState.js";

export async function runSupervise(cli, context) {
  const args = cli.commandArgs;
  if (!args.queue) {
    return handleUnsupportedCommand("supervise", context);
  }
  if (args.task !== undefined || args.file !== undefined || args.resume) {
    throw new Error("`agent-loop supervise --queue` cannot be combined with task text, --file, or --resume.");
  }

  const config = await loadConfig(context.cwd, cli, context);
  const item = await activateNextQueueItem(config);
  if (!item) {
    if (!config.jsonMode) {
      context.stdout.write("Queue is empty; add work with `agent-loop queue add <objective>`.\n");
    }
    return 1;
  }

  await prepareQueueRunGoal(config, item);
  const verb = await hasResumableState(config) ? "Resuming" : "Running";
  if (!config.jsonMode) {
    context.stdout.write(`${verb} queue item ${shortQueueId(item.queue_id)}: ${item.title}\n`);
  }
  return handleUnsupportedCommand("supervise --queue", context);
}
