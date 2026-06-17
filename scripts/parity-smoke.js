#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = resolve(import.meta.dirname, "..");
const defaultNodeBin = resolve(packageDir, "bin/agent-loop.js");
const defaultRustBin = await resolveDefaultRustBin();
const DYNAMIC_JSON_KEYS = new Set(["created_at", "timestamp", "ts", "updated_at"]);

export const PARITY_SCENARIOS = Object.freeze([
  {
    name: "version",
    args: ["--version"],
  },
  {
    name: "json-version",
    args: ["--json", "--version"],
  },
  {
    name: "list-agents",
    args: ["list-agents"],
  },
  {
    name: "json-list-agents",
    args: ["--json", "list-agents"],
  },
  {
    name: "status-uninitialized",
    args: ["status"],
  },
  {
    name: "json-status-uninitialized",
    args: ["--json", "status"],
  },
  {
    name: "status-initialized-plan",
    args: ["status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "PENDING",
        round: 2,
        timestamp: "2026-01-01T00:00:00Z",
        lastRunTask: "Ship status parity",
      })}\n`);
    },
  },
  {
    name: "json-status-initialized-plan",
    args: ["--json", "status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "PENDING",
        round: 2,
        timestamp: "2026-01-01T00:00:00Z",
        lastRunTask: "Ship status parity",
      })}\n`);
    },
  },
  {
    name: "json-status-empty-file",
    args: ["--json", "status"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", "");
    },
  },
  {
    name: "next-complete",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "verify\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "VERIFIED", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "json-next-complete",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "verify\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "VERIFIED", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "next-error",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "implement\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ERROR", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "json-next-error",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "implement\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ERROR", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
    },
  },
  {
    name: "next-awaiting-plan-approval",
    args: ["next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "AWAITING_INPUT", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/plan-pending-approval.flag", `${JSON.stringify({
        decision_id: "decision-plan",
        phase: "plan",
        artifact_path: "/tmp/plan.md",
        created_at: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "json-next-awaiting-plan-approval",
    args: ["--json", "next"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "AWAITING_INPUT", round: 1, timestamp: "2026-01-01T00:00:00Z" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/plan-pending-approval.flag", `${JSON.stringify({
        decision_id: "decision-plan",
        phase: "plan",
        artifact_path: "/tmp/plan.md",
        created_at: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "spec-missing-task",
    args: ["spec"],
  },
  {
    name: "plan-missing-task",
    args: ["plan"],
  },
  {
    name: "plan-empty-file",
    args: ["plan", "--file", "empty.md"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, "empty.md", " \n");
    },
  },
  {
    name: "implement-empty-state",
    args: ["implement"],
  },
  {
    name: "implement-verify-empty-state",
    args: ["implement-verify"],
  },
  {
    name: "resume-dry-run-empty",
    args: ["resume", "--dry-run"],
  },
  {
    name: "json-resume-dry-run-empty",
    args: ["--json", "resume", "--dry-run"],
  },
  {
    name: "resume-empty",
    args: ["resume"],
  },
  {
    name: "json-resume-empty",
    args: ["--json", "resume"],
  },
  {
    name: "resume-interrupted-missing-workflow",
    args: ["resume"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "INTERRUPTED",
        round: 1,
        timestamp: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "json-resume-interrupted-missing-workflow",
    args: ["--json", "resume"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({
        status: "INTERRUPTED",
        round: 1,
        timestamp: "2026-01-01T00:00:00Z",
      })}\n`);
    },
  },
  {
    name: "resume-dry-run-pipeline-no-status",
    args: ["resume", "--dry-run"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/workflow.txt", "plan\n");
      await writeProjectFile(projectDir, ".agent-loop/state/pipeline.json", `${JSON.stringify({
        schema_version: 1,
        phases: "plan,implement",
        discover: true,
      })}\n`);
    },
  },
  {
    name: "reset-empty",
    args: ["reset"],
  },
  {
    name: "json-reset-empty",
    args: ["--json", "reset"],
  },
  {
    name: "reset-seeded-state",
    args: ["reset"],
    stateFiles: [
      ".agent-loop/decisions.md",
      ".agent-loop/wave-progress.jsonl",
      ".agent-loop/state/status.json",
      ".agent-loop/state/session-a/status.json",
      ".agent-loop/state/.wave-task-1/status.json",
      ".agent-loop/state/history/event.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/decisions.md", "keep\n");
      await writeProjectFile(projectDir, ".agent-loop/wave-progress.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/session-a/status.json", `${JSON.stringify({ status: "SESSION" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/.wave-task-1/status.json", `${JSON.stringify({ status: "TASK" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/history/event.json", "{}\n");
    },
  },
  {
    name: "reset-session-state",
    args: ["--session", "alpha", "reset"],
    stateFiles: [
      ".agent-loop/wave-progress-alpha.jsonl",
      ".agent-loop/wave-progress.jsonl",
      ".agent-loop/state/status.json",
      ".agent-loop/state/alpha/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave-progress-alpha.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/wave-progress.jsonl", "{}\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "ROOT" })}\n`);
      await writeProjectFile(projectDir, ".agent-loop/state/alpha/status.json", `${JSON.stringify({ status: "SESSION" })}\n`);
    },
  },
  {
    name: "reset-wave-lock-missing",
    args: ["reset", "--wave-lock"],
  },
  {
    name: "reset-wave-lock-present",
    args: ["reset", "--wave-lock"],
    stateFiles: [
      ".agent-loop/wave.lock",
      ".agent-loop/state/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave.lock", "locked\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
    },
  },
  {
    name: "json-reset-wave-lock-present",
    args: ["--json", "reset", "--wave-lock"],
    stateFiles: [
      ".agent-loop/wave.lock",
      ".agent-loop/state/status.json",
    ],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/wave.lock", "locked\n");
      await writeProjectFile(projectDir, ".agent-loop/state/status.json", `${JSON.stringify({ status: "PENDING" })}\n`);
    },
  },
  {
    name: "analyze-coverage-complete",
    args: ["analyze-coverage"],
    prepare: async (projectDir) => {
      await writeProjectFile(projectDir, ".agent-loop/state/spec.md", "- REQ-002: Keep logs\n- REQ-001: Export data\n");
      await writeProjectFile(projectDir, ".agent-loop/state/tasks.md", "## Task 1\nCovers REQ-001 and REQ-002.\n");
    },
  },
  {
    name: "goal-status-empty",
    args: ["goal", "status"],
  },
  {
    name: "queue-status-empty",
    args: ["queue", "status"],
  },
  {
    name: "inline-missing-task",
    args: ["inline"],
  },
  {
    name: "chain-missing-file",
    args: ["chain", "missing.md"],
  },
  {
    name: "json-goal-status-empty",
    args: ["--json", "goal", "status"],
  },
  {
    name: "json-queue-status-empty",
    args: ["--json", "queue", "status"],
  },
  {
    name: "goal-pause-state",
    args: ["goal", "pause"],
    stateFiles: [".agent-loop/state/goal.json"],
    prepare: async (projectDir) => {
      await writeProjectFile(
        projectDir,
        ".agent-loop/state/goal.json",
        `${JSON.stringify({
          schema_version: 1,
          goal_id: "goal-demo",
          objective: "Ship seeded goal",
          status: "active",
          phases: ["spec", "plan", "tasks", "implement", "verify"],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        })}\n`,
      );
    },
  },
]);

export function normalizeOutput(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^elapsed:\s/i.test(line))
    .map((line) => canonicalizeJsonLine(line))
    .join("\n")
    .trim();
}

export function normalizeJsonContent(text) {
  return `${JSON.stringify(sortJsonValue(scrubDynamicJsonFields(JSON.parse(text))))}\n`;
}

export function scrubDynamicJsonFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => scrubDynamicJsonFields(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const scrubbed = {};
  for (const [key, entry] of Object.entries(value)) {
    scrubbed[key] = DYNAMIC_JSON_KEYS.has(key) ? "<timestamp>" : scrubDynamicJsonFields(entry);
  }
  return scrubbed;
}

export function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

export async function runParitySmoke(options = {}) {
  const rustBin = options.rustBin ?? defaultRustBin;
  const nodeBin = options.nodeBin ?? defaultNodeBin;
  const scenarioNames = options.scenarioNames?.length ? new Set(options.scenarioNames) : null;
  const scenarios = scenarioNames
    ? PARITY_SCENARIOS.filter((scenario) => scenarioNames.has(scenario.name))
    : PARITY_SCENARIOS;

  if (scenarioNames && scenarios.length !== scenarioNames.size) {
    const known = new Set(PARITY_SCENARIOS.map((scenario) => scenario.name));
    const missing = [...scenarioNames].filter((name) => !known.has(name));
    throw new Error(`unknown parity scenario(s): ${missing.join(", ")}`);
  }

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, { rustBin, nodeBin, keepTemp: Boolean(options.keepTemp) }));
  }
  return results;
}

async function runScenario(scenario, { rustBin, nodeBin, keepTemp }) {
  const root = await mkdtemp(resolve(tmpdir(), "agent-loop-parity-"));
  const rustProject = resolve(root, "rust");
  const nodeProject = resolve(root, "node");
  await mkdir(rustProject, { recursive: true });
  await mkdir(nodeProject, { recursive: true });
  await scenario.prepare?.(rustProject);
  await scenario.prepare?.(nodeProject);

  try {
    const [rustRun, nodeRun] = await Promise.all([
      runCommand(rustBin, scenario.args, rustProject),
      runCommand(process.execPath, [nodeBin, ...scenario.args], nodeProject),
    ]);
    const checks = [
      compareValue("exit code", rustRun.code, nodeRun.code),
      compareValue("stdout", normalizeOutput(rustRun.stdout), normalizeOutput(nodeRun.stdout)),
      compareValue("stderr", normalizeOutput(rustRun.stderr), normalizeOutput(nodeRun.stderr)),
      ...(await compareStateFiles(scenario.stateFiles ?? [], rustProject, nodeProject)),
    ];
    return {
      name: scenario.name,
      ok: checks.every((check) => check.ok),
      checks,
      tempDir: keepTemp ? root : undefined,
    };
  } finally {
    if (!keepTemp) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function compareStateFiles(stateFiles, rustProject, nodeProject) {
  const comparisons = [];
  for (const fileName of stateFiles) {
    const [rustContent, nodeContent] = await Promise.all([
      readProjectFile(rustProject, fileName),
      readProjectFile(nodeProject, fileName),
    ]);
    comparisons.push(compareValue(`state ${fileName}`, normalizeStateContent(rustContent), normalizeStateContent(nodeContent)));
  }
  return comparisons;
}

function normalizeStateContent(content) {
  if (content === null) {
    return "<missing>";
  }
  try {
    return normalizeJsonContent(content);
  } catch {
    return normalizeOutput(content);
  }
}

function compareValue(label, rust, node) {
  return {
    label,
    ok: rust === node,
    rust,
    node,
  };
}

function canonicalizeJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return line;
  }
  try {
    return JSON.stringify(sortJsonValue(scrubDynamicJsonFields(JSON.parse(trimmed))));
  } catch {
    return line;
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function writeProjectFile(projectDir, fileName, content) {
  const path = resolve(projectDir, fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function readProjectFile(projectDir, fileName) {
  try {
    return await readFile(resolve(projectDir, fileName), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function resolveDefaultRustBin() {
  const envBin = process.env.AGENT_LOOP_RUST_BIN ?? process.env.RUST_AGENT_LOOP_BIN;
  if (envBin) {
    return envBin;
  }
  const cargoBin = "/Users/brunogomes/.cargo/bin/agent-loop";
  try {
    await access(cargoBin);
    return cargoBin;
  } catch {
    return "agent-loop";
  }
}

function parseArgs(argv) {
  const options = {
    scenarioNames: [],
    keepTemp: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--list") {
      options.list = true;
      continue;
    }
    if (token === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }
    if (token === "--rust-bin" || token === "--node-bin" || token === "--scenario") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${token}`);
      }
      index += 1;
      if (token === "--rust-bin") {
        options.rustBin = value;
      } else if (token === "--node-bin") {
        options.nodeBin = value;
      } else {
        options.scenarioNames.push(...value.split(",").map((name) => name.trim()).filter(Boolean));
      }
      continue;
    }
    throw new Error(`unknown argument '${token}'`);
  }
  return options;
}

function printResults(results) {
  for (const result of results) {
    const marker = result.ok ? "PASS" : "FAIL";
    console.log(`${marker} ${result.name}`);
    for (const check of result.checks) {
      if (check.ok) {
        continue;
      }
      console.log(`  ${check.label}`);
      console.log(`    rust: ${JSON.stringify(check.rust)}`);
      console.log(`    node: ${JSON.stringify(check.node)}`);
    }
    if (result.tempDir) {
      console.log(`  temp: ${result.tempDir}`);
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.list) {
    for (const scenario of PARITY_SCENARIOS) {
      console.log(scenario.name);
    }
    return 0;
  }
  const results = await runParitySmoke(options);
  printResults(results);
  return results.every((result) => result.ok) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}
