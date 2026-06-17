import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateCompletionInvariants } from "../src/app/commands/verify.js";
import { runMain } from "../src/main.js";
import { captureStream } from "./helpers.js";

async function run(argv, cwd, env = {}, overrides = {}) {
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
    ...overrides,
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

test("status reports uninitialized without status.json", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["status", "--json"], project);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), JSON.stringify({ type: "status", data: { initialized: false } }));
});

test("status reports Rust-shaped initialized output in plain and JSON modes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "plan\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({
    status: "PENDING",
    round: 2,
    timestamp: "2026-01-01T00:00:00Z",
    lastRunTask: "Ship status parity",
  }));

  const plain = await run(["status"], project);
  assert.equal(plain.code, 0);
  assert.match(
    plain.stdout,
    /^status: PENDING\nround: 2\nimplementer: claude\nreviewer: codex\nplanner: claude\nverifier: codex\nmode: dual-agent\nlastRunTask: Ship status parity\ntimestamp: 2026-01-01T00:00:00Z\nnextAction: plan --resume\n/,
  );
  assert.doesNotMatch(plain.stdout, /^task:/m);

  const json = await run(["--json", "status"], project);
  assert.equal(json.code, 0);
  assert.deepEqual(JSON.parse(json.stdout.trim()), {
    type: "status",
    data: {
      initialized: true,
      status: "PENDING",
      round: 2,
      implementer: "claude",
      reviewer: "codex",
      planner: "claude",
      verifier: "codex",
      activeRole: null,
      activeAgent: null,
      mode: "dual-agent",
      lastRunTask: "Ship status parity",
      reason: null,
      timestamp: "2026-01-01T00:00:00Z",
      warnings: [],
      nextAction: "plan --resume",
    },
  });
});

test("status normalizes empty and invalid status files like Rust", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "task.md"), "# Fallback task\n\nDetails");
  await writeFile(resolve(stateDir, "status.json"), "");

  const empty = await run(["--json", "status"], project);
  assert.equal(empty.code, 0);
  const emptyEvent = JSON.parse(empty.stdout.trim());
  assert.equal(emptyEvent.data.initialized, true);
  assert.equal(emptyEvent.data.status, "PENDING");
  assert.equal(emptyEvent.data.round, 0);
  assert.equal(emptyEvent.data.lastRunTask, "Fallback task");
  assert.deepEqual(emptyEvent.data.warnings, []);

  await writeFile(resolve(stateDir, "status.json"), "{not json");
  const invalid = await run(["status"], project);
  assert.equal(invalid.code, 0);
  assert.match(invalid.stderr, /status\.json: invalid JSON:/);
  assert.match(invalid.stdout, /^status: ERROR/m);
  assert.match(invalid.stdout, /reason: Invalid status\.json:/);
  assert.match(invalid.stdout, /Warnings:\n  - invalid JSON:/);
  assert.match(invalid.stdout, /Hint: status\.json may be corrupted\. Run `agent-loop reset` to reset state\./);

  const invalidJson = await run(["--json", "status"], project);
  assert.equal(invalidJson.code, 0);
  const invalidEvent = JSON.parse(invalidJson.stdout.trim());
  assert.equal(invalidEvent.data.status, "ERROR");
  assert.equal(invalidEvent.data.nextAction, "error");
  assert.match(invalidEvent.data.reason, /Invalid status\.json:/);
  assert.equal(invalidEvent.data.warnings.length, 1);
});

test("status prints grouped artifacts, wave lock, and recent wave events", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(resolve(stateDir, ".wave-task-2"), { recursive: true });
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({
    status: "CONSENSUS",
    round: 1,
    timestamp: "2026-01-01T00:00:00Z",
    lastRunTask: "Wave artifacts",
  }));
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "original-request.md"), "request");
  await writeFile(resolve(stateDir, "planning-progress.md"), "planning");
  await writeFile(resolve(stateDir, "tasks-progress.md"), "tasks");
  await writeFile(resolve(stateDir, "implement-progress.md"), "implement");
  await writeFile(resolve(stateDir, ".wave-task-2/implement-progress.md"), "task implement");
  await writeFile(resolve(stateDir, "conversation.md"), "conversation");
  await writeFile(resolve(stateDir, "verification.md"), "verification");
  await writeFile(resolve(project, ".agent-loop/wave.lock"), JSON.stringify({
    pid: process.pid,
    started_at: "2026-01-01T00:00:00Z",
    mode: "wave",
    max_parallel: 2,
  }));
  await writeFile(
    resolve(project, ".agent-loop/wave-progress.jsonl"),
    [
      JSON.stringify({ type: "RunStart", timestamp: "2026-01-01T00:00:00Z", total_tasks: 2, total_waves: 1, max_parallel: 2 }),
      JSON.stringify({ type: "TaskEnd", timestamp: "2026-01-01T00:00:05Z", task_index: 0, title: "lint", success: true }),
    ].join("\n"),
  );

  const result = await run(["status"], project);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /wave lock: PID \d+ since 2026-01-01T00:00:00Z \(mode=wave, parallel=2\)/);
  assert.match(result.stdout, new RegExp(`Request artifact:\\n  - ${resolve(stateDir, "original-request.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(result.stdout, /Planning artifacts:\n/);
  assert.match(result.stdout, /Tasks artifacts:\n/);
  assert.match(result.stdout, /Implementation artifacts:\n/);
  assert.match(result.stdout, /\.wave-task-2\/implement-progress\.md/);
  assert.match(result.stdout, /Verification artifacts:\n/);
  assert.match(result.stdout, /Recent wave events:\n/);
  assert.match(result.stdout, /\[2026-01-01T00:00:00Z\] RunStart: 2 tasks, 1 waves, parallel=2/);
  assert.match(result.stdout, /\[2026-01-01T00:00:05Z\] TaskEnd: task 1 'lint' — ok/);
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

test("spec and plan reject missing or empty task input like Rust", async () => {
  for (const command of ["spec", "plan"]) {
    const missingProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
    const missing = await run([command], missingProject);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /Task is required\. Provide task text or --file <path>\./);
    await assert.rejects(() => readFile(resolve(missingProject, ".agent-loop/state/task.md"), "utf8"), /ENOENT/);

    const emptyTextProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
    const emptyText = await run([command, "   "], emptyTextProject);
    assert.equal(emptyText.code, 1);
    assert.match(emptyText.stderr, /Task cannot be empty\./);

    const emptyFileProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
    await writeFile(resolve(emptyFileProject, "empty.md"), " \n");
    const emptyFile = await run([command, "--file", "empty.md"], emptyFileProject);
    assert.equal(emptyFile.code, 1);
    assert.match(emptyFile.stderr, /Task file 'empty\.md' is empty\./);
  }
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

test("analyze-coverage reports missing requirements and orphan tasks", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "spec.md"), "## Requirements\n- REQ-002: Keep audit logs\n- REQ-001: Export data\n");
  await writeFile(resolve(stateDir, "tasks.md"), "## Task 1\nCovers REQ-001.\n\n## Task 2\nRefactor internal helpers.\n");

  const result = await run(["analyze-coverage"], project);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^coverage: 50%/);
  assert.match(result.stdout, /missing requirements: REQ-002/);
  assert.match(result.stdout, /orphan tasks:\n  - Task 2/);
});

test("analyze-coverage emits JSON report and exits zero when complete", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "spec.md"), "- REQ-001: Export data\n- REQ-002: Keep audit logs\n");
  await writeFile(resolve(stateDir, "tasks.md"), "- Task 1: Build export\n  Covers REQ-002 and REQ-001.\n");

  const result = await run(["--json", "analyze-coverage"], project);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "command_started");
  assert.deepEqual(lines[0].data, { command: "analyze-coverage", isPipeline: false });
  assert.deepEqual(lines[1], {
    type: "spec_coverage",
    data: {
      requirements: ["REQ-001", "REQ-002"],
      covered_requirements: ["REQ-001", "REQ-002"],
      missing_requirements: [],
      orphan_tasks: [],
      coverage_percent: 100,
    },
  });
});

test("analyze-coverage requires existing spec and tasks state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const missingSpec = await run(["analyze-coverage"], project);
  assert.equal(missingSpec.code, 1);
  assert.match(missingSpec.stderr, /No spec\.md found\. Run 'agent-loop spec' first\./);

  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "spec.md"), "- REQ-001: Export data\n");
  const missingTasks = await run(["analyze-coverage"], project);
  assert.equal(missingTasks.code, 1);
  assert.match(missingTasks.stderr, /No tasks\.md found\. Run 'agent-loop tasks' first\./);
});

test("goal status reports active goal state in plain and JSON modes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "goal.json"), JSON.stringify({
    schema_version: 1,
    goal_id: "goal-1",
    objective: "Ship reporting",
    status: "paused",
    source_file: "goal.md",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    reason: "Paused by user.",
  }));
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "INTERRUPTED", round: 2 }));

  const plain = await run(["goal", "status"], project);

  assert.equal(plain.code, 0);
  assert.match(plain.stdout, /^Goal: Ship reporting\nStatus: paused\nPhases: spec,plan,tasks,implement,verify\nSource file: goal\.md\nReason: Paused by user\.\nWorkflow: INTERRUPTED\n/);

  const json = await run(["--json", "goal", "status"], project);
  assert.equal(json.code, 0);
  assert.equal(json.stderr, "");
  assert.deepEqual(JSON.parse(json.stdout.trim()), {
    type: "goal_status",
    data: {
      goal: {
        schema_version: 1,
        goal_id: "goal-1",
        objective: "Ship reporting",
        status: "paused",
        source_file: "goal.md",
        phases: ["spec", "plan", "tasks", "implement", "verify"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        reason: "Paused by user.",
      },
      workflow: {
        status: "INTERRUPTED",
        round: 2,
        implementer: "claude",
        reviewer: "codex",
        planner: "claude",
        verifier: "codex",
        mode: "dual-agent",
        lastRunTask: "",
        reason: null,
        timestamp: "2026-01-02T03:04:05.006Z",
      },
    },
  });
});

test("goal lifecycle commands mutate Rust-compatible goal state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "goal.json"), `${JSON.stringify({
    schema_version: 1,
    goal_id: "goal-1",
    objective: "Ship reporting",
    status: "active",
    phases: ["spec", "plan", "tasks", "implement", "verify"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  })}\n`);

  const pause = await run(["goal", "pause"], project);
  assert.equal(pause.code, 0);
  assert.match(pause.stdout, /^Goal paused: "Ship reporting"\n/);
  const pausedGoal = JSON.parse(await readFile(resolve(stateDir, "goal.json"), "utf8"));
  assert.equal(pausedGoal.status, "paused");
  assert.equal(pausedGoal.reason, "Paused by user.");
  assert.equal(pausedGoal.updated_at, "2026-01-02T03:04:05.006Z");
  assert.equal(await readFile(resolve(stateDir, "goal.lock"), "utf8"), "");

  const resume = await run(["goal", "resume"], project);
  assert.equal(resume.code, 0);
  assert.match(resume.stdout, /^Goal active: "Ship reporting"\n/);
  const resumedGoal = JSON.parse(await readFile(resolve(stateDir, "goal.json"), "utf8"));
  assert.equal(resumedGoal.status, "active");
  assert.equal(Object.hasOwn(resumedGoal, "reason"), false);

  const clear = await run(["goal", "clear"], project);
  assert.equal(clear.code, 0);
  assert.match(clear.stdout, /^Goal cleared\.\n/);
  await assert.rejects(() => readFile(resolve(stateDir, "goal.json"), "utf8"), /ENOENT/);

  const missingResume = await run(["goal", "resume"], project);
  assert.equal(missingResume.code, 1);
  assert.match(missingResume.stdout, /^No goal to resume\.\n/);
});

test("goal lifecycle validates Rust lifecycle-only flags and keeps runtime gaps explicit", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const invalid = await run(["goal", "--file", "goal.md", "status"], project);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /`agent-loop goal status` does not accept objective, file, replace, discovery, or implementation flags/);

  const resumeRun = await run(["goal", "resume", "--run"], project);
  assert.equal(resumeRun.code, 2);
  assert.match(resumeRun.stderr, /Unsupported in node-cli first pass: goal resume --run/);

  const create = await run(["goal", "Ship reporting"], project);
  assert.equal(create.code, 2);
  assert.match(create.stderr, /Unsupported in node-cli first pass: goal/);
});

test("queue lifecycle commands mutate Rust-compatible queue state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));

  const add = await run([
    "queue",
    "add",
    "--priority",
    "4",
    "--depends-on",
    "dep-a, dep-b",
    "--depends-on",
    "dep-a",
    "Ship",
    "queue",
  ], project);

  assert.equal(add.code, 0);
  assert.match(add.stdout, /^Queued [0-9a-f]{8}: Ship queue\n/);
  const stateDir = resolve(project, ".agent-loop/state");
  const queue = JSON.parse(await readFile(resolve(stateDir, "goal-queue.json"), "utf8"));
  assert.equal(queue.schema_version, 1);
  assert.equal(queue.items.length, 1);
  const item = queue.items[0];
  const shortId = item.queue_id.slice(0, 8);
  assert.equal(item.title, "Ship queue");
  assert.equal(item.objective, "Ship queue");
  assert.equal(item.status, "queued");
  assert.equal(item.priority, 4);
  assert.deepEqual(item.depends_on, ["dep-a", "dep-b"]);
  assert.equal(item.created_at, "2026-01-02T03:04:05.006Z");
  assert.equal(await readFile(resolve(stateDir, "goal-queue.lock"), "utf8"), "");

  const list = await run(["queue", "list"], project);
  assert.equal(list.code, 0);
  assert.match(list.stdout, new RegExp(`^${shortId} \\[queued\\] p4 Ship queue\\n`));

  const status = await run(["queue", "status"], project);
  assert.equal(status.code, 0);
  assert.match(status.stdout, new RegExp(`^Active: none\\nNext: ${shortId} \\[queued\\] Ship queue\\n`));

  const pause = await run(["queue", "pause", item.queue_id], project);
  assert.equal(pause.code, 0);
  assert.match(pause.stdout, new RegExp(`^Queue item deferred: ${shortId} Ship queue\\n`));
  const paused = JSON.parse(await readFile(resolve(stateDir, "goal-queue.json"), "utf8")).items[0];
  assert.equal(paused.status, "deferred");
  assert.equal(paused.reason, "Deferred by user.");

  const resume = await run(["queue", "resume", item.queue_id], project);
  assert.equal(resume.code, 0);
  assert.match(resume.stdout, new RegExp(`^Queue item runnable: ${shortId} Ship queue\\n`));
  const resumed = JSON.parse(await readFile(resolve(stateDir, "goal-queue.json"), "utf8")).items[0];
  assert.equal(resumed.status, "queued");
  assert.equal(Object.hasOwn(resumed, "reason"), false);

  const cancelMissing = await run(["queue", "cancel", "missing"], project);
  assert.equal(cancelMissing.code, 0);
  assert.match(cancelMissing.stdout, /^Queue item not found\.\n/);

  const cancel = await run(["queue", "cancel", item.queue_id], project);
  assert.equal(cancel.code, 0);
  assert.match(cancel.stdout, new RegExp(`^Queue item cancelled: ${shortId} Ship queue\\n`));

  const terminalResume = await run(["queue", "resume", item.queue_id], project);
  assert.equal(terminalResume.code, 1);
  assert.match(terminalResume.stderr, /State error: Queue item .* is cancelled; terminal items cannot be changed\./);

  const missingResume = await run(["queue", "resume", "missing"], project);
  assert.equal(missingResume.code, 1);
  assert.match(missingResume.stdout, /^Queue item not found: missing\n/);
});

test("queue JSON output and unsupported run boundary match the state-only scope", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "goal-queue.json"), JSON.stringify({
    schema_version: 1,
    items: [
      {
        queue_id: "active-queue-item",
        title: "Active item",
        objective: "Active item",
        status: "deferred",
        priority: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        reason: "Deferred by user.",
      },
      {
        queue_id: "next-queue-item",
        title: "Next item",
        objective: "Next item",
        status: "queued",
        priority: 2,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  }));

  const status = await run(["--json", "queue", "status"], project);
  assert.equal(status.code, 0);
  const statusEvent = JSON.parse(status.stdout.trim());
  assert.equal(statusEvent.type, "queue_status");
  assert.equal(statusEvent.data.active.queue_id, "active-queue-item");
  assert.equal(statusEvent.data.next.queue_id, "next-queue-item");
  assert.equal(statusEvent.data.queue.items.length, 2);

  const pause = await run(["--json", "queue", "pause", "next-queue-item"], project);
  assert.equal(pause.code, 0);
  const pauseEvent = JSON.parse(pause.stdout.trim());
  assert.equal(pauseEvent.type, "queue_item");
  assert.equal(pauseEvent.data.status, "deferred");

  const resume = await run(["--json", "queue", "resume", "next-queue-item"], project);
  assert.equal(resume.code, 0);
  assert.equal(resume.stdout, "");

  const runBoundary = await run(["queue", "resume", "next-queue-item", "--run"], project);
  assert.equal(runBoundary.code, 2);
  assert.match(runBoundary.stderr, /Unsupported in node-cli first pass: queue resume --run/);
});

test("next and resume route unsupported selections explicitly", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const next = await run(["next"], project);
  assert.equal(next.code, 0);
  assert.equal(next.stdout.trim().split(/\r?\n/)[0], "agent-loop discuss");
  const dryRun = await run(["resume", "--dry-run"], project);
  assert.equal(dryRun.code, 0);
  assert.equal(dryRun.stdout.trim().split(/\r?\n/)[0], "agent-loop next");
  const resume = await run(["resume"], project);
  assert.equal(resume.code, 1);
  assert.match(resume.stderr, /No resumable state found/);
  const jsonResume = await run(["--json", "resume"], project);
  assert.equal(jsonResume.code, 1);
  assert.equal(JSON.parse(jsonResume.stdout.trim()).type, "command_started");
  assert.equal(jsonResume.stderr, "");
});

test("next handles deterministic control outcomes without invoking phases", async () => {
  const completeProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(completeProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(completeProject, ".agent-loop/state/workflow.txt"), "verify\n");
  await writeFile(resolve(completeProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "VERIFIED", round: 1 }));
  const complete = await run(["next"], completeProject);
  assert.equal(complete.code, 0);
  assert.equal(complete.stdout.split(/\r?\n/)[0], "Pipeline complete. Nothing to do.");
  const completeJson = await run(["--json", "next"], completeProject);
  assert.equal(completeJson.code, 0);
  assert.equal(JSON.parse(completeJson.stdout.trim()).type, "command_started");
  assert.equal(completeJson.stderr, "");

  const errorProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(errorProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(errorProject, ".agent-loop/state/workflow.txt"), "implement\n");
  await writeFile(resolve(errorProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "ERROR", round: 1 }));
  const errored = await run(["next"], errorProject);
  assert.equal(errored.code, 1);
  assert.match(errored.stderr, /Previous run failed with ERROR\. Resume or reset\./);
  const erroredJson = await run(["--json", "next"], errorProject);
  assert.equal(erroredJson.code, 1);
  assert.equal(JSON.parse(erroredJson.stdout.trim()).type, "command_started");
  assert.equal(erroredJson.stderr, "");

  const approvalProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const approvalState = resolve(approvalProject, ".agent-loop/state");
  await mkdir(approvalState, { recursive: true });
  await writeFile(resolve(approvalState, "workflow.txt"), "plan\n");
  await writeFile(resolve(approvalState, "status.json"), JSON.stringify({ status: "AWAITING_INPUT", round: 1 }));
  await writeFile(resolve(approvalState, "plan-pending-approval.flag"), JSON.stringify({
    decision_id: "decision-plan",
    phase: "plan",
    artifact_path: "/tmp/plan.md",
    created_at: "2026-01-01T00:00:00Z",
  }));
  const awaiting = await run(["next"], approvalProject);
  assert.equal(awaiting.code, 1);
  assert.match(awaiting.stdout, /Awaiting plan approval \(\/tmp\/plan\.md\)\. Run `agent-loop approve plan`/);
  const awaitingJson = await run(["--json", "next"], approvalProject);
  assert.equal(awaitingJson.code, 1);
  const awaitingJsonLines = awaitingJson.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(awaitingJsonLines[0].type, "command_started");
  assert.deepEqual(awaitingJsonLines[1], {
    type: "next",
    data: {
      action: "awaiting_plan_approval",
      artifactPath: "/tmp/plan.md",
    },
  });
});

test("next fresh task routes into selected plan state setup", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["next", "--task", "Build routed plan"], project, { NEXT_SKIP_DISCUSS: "true" });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Plan state initialized\./);
  assert.doesNotMatch(result.stdout, /^agent-loop plan/m);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "plan\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), "Build routed plan");
});

test("next fresh file routes into selected spec state setup", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ requirements_workflow: "spec" }));
  await writeFile(resolve(project, "task.md"), "Build routed spec");
  const result = await run(
    ["next", "--file", "task.md"],
    project,
    { NEXT_SKIP_DISCUSS: "true" },
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Spec state initialized\./);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "spec\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), "Build routed spec");
});

test("next consensus transitions follow Rust decision table", async () => {
  const discussProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(discussProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(discussProject, ".agent-loop/state/workflow.txt"), "discuss\n");
  await writeFile(resolve(discussProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(discussProject, ".agent-loop/state/task.md"), "Build consensus plan");
  const discussNext = await run(["next"], discussProject);
  assert.equal(discussNext.code, 0);
  assert.match(discussNext.stdout, /^Plan state initialized\./);
  assert.equal(await readFile(resolve(discussProject, ".agent-loop/state/workflow.txt"), "utf8"), "plan\n");
  assert.equal(await readFile(resolve(discussProject, ".agent-loop/state/task.md"), "utf8"), "Build consensus plan");

  const discussSpecProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(discussSpecProject, ".agent-loop.json"), JSON.stringify({ requirements_workflow: "spec" }));
  await mkdir(resolve(discussSpecProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(discussSpecProject, ".agent-loop/state/workflow.txt"), "discuss\n");
  await writeFile(resolve(discussSpecProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(discussSpecProject, ".agent-loop/state/task.md"), "Build consensus spec");
  const discussSpecNext = await run(["next"], discussSpecProject);
  assert.equal(discussSpecNext.code, 0);
  assert.match(discussSpecNext.stdout, /^Spec state initialized\./);
  assert.equal(await readFile(resolve(discussSpecProject, ".agent-loop/state/workflow.txt"), "utf8"), "spec\n");
  assert.equal(await readFile(resolve(discussSpecProject, ".agent-loop/state/task.md"), "utf8"), "Build consensus spec");

  const specProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(specProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(specProject, ".agent-loop/state/workflow.txt"), "spec\n");
  await writeFile(resolve(specProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(specProject, ".agent-loop/state/task.md"), "Build plan from spec");
  const specNext = await run(["next"], specProject);
  assert.equal(specNext.code, 0);
  assert.match(specNext.stdout, /^Plan state initialized\./);
  assert.equal(await readFile(resolve(specProject, ".agent-loop/state/workflow.txt"), "utf8"), "plan\n");
  assert.equal(await readFile(resolve(specProject, ".agent-loop/state/task.md"), "utf8"), "Build plan from spec");

  const planProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(planProject, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(planProject, ".agent-loop/state/workflow.txt"), "plan\n");
  await writeFile(resolve(planProject, ".agent-loop/state/status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(planProject, ".agent-loop/state/task.md"), "Build tasks from plan");
  await writeFile(resolve(planProject, ".agent-loop/state/plan.md"), "Plan body");
  const planNext = await run(["next"], planProject);
  assert.equal(planNext.code, 0);
  assert.match(planNext.stdout, /^Tasks state initialized\./);
  assert.equal(await readFile(resolve(planProject, ".agent-loop/state/workflow.txt"), "utf8"), "decompose\n");
  assert.equal(await readFile(resolve(planProject, ".agent-loop/state/task.md"), "utf8"), "Build tasks from plan");
  assert.equal(await readFile(resolve(planProject, ".agent-loop/state/plan.md"), "utf8"), "Plan body");
});

test("next verification failed routes through plan fixes file", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "verify\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFICATION_FAILED", round: 1 }));
  await writeFile(resolve(stateDir, "verification-fixes.md"), "# Fixes\nRework export endpoint");

  const result = await run(["next"], project);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Plan state initialized\./);
  assert.equal(await readFile(resolve(stateDir, "workflow.txt"), "utf8"), "plan\n");
  assert.equal(await readFile(resolve(stateDir, "task.md"), "utf8"), "# Fixes\nRework export endpoint");
});

test("next context limit selects workflow resume boundary", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "plan\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONTEXT_LIMIT", round: 1 }));
  await writeFile(resolve(stateDir, "plan.md"), "Existing plan");

  const result = await run(["next"], project);

  assert.equal(result.code, 2);
  assert.match(result.stdout, /^Plan resume shell is unsupported in node-cli first pass\./);
});

test("next clears stale verification and runs verify after implementation consensus", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ single_agent: true, verify_auto_test: false }));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Ship export endpoint");
  await writeFile(resolve(stateDir, "plan.md"), "## Plan\n\n### 1. Add export endpoint\n");
  await writeFile(resolve(stateDir, "review.md"), "APPROVED");
  await writeFile(resolve(stateDir, "verification.json"), JSON.stringify({ items: [{ id: "old", status: "failed" }] }));
  await writeFile(resolve(stateDir, "verification.md"), "stale report");
  await writeFile(resolve(stateDir, "verification-fixes.md"), "stale fixes");

  const agentRunner = async () => ({
    status: 0,
    stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
    stderr: "",
  });

  const result = await run(["next"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "VERIFIED");
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "verification.json"), "utf8")).items[0].id, "V1");
  await assert.rejects(() => readFile(resolve(stateDir, "verification-fixes.md"), "utf8"), /ENOENT/);
});

test("discuss runs facilitator loop and writes preferences when decisions are captured", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 1) {
      return { status: 0, stdout: "Which users should this serve?", stderr: "" };
    }
    await mkdir(resolve(command.cwd, ".agent-loop"), { recursive: true });
    await writeFile(resolve(command.cwd, ".agent-loop/preferences.md"), "- Users: internal operators\n");
    return { status: 0, stdout: "All decisions captured.", stderr: "" };
  };

  const result = await run(
    ["--simple", "discuss", "--task", "Build a reporting flow"],
    project,
    {},
    { agentRunner, readAnswer: async () => "Internal operators" },
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Which users should this serve\?/);
  assert.match(result.stdout, /Your answer:/);
  assert.equal(calls.length, 2);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "discuss\n");
  const progress = await readFile(resolve(project, ".agent-loop/state/discuss-progress.md"), "utf8");
  assert.match(progress, /### Round 1 — Question \(Facilitator\)\nWhich users should this serve\?/);
  assert.match(progress, /### Round 1 — Answer \(User\)\nInternal operators/);
  assert.equal(await readFile(resolve(project, ".agent-loop/preferences.md"), "utf8"), "- Users: internal operators\n");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "CONSENSUS");
});

test("discuss resume answers a pending question before continuing", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "discuss\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "AWAITING_INPUT", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Build a reporting flow");
  await writeFile(resolve(stateDir, "discuss-progress.md"), "### Round 1 — Question (Facilitator)\nWhich users?\n\n");

  const agentRunner = async (command) => {
    await mkdir(resolve(command.cwd, ".agent-loop"), { recursive: true });
    await writeFile(resolve(command.cwd, ".agent-loop/preferences.md"), "- Users: support team\n");
    return { status: 0, stdout: "All decisions captured.", stderr: "" };
  };
  const result = await run(
    ["discuss", "--resume"],
    project,
    {},
    { agentRunner, readAnswer: async () => "Support team" },
  );

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Resuming from previous question/);
  const progress = await readFile(resolve(project, ".agent-loop/state/discuss-progress.md"), "utf8");
  assert.match(progress, /### Round 1 — Answer \(User\)\nSupport team/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "CONSENSUS");
});

test("discuss runs distinct reviewer and planner challenger approvals before finalization", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    implementer: "claude",
    reviewer: "codex",
    planner: "qwen",
    discuss_multi_agent: true,
  }));
  const providers = [];
  const agentRunner = async (command) => {
    providers.push(command.provider);
    if (providers.length === 1) {
      await mkdir(resolve(command.cwd, ".agent-loop"), { recursive: true });
      await writeFile(resolve(command.cwd, ".agent-loop/preferences.md"), "- Draft: serve admins\n");
      return { status: 0, stdout: "All decisions captured.", stderr: "" };
    }
    if (providers.length === 2 || providers.length === 3) {
      return { status: 0, stdout: "DISCUSS_CHALLENGER_APPROVED", stderr: "" };
    }
    return { status: 0, stdout: "- Final: serve admins\n", stderr: "" };
  };

  const result = await run(["discuss", "--task", "Build admin reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.deepEqual(providers, ["claude", "codex", "qwen", "claude"]);
  const progress = await readFile(resolve(project, ".agent-loop/state/discuss-progress.md"), "utf8");
  assert.match(progress, /### Round 1 — Approval \(Reviewer\)\nDISCUSS_CHALLENGER_APPROVED/);
  assert.match(progress, /### Round 1 — Approval \(Planner\)\nDISCUSS_CHALLENGER_APPROVED/);
  assert.equal(await readFile(resolve(project, ".agent-loop/preferences.md"), "utf8"), "- Final: serve admins");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "CONSENSUS");
});

test("discuss discovery prepass remains explicitly unsupported", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["discuss", "--task", "Build", "--discover"], project);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unsupported in node-cli first pass: discuss --discover/);
});

test("implement task runs implementer and reviewer before simple auto-consensus", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.deepEqual(calls.map((call) => call.provider), ["claude", "claude"]);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "implement\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/implement-mode.txt"), "utf8"), "batch\n");
  assert.deepEqual(JSON.parse(await readFile(resolve(project, ".agent-loop/state/implement-flags.json"), "utf8")), {
    per_task: false,
    wave: false,
    max_retries: 2,
    round_step: 2,
    continue_on_fail: false,
    fail_fast: false,
    max_parallel: null,
  });
  assert.match(await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8"), /Consensus: AUTO-CONSENSUS \(simple mode\)/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/review.md"), "utf8"), "Approved.\n");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "CONSENSUS");
});

test("implement file wraps specification content and preserves an existing plan", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(project, "task.md"), "Add report export\n");
  await writeFile(resolve(stateDir, "plan.md"), "Existing plan context\n");
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement", "--file", "task.md"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  const task = await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8");
  assert.match(task, /^# Implementation Task \(source: task\.md\)/);
  assert.match(task, /Add report export/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/plan.md"), "utf8"), "Existing plan context\n");
});

test("implement runs batch mode from existing tasks state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "task.md"), "Original reporting request\n");
  await writeFile(resolve(stateDir, "plan.md"), "Approved plan context\n");
  await writeFile(resolve(stateDir, "tasks.md"), "### Task 1: Export reports\nBuild export.\n\n## 2. Audit logs\nRecord events.\n");
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Found 2 tasks in \.agent-loop\/state\/tasks\.md/);
  assert.match(result.stdout, /Running batch implementation for all tasks in a single loop\./);
  const task = await readFile(resolve(stateDir, "task.md"), "utf8");
  assert.match(task, /^Implement ALL tasks below as one cohesive change set\./);
  assert.match(task, /### Task 1: Export reports/);
  assert.match(task, /## 2\. Audit logs/);
  assert.equal(await readFile(resolve(stateDir, "workflow.txt"), "utf8"), "implement\n");
  assert.equal(await readFile(resolve(stateDir, "plan.md"), "utf8"), "Approved plan context\n");
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "CONSENSUS");
});

test("implement falls back to existing plan when tasks are absent", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "task.md"), "Original export request\n");
  await writeFile(resolve(stateDir, "plan.md"), "Approved plan body\n");
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /No tasks found; falling back to plan\.md for batch implementation\./);
  const task = await readFile(resolve(stateDir, "task.md"), "utf8");
  assert.match(task, /^Implement the approved plan below as one cohesive change set\./);
  assert.match(task, /ORIGINAL TASK:\nOriginal export request/);
  assert.match(task, /PLAN:\nApproved plan body/);
  assert.equal(await readFile(resolve(stateDir, "plan.md"), "utf8"), "Approved plan body\n");
});

test("next delegates final implement selection into existing tasks batch mode", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "decompose\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Original task\n");
  await writeFile(resolve(stateDir, "plan.md"), "Approved plan\n");
  await writeFile(resolve(stateDir, "tasks.md"), "## Task 1: Build export\nDo it.\n");
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "next"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /^agent-loop implement/m);
  assert.match(result.stdout, /Running batch implementation for all tasks in a single loop\./);
  assert.equal(await readFile(resolve(stateDir, "workflow.txt"), "utf8"), "implement\n");
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "CONSENSUS");
});

test("implement resume reruns batch implementation without clearing existing state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONTEXT_LIMIT", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Persisted implementation task\n");
  await writeFile(resolve(stateDir, "plan.md"), "Persisted plan\n");
  await writeFile(resolve(stateDir, "implement-mode.txt"), "batch\n");
  await writeFile(resolve(stateDir, "implement-flags.json"), JSON.stringify({ per_task: false, wave: false, max_retries: 2 }));
  await writeFile(resolve(stateDir, "implement-progress.md"), "Previous marker\n");
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement", "--resume"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Elapsed: 00:00:00/);
  assert.equal(calls.length, 2);
  assert.equal(await readFile(resolve(stateDir, "workflow.txt"), "utf8"), "implement\n");
  assert.equal(await readFile(resolve(stateDir, "task.md"), "utf8"), "Persisted implementation task\n");
  assert.equal(await readFile(resolve(stateDir, "plan.md"), "utf8"), "Persisted plan\n");
  const progress = await readFile(resolve(stateDir, "implement-progress.md"), "utf8");
  assert.match(progress, /Previous marker/);
  assert.match(progress, /Implementation: Round 1 complete/);
  assert.match(progress, /Consensus: AUTO-CONSENSUS/);
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "CONSENSUS");
});

test("implement resume validates workflow and unsupported persisted modes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "plan\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONTEXT_LIMIT", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Persisted implementation task\n");

  const wrongWorkflow = await run(["implement", "--resume"], project);
  assert.equal(wrongWorkflow.code, 1);
  assert.match(wrongWorkflow.stderr, /State error: Cannot resume implementation: workflow is not 'implement'\./);

  const perTaskProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const perTaskState = resolve(perTaskProject, ".agent-loop/state");
  await mkdir(perTaskState, { recursive: true });
  await writeFile(resolve(perTaskState, "workflow.txt"), "implement\n");
  await writeFile(resolve(perTaskState, "status.json"), JSON.stringify({ status: "CONTEXT_LIMIT", round: 1 }));
  await writeFile(resolve(perTaskState, "task.md"), "Persisted implementation task\n");
  await writeFile(resolve(perTaskState, "implement-mode.txt"), "per-task\n");

  const perTask = await run(["implement", "--resume"], perTaskProject);
  assert.equal(perTask.code, 2);
  assert.match(perTask.stderr, /Unsupported in node-cli first pass: implement --resume per-task mode/);

  const batchDisabledProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const batchDisabledState = resolve(batchDisabledProject, ".agent-loop/state");
  await writeFile(resolve(batchDisabledProject, ".agent-loop.json"), JSON.stringify({ batch_implement: false }));
  await mkdir(batchDisabledState, { recursive: true });
  await writeFile(resolve(batchDisabledState, "workflow.txt"), "implement\n");
  await writeFile(resolve(batchDisabledState, "status.json"), JSON.stringify({ status: "CONTEXT_LIMIT", round: 1 }));
  await writeFile(resolve(batchDisabledState, "task.md"), "Persisted implementation task\n");

  const batchDisabled = await run(["implement", "--resume"], batchDisabledProject);
  assert.equal(batchDisabled.code, 1);
  assert.match(batchDisabled.stderr, /Config error: Cannot resume implementation in per-task mode without persisted mode metadata/);
});

test("implement retries needs-changes review when review_max_rounds is bounded", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ review_max_rounds: 2 }));
  const calls = [];
  let reviewCount = 0;
  const agentRunner = async (command) => {
    calls.push(command);
    if (command.args.join(" ").includes("Review implementation")) {
      reviewCount += 1;
      const status = reviewCount === 1
        ? { status: "NEEDS_CHANGES", round: 1, reason: "missing tests", timestamp: "2026-01-02T03:04:05.006Z" }
        : { status: "APPROVED", round: 2, timestamp: "2026-01-02T03:04:05.006Z" };
      await writeFile(resolve(command.cwd, ".agent-loop/state/status.json"), JSON.stringify(status));
      return { status: 0, stdout: `${status.status}\n`, stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement", "--task", "Ship retry"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 4);
  assert.match(calls[2].args.join("\n"), /Address the reviewer's feedback in \.agent-loop\/state\/review\.md/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /## Round 1\nImplementation: Round 1 complete/);
  assert.match(progress, /Retry: continuing to round 2/);
  assert.match(progress, /## Round 2\nImplementation: Round 2 complete/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.equal(status.round, 2);
});

test("implement bounded retry writes max rounds when review never approves", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  let reviewCount = 0;
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      reviewCount += 1;
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: reviewCount, reason: `missing tests round ${reviewCount}`, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Needs tests.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement", "--task", "Ship retry"], project, { REVIEW_MAX_ROUNDS: "2" }, { agentRunner });

  assert.equal(result.code, 1);
  assert.equal(reviewCount, 2);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "MAX_ROUNDS");
  assert.equal(status.round, 2);
  assert.equal(status.reason, "missing tests round 2");
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /MAX_ROUNDS - missing tests round 2/);
});

test("implement needs-changes review stops at the documented partial boundary", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const agentRunner = async (command) => {
    if (command.args.join(" ").includes("Review implementation")) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: "missing tests", timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Needs tests.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Implementation retry loops are not yet supported/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "NEEDS_CHANGES");
});

test("implement writes passing quality evidence and references it in review prompts", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    auto_test: true,
    quality_commands: [{ command: "node -e \"console.log('quality pass')\"" }],
  }));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 1, timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship quality evidence"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 4);
  assert.match(calls[1].args.join("\n"), /Review automated check output from \.agent-loop\/state\/quality_checks\.md/);
  assert.match(calls[2].args.join("\n"), /Review check output from \.agent-loop\/state\/quality_checks\.md/);
  const quality = await readFile(resolve(project, ".agent-loop/state/quality_checks.md"), "utf8");
  assert.match(quality, /QUALITY CHECKS:/);
  assert.match(quality, /node -e "console\.log\('quality pass'\)" \[PASS\]/);
  const log = await readFile(resolve(project, ".agent-loop/state/log.txt"), "utf8");
  assert.match(log, /Running quality checks/);
  assert.match(log, /Quality check PASS: node -e "console\.log\('quality pass'\)"/);
});

test("implement quality failures are reviewer evidence and do not block Gate A", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    auto_test: true,
    quality_commands: [{
      command: "node -e \"console.error('quality fail'); process.exit(7)\"",
      remediation: "Fix quality failures.",
    }],
  }));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved despite known quality evidence.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 1, timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship quality failure evidence"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 4);
  assert.match(calls[1].args.join("\n"), /Review automated check output from \.agent-loop\/state\/quality_checks\.md/);
  const quality = await readFile(resolve(project, ".agent-loop/state/quality_checks.md"), "utf8");
  assert.match(quality, /--- node -e "console\.error\('quality fail'\); process\.exit\(7\)" \[FAIL\] ---/);
  assert.match(quality, /REMEDIATION: Fix quality failures\./);
  assert.match(quality, /quality fail/);
});

test("implement dual-agent approval path runs fresh-context Gate B and implementer signoff", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), calls.length === 2 ? "Gate A approved.\n" : "Gate B approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 1, timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 4);
  assert.match(calls[1].args.join("\n"), /Review implementation/);
  assert.match(calls[2].args.join("\n"), /fresh-context reviewer for Gate B/);
  assert.match(calls[3].args.join("\n"), /If you agree: \{"status": "CONSENSUS"/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Gate A: APPROVED/);
  assert.match(progress, /Gate B: APPROVED \(fresh-context\)/);
  assert.match(progress, /Implementer signoff: CONSENSUS/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.equal(status.round, 1);
});

test("implement Gate B verification withdrawn findings proceeds to signoff", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Gate A approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Gate B found an issue.\n");
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/findings.json"),
        JSON.stringify({ round: 1, findings: [{ id: "F-001", severity: "HIGH", summary: "Missing test", file_refs: ["src/a.js:4"] }] }),
      );
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: "missing test", timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Gate B withdrew the finding.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.008Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 5) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 1, timestamp: "2026-01-02T03:04:05.009Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 5);
  assert.match(calls[3].args.join("\n"), /SAME fresh-context reviewer from Gate B/);
  assert.match(calls[3].args.join("\n"), /If ALL withdrawn: write APPROVED/);
  assert.match(calls[4].args.join("\n"), /If you agree: \{"status": "CONSENSUS"/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Gate B: NEEDS_CHANGES \(fresh-context\) - missing test/);
  assert.match(progress, /Gate B verification: APPROVED/);
  assert.match(progress, /Implementer signoff: CONSENSUS/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "CONSENSUS");
});

test("implement Gate B verification confirmed findings can enter bounded retry", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ review_max_rounds: 2 }));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 6 || calls.length === 7) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), calls.length === 7 ? "Gate B approved.\n" : "Gate A approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: calls.length === 2 ? 1 : 2, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: calls.length === 2 ? 1 : 2, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 3 || calls.length === 4) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), calls.length === 3 ? "Gate B found an issue.\n" : "Gate B confirmed the issue.\n");
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/findings.json"),
        JSON.stringify({ round: 1, findings: [{ id: "F-001", severity: "HIGH", summary: "Missing test", file_refs: ["src/a.js:4"] }] }),
      );
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: calls.length === 3 ? "missing test" : "confirmed missing test", timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 8) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 2, timestamp: "2026-01-02T03:04:05.009Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 8);
  assert.match(calls[4].args.join("\n"), /Address the reviewer's feedback in \.agent-loop\/state\/review\.md/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Gate B verification: NEEDS_CHANGES - confirmed missing test/);
  assert.match(progress, /Retry: continuing to round 2/);
  assert.match(progress, /## Round 2\nImplementation: Round 2 complete/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.equal(status.round, 2);
});

test("implement Gate C rejects disputed late findings and reaches consensus", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "DISPUTED", round: 1, reason: "late concern", timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "Disputed.\n", stderr: "" };
    }
    if (calls.length === 5) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Late concern rejected.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.008Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 5);
  assert.match(calls[4].args.join("\n"), /The implementer has DISPUTED the consensus with late findings/);
  assert.match(calls[4].args.join("\n"), /IMPLEMENTER'S DISPUTE REASON:\nlate concern/);
  assert.match(calls[4].args.join("\n"), /If REJECTED: write APPROVED/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Implementer signoff: DISPUTED - late concern/);
  assert.match(progress, /Gate C bounce: APPROVED \(late findings verification\)/);
  assert.match(progress, /Consensus: CONSENSUS \(late findings rejected\)/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.equal(status.reason, "CONSENSUS: late findings rejected by reviewer");
});

test("implement Gate C confirmed late findings can enter bounded retry", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ review_max_rounds: 2 }));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2 || calls.length === 3 || calls.length === 7 || calls.length === 8) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: calls.length < 7 ? 1 : 2, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: calls.length < 7 ? 1 : 2, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "DISPUTED", round: 1, reason: "late concern", timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "Disputed.\n", stderr: "" };
    }
    if (calls.length === 5) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Late concern confirmed.\n");
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/findings.json"),
        JSON.stringify({ round: 1, findings: [{ id: "F-001", severity: "HIGH", summary: "Late concern", file_refs: ["src/a.js:4"] }] }),
      );
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: "confirmed late concern", timestamp: "2026-01-02T03:04:05.008Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 9) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 2, timestamp: "2026-01-02T03:04:05.009Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["implement", "--task", "Ship reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 9);
  assert.match(calls[4].args.join("\n"), /If CONFIRMED: write NEEDS_CHANGES/);
  assert.match(calls[5].args.join("\n"), /Address the reviewer's feedback in \.agent-loop\/state\/review\.md/);
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Gate C bounce: NEEDS_CHANGES \(late findings verification\) - confirmed late concern/);
  assert.match(progress, /Retry: continuing to round 2/);
  assert.match(progress, /## Round 2\nImplementation: Round 2 complete/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.equal(status.round, 2);
});

test("implement unsupported modes return explicit partial-support errors", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const resumePerTask = await run(["implement", "--resume", "--per-task"], project);
  assert.equal(resumePerTask.code, 1);
  assert.match(resumePerTask.stderr, /--per-task cannot be combined with --resume/);

  const emptyState = await run(["implement"], project);
  assert.equal(emptyState.code, 1);
  assert.match(emptyState.stderr, /State error: No tasks found and no plan found/);

  const perTaskProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(perTaskProject, ".agent-loop.json"), JSON.stringify({ batch_implement: false }));
  const batchDisabled = await run(["implement"], perTaskProject);
  assert.equal(batchDisabled.code, 2);
  assert.match(batchDisabled.stderr, /Unsupported in node-cli first pass: implement with batch_implement=false/);
});

test("implement-verify task runs implementation then verification", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    if (calls.length === 3) {
      return {
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Reporting task is implemented",
            status: "passed",
            evidence: "src/reporting.js:1",
            artifact_exists: true,
            artifact_substantive: true,
            artifact_wired: true,
          },
        ], "1 of 1 plan goals verified"),
        stderr: "",
      };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement-verify", "--task", "# Task\nShip reporting"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.provider), ["claude", "claude", "claude"]);
  assert.match(calls[0].args.join("\n"), /Implement ONLY the task/);
  assert.match(calls[1].args.join("\n"), /Review implementation/);
  assert.match(calls[2].args.join("\n"), /acceptance verification against the original plan/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "verify\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/implement-mode.txt"), "utf8"), "batch\n");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFIED");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8")).items[0].plan_ref, "goal-1");
  const progress = await readFile(resolve(project, ".agent-loop/state/implement-progress.md"), "utf8");
  assert.match(progress, /Consensus: AUTO-CONSENSUS \(simple mode\)/);
});

test("implement-verify runs from existing tasks state before verification", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "tasks.md"), "### Task 1: Ship reporting\n- Add the reporting export.\n");
  await writeFile(resolve(stateDir, "plan.md"), "## Goal 1\nShip reporting export.\n");

  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    if (calls.length === 3) {
      return {
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Reporting export is implemented",
            status: "passed",
            evidence: "src/reporting.js:1",
            artifact_exists: true,
            artifact_substantive: true,
            artifact_wired: true,
          },
        ], "1 of 1 plan goals verified"),
        stderr: "",
      };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement-verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 3);
  assert.match(result.stdout, /Found 1 tasks in \.agent-loop\/state\/tasks\.md/);
  assert.match(calls[0].args.join("\n"), /Implement ONLY the task in \.agent-loop\/state\/task\.md/);
  assert.match(calls[2].args.join("\n"), /acceptance verification against the original plan/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "verify\n");
  assert.match(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), /TASKS:\n### Task 1: Ship reporting/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFIED");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8")).items[0].status, "passed");
});

test("implement-verify falls back to existing plan state before verification", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "task.md"), "Ship reporting export");
  await writeFile(resolve(stateDir, "plan.md"), "## goal-1: Ship reporting export\nShip reporting export from the approved plan.\n");

  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "Approved.\n", stderr: "" };
    }
    if (calls.length === 3) {
      return {
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Reporting export is implemented",
            status: "passed",
            evidence: "src/reporting.js:1",
            artifact_exists: true,
            artifact_substantive: true,
            artifact_wired: true,
          },
        ], "1 of 1 plan goals verified"),
        stderr: "",
      };
    }
    return { status: 0, stdout: "Implemented.\n", stderr: "" };
  };

  const result = await run(["--simple", "implement-verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 3);
  assert.match(result.stdout, /No tasks found; falling back to plan\.md for batch implementation\./);
  assert.match(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), /PLAN:\n## goal-1: Ship reporting export/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/plan.md"), "utf8"), "## goal-1: Ship reporting export\nShip reporting export from the approved plan.\n");
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFIED");
});

test("implement-verify unsupported boundaries stay explicit", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const resume = await run(["implement-verify", "--resume"], project);
  assert.equal(resume.code, 2);
  assert.match(resume.stderr, /Unsupported in node-cli first pass: implement-verify --resume/);

  const noTask = await run(["implement-verify"], project);
  assert.equal(noTask.code, 1);
  assert.match(noTask.stderr, /State error: No tasks found and no plan found/);
});

test("inline task runs the implementer directly and completes state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const result = await run(["inline", "--task", "Ship inline mode"], project, {}, {
    agentRunner: async (command) => {
      calls.push(command);
      return { status: 0, stdout: "Implemented directly.\n", stderr: "" };
    },
  });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "claude");
  assert.match(calls[0].args.join("\n"), /Read the task from \.agent-loop\/state\/task\.md and implement it directly/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/original-request.md"), "utf8"), "Ship inline mode");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), "Ship inline mode");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "implement\n");
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "COMPLETED");
  assert.equal(status.round, 1);
  assert.equal(status.reason, "Inline execution completed");
});

test("inline file input matches Rust file-preference behavior", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, "inline-task.md"), "File task\n");

  const result = await run(["inline", "--task", "Ignored task", "--file", "inline-task.md"], project, {}, {
    agentRunner: async () => ({ status: 0, stdout: "done\n", stderr: "" }),
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), "File task\n");
});

test("inline agent failures update status and exit non-zero", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["inline", "--task", "Ship inline mode"], project, {}, {
    agentRunner: async () => ({ status: 7, stdout: "", stderr: "agent failed\n" }),
  });

  assert.equal(result.code, 1);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "ERROR");
  assert.equal(status.reason, "Inline execution failed");
  assert.equal(status.round, 1);
});

test("inline quality checks are non-blocking and logged when auto_test is enabled", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(
    resolve(project, ".agent-loop.json"),
    JSON.stringify({
      auto_test: true,
      inline_quality_check: true,
      quality_commands: [{ command: "node -e \"console.error('quality fail'); process.exit(7)\"" }],
    }),
  );

  const result = await run(["inline", "--task", "Ship inline mode"], project, {}, {
    agentRunner: async () => ({ status: 0, stdout: "done\n", stderr: "" }),
  });

  assert.equal(result.code, 0);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "COMPLETED");
  const log = await readFile(resolve(project, ".agent-loop/state/log.txt"), "utf8");
  assert.match(log, /Running quality checks/);
  assert.match(log, /Quality check FAIL/);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/quality_checks.md"), "utf8"), /ENOENT/);
});

test("inline auto-commit remains an explicit unsupported boundary", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ inline_auto_commit: true }));

  const result = await run(["inline", "--task", "Ship inline mode"], project, {}, {
    agentRunner: async () => {
      throw new Error("agent should not run");
    },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unsupported in node-cli first pass: inline_auto_commit=true/);
});

test("review files path runs primary reviewer and approves empty findings", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, "src"), { recursive: true });
  await writeFile(resolve(project, "src/a.js"), "export const a = 1;\n");
  await writeFile(resolve(project, "context.md"), "Review context\n");
  await writeFile(resolve(project, "plan.md"), "Plan context\n");

  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved.\n");
    await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/status.json"),
      JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
    );
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await run(
    ["review", "focus on auth", "--files", "src/a.js", "--file", "context.md", "--plan", "plan.md", "--single-agent"],
    project,
    {},
    { agentRunner },
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "No issues found.\n");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "claude");
  assert.match(calls[0].args.join("\n"), /FOCUS AREA: focus on auth/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "review\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8"), "Review context\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/plan.md"), "utf8"), "Plan context\n");
  assert.equal(
    await readFile(resolve(project, ".agent-loop/state/changes.md"), "utf8"),
    "# Files to Review\n\n- src/a.js\n\nRead each file listed above and review the code.",
  );
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "APPROVED");
  assert.equal(status.reason, "No findings from primary review.");
});

test("review confirmed findings run the supported simple implementation fix loop", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 2) {
      return { status: 0, stdout: "Implemented fix.\n", stderr: "" };
    }
    if (calls.length === 3) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved fix.\n");
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.007Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/findings.json"),
      JSON.stringify({
        round: 1,
        findings: [{ id: "F-001", severity: "HIGH", summary: "Missing authorization check", file_refs: ["src/a.js:12"] }],
      }),
    );
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/status.json"),
      JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: "security gap", timestamp: "2026-01-02T03:04:05.006Z" }),
    );
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await run(["--simple", "review", "--files", "src/a.js"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Confirmed findings - transitioning to implementation loop to fix issues\./);
  assert.match(result.stdout, /Elapsed: 00:00:00/);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 3);
  assert.match(calls[1].args.join("\n"), /Read the task from \.agent-loop\/state\/task\.md/);
  assert.match(calls[2].args.join("\n"), /Review implementation/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "implement\n");
  const task = await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8");
  assert.match(task, /# Review Findings to Fix/);
  assert.match(task, /- F-001 \[HIGH\] Missing authorization check \(src\/a\.js:12\)/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
  assert.match(status.reason, /AUTO-CONSENSUS \(simple mode\)/);
});

test("review dual-agent adversarial validation can withdraw primary findings", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 1) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/findings.json"),
        JSON.stringify({ round: 1, findings: [{ id: "F-001", severity: "MEDIUM", summary: "Needs validation", file_refs: [] }] }),
      );
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "NEEDS_CHANGES", round: 1, reason: "needs validation", timestamp: "2026-01-02T03:04:05.006Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Withdrawn after adversarial validation.\n");
    await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/status.json"),
      JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.006Z" }),
    );
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await run(["review", "--files", "src/a.js"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "No issues found.\n");
  assert.equal(calls.length, 2);
  assert.match(calls[1].args.join("\n"), /adversarial validation of a standalone code review/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "review\n");
  assert.deepEqual(JSON.parse(await readFile(resolve(project, ".agent-loop/state/findings.json"), "utf8")).findings, []);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "APPROVED");
  assert.equal(status.reason, "All findings withdrawn after adversarial review.");
});

test("review dual-agent confirmed findings can complete through implementation Gate B signoff", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    if (calls.length === 3) {
      return { status: 0, stdout: "Implemented fix.\n", stderr: "" };
    }
    if (calls.length === 4) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Approved implementation.\n");
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.008Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 5) {
      await writeFile(resolve(command.cwd, ".agent-loop/state/review.md"), "Fresh-context reviewer approved implementation.\n");
      await writeFile(resolve(command.cwd, ".agent-loop/state/findings.json"), JSON.stringify({ round: 1, findings: [] }));
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "APPROVED", round: 1, timestamp: "2026-01-02T03:04:05.009Z" }),
      );
      return { status: 0, stdout: "", stderr: "" };
    }
    if (calls.length === 6) {
      await writeFile(
        resolve(command.cwd, ".agent-loop/state/status.json"),
        JSON.stringify({ status: "CONSENSUS", round: 1, timestamp: "2026-01-02T03:04:05.010Z" }),
      );
      return { status: 0, stdout: "Consensus.\n", stderr: "" };
    }
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/findings.json"),
      JSON.stringify({
        round: 1,
        findings: [{ id: "F-001", severity: "MEDIUM", summary: calls.length === 1 ? "Needs validation" : "Confirmed validation gap", file_refs: ["src/a.js:4"] }],
      }),
    );
    await writeFile(
      resolve(command.cwd, ".agent-loop/state/status.json"),
      JSON.stringify({
        status: "NEEDS_CHANGES",
        round: 1,
        reason: calls.length === 1 ? "needs validation" : "confirmed finding",
        timestamp: calls.length === 1 ? "2026-01-02T03:04:05.006Z" : "2026-01-02T03:04:05.007Z",
      }),
    );
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await run(["review", "--files", "src/a.js"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(calls.length, 6);
  assert.match(calls[1].args.join("\n"), /Primary findings to validate:\n- F-001 \[MEDIUM\] Needs validation \(src\/a\.js:4\)/);
  assert.match(calls[2].args.join("\n"), /Read the task from \.agent-loop\/state\/task\.md/);
  assert.match(calls[3].args.join("\n"), /Review implementation/);
  assert.match(calls[4].args.join("\n"), /fresh-context reviewer for Gate B/);
  assert.match(calls[5].args.join("\n"), /If you agree: \{"status": "CONSENSUS"/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "implement\n");
  const task = await readFile(resolve(project, ".agent-loop/state/task.md"), "utf8");
  assert.match(task, /- F-001 \[MEDIUM\] Confirmed validation gap \(src\/a\.js:4\)/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "CONSENSUS");
});

test("review treats a reviewer that does not update status as protocol failure", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(
    ["review", "--files", "src/a.js", "--single-agent"],
    project,
    {},
    { agentRunner: async () => ({ status: 0, stdout: "", stderr: "" }) },
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Review failed: Primary reviewer exited without writing status \(protocol failure\)/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "ERROR");
  assert.equal(status.reason, "Reviewer exited without writing status.");
});

async function seedConsensusState(project) {
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "implement\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "CONSENSUS", round: 1 }));
  await writeFile(resolve(stateDir, "task.md"), "Build reporting export\n");
  await writeFile(resolve(stateDir, "plan.md"), "1. Add export endpoint\n");
  await writeFile(resolve(stateDir, "tasks.md"), "- Add export endpoint\n");
  await writeFile(resolve(stateDir, "review.md"), "Approved\n");
  await writeFile(resolve(stateDir, "implement-progress.md"), "Consensus reached\n");
}

function verificationOutputForItems(items, summary = "verification summary") {
  return `<verification_markdown>
# Verification Report
Generated by test verifier.
</verification_markdown>
<verification_json>
${JSON.stringify({ items, summary })}
</verification_json>`;
}

async function seedPendingPlanApproval(project, decisionId = "decision-1") {
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "plan-pending-approval.flag"), JSON.stringify({
    decision_id: decisionId,
    phase: "plan",
    artifact_path: ".agent-loop/state/plan.md",
    created_at: "2026-05-02T00:00:00Z",
  }));
  return stateDir;
}

test("verify rejects fresh runs before implementation consensus", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["verify"], project);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cannot verify: status is PENDING \(expected implementation Consensus\)\./);
  assert.match(result.stderr, /Run `agent-loop implement` first/);
});

test("verify fresh automated round persists passing artifacts and status", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "claude");
  assert.match(calls[0].args.join("\n"), /acceptance verification against the original plan/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/workflow.txt"), "utf8"), "verify\n");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/verification.md"), "utf8"), "# Verification Report\nAll goals passed.");
  const report = JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8"));
  assert.equal(report.checklist_source, "automated");
  assert.equal(report.items[0].status, "passed");
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "VERIFIED");
  assert.match(status.reason, /FreshContextSelfCheck/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Started: mode=FreshContextSelfCheck resume=false max_rounds=1/);
  assert.match(progress, /Parsed report: 1 item\(s\) \(1 passed\)/);
  assert.match(progress, /Gate B skipped: verification is already single-agent/);
  assert.match(progress, /Verified: all verification items passed/);
});

test("verify completion invariants reject stale handoff after passing verifier", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const agentRunner = async (command) => {
    await writeFile(resolve(command.cwd, ".agent-loop/state/handoff.json"), "{}\n");
    return {
      status: 0,
      stdout: verificationOutputForItems([
        {
          id: "V1",
          plan_ref: "goal-1",
          description: "Export endpoint exists",
          status: "passed",
          evidence: "src/export.js:1",
          artifact_exists: true,
          artifact_substantive: true,
          artifact_wired: true,
        },
      ], "1 of 1 plan goals verified"),
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 1);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "VERIFICATION_FAILED");
  assert.equal(status.reason, "Command-final completion invariants failed");
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /## Deterministic Failures/);
  assert.match(fixes, /\[INVARIANT\]/);
  assert.match(fixes, /Unconsumed handoff\.json checkpoint remains/);
  const log = await readFile(resolve(project, ".agent-loop/state/log.txt"), "utf8");
  assert.match(log, /Command-final completion validation failed: 1 invariant\(s\) violated/);
});

test("verify completion invariants flag invalid verification json", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFIED", round: 1 }));
  await writeFile(resolve(stateDir, "verification.md"), "# Verification\nAll passed\n");
  await writeFile(resolve(stateDir, "verification.json"), "{not-json");

  const issues = await validateCompletionInvariants({ stateDir });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].source, "CommandInvariant");
  assert.match(issues[0].description, /verification\.json exists but contains invalid JSON/);
});

test("verify uses cached spec acceptance goals for prompt and coverage", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/spec.md"), "## Requirements\n- REQ-001: Export invoices\n");
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: verificationOutputForItems([
        {
          id: "V1",
          plan_ref: "REQ-001",
          description: "Export invoices",
          status: "passed",
          evidence: "src/export.js:1",
          artifact_exists: true,
          artifact_substantive: true,
          artifact_wired: true,
        },
      ], "1 of 1 requirements verified"),
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(calls[0].args.join("\n"), /- REQ-001: Export invoices/);
  const acceptanceFile = JSON.parse(await readFile(resolve(project, ".agent-loop/state/acceptance-goals.json"), "utf8"));
  assert.equal(acceptanceFile.source_kind, "spec_requirements");
  assert.equal(acceptanceFile.goals[0].id, "REQ-001");
});

test("verify blocks authoritative canonical goal lint before verifier call", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(
    resolve(project, ".agent-loop/state/spec.md"),
    "## Requirements\n- REQ-001: `unsupported_daily_cycle_protocol` does not exist anywhere\n- REQ-002: `unsupported_daily_cycle_protocol` must be emitted\n",
  );
  const calls = [];

  const result = await run(["--simple", "verify"], project, {}, {
    agentRunner: async (command) => {
      calls.push(command);
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 0);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "NEEDS_REVISION");
  assert.equal(status.failure_severity, "plan_revision_required");
  assert.match(status.reason, /Canonical acceptance goals need revision before verification can continue/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Canonical acceptance goals need revision before verification can continue/);
});

test("verify dual-agent default runs Gate B through the implementer as second verifier", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    const reportLabel = calls.length === 1 ? "Primary verifier passed." : "Gate B verifier passed.";
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
${reportLabel}
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1","artifact_exists":true,"artifact_substantive":true,"artifact_wired":true}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].provider, "codex");
  assert.equal(calls[1].provider, "claude");
  assert.match(calls[1].args.join("\n"), /Gate B, the second-model verification gate/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/verification.md"), "utf8"), "# Verification Report\nGate B verifier passed.");
  const report = JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8"));
  assert.equal(report.checklist_source, "automated-gate-b");
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Gate B started: second verifier=claude after primary verifier=codex passed/);
  assert.match(progress, /Gate B Parsed report: 1 item\(s\) \(1 passed\)/);
  assert.match(progress, /Gate B passed: second verifier accepted full plan coverage/);
});

test("verify Gate B rejection blocks otherwise passing primary verifier", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async () => {
    calls.push(null);
    return {
      status: 0,
      stdout: calls.length === 1
        ? verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Export endpoint exists",
            status: "passed",
            evidence: "src/export.js:1",
          },
        ])
        : verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-99",
            description: "Invented goal",
            status: "passed",
            evidence: "src/export.js:1",
          },
        ]),
      stderr: "",
    };
  };

  const result = await run(["verify"], project, {}, { agentRunner });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 2);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /plan_ref 'goal-99' does not resolve to any canonical plan goal/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Gate B rejected: 2 issue\(s\)/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify Gate B structural failure writes fixes and blocks verification", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async () => {
    calls.push(null);
    return {
      status: 0,
      stdout: calls.length === 1
        ? verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Export endpoint exists",
            status: "passed",
            evidence: "src/export.js:1",
          },
        ])
        : "<verification_json>{}</verification_json>",
      stderr: "",
    };
  };

  const result = await run(["verify"], project, {}, { agentRunner });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 2);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /Verifier output must include both/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Gate B structural failure: Verifier output must include both/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify includes passing configured quality checks in progress and prompt", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    quality_commands: [{ command: "node -e \"console.log('quality pass')\"" }],
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(calls[0].args.join("\n"), /Quality check results \(all passed\):/);
  assert.match(calls[0].args.join("\n"), /node -e "console\.log\('quality pass'\)" \[PASS\]/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Quality checks passed before verifier round/);
});

test("verify auto-detects npm quality scripts when no quality config exists", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, "package.json"), JSON.stringify({
    scripts: {
      build: "node -e \"console.log('detected build')\"",
      test: "echo \"Error: no test specified\" && exit 1",
      lint: "node -e \"console.log('detected lint')\"",
    },
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  const prompt = calls[0].args.join("\n");
  assert.match(prompt, /npm run build \[PASS\]/);
  assert.match(prompt, /npm run lint \[PASS\]/);
  assert.doesNotMatch(prompt, /npm run test/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Quality checks passed before verifier round/);
});

test("verify prefers explicit quality commands over auto-detected npm scripts", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    quality_commands: [{ command: "node -e \"console.log('explicit pass')\"" }],
  }));
  await writeFile(resolve(project, "package.json"), JSON.stringify({
    scripts: {
      build: "node -e \"process.exit(9)\"",
      lint: "node -e \"process.exit(9)\"",
    },
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  const prompt = calls[0].args.join("\n");
  assert.match(prompt, /node -e "console\.log\('explicit pass'\)" \[PASS\]/);
  assert.doesNotMatch(prompt, /npm run build/);
  assert.doesNotMatch(prompt, /npm run lint/);
});

test("verify runs configured browser checks by default and passes evidence to verifier", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    browser_test_commands: [{ command: "node -e \"console.log('browser pass')\"" }],
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  const prompt = calls[0].args.join("\n");
  assert.match(prompt, /Browser\/E2E check results \(all passed\):/);
  assert.match(prompt, /BROWSER\/E2E CHECKS:/);
  assert.match(prompt, /node -e "console\.log\('browser pass'\)" \[PASS\]/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Browser\/E2E checks passed before verifier round/);
});

test("verify deterministic browser failures block when browser evidence policy blocks", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    browser_evidence_policy: "block",
    browser_test_commands: [
      {
        command: "node -e \"console.error('browser fail'); process.exit(7)\"",
        remediation: "Fix browser regressions.",
      },
    ],
  }));
  await seedConsensusState(project);
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async () => ({
        status: 0,
        stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
        stderr: "",
      }),
    },
  );

  assert.equal(result.code, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /### \[BROWSER\/E2E CHECK\]/);
  assert.match(fixes, /REMEDIATION: Fix browser regressions\./);
  assert.match(fixes, /browser fail/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Browser\/E2E checks failed before verifier round: 1 deterministic issue\(s\)/);
  assert.match(progress, /\[BrowserTest\] Browser\/E2E checks failed:/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify browser failures warn without blocking when browser evidence policy warns", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    browser_evidence_policy: "warn",
    browser_test_commands: [{ command: "node -e \"console.error('browser warn'); process.exit(7)\"" }],
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(calls[0].args.join("\n"), /Browser\/E2E check results \(failures detected\):/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Browser\/E2E checks failed before verifier round: 0 deterministic issue\(s\)/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFIED");
});

test("verify browser evidence gate blocks browser-facing work without browser evidence", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "Add a frontend page with a submit button\n");
  const calls = [];
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async (command) => {
        calls.push(command);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  );

  assert.equal(result.code, 1);
  assert.equal(calls.length, 0);
  const gate = await readFile(resolve(project, ".agent-loop/state/browser-evidence-gate.md"), "utf8");
  assert.match(gate, /# Browser Evidence Gate/);
  assert.match(gate, /- `frontend`/);
  assert.match(gate, /- `button`/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "AWAITING_INPUT");
  assert.equal(status.failure_severity, "missing_feature");
  assert.match(status.reason, /browser evidence gate paused before verification/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /AWAITING_INPUT - browser evidence gate: browser-facing goals detected but no browser\/E2E command is configured/);
});

test("verify browser evidence gate warns without blocking when policy warns", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    browser_evidence_policy: "warn",
  }));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/task.md"), "Polish the responsive modal form\n");
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Modal form works","status":"passed","evidence":"src/modal.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  const gate = await readFile(resolve(project, ".agent-loop/state/browser-evidence-gate.md"), "utf8");
  assert.match(gate, /- `responsive`/);
  assert.match(gate, /- `modal`/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /WARN - browser evidence gate: browser-facing goals detected but no browser\/E2E command is configured/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFIED");
});

test("verify canonical gate rejects missing plan goals", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "\n");
  await writeFile(resolve(project, ".agent-loop/state/task.md"), "\n");
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async () => ({
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Export endpoint exists",
            status: "passed",
            evidence: "src/export.js:1",
          },
        ]),
        stderr: "",
      }),
    },
  );

  assert.equal(result.code, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /Cannot verify plan coverage: no extractable goals found in plan\.md or task\.md/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Gate rejected: Cannot verify plan coverage/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify canonical gate rejects omitted goals and fabricated refs", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "- Add export endpoint\n- Add CSV download\n");
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async () => ({
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-99",
            description: "Invented goal",
            status: "passed",
            evidence: "src/export.js:1",
          },
        ]),
        stderr: "",
      }),
    },
  );

  assert.equal(result.code, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /plan_ref 'goal-99' does not resolve to any canonical plan goal/);
  assert.match(fixes, /Canonical goal 'goal-1' \(Add export endpoint\) has no verification item covering it/);
  assert.match(fixes, /Canonical goal 'goal-2' \(Add CSV download\) has no verification item covering it/);
});

test("verify canonical gate rejects duplicate coverage and missing item evidence", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "- Add export endpoint\n");
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async () => ({
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Export endpoint exists",
            status: "passed",
            evidence: "src/export.js:1",
          },
          {
            id: "V2",
            plan_ref: "Add export endpoint",
            description: "Export endpoint is wired",
            status: "passed",
          },
        ]),
        stderr: "",
      }),
    },
  );

  assert.equal(result.code, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /Item V2 is missing evidence/);
  assert.match(fixes, /Canonical goal 'goal-1' \(Add export endpoint\) is covered by multiple items/);
});

test("verify canonical gate rejects failed artifact booleans on passed items", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "- Add export endpoint\n");
  const result = await run(
    ["verify"],
    project,
    {},
    {
      agentRunner: async () => ({
        status: 0,
        stdout: verificationOutputForItems([
          {
            id: "V1",
            plan_ref: "goal-1",
            description: "Export endpoint exists",
            status: "passed",
            evidence: "src/export.js:1",
            artifact_exists: false,
            artifact_substantive: true,
            artifact_wired: false,
          },
        ]),
        stderr: "",
      }),
    },
  );

  assert.equal(result.code, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /Item V1 \(Passed\) has failed artifact checks: exists, wired/);
});

test("verify deterministic quality failures block otherwise passing verifier output", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    quality_commands: [
      {
        command: "node -e \"console.error('quality fail'); process.exit(7)\"",
        remediation: "Fix quality failures.",
      },
    ],
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 1);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /## Deterministic Failures/);
  assert.match(fixes, /REMEDIATION: Fix quality failures\./);
  assert.match(fixes, /quality fail/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Quality checks failed before verifier round: 1 deterministic issue\(s\)/);
  assert.match(progress, /Deterministic gate rejected: 1 issue\(s\)/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify_auto_test false skips configured quality commands and tells verifier not to run tests", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    verify_auto_test: false,
    quality_commands: [{ command: "node -e \"process.exit(7)\"" }],
  }));
  await seedConsensusState(project);
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
All goals passed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(calls[0].args.join("\n"), /Do NOT run tests or execute any test commands/);
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Quality checks skipped or no commands detected/);
});

test("verify failed items persist fixes and verification failed status", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const agentRunner = async () => ({
    status: 0,
    stdout: `<verification_markdown>
# Verification Report
One goal failed.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint works","status":"failed","detail":"No route is wired","evidence":"routes.js"}],"summary":"0 of 1 plan goals verified"}
</verification_json>
<verification_fixes_markdown>
# Fixes
- Wire the route.
</verification_fixes_markdown>`,
    stderr: "",
  });

  const result = await run(["--simple", "verify"], project, {}, { agentRunner });

  assert.equal(result.code, 1);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8"), "# Fixes\n- Wire the route.");
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "VERIFICATION_FAILED");
  assert.equal(status.reason, "Verification failed after max rounds");
});

test("verify malformed output writes structural fixes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const result = await run(
    ["verify"],
    project,
    {},
    { agentRunner: async () => ({ status: 0, stdout: "<verification_json>{}</verification_json>", stderr: "" }) },
  );

  assert.equal(result.code, 1);
  assert.match(await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8"), /Verifier output must include both/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8")).status, "VERIFICATION_FAILED");
});

test("verify resume reruns verifier without clearing existing progress first", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const stateDir = resolve(project, ".agent-loop/state");
  await writeFile(resolve(stateDir, "workflow.txt"), "verify\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFICATION_FAILED", round: 1 }));
  await writeFile(resolve(stateDir, "verification-progress.md"), "## Round 1\nOld failure\n");
  await writeFile(resolve(stateDir, "verification.md"), "old report\n");
  await writeFile(resolve(stateDir, "verification.json"), JSON.stringify({ items: [{ id: "V1", status: "failed", description: "old" }] }));
  await writeFile(resolve(stateDir, "verification-fixes.md"), "# Old fixes\n");
  const calls = [];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: `<verification_markdown>
# Verification Report
Recovered.
</verification_markdown>
<verification_json>
{"items":[{"id":"V1","plan_ref":"goal-1","description":"Export endpoint exists","status":"passed","evidence":"src/export.js:1"}],"summary":"1 of 1 plan goals verified"}
</verification_json>`,
      stderr: "",
    };
  };

  const result = await run(["verify", "--resume"], project, {}, { agentRunner });

  assert.equal(result.code, 0);
  assert.match(calls[0].args.join("\n"), /Continue re-verification/);
  const progress = await readFile(resolve(stateDir, "verification-progress.md"), "utf8");
  assert.match(progress, /Old failure/);
  assert.match(progress, /Started: mode=IndependentReviewer resume=true max_rounds=1/);
  assert.equal(await readFile(resolve(stateDir, "verification.md"), "utf8"), "# Verification Report\nRecovered.");
  await assert.rejects(() => readFile(resolve(stateDir, "verification-fixes.md"), "utf8"), /ENOENT/);
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "VERIFIED");
});

test("verify manual generates checklist and records passing answers", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const calls = [];
  const answers = ["pass", "p", "PASS"];
  const agentRunner = async (command) => {
    calls.push(command);
    return {
      status: 0,
      stdout: "Intro\n1. Check export endpoint exists\n02. Verify audit logs are preserved\n3) ignored\n3. Confirm route is wired\n",
      stderr: "",
    };
  };

  const result = await run(["verify", "--manual"], project, {}, {
    agentRunner,
    readAnswer: async () => answers.shift(),
  });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].args.join("\n"), /Generate a concise verification checklist/);
  assert.match(result.stdout, /\[M1\] Check export endpoint exists/);
  assert.match(result.stdout, /\[M3\] Confirm route is wired/);
  const report = JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8"));
  assert.equal(report.checklist_source, "manual");
  assert.deepEqual(report.items.map((item) => item.id), ["M1", "M2", "M3"]);
  assert.deepEqual(report.items.map((item) => item.status), ["passed", "passed", "passed"]);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8"), /ENOENT/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "VERIFIED");
  assert.equal(status.reason, "Manual verification passed");
  const progress = await readFile(resolve(project, ".agent-loop/state/verification-progress.md"), "utf8");
  assert.match(progress, /Generated manual checklist: 3 item\(s\)/);
  assert.match(progress, /Manual verification passed/);
});

test("verify manual writes fixes and failed status for failed or skipped answers", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await seedConsensusState(project);
  const answers = ["fail", "skip"];

  const result = await run(["verify", "--manual"], project, {}, {
    agentRunner: async () => ({
      status: 0,
      stdout: "1. Check export endpoint exists\n2. Verify audit logs are preserved\n",
      stderr: "",
    }),
    readAnswer: async () => answers.shift(),
  });

  assert.equal(result.code, 1);
  const report = JSON.parse(await readFile(resolve(project, ".agent-loop/state/verification.json"), "utf8"));
  assert.deepEqual(report.items.map((item) => item.status), ["failed", "skipped"]);
  const fixes = await readFile(resolve(project, ".agent-loop/state/verification-fixes.md"), "utf8");
  assert.match(fixes, /# Manual Verification Fixes/);
  assert.match(fixes, /- \[M1\] Check export endpoint exists - failed/);
  assert.match(fixes, /- \[M2\] Verify audit logs are preserved - skipped/);
  const status = JSON.parse(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"));
  assert.equal(status.status, "VERIFICATION_FAILED");
  assert.equal(status.reason, "Manual verification found failures or blocked items");
});

test("verify manual resume rejects automated verification reports", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "verify\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFICATION_FAILED", round: 1 }));
  await writeFile(resolve(stateDir, "verification.json"), JSON.stringify({
    checklist_source: "automated",
    items: [{ id: "V1", status: "failed", description: "old" }],
  }));
  const calls = [];

  const result = await run(["verify", "--manual", "--resume"], project, {}, {
    agentRunner: async (command) => {
      calls.push(command);
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(result.code, 1);
  assert.equal(calls.length, 0);
  const status = JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8"));
  assert.equal(status.status, "ERROR");
  assert.equal(status.reason, "Cannot resume: persisted report is from automated verify, not manual checklist");
  const progress = await readFile(resolve(stateDir, "verification-progress.md"), "utf8");
  assert.match(progress, /Manual verification resume failed: persisted report is from automated verify/);
});

test("verify manual resume skips already passed checklist items", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "workflow.txt"), "verify\n");
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({ status: "VERIFICATION_FAILED", round: 1 }));
  await writeFile(resolve(stateDir, "verification.json"), JSON.stringify({
    checklist_source: "manual",
    items: [
      { id: "M1", status: "passed", description: "Already done" },
      { id: "M2", status: "pending", description: "Needs answer" },
    ],
  }));
  const calls = [];

  const result = await run(["verify", "--manual", "--resume"], project, {}, {
    agentRunner: async (command) => {
      calls.push(command);
      return { status: 0, stdout: "", stderr: "" };
    },
    readAnswer: async () => "pass",
  });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(result.stdout, /\[M1\]/);
  assert.match(result.stdout, /\[M2\] Needs answer/);
  const report = JSON.parse(await readFile(resolve(stateDir, "verification.json"), "utf8"));
  assert.deepEqual(report.items.map((item) => item.status), ["passed", "passed"]);
  assert.equal(JSON.parse(await readFile(resolve(stateDir, "status.json"), "utf8")).status, "VERIFIED");
});

test("approve writes Rust-compatible plan approval response files", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = await seedPendingPlanApproval(project, "decision-approve");

  const result = await run(["approve", "plan"], project);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Approved pending plan gate\./);
  const response = JSON.parse(await readFile(resolve(stateDir, "decisions/decision-approve/response.json"), "utf8"));
  assert.equal(response.decision_id, "decision-approve");
  assert.equal(response.chosen, "approve");
  assert.equal(response.reason, null);
  assert.equal(response.free_text, null);
  assert.equal(response.chosen_at, "2026-01-02T03:04:05.006Z");
  assert.equal(response.responder, "cli");
  const legacy = JSON.parse(await readFile(resolve(stateDir, "decision_response.json"), "utf8"));
  assert.deepEqual(legacy, response);
});

test("reject writes reason and emits JSON approval response", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = await seedPendingPlanApproval(project, "decision-reject");

  const result = await run(["--json", "reject", "plan", "--reason", "needs scope cut"], project);

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    type: "approval_response",
    data: {
      phase: "plan",
      chosen: "reject",
      reason: "needs scope cut",
    },
  });
  const response = JSON.parse(await readFile(resolve(stateDir, "decisions/decision-reject/response.json"), "utf8"));
  assert.equal(response.chosen, "reject");
  assert.equal(response.reason, "needs scope cut");
  assert.equal(response.free_text, "needs scope cut");
  assert.deepEqual(JSON.parse(await readFile(resolve(stateDir, "decision_response.json"), "utf8")), response);
});

test("approval commands validate pending marker and supported phase", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const missing = await run(["approve", "plan"], project);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /no pending plan approval found/);

  const unsupportedPhase = await run(["approve", "verify"], project);
  assert.equal(unsupportedPhase.code, 1);
  assert.match(unsupportedPhase.stderr, /only plan approval is supported in this release/);

  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "plan-pending-approval.flag"), "{not-json");
  const invalid = await run(["reject", "plan", "--reason", "bad marker"], project);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /invalid plan-pending-approval\.flag/);
});

test("chain runs supported command steps and archives state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ chain_default_command: "plan" }));
  await writeFile(resolve(project, "plan-a.md"), "Build the first thing");
  await writeFile(resolve(project, "plan-b.md"), "Build the second thing");

  const result = await run(["chain", "plan-a.md", "plan-b.md"], project);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /--- Chain \[1\/2\]: plan-a\.md ---/);
  assert.match(result.stdout, /--- Chain \[2\/2\]: plan-b\.md ---/);
  assert.match(result.stdout, /--- Chain Summary ---/);
  assert.match(result.stdout, /\[1\/2\] plan-a\.md -- completed/);
  assert.match(result.stdout, /\[2\/2\] plan-b\.md -- completed/);

  const chainState = JSON.parse(await readFile(resolve(project, ".agent-loop/chain.json"), "utf8"));
  assert.equal(chainState.current_index, 1);
  assert.deepEqual(chainState.results, [
    {
      file: "plan-a.md",
      status: "completed",
      archive_path: ".agent-loop/state/archive/plan-a/",
    },
    {
      file: "plan-b.md",
      status: "completed",
      archive_path: ".agent-loop/state/archive/plan-b/",
    },
  ]);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/archive/plan-a/task.md"), "utf8"), "Build the first thing");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/archive/plan-b/task.md"), "utf8"), "Build the second thing");
});

test("chain records unsupported default step failure", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, "plan-a.md"), "Build the default thing");

  const result = await run(["chain", "plan-a.md"], project);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unsupported in node-cli first pass: plan-tasks-implement/);
  assert.match(result.stdout, /\[1\/1\] plan-a\.md -- failed/);
  const chainState = JSON.parse(await readFile(resolve(project, ".agent-loop/chain.json"), "utf8"));
  assert.deepEqual(chainState.results, [
    {
      file: "plan-a.md",
      status: "failed",
      error: "exit code 2",
    },
  ]);
});

test("chain resume starts at the first incomplete result", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop"), { recursive: true });
  await writeFile(resolve(project, "plan-a.md"), "Already done");
  await writeFile(resolve(project, "plan-b.md"), "Resume here");
  await writeFile(resolve(project, ".agent-loop/chain.json"), JSON.stringify({
    current_index: 0,
    results: [
      {
        file: "plan-a.md",
        status: "completed",
        archive_path: ".agent-loop/state/archive/plan-a/",
      },
      {
        file: "plan-b.md",
        status: "pending",
      },
    ],
  }));

  const result = await run(["chain", "plan-a.md", "plan-b.md", "--command", "plan", "--resume"], project);

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /--- Chain \[1\/2\]: plan-a\.md ---/);
  assert.match(result.stdout, /--- Chain \[2\/2\]: plan-b\.md ---/);
  const chainState = JSON.parse(await readFile(resolve(project, ".agent-loop/chain.json"), "utf8"));
  assert.equal(chainState.current_index, 1);
  assert.equal(chainState.results[0].status, "completed");
  assert.equal(chainState.results[1].status, "completed");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/archive/plan-b/task.md"), "utf8"), "Resume here");
});

test("chain validates all input files before creating chain state", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["chain", "missing.md", "--command", "plan"], project);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /chain file not found: missing\.md/);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/chain.json"), "utf8"), /ENOENT/);
});

test("unsupported commands with Rust-style args print docs pointer", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const cases = [
    ["goal", "resume", "--run"],
    ["pipeline", "--phases", "plan,implement", "--resume"],
    ["supervise", "--phases", "spec,plan", "--resume"],
  ];

  for (const argv of cases) {
    const result = await run(argv, project);
    assert.equal(result.code, 2);
    assert.match(result.stderr, new RegExp(`Unsupported in node-cli first pass: ${argv[0]}`));
    assert.match(result.stderr, /node-cli\/docs\/unsupported\.md/);
  }
});

test("init writes .agent-loop.json and preserves existing configs without force", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const created = await run(["init"], project);
  assert.equal(created.code, 0);
  assert.equal(created.stdout.split(/\r?\n/)[0], "Generated .agent-loop.json with defaults.");
  const configPath = resolve(project, ".agent-loop.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.implementer, "claude");
  assert.equal(config.reviewer, "codex");
  assert.equal(config.requirements_workflow, "legacy");
  const status = await run(["status"], project);
  assert.equal(status.code, 0);

  await writeFile(configPath, JSON.stringify({ implementer: "codex" }));
  const refused = await run(["init"], project);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /\.agent-loop\.json already exists\. Use --force to overwrite\./);
  assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), { implementer: "codex" });

  const forced = await run(["init", "--force"], project);
  assert.equal(forced.code, 0);
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).implementer, "claude");
});

test("init protects legacy TOML and suppresses success text in json mode", async () => {
  const legacyProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(legacyProject, ".agent-loop.toml"), "implementer = \"codex\"\n");
  const refused = await run(["init"], legacyProject);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /Run 'npm run migrate-config --/);
  await assert.rejects(() => readFile(resolve(legacyProject, ".agent-loop.json"), "utf8"), /ENOENT/);

  const jsonProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const created = await run(["--json", "init"], jsonProject);
  assert.equal(created.code, 0);
  assert.equal(created.stdout, "");
  assert.equal(created.stderr, "");
  assert.equal(JSON.parse(await readFile(resolve(jsonProject, ".agent-loop.json"), "utf8")).reviewer, "codex");
});

test("init adds project-aware quality and browser settings for Laravel JS Dusk projects", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, "artisan"), "");
  await mkdir(resolve(project, "resources/views"), { recursive: true });
  await writeFile(resolve(project, "resources/views/welcome.blade.php"), "");
  await writeFile(resolve(project, "composer.json"), JSON.stringify({
    require: { "laravel/framework": "^13.0" },
    "require-dev": {
      "laravel/dusk": "^8.0",
      "laravel/pint": "^1.0",
      "phpunit/phpunit": "^11.0",
    },
    scripts: { test: "php artisan test --compact" },
  }));
  await writeFile(resolve(project, "package.json"), JSON.stringify({
    scripts: {
      build: "vite build",
      lint: "eslint resources/js",
      test: "echo \"no test specified\" && exit 1",
    },
    devDependencies: { vite: "^7.0.0" },
  }));
  await writeFile(resolve(project, "package-lock.json"), "{}");
  await mkdir(resolve(project, "tests/Browser"), { recursive: true });
  await writeFile(resolve(project, "tests/Browser/AdminFlowTest.php"), "<?php\n");

  const result = await run(["init"], project);
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout.split(/\r?\n/)[0],
    "Generated .agent-loop.json (auto-detected: Laravel/PHP + JavaScript/TypeScript project).",
  );
  const config = JSON.parse(await readFile(resolve(project, ".agent-loop.json"), "utf8"));
  assert.equal(config.auto_test, true);
  assert.equal(config.verify_browser_test, true);
  assert.equal(config.browser_evidence_policy, "block");
  assert.deepEqual(
    config.quality_commands.map((entry) => entry.command),
    ["vendor/bin/pint --dirty --format agent", "composer test", "npm run build", "npm run lint"],
  );
  assert.deepEqual(config.browser_test_commands, [{ command: "php artisan dusk" }]);

  const status = await run(["status"], project);
  assert.equal(status.code, 0);
});

test("init uses warn browser policy for web projects without browser commands", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, "package.json"), JSON.stringify({
    scripts: { build: "vite build" },
    devDependencies: { vite: "^7.0.0" },
  }));

  const result = await run(["init"], project);
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout.split(/\r?\n/)[0],
    "Generated .agent-loop.json (auto-detected: JavaScript/TypeScript project).",
  );
  const config = JSON.parse(await readFile(resolve(project, ".agent-loop.json"), "utf8"));
  assert.equal(config.auto_test, true);
  assert.equal(config.browser_evidence_policy, "warn");
  assert.equal(Object.hasOwn(config, "browser_test_commands"), false);
  assert.deepEqual(config.quality_commands, [{ command: "npm run build" }]);
});

test("completions generates scripts for Rust-supported shells", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));

  const bash = await run(["completions", "bash"], project);
  assert.equal(bash.code, 0);
  assert.match(bash.stdout, /_agent_loop_node_cli/);
  assert.match(bash.stdout, /complete -F _agent_loop_node_cli agent-loop-node/);
  assert.match(bash.stdout, /plan-tasks-implement-verify/);
  assert.match(bash.stderr, /^elapsed: /);

  const fish = await run(["--json", "completions", "fish"], project);
  assert.equal(fish.code, 0);
  assert.match(fish.stdout, /complete -c agent-loop-node/);
  assert.match(fish.stdout, /Generate zsh completions/);
  assert.equal(fish.stderr, "");

  const powershell = await run(["completions", "powershell"], project);
  assert.equal(powershell.code, 0);
  assert.match(powershell.stdout, /Register-ArgumentCompleter/);
  assert.match(powershell.stdout, /agent-loop-node/);
});

test("list-agents prints Rust-shaped JSON and elapsed on stderr", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = await run(["list-agents"], project, { PATH: "" });
  assert.equal(result.code, 0);
  assert.match(result.stderr, /^elapsed: /);
  const agents = JSON.parse(result.stdout);
  assert.deepEqual(
    agents.map((agent) => agent.name),
    ["aider", "claude", "codex", "copilot", "cursor", "deepseek", "opencode", "pi", "qwen", "vibe"],
  );
  assert.equal(agents.every((agent) => agent.installed === false), true);

  const claude = agents.find((agent) => agent.name === "claude");
  assert.deepEqual(claude, {
    name: "claude",
    binary: "claude",
    install_hint: "npm install -g @anthropic-ai/claude-code",
    installed: false,
    tier: "Stable",
    supports_model_flag: true,
    suggested_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
    supported_effort_levels: ["low", "medium", "high", "max"],
  });

  const deepseek = agents.find((agent) => agent.name === "deepseek");
  assert.equal(deepseek.supports_model_flag, false);
  assert.deepEqual(deepseek.suggested_models, []);
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

  await writeFile(resolve(stateDir, "status.json"), "");
  const noStatus = await run(["resume", "--dry-run"], project);
  assert.equal(noStatus.code, 0);
  assert.equal(
    noStatus.stdout.trim().split(/\r?\n/)[0],
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

test("resume reports interrupted-state integrity issues before next fallback", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const stateDir = resolve(project, ".agent-loop/state");
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "status.json"), JSON.stringify({
    status: "INTERRUPTED",
    round: 1,
    timestamp: "2026-01-01T00:00:00Z",
  }));

  const missing = await run(["resume"], project);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Cannot resume: status\.json reports an interrupted run but workflow\.txt is missing\./);
  assert.match(missing.stderr, /Run 'agent-loop reset' to clear the corrupted state, then start a new run\./);

  const missingJson = await run(["--json", "resume"], project);
  assert.equal(missingJson.code, 1);
  assert.equal(JSON.parse(missingJson.stdout.trim()).type, "command_started");
  assert.equal(missingJson.stderr, "");

  await writeFile(resolve(stateDir, "workflow.txt"), "not-a-workflow\n");
  const invalid = await run(["resume"], project);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /Cannot resume: status\.json reports an interrupted run but workflow\.txt is invalid\./);

  const dryRun = await run(["resume", "--dry-run"], project);
  assert.equal(dryRun.code, 0);
  assert.equal(dryRun.stdout.trim().split(/\r?\n/)[0], "agent-loop next");
});

test("reset preserves decisions and wave-lock reset touches only the lock", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await run(["plan", "Build"], project);
  await writeFile(resolve(project, ".agent-loop/decisions.md"), "keep");
  await writeFile(resolve(project, ".agent-loop/wave.lock"), "locked");
  await writeFile(resolve(project, ".agent-loop/wave-progress.jsonl"), "{}\n");
  await mkdir(resolve(project, ".agent-loop/state/session-a"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/state/session-a/status.json"), JSON.stringify({ status: "SESSION" }));
  await mkdir(resolve(project, ".agent-loop/state/.wave-task-1"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/state/.wave-task-1/status.json"), JSON.stringify({ status: "TASK" }));
  await mkdir(resolve(project, ".agent-loop/state/history"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/state/history/event.json"), "{}\n");
  const invalid = await run(["reset", "unexpected"], project);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /unexpected argument 'unexpected' for reset/);
  assert.equal(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8").then(() => "exists"), "exists");
  const lock = await run(["reset", "--wave-lock"], project);
  assert.equal(lock.code, 0);
  assert.equal(lock.stdout.split(/\r?\n/)[0], "Wave lock removed.");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8").then(() => "exists"), "exists");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/wave.lock"), "utf8"), /ENOENT/);
  const missingLock = await run(["reset", "--wave-lock"], project);
  assert.equal(missingLock.stdout.split(/\r?\n/)[0], "No wave lock found.");
  const reset = await run(["reset"], project);
  assert.equal(reset.code, 0);
  assert.equal(reset.stdout.split(/\r?\n/)[0], "State cleared. decisions.md preserved.");
  assert.equal(await readFile(resolve(project, ".agent-loop/decisions.md"), "utf8"), "keep");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/wave-progress.jsonl"), "utf8"), /ENOENT/);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"), /ENOENT/);
  assert.equal(JSON.parse(await readFile(resolve(project, ".agent-loop/state/session-a/status.json"), "utf8")).status, "SESSION");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/.wave-task-1/status.json"), "utf8"), /ENOENT/);
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/history/event.json"), "utf8"), /ENOENT/);
});

test("reset suppresses human output in JSON mode", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/state/status.json"), JSON.stringify({ status: "PENDING" }));
  await writeFile(resolve(project, ".agent-loop/decisions.md"), "keep");
  await writeFile(resolve(project, ".agent-loop/wave.lock"), "locked");
  await writeFile(resolve(project, ".agent-loop/wave-progress.jsonl"), "{}\n");

  const lock = await run(["--json", "reset", "--wave-lock"], project);
  assert.equal(lock.code, 0);
  assert.equal(lock.stdout, "");
  assert.equal(lock.stderr, "");
  assert.equal(await readFile(resolve(project, ".agent-loop/state/status.json"), "utf8").then(() => "exists"), "exists");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/wave.lock"), "utf8"), /ENOENT/);

  const reset = await run(["--json", "reset"], project);
  assert.equal(reset.code, 0);
  assert.equal(reset.stdout, "");
  assert.equal(reset.stderr, "");
  assert.equal(await readFile(resolve(project, ".agent-loop/decisions.md"), "utf8"), "keep");
  await assert.rejects(() => readFile(resolve(project, ".agent-loop/state/status.json"), "utf8"), /ENOENT/);
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
