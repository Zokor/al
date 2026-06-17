import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readStateFile, writeStateFile } from "../state/files.js";

export async function readTaskInput(projectDir, commandArgs, fallback) {
  if (commandArgs.file) {
    const content = await readTaskFile(projectDir, commandArgs.file);
    return requireTaskContent(content, `Config error: Task file '${commandArgs.file}' is empty.`);
  }
  if (commandArgs.positional?.length) {
    return requireTaskContent(commandArgs.positional.join(" "), "Config error: Task cannot be empty.");
  }
  if (fallback !== undefined) {
    return requireTaskContent(fallback, "Config error: Task cannot be empty.");
  }
  throw new Error("Config error: Task is required. Provide task text or --file <path>.");
}

async function readTaskFile(projectDir, file) {
  try {
    return await readFile(resolve(projectDir, file), "utf8");
  } catch (error) {
    throw new Error(`Config error: Failed to read task file '${file}': ${error.message ?? error}`);
  }
}

function requireTaskContent(content, message) {
  if (!content.trim()) {
    throw new Error(message);
  }
  return content;
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
