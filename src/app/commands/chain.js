import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { appendEvent } from "../../state/events.js";
import { archiveState } from "../../state/archive.js";
import { chainPath } from "../../state/paths.js";
import { runImplement } from "./implement.js";
import { runImplementVerify } from "./implementVerify.js";
import { runInline } from "./inline.js";
import { runPlan, runSpec } from "./phases.js";

const ChainStatus = Object.freeze({
  Pending: "pending",
  InProgress: "inprogress",
  Completed: "completed",
  Failed: "failed",
});

export async function runChain(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  await appendEvent(config, { type: "command_started", data: { command: "chain" } });
  await validateChainFiles(config.projectDir, cli.commandArgs.files);

  const command = cli.commandArgs.command ?? config.chainDefaultCommand;
  const state = await loadOrCreateChainState(config, cli.commandArgs);
  const startIndex = cli.commandArgs.resume ? firstIncompleteIndex(state) : 0;
  let failures = 0;

  for (let index = startIndex; index < state.results.length; index += 1) {
    const result = state.results[index];
    const priorStatus = result.status;
    const filePath = resolve(config.projectDir, result.file);
    if (!config.jsonMode) {
      context.stdout.write(`\n--- Chain [${index + 1}/${state.results.length}]: ${result.file} ---\n`);
    }

    state.current_index = index;
    result.status = ChainStatus.InProgress;
    delete result.error;
    await persistChainState(config, state);

    const task = await readFile(filePath, "utf8");
    const shouldResume = cli.commandArgs.resume && isInProgressStatus(priorStatus);
    const exitCode = await dispatchChainStep(command, task, shouldResume, cli, context);

    if (exitCode === 0) {
      const stem = planStem(result.file, index);
      await archiveState(config, stem);
      result.status = ChainStatus.Completed;
      result.archive_path = `.agent-loop/state/archive/${stem}/`;
      delete result.error;
      await persistChainState(config, state);
      continue;
    }

    result.status = ChainStatus.Failed;
    result.error = `exit code ${exitCode}`;
    failures += 1;
    await persistChainState(config, state);
    break;
  }

  if (!config.jsonMode) {
    writeChainSummary(context, state);
  }

  return failures > 0 ? 1 : 0;
}

async function validateChainFiles(projectDir, files) {
  for (const file of files) {
    try {
      await access(resolve(projectDir, file));
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Config error: chain file not found: ${file}`);
      }
      throw error;
    }
  }
}

async function loadOrCreateChainState(config, commandArgs) {
  const path = chainPath(config.projectDir);
  if (commandArgs.resume && await fileExists(path)) {
    return readChainState(path);
  }
  return {
    current_index: 0,
    results: commandArgs.files.map((file) => ({
      file,
      status: ChainStatus.Pending,
    })),
  };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readChainState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`invalid chain.json: ${error.message}`);
    }
    throw error;
  }
}

async function persistChainState(config, state) {
  const path = chainPath(config.projectDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function firstIncompleteIndex(state) {
  const index = state.results.findIndex((result) => result.status !== ChainStatus.Completed);
  return index === -1 ? state.results.length : index;
}

function isInProgressStatus(status) {
  return status === ChainStatus.InProgress || status === "in_progress";
}

function planStem(file, index) {
  const base = basename(file);
  const extension = extname(base);
  const stem = extension ? base.slice(0, -extension.length) : base;
  return stem || `plan-${index}`;
}

async function dispatchChainStep(command, task, resume, parentCli, context) {
  const runner = chainRunner(command);
  if (!runner) {
    return handleUnsupportedCommand(command, context);
  }
  return runner(
    {
      ...parentCli,
      command,
      commandArgs: chainCommandArgs(command, task, resume),
    },
    context,
  );
}

function chainRunner(command) {
  return {
    spec: runSpec,
    plan: runPlan,
    inline: runInline,
    implement: runImplement,
    "implement-verify": runImplementVerify,
  }[command];
}

function chainCommandArgs(command, task, resume) {
  if (command === "spec" || command === "plan") {
    return resume ? { positional: [], resume: true } : { positional: [task] };
  }
  if (command === "implement" || command === "implement-verify") {
    return resume ? { resume: true, flags: defaultImplementFlags() } : { task, flags: defaultImplementFlags() };
  }
  if (command === "inline") {
    return resume ? { resume: true } : { task };
  }
  return {};
}

function defaultImplementFlags() {
  return {
    perTask: false,
    wave: false,
    maxRetries: 2,
    roundStep: 2,
    continueOnFail: false,
    failFast: false,
    maxParallel: undefined,
  };
}

function writeChainSummary(context, state) {
  context.stdout.write("\n--- Chain Summary ---\n");
  for (const [index, result] of state.results.entries()) {
    context.stdout.write(`  [${index + 1}/${state.results.length}] ${result.file} -- ${statusLabel(result.status)}\n`);
  }
}

function statusLabel(status) {
  if (isInProgressStatus(status)) {
    return "in progress";
  }
  return {
    pending: "pending",
    completed: "completed",
    failed: "failed",
    skipped: "skipped",
  }[status] ?? String(status);
}
