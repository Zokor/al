import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { acceptanceGoalSourceHash, canonicalGoalLintShouldBlock, lintCanonicalGoals, loadOrRefreshAcceptanceGoals } from "../src/app/acceptanceGoals.js";

function testConfig(project) {
  return {
    projectDir: project,
    stateDir: resolve(project, ".agent-loop/state"),
    now: () => new Date("2026-01-02T03:04:05.006Z"),
  };
}

async function writeState(config, fileName, content) {
  await mkdir(config.stateDir, { recursive: true });
  await writeFile(resolve(config.stateDir, fileName), content);
}

async function readAcceptanceFile(config) {
  return JSON.parse(await readFile(resolve(config.stateDir, "acceptance-goals.json"), "utf8"));
}

test("acceptance goals cache refreshes when plan changes", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(config, "task.md", "Build review and verify reliability");
  await writeState(config, "plan.md", "## Plan\n\n### 1. Add acceptance goals\n\n### 2. Harden verify\n");

  const goals = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(goals.sourceKind, "plan_heuristic_fallback");
  assert.match(goals.sourceWarning, /heuristic extraction/);
  assert.deepEqual(goals.goals.map((goal) => goal.canonicalId), ["goal-1", "goal-2"]);
  const saved = await readAcceptanceFile(config);
  assert.equal(saved.schema_version, 3);
  assert.equal(saved.source_kind, "plan_heuristic_fallback");
  assert.equal(saved.goals[0].id, "goal-1");
  const originalHash = saved.source_hash;

  await writeState(
    config,
    "plan.md",
    "## Plan\n\n### 1. Add acceptance goals\n\n### 2. Harden verify\n\n### 3. Gate browser evidence\n",
  );

  const refreshed = await loadOrRefreshAcceptanceGoals(config);
  const refreshedFile = await readAcceptanceFile(config);

  assert.deepEqual(refreshed.goals.map((goal) => goal.canonicalId), ["goal-1", "goal-2", "goal-3"]);
  assert.notEqual(refreshedFile.source_hash, originalHash);
});

test("acceptance goals prefer spec requirements over plan heuristics", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(config, "spec.md", "## Requirements\n- REQ-001: Export invoices\n- REQ-002: Preserve audit logs\n");
  await writeState(config, "plan.md", "## Plan\n\n### 1. Legacy plan goal\n");

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "spec_requirements");
  assert.equal(extracted.sourceWarning, undefined);
  assert.deepEqual(extracted.goals.map((goal) => goal.canonicalId), ["REQ-001", "REQ-002"]);
  assert.equal(extracted.goals[1].displayText, "Preserve audit logs");
  const saved = await readAcceptanceFile(config);
  assert.equal(saved.source_kind, "spec_requirements");
});

test("acceptance goals cache recomputes stale lint issues", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(config, "spec.md", "## Requirements\n- REQ-100: Add monitor tests\n- REQ-102: Add retention tests\n");
  const sourceHash = await acceptanceGoalSourceHash(config);
  await writeState(config, "acceptance-goals.json", JSON.stringify({
    schema_version: 3,
    source_hash: sourceHash,
    generated_at: "old",
    source_kind: "spec_requirements",
    source_warning: null,
    lint_issues: ["stale lint issue"],
    goals: [
      { id: "REQ-100", display_text: "Add monitor tests", aliases: [] },
      { id: "REQ-102", display_text: "Add retention tests", aliases: [] },
    ],
  }));

  const extracted = await loadOrRefreshAcceptanceGoals(config);
  const saved = await readAcceptanceFile(config);

  assert.deepEqual(extracted.lintIssues, []);
  assert.deepEqual(saved.lint_issues, []);
});

test("acceptance goals prefer active slice scope over full spec cache", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(
    config,
    "spec.md",
    "## Requirements\n- REQ-001: Seed permissions\n- REQ-100: Add monitor tests\n",
  );
  await writeState(config, "plan.md", "# Plan Slice 1: Database And Model Foundation\n");

  const fullSpec = await loadOrRefreshAcceptanceGoals(config);
  assert.equal(fullSpec.sourceKind, "spec_requirements");
  assert.deepEqual(fullSpec.goals.map((goal) => goal.canonicalId), ["REQ-001", "REQ-100"]);

  await writeState(
    config,
    "tasks.md",
    "# Tasks - Slice 1\n\nREQ IDs covered by this slice (subset of spec.md):\n- REQ-001 - seed churn permissions.\n- C-3 - schema additions stay limited.\n\nConventions to follow:\n- Leave monitor tests for later slices.\n",
  );

  const refreshed = await loadOrRefreshAcceptanceGoals(config);
  const saved = await readAcceptanceFile(config);

  assert.equal(refreshed.sourceKind, "slice_task_scope");
  assert.deepEqual(refreshed.goals.map((goal) => goal.canonicalId), ["REQ-001", "C-3"]);
  assert.equal(refreshed.goals[0].displayText, "seed churn permissions.");
  assert.equal(saved.source_kind, "slice_task_scope");
});

test("acceptance goals extract inline covered requirements slice scope", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(config, "spec.md", "## Requirements\n- REQ-003: Register routes\n- REQ-100: Add monitor tests\n");
  await writeState(config, "plan.md", "# Plan Slice 2: Retention\n");
  await writeState(
    config,
    "tasks.md",
    "# Tasks - Slice: Retention\n\nCovered requirements: REQ-003 (retention rows only), REQ-050, C-7 (schema only).\n",
  );

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "slice_task_scope");
  assert.deepEqual(extracted.goals.map((goal) => goal.canonicalId), ["REQ-003", "REQ-050", "C-7"]);
  assert.equal(extracted.goals[0].displayText, "REQ-003 (retention rows only)");
  assert.equal(extracted.goals[2].displayText, "C-7 (schema only)");
});

test("acceptance goals prefer explicit canonical section over plan history and verification", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(
    config,
    "plan.md",
    "## Plan\n\n### 1. Historical problem statement\n\n## Canonical Acceptance Goals\n\n- Emit `unsupported_daily_cycle_protocol`\n- Update focused tests\n\n## Verification\n\n1. npm test\n",
  );

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "explicit_section");
  assert.deepEqual(extracted.goals.map((goal) => goal.displayText), [
    "Emit `unsupported_daily_cycle_protocol`",
    "Update focused tests",
  ]);
});

test("acceptance goals use embedded task plan before task summary fallback", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(
    config,
    "task.md",
    "# Task\nBuild export reliability.\n\n# Plan\n\n### 1. Add export endpoint\n\n## Verification\n\n1. npm test\n",
  );

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "embedded_task_plan_heuristic_fallback");
  assert.deepEqual(extracted.goals.map((goal) => goal.displayText), [
    "1. Add export endpoint",
    "Verification item 1: npm test",
  ]);
});

test("acceptance goals task heading fallback ignores implementation steps", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(config, "plan.md", "");
  await writeState(
    config,
    "task.md",
    "## Task 2 - Add `settleByAdmin()` pure-mutation method\n\ndepends: 1\n\nSteps inside the method:\n1. Reload the order.\n2. Check `OrderPartialPaymentService.php:685-687` as supporting evidence.\n",
  );

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "task_heuristic_fallback");
  assert.deepEqual(extracted.goals.map((goal) => goal.displayText), [
    "Task 2 - Add `settleByAdmin()` pure-mutation method",
  ]);
  assert.deepEqual(extracted.lintIssues, []);
});

test("acceptance goals include verification checklist items with aliases", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const config = testConfig(project);
  await writeState(
    config,
    "plan.md",
    "# Plan: Sync TUI command parser\n\n### 1. `src/tui/command.rs` \u2014 `SLASH_COMMANDS`\n\n### 2. `src/tui/palette.rs` \u2014 `COMMANDS`\n\n## Verification\n\n1. `cargo test -p agent-loop` \u2014 existing tests should still pass\n2. Add a test that `/verify` parses correctly\n",
  );

  const extracted = await loadOrRefreshAcceptanceGoals(config);

  assert.equal(extracted.sourceKind, "plan_heuristic_fallback");
  assert.equal(extracted.goals.length, 4);
  assert.equal(
    extracted.goals[2].displayText,
    "Verification item 1: `cargo test -p agent-loop` \u2014 existing tests should still pass",
  );
  assert.equal(
    extracted.goals[2].aliases.includes("1. cargo test -p agent-loop \u2014 existing tests should still pass"),
    true,
  );
});

test("canonical goal lint flags evidence citations and contradictions", () => {
  const issues = lintCanonicalGoals([
    {
      canonicalId: "goal-1",
      displayText: "`unsupported_daily_cycle_protocol` does not exist anywhere",
      aliases: [],
    },
    {
      canonicalId: "goal-2",
      displayText: "`unsupported_daily_cycle_protocol` must be emitted",
      aliases: [],
    },
    {
      canonicalId: "goal-3",
      displayText: "Move details from src/verify.js:42 into supporting evidence",
      aliases: [],
    },
  ]);

  assert.equal(issues.length, 2);
  assert.equal(issues.some((issue) => /contains a file:line evidence citation/.test(issue)), true);
  assert.equal(issues.some((issue) => /Canonical goals contradict each other/.test(issue)), true);
});

test("canonical goal lint blocks only authoritative sources", () => {
  assert.equal(canonicalGoalLintShouldBlock("spec_requirements"), true);
  assert.equal(canonicalGoalLintShouldBlock("slice_task_scope"), true);
  assert.equal(canonicalGoalLintShouldBlock("explicit_section"), true);
  assert.equal(canonicalGoalLintShouldBlock("plan_heuristic_fallback"), false);
  assert.equal(canonicalGoalLintShouldBlock("embedded_task_plan_heuristic_fallback"), false);
  assert.equal(canonicalGoalLintShouldBlock("task_heuristic_fallback"), false);
});
