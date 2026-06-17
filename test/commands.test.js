import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { runMain } from "../src/main.js";
import { captureStream } from "./helpers.js";

async function run(argv, cwd, env = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runMain({
    argv,
    cwd,
    env,
    stdout: stdout.stream,
    stderr: stderr.stream,
    stderrIsTTY: false,
    now: () => new Date("2026-01-02T03:04:05.006Z"),
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

test("status reports uninitialized without status.json", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["status", "--json"], project);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), JSON.stringify({ type: "status", data: { initialized: false } }));
});

test("config warnings reach stderr in plain and json modes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ models: { future_provider: { plan: { model: "future" } } } }));
  const plain = await run(["status"], project);
  assert.equal(plain.code, 0);
  assert.match(plain.stderr, /^warning: Unknown provider 'future_provider'/m);
  const json = await run(["status", "--json"], project);
  assert.equal(json.code, 0);
  const warningLine = json.stderr.trim().split(/\r?\n/)[0];
  assert.deepEqual(JSON.parse(warningLine).type, "warning");
  assert.match(JSON.parse(warningLine).data.message, /Unknown provider 'future_provider'/);
});

test("fatal config errors are plain text normally and JSON events in --json mode", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), "{not json");
  const plain = await run(["status"], project);
  assert.equal(plain.code, 1);
  assert.equal(plain.stdout, "");
  assert.match(plain.stderr, /^\.agent-loop\.json is not valid JSON \(/);
  const json = await run(["status", "--json"], project);
  assert.equal(json.code, 1);
  assert.equal(json.stdout, "");
  const errorLine = JSON.parse(json.stderr.trim());
  assert.equal(errorLine.type, "error");
  assert.match(errorLine.data.message, /\.agent-loop\.json is not valid JSON \(/);
});

test("plan initializes state and does not create tasks.md", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["plan", "# Task"], project);
  assert.equal(result.code, 0);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "plan\n");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "PENDING");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/tasks.md"), "utf8"), /ENOENT/);
});

test("tasks fails without a plan and initializes decompose when plan exists", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const missing = await run(["tasks"], project);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /No plan found/);
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ implementer: "codex", reviewer: "codex" }));
  await run(["plan", "Build"], project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "Plan body");
  await writeFile(resolve(project, ".agent-loop/state/tasks.md"), "stale");
  const result = await run(["tasks"], project);
  assert.equal(result.code, 0);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "decompose\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/plan.md"), "utf8"), "Plan body");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/tasks.md"), "utf8"), /ENOENT/);
});

test("next and resume route unsupported selections explicitly", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const next = await run(["next"], project);
  assert.equal(next.code, 2);
  assert.match(next.stderr, /Unsupported in node-cli first pass: discuss/);
  const dryRun = await run(["resume", "--dry-run"], project);
  assert.equal(dryRun.code, 0);
  assert.equal(dryRun.stdout.trim().split(/\r?\n/)[0], "agent-loop next");
  const resume = await run(["resume"], project);
  assert.equal(resume.code, 1);
  assert.match(resume.stderr, /No resumable state found/);
});

test("unsupported commands with Rust-style args print docs pointer", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const cases = [
    ["goal", "resume", "--run"],
    ["pipeline", "--phases", "plan,implement", "--resume"],
    ["supervise", "--phases", "spec,plan", "--resume"],
    ["init", "--force"],
  ];

  for (const argv of cases) {
    const result = await run(argv, project);
    assert.equal(result.code, 2);
    assert.match(result.stderr, new RegExp(`Unsupported in node-cli first pass: ${argv[0]}`));
    assert.match(result.stderr, /node-cli\/docs\/unsupported\.md/);
  }
});

test("resume dry-run selects active pipeline before interrupted workflow", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "INTERRUPTED" }));
  await writeFile(resolve(stateDir, "pipeline.json"), JSON.stringify({
    phases: "plan,implement,verify",
    simple_mode: true,
    discover: true,
    single_agent: true,
    flags: {
      per_task: true,
      max_retries: 4,
      round_step: 3,
      continue_on_fail: true,
      max_parallel: 5,
    },
  }));

  const result = await run(["resume", "--dry-run"], project);
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout.trim().split(/\r?\n/)[0],
    "agent-loop --simple pipeline --phases plan,implement,verify --resume --discover --single-agent --per-task --max-retries 4 --round-step 3 --continue-on-fail --max-parallel 5",
  );
});

test("resume handles inactive or invalid pipeline state with Rust-compatible fallbacks", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFIED" }));
  await writeFile(resolve(stateDir, "pipeline.json"), JSON.stringify({ phases: "plan,implement,verify" }));

  const terminal = await run(["resume", "--dry-run"], project);
  assert.equal(terminal.code, 0);
  assert.equal(terminal.stdout.trim().split(/\r?\n/)[0], "agent-loop next");

  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "PENDING" }));
  await writeFile(resolve(stateDir, "pipeline.json"), JSON.stringify({ schema_version: 2, phases: "plan,implement,verify" }));
  const invalidSchema = await run(["resume", "--dry-run"], project);
  assert.equal(invalidSchema.code, 0);
  assert.equal(invalidSchema.stdout.trim().split(/\r?\n/)[0], "agent-loop next");
});

test("resume ignores stale supervisor checkpoint without active workflow", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "supervisor.json"), JSON.stringify({
    workflow: {
      phases: ["spec", "plan", "tasks", "implement", "verify"],
      current_phase: "implement",
    },
  }));

  const stale = await run(["resume", "--dry-run"], project);
  assert.equal(stale.code, 0);
  assert.equal(stale.stdout.trim().split(/\r?\n/)[0], "agent-loop next");

  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  const active = await run(["resume", "--dry-run"], project);
  assert.equal(active.code, 0);
  assert.equal(
    active.stdout.trim().split(/\r?\n/)[0],
    "agent-loop supervise --phases spec,plan,tasks,implement,verify --resume",
  );
});

test("resume non-dry-run routes saved pipeline through unsupported handler", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "plan\n");
  await writeFile(resolve(stateDir, "pipeline.json"), JSON.stringify({ phases: "plan,implement,verify" }));

  const result = await run(["resume"], project);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unsupported in node-cli first pass: pipeline/);
});

test("resume with an active goal surfaces the suggested Rust CLI command", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "PENDING" }));
  await writeFile(resolve(stateDir, "goal.json"), JSON.stringify({ schema_version: 1, status: "paused" }));

  const result = await run(["resume"], project);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unsupported in node-cli first pass: goal/);
  assert.match(result.stderr, /This workflow requires the Rust CLI\. Run: agent-loop goal resume --run/);
});

test("reset preserves decisions and wave-lock reset touches only the lock", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await run(["plan", "Build"], project);
  await writeFile(resolve(project, ".agent-loop/decisions.md"), "keep");
  await writeFile(resolve(project, ".agent-loop/wave.lock"), "locked");
  await writeFile(resolve(project, ".agent-loop/wave-progress.jsonl"), "{}\n");
  const invalid = await run(["reset", "unexpected"], project);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /unexpected argument 'unexpected' for reset/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8").then(() => "exists"), "exists");
  const lock = await run(["reset", "--wave-lock"], project);
  assert.equal(lock.stdout.split(/\r?\n/)[0], "Wave lock removed.");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8").then(() => "exists"), "exists");
  const reset = await run(["reset"], project);
  assert.equal(reset.code, 0);
  assert.equal(await readFile(resolve(project, ".agent-loop/decisions.md"), "utf8"), "keep");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/wave-progress.jsonl"), "utf8"), /ENOENT/);
});

test("state-mutating commands abort when a live wave lock exists", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop"), { recursive: true });
  await writeFile(
    resolve(project, ".agent-loop/wave.lock"),
    JSON.stringify({ pid: process.pid, started_at: "2026-01-02T03:04:05Z", mode: "wave", max_parallel: 2 }),
  );
  const result = await run(["plan", "Build"], project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`A run is in progress \\(PID ${process.pid}\\)`));
  assert.match(result.stderr, /agent-loop reset --wave-lock/);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"), /ENOENT/);
});

test("a wave lock from a dead process does not block state-mutating commands", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop"), { recursive: true });
  await writeFile(
    resolve(project, ".agent-loop/wave.lock"),
    JSON.stringify({ pid: 99999999, started_at: "2026-01-02T03:04:05Z", mode: "wave", max_parallel: 2 }),
  );
  const result = await run(["plan", "Build"], project);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "PENDING");
});

test("an unreadable wave lock blocks state-mutating commands", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/wave.lock"), "not-json");
  const result = await run(["plan", "Build"], project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /A run is in progress\. If stale, run: agent-loop reset --wave-lock/);
});

test("phase resume errors distinguish missing, empty, and mismatched workflow state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");

  const missing = await run(["plan", "--resume"], project);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Cannot resume plan: workflow\.txt is missing\./);

  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "");
  const empty = await run(["plan", "--resume"], project);
  assert.equal(empty.code, 1);
  assert.match(empty.stderr, /Cannot resume plan: workflow\.txt is empty\./);

  await writeFile(resolve(stateDir, "workflow.txt"), "spec\n");
  const mismatch = await run(["plan", "--resume"], project);
  assert.equal(mismatch.code, 1);
  assert.match(mismatch.stderr, /Cannot resume plan: state belongs to workflow 'spec' \(expected 'plan'\)\./);

  await writeFile(resolve(stateDir, "workflow.txt"), "plan\n");
  const noStatus = await run(["plan", "--resume"], project);
  assert.equal(noStatus.code, 1);
  assert.match(noStatus.stderr, /Cannot resume plan: status\.json is missing or empty\./);

  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "INTERRUPTED" }));
  const noPlanFile = await run(["plan", "--resume"], project);
  assert.equal(noPlanFile.code, 1);
  assert.match(noPlanFile.stderr, /Cannot resume plan: plan\.md is empty\./);

  const verifyMismatch = await run(["verify", "--resume"], project);
  assert.equal(verifyMismatch.code, 1);
  assert.match(verifyMismatch.stderr, /Cannot resume verify: state belongs to workflow 'plan' \(expected 'verify'\)\./);
});

test("corrupted state JSON files report a consistent actionable error", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");

  await writeFile(resolve(stateDir, "status.json"), "{not json");
  const status = await run(["resume", "--dry-run"], project);
  assert.equal(status.code, 1);
  assert.match(status.stderr, /State file 'status\.json' is corrupted \(/);
  assert.match(status.stderr, /reset state with the Rust CLI/);

  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "PENDING" }));
  await writeFile(resolve(stateDir, "pipeline.json"), "[broken");
  const pipeline = await run(["resume", "--dry-run"], project);
  assert.equal(pipeline.code, 1);
  assert.match(pipeline.stderr, /State file 'pipeline\.json' is corrupted \(/);

  await writeFile(resolve(stateDir, "goal.json"), "###");
  const goal = await run(["resume", "--dry-run"], project);
  assert.equal(goal.code, 1);
  assert.match(goal.stderr, /State file 'goal\.json' is corrupted \(/);

  const direct = await run(["status"], project);
  assert.equal(direct.code, 0);
  assert.equal(JSON.parse((await run(["status", "--json"], project)).stdout).data.status, "PENDING");
});
