import { createGoal, GoalStatus, readGoal } from "../../state/goal.js";
import { shortQueueId } from "../../state/queue.js";

export async function prepareQueueRunGoal(config, item) {
  const existingGoal = await readGoal(config);
  if (existingGoal?.status === GoalStatus.Active && existingGoal.objective !== item.objective) {
    throw new Error(
      `State error: Active goal already exists: "${existingGoal.objective}". Pause, clear, or complete it before running queue item ${shortQueueId(item.queue_id)}.`,
    );
  }
  return createGoal(config, item.objective, item.source_file, true);
}
