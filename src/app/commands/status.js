import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { readStateFile } from "../../state/files.js";

const ARTIFACTS = [
  ["original-request.md", "request artifact"],
  ["planning-progress.md", "planning progress"],
  ["tasks_findings.json", "task decomposition findings"],
  ["tasks-progress.md", "tasks progress"],
  ["implement-progress.md", "implementation progress"],
  ["conversation.md", "conversation"],
  ["findings.json", "findings"],
  ["task_status.json", "task status"],
  ["task_metrics.json", "task metrics"],
  ["verification-progress.md", "verification progress"],
  ["verification.md", "verification report"],
  ["verification.json", "verification data"],
  ["verification-fixes.md", "verification fixes"],
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function toStatusEvent(status) {
  const data = { initialized: true, ...status };
  if (Object.prototype.hasOwnProperty.call(data, "active_role")) {
    data.activeRole = data.active_role;
    delete data.active_role;
  }
  if (Object.prototype.hasOwnProperty.call(data, "active_agent")) {
    data.activeAgent = data.active_agent;
    delete data.active_agent;
  }
  return { type: "status", data };
}

export async function runStatus(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const statusText = await readStateFile(config, "status.json");
  if (!statusText.trim()) {
    if (config.jsonMode) {
      context.stdout.write(`${JSON.stringify({ type: "status", data: { initialized: false } })}\n`);
    } else {
      context.stdout.write("not initialized\n");
    }
    return 0;
  }
  let status;
  try {
    status = JSON.parse(statusText);
  } catch {
    context.stderr.write("status.json may be corrupted. Run `agent-loop reset` to reset state.\n");
    return 1;
  }
  if (config.jsonMode) {
    context.stdout.write(`${JSON.stringify(toStatusEvent(status))}\n`);
    return 0;
  }
  context.stdout.write(`status: ${status.status ?? "UNKNOWN"}\n`);
  context.stdout.write(`round: ${status.round ?? 0}\n`);
  if (status.lastRunTask) {
    context.stdout.write(`task: ${status.lastRunTask}\n`);
  }
  for (const [fileName, label] of ARTIFACTS) {
    if (await exists(resolve(config.stateDir, fileName))) {
      context.stdout.write(`${label}: ${fileName}\n`);
    }
  }
  const waveLock = resolve(config.projectDir, ".agent-loop", config.session ? `wave-${config.session}.lock` : "wave.lock");
  if (await exists(waveLock)) {
    context.stdout.write(`wave lock: ${waveLock}\n`);
  }
  const journal = resolve(config.projectDir, ".agent-loop", config.session ? `wave-progress-${config.session}.jsonl` : "wave-progress.jsonl");
  if (await exists(journal)) {
    const text = await readFile(journal, "utf8");
    const recent = text.trim().split(/\r?\n/).filter(Boolean).slice(-3);
    for (const line of recent) {
      context.stdout.write(`wave event: ${line}\n`);
    }
  }
  return 0;
}
