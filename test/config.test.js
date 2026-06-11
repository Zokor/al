import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("current root .agent-loop.toml loads and resolves role providers", async () => {
  const config = await loadConfig(repoRoot, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.roles.implementer, "codex");
  assert.equal(config.roles.reviewer, "codex");
  assert.equal(config.roles.planner, "codex");
  assert.equal(config.mode, "dual-agent");
});

test("configs without action_providers preserve slot fallback routing", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "implementer = \"codex\"\nreviewer = \"codex\"\n");
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.deepEqual(config.actionProviders, {});
  assert.equal(config.roles.implementer, "codex");
  assert.equal(config.roles.planner, "codex");
});

test("unknown action_providers provider errors name action and provider", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "[action_providers]\nimplement = \"missing\"\n");
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /action_providers\.implement: unknown provider 'missing'/,
  );
});

test("action_providers reject providers missing from the Rust registry", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "[action_providers]\nimplement = \"gemini\"\n");
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /action_providers\.implement: unknown provider 'gemini'/,
  );
});

test("qwen and pi are registered providers with correct effort profile behavior", async () => {
  const qwenProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(qwenProject, ".agent-loop.toml"), "implementer = \"qwen/qwen3-coder-plus\"\n");
  const qwen = await loadConfig(qwenProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(qwen.roles.implementer, "qwen");

  const piProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(piProject, ".agent-loop.toml"), "implementer = \"pi/claude-sonnet-4-6/high\"\n");
  const pi = await loadConfig(piProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(pi.roles.implementer, "pi");

  const missingEffort = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(missingEffort, ".agent-loop.toml"), "implementer = \"pi/claude-sonnet-4-6\"\n");
  await assert.rejects(
    () => loadConfig(missingEffort, { globals: {}, commandArgs: {} }, { env: {} }),
    /\.agent-loop\.toml\.implementer: provider 'pi' requires an effort segment/,
  );
});

test("model provider config preserves action model and effort entries", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "[models.codex.plan]\nmodel = \"gpt-5.5\"\neffort = \"xhigh\"\n");
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.deepEqual(config.models, {
    codex: {
      plan: {
        model: "gpt-5.5",
        effort: "xhigh",
      },
    },
  });
  assert.deepEqual(config.warnings, []);
});

test("model provider config rejects action typos but preserves unknown providers", async () => {
  const typoProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(typoProject, ".agent-loop.toml"), "[models.codex.reveiw]\nmodel = \"typo\"\n");
  await assert.rejects(
    () => loadConfig(typoProject, { globals: {}, commandArgs: {} }, { env: {} }),
    /models\.codex\.reveiw: unknown action/,
  );

  const futureProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(futureProject, ".agent-loop.toml"), "[models.future_provider.plan]\nmodel = \"future\"\n");
  const config = await loadConfig(futureProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.models.future_provider.plan.model, "future");
  assert.match(config.warnings[0], /Unknown provider 'future_provider'/);
});

test("single-agent env override collapses roles in both directions", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "single_agent = true\nimplementer = \"codex\"\nreviewer = \"claude\"\n");
  const dual = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { SINGLE_AGENT: "false" } });
  assert.equal(dual.mode, "dual-agent");
  const single = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { SINGLE_AGENT: "true" } });
  assert.equal(single.mode, "single-agent");
  assert.equal(single.roles.reviewer, "codex");
});
