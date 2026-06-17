import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { runAgentInvocation } from "../../agent/runtime.js";
import { loadConfig } from "../../config/index.js";
import { resolveRuntimeQualityCommands } from "../../config/qualityCommands.js";
import { appendEvent } from "../../state/events.js";
import { safeStatePath, writeStateFile } from "../../state/files.js";
import { writeStatus } from "../../state/status.js";
import { assertNoActiveWaveLock } from "../../state/waveLock.js";
import { runCheckCommands } from "../checkCommands.js";

export async function runInline(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (config.inlineAutoCommit) {
    context.stderr.write("Unsupported in node-cli first pass: inline_auto_commit=true\n");
    context.stderr.write("See node-cli/docs/unsupported.md for supported first-pass behavior.\n");
    return 2;
  }

  await assertNoActiveWaveLock(config);
  const task = await readInlineTask(context.cwd, cli.commandArgs);
  await appendEvent(config, { type: "command_started", data: { command: "inline" } });
  await writeStateFile(config, "original-request.md", task);
  await writeStateFile(config, "task.md", task);
  await writeStateFile(config, "workflow.txt", "implement\n");
  await writeStatus({ status: "IMPLEMENTING", round: 1, reason: "Inline execution in progress", workflow: "implement" }, config);

  try {
    await runAgentInvocation(
      {
        config,
        action: "implement",
        slot: "implementer",
        role: "implementer",
        prompt: inlinePrompt(config),
      },
      { runner: context.agentRunner },
    );
  } catch {
    await writeStatus({ status: "ERROR", round: 1, reason: "Inline execution failed", workflow: "implement" }, config);
    return 1;
  }

  await runInlineQualityChecks(config);
  await writeStatus({ status: "COMPLETED", round: 1, reason: "Inline execution completed", workflow: "implement" }, config);
  return 0;
}

async function readInlineTask(projectDir, commandArgs) {
  if (commandArgs.file) {
    let content;
    try {
      content = await readFile(resolve(projectDir, commandArgs.file), "utf8");
    } catch (error) {
      throw new Error(`Config error: Failed to read task file '${commandArgs.file}': ${error.message ?? error}`);
    }
    if (!content.trim()) {
      throw new Error(`Config error: Task file '${commandArgs.file}' is empty.`);
    }
    return content;
  }
  if (commandArgs.task !== undefined) {
    if (!commandArgs.task.trim()) {
      throw new Error("Config error: Task cannot be empty.");
    }
    return commandArgs.task;
  }
  throw new Error("Config error: Task is required. Provide task text or --file <path>.");
}

async function runInlineQualityChecks(config) {
  if (!config.inlineQualityCheck || !config.autoTest) {
    return;
  }
  const commands = await resolveRuntimeQualityCommands(config);
  await runCheckCommands(config, commands, {
    startLog: "Running quality checks",
    itemLog: "Quality check",
    header: "QUALITY CHECKS:",
  });
}

function inlinePrompt(config) {
  const taskMd = displayPath(config, safeStatePath(config, "task.md"));
  return `Read the task from ${taskMd} and implement it directly.\n\nDo not plan, decompose, or review. Just implement the changes.\nAfter implementation, summarize what you did in 2-3 sentences.`;
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}
