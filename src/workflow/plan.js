import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readStateFile, writeStateFile } from "../state/files.js";

export async function readTaskInput(projectDir, commandArgs, fallback = "") {
  if (commandArgs.file) {
    return readFile(resolve(projectDir, commandArgs.file), "utf8");
  }
  if (commandArgs.positional?.length) {
    return commandArgs.positional.join(" ");
  }
  return fallback;
}

export async function loadPlanForTasksPhase(config, commandArgs) {
  const plan = commandArgs.file
    ? await readFile(resolve(config.projectDir, commandArgs.file), "utf8")
    : await readStateFile(config, "plan.md");
  if (!plan.trim()) {
    throw new Error("No plan found. Run 'agent-loop plan' first.");
  }
  return plan;
}

export async function preserveOrDeriveTask(config, planContent) {
  const existing = await readStateFile(config, "task.md");
  if (existing.trim()) {
    return existing;
  }
  const derived = planContent.trim().slice(0, 500);
  await writeStateFile(config, "task.md", derived);
  return derived;
}
