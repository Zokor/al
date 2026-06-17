import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { resolveAgentForAction } from "../src/agent/resolution.js";
import { resolveAgentCommand, runAgentInvocation, AgentRunError } from "../src/agent/runtime.js";
import { loadConfig } from "../src/config/index.js";

async function loadProjectConfig(fileConfig, cli = { globals: {}, commandArgs: {} }) {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-agent-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify(fileConfig));
  return loadConfig(project, cli, { env: {} });
}

test("agent resolution honors action providers, model tables, and CLI effort overrides", async () => {
  const config = await loadProjectConfig(
    {
      implementer: "claude/claude-sonnet-4-6/high",
      reviewer: "codex/gpt-5.4/high",
      action_providers: { review: "codex" },
      models: { codex: { review: { model: "gpt-5.5", effort: "high" } } },
    },
    {
      globals: {
        actionOverrides: [{ action: "review", field: "effort", value: "xhigh", argvIndex: 12 }],
      },
      commandArgs: {},
    },
  );

  assert.deepEqual(resolveAgentForAction(config, { action: "review", slot: "reviewer", role: "reviewer" }), {
    provider: "codex",
    model: "gpt-5.5",
    effort: "xhigh",
    slot: "reviewer",
    role: "reviewer",
  });
});

test("agent resolution uses slot-profile handoff for non-owner action roles", async () => {
  const config = await loadProjectConfig({
    implementer: "claude/claude-sonnet-4-6/high|codex/gpt-5.5/xhigh",
    reviewer: "claude",
  });

  assert.deepEqual(resolveAgentForAction(config, { action: "implement", slot: "reviewer", role: "reviewer" }), {
    provider: "codex",
    model: "gpt-5.5",
    effort: "xhigh",
    slot: "reviewer",
    role: "reviewer",
  });
});

test("provider command builder applies Rust-shaped codex flags", async () => {
  const config = await loadProjectConfig({
    implementer: "codex/gpt-5.5/xhigh",
  });

  const command = resolveAgentCommand({
    config,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Ship the task",
    systemPrompt: "System rules",
  });

  assert.equal(command.command, "codex");
  assert.equal(command.cwd, config.projectDir);
  assert.deepEqual(command.args, [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-m",
    "gpt-5.5",
    "--dangerously-bypass-approvals-and-sandbox",
    "-c",
    "model_reasoning_effort=\"xhigh\"",
    "System rules\n\nShip the task",
  ]);
});

test("agent invocation uses injected runner and writes output artifacts", async () => {
  const config = await loadProjectConfig({ implementer: "qwen/qwen3-coder-plus" });
  const outputFile = resolve(config.projectDir, ".agent-output.txt");
  const calls = [];

  const result = await runAgentInvocation(
    {
      config,
      action: "implement",
      slot: "implementer",
      role: "implementer",
      prompt: "Implement this",
      outputFile,
    },
    {
      runner: async (command) => {
        calls.push(command);
        return { status: 0, stdout: "\u001b[32mdone\u001b[0m\n", stderr: "" };
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "qwen");
  assert.deepEqual(calls[0].args, ["-p", "Implement this", "--output-format", "text", "-m", "qwen3-coder-plus"]);
  assert.equal(result.output, "done\n");
  assert.equal(await readFile(outputFile, "utf8"), "done\n");
});

test("agent invocation normalizes provider JSON output when available", async () => {
  const claudeConfig = await loadProjectConfig({ implementer: "claude" });
  const claude = await runAgentInvocation(
    {
      config: claudeConfig,
      action: "discuss",
      slot: "implementer",
      role: "implementer",
      prompt: "Ask a question",
    },
    {
      runner: async () => ({
        status: 0,
        stdout: `${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "draft" }] } })}\n${JSON.stringify({ type: "result", result: "final question" })}\n`,
        stderr: "",
      }),
    },
  );
  assert.equal(claude.output, "final question");

  const codexConfig = await loadProjectConfig({ implementer: "codex" });
  const codex = await runAgentInvocation(
    {
      config: codexConfig,
      action: "discuss",
      slot: "implementer",
      role: "implementer",
      prompt: "Ask a question",
    },
    {
      runner: async () => ({
        status: 0,
        stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "codex answer" } })}\n`,
        stderr: "",
      }),
    },
  );
  assert.equal(codex.output, "codex answer");
});

test("agent invocation surfaces non-zero provider exits with captured output", async () => {
  const config = await loadProjectConfig({ implementer: "vibe" });

  await assert.rejects(
    () => runAgentInvocation(
      {
        config,
        action: "implement",
        slot: "implementer",
        role: "implementer",
        prompt: "Implement this",
      },
      {
        runner: async () => ({ status: 7, stdout: "partial", stderr: "\nfailure" }),
      },
    ),
    (error) => {
      assert.ok(error instanceof AgentRunError);
      assert.equal(error.status, 7);
      assert.equal(error.output, "partial\nfailure");
      assert.equal(error.command.provider, "vibe");
      return true;
    },
  );
});
