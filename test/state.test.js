import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config/index.js";
import { initializeWorkflowState } from "../src/state/initialization.js";
import { writeFindings } from "../src/state/findings.js";
import { writeStatus } from "../src/state/status.js";
import { readStateFile } from "../src/state/files.js";
import { stateDirForSession, waveJournalPathForSession, waveLockPathForSession } from "../src/state/paths.js";

test("state and wave paths match session layout", () => {
  const project = "/tmp/example";
  assert.equal(stateDirForSession(project), "/tmp/example/.agent-loop/state");
  assert.equal(stateDirForSession(project, "demo_1"), "/tmp/example/.agent-loop/state/demo_1");
  assert.equal(waveLockPathForSession(project, "demo_1"), "/tmp/example/.agent-loop/wave-demo_1.lock");
  assert.equal(waveJournalPathForSession(project, "demo_1"), "/tmp/example/.agent-loop/wave-progress-demo_1.jsonl");
  assert.throws(() => stateDirForSession(project, "../bad"), /invalid session/);
});

test("initializeWorkflowState writes compatible baseline files", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {}, now: () => new Date("2026-01-02T03:04:05.006Z") });
  await initializeWorkflowState(config, { task: "# Build it\n\nDetails", workflow: "plan" });
  assert.equal(await readStateFile(config, "workflow.txt"), "plan\n");
  assert.equal(await readStateFile(config, "plan.md"), "");
  assert.equal(JSON.parse(await readStateFile(config, "findings.json")).round, 0);
  const status = JSON.parse(await readStateFile(config, "status.json"));
  assert.equal(status.status, "PENDING");
  assert.equal(status.lastRunTask, "Build it");
  assert.equal(status.timestamp, "2026-01-02T03:04:05.006Z");
});

test("status and findings writers preserve unknown JSON fields", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {}, now: () => new Date("2026-01-02T03:04:05.006Z") });
  await initializeWorkflowState(config, { task: "Task", workflow: "plan" });
  await writeFile(resolve(config.stateDir, "status.json"), JSON.stringify({ custom: true, status: "OLD" }));
  await writeStatus({ status: "PENDING", lastRunTask: "Task" }, config);
  assert.equal(JSON.parse(await readFile(resolve(config.stateDir, "status.json"), "utf8")).custom, true);
  await writeFile(resolve(config.stateDir, "findings.json"), JSON.stringify({ custom: 1, round: 9, findings: [{ id: "a", extra: "keep" }] }));
  await writeFindings({ round: 0, findings: [{ id: "a", severity: "low", summary: "ok", file_refs: [] }] }, config);
  const findings = JSON.parse(await readFile(resolve(config.stateDir, "findings.json"), "utf8"));
  assert.equal(findings.custom, 1);
  assert.equal(findings.findings[0].extra, "keep");
});

test("requestInterrupt waits for in-flight state writes to finish", async () => {
  const { clearInterrupt, requestInterrupt, writeStateFile } = await import("../src/state/files.js");
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  try {
    const content = `${"x".repeat(1024 * 1024)}\n`;
    const write = writeStateFile(config, "status.json", content);
    let drained = false;
    requestInterrupt(() => {
      drained = true;
    });
    assert.equal(drained, false);
    await write;
    assert.equal(drained, true);
    assert.equal(await readStateFile(config, "status.json"), content);
  } finally {
    clearInterrupt();
  }
});
