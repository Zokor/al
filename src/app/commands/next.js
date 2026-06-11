import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { readStateFile } from "../../state/files.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function computeNextAction(config) {
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  if (workflow === "decompose") {
    return "implement";
  }
  if (workflow === "plan") {
    return "tasks";
  }
  const preferences = await fileExists(resolve(config.projectDir, ".agent-loop", "preferences.md"));
  if (preferences || config.nextSkipDiscuss) {
    return config.requirementsWorkflow === "spec" ? "spec" : "plan";
  }
  return "discuss";
}

export async function runNext(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const selected = await computeNextAction(config);
  if (["spec", "plan", "tasks"].includes(selected)) {
    context.stdout.write(`agent-loop ${selected}\n`);
    return 0;
  }
  return handleUnsupportedCommand(selected, context);
}
