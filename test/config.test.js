import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/index.js";

const migrateScriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/migrate-config.js");

test("project .agent-loop.json loads and resolves role providers", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    planner: "codex/gpt-5.5/xhigh",
    implementer: "codex/gpt-5.5/high",
    reviewer: "codex/gpt-5.5/xhigh",
  }));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.roles.implementer, "codex");
  assert.equal(config.roles.reviewer, "codex");
  assert.equal(config.roles.planner, "codex");
  assert.equal(config.mode, "dual-agent");
});

test("configs without action_providers preserve slot fallback routing", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ implementer: "codex", reviewer: "codex" }));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.deepEqual(config.actionProviders, {});
  assert.equal(config.roles.implementer, "codex");
  assert.equal(config.roles.planner, "codex");
});

test("unknown action_providers provider errors name action and provider", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ action_providers: { implement: "missing" } }));
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /action_providers\.implement: unknown provider 'missing'/,
  );
});

test("action_providers reject providers missing from the Rust registry", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ action_providers: { implement: "gemini" } }));
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /action_providers\.implement: unknown provider 'gemini'/,
  );
});

test("qwen and pi are registered providers with correct effort profile behavior", async () => {
  const qwenProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(qwenProject, ".agent-loop.json"), JSON.stringify({ implementer: "qwen/qwen3-coder-plus" }));
  const qwen = await loadConfig(qwenProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(qwen.roles.implementer, "qwen");

  const piProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(piProject, ".agent-loop.json"), JSON.stringify({ implementer: "pi/claude-sonnet-4-6/high" }));
  const pi = await loadConfig(piProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(pi.roles.implementer, "pi");

  const missingEffort = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(missingEffort, ".agent-loop.json"), JSON.stringify({ implementer: "pi/claude-sonnet-4-6" }));
  await assert.rejects(
    () => loadConfig(missingEffort, { globals: {}, commandArgs: {} }, { env: {} }),
    /\.agent-loop\.json\.implementer: provider 'pi' requires an effort segment/,
  );
});

test("model provider config preserves action model and effort entries", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    models: { codex: { plan: { model: "gpt-5.5", effort: "xhigh" } } },
  }));
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
  await writeFile(resolve(typoProject, ".agent-loop.json"), JSON.stringify({ models: { codex: { reveiw: { model: "typo" } } } }));
  await assert.rejects(
    () => loadConfig(typoProject, { globals: {}, commandArgs: {} }, { env: {} }),
    /models\.codex\.reveiw: unknown action/,
  );

  const futureProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(futureProject, ".agent-loop.json"), JSON.stringify({ models: { future_provider: { plan: { model: "future" } } } }));
  const config = await loadConfig(futureProject, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.models.future_provider.plan.model, "future");
  assert.match(config.warnings[0], /Unknown provider 'future_provider'/);
});

test("single-agent env override collapses roles in both directions", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    single_agent: true,
    implementer: "codex",
    reviewer: "claude",
  }));
  const dual = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { SINGLE_AGENT: "false" } });
  assert.equal(dual.mode, "dual-agent");
  const single = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { SINGLE_AGENT: "true" } });
  assert.equal(single.mode, "single-agent");
  assert.equal(single.roles.reviewer, "codex");
});

test("corrupt .agent-loop.json fails with an actionable parse error", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), "{not json");
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /\.agent-loop\.json is not valid JSON \(/,
  );
});

test("empty or whitespace-only .agent-loop.json loads as an empty config", async () => {
  const empty = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(empty, ".agent-loop.json"), "");
  const emptyConfig = await loadConfig(empty, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(emptyConfig.roles.implementer, "claude");

  const whitespace = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(whitespace, ".agent-loop.json"), "\n  \t\n");
  const whitespaceConfig = await loadConfig(whitespace, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(whitespaceConfig.roles.implementer, "claude");
});

test("non-object .agent-loop.json root is rejected", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify(["implementer"]));
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /\.agent-loop\.json must contain a JSON object at the top level/,
  );
});

test(".agent-loop.json with a UTF-8 BOM still parses", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), `\uFEFF${JSON.stringify({ implementer: "codex" })}`);
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.roles.implementer, "codex");
});

// The two tests below intentionally write .agent-loop.toml fixtures and assert
// the exact warning strings: they are the test-side counterpart of the
// legacy-detection code in src/config/index.js (the only runtime place allowed
// to mention the retired TOML config), and that behavior cannot be covered
// without these literals.
test("legacy .agent-loop.toml without JSON config warns with the migrate hint", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "implementer = \"codex\"\n");
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.roles.implementer, "claude");
  assert.ok(config.warnings.includes(
    `found .agent-loop.toml, but the Node CLI now reads .agent-loop.json; run 'node "${migrateScriptPath}" "${project}"' to convert it.`,
  ));
});

test("when both config files exist JSON wins and the TOML is reported as ignored", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "implementer = \"codex\"\n");
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ implementer: "qwen/qwen3-coder-plus" }));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(config.roles.implementer, "qwen");
  assert.ok(config.warnings.includes(
    ".agent-loop.toml is ignored by the Node CLI; .agent-loop.json takes precedence.",
  ));
});
