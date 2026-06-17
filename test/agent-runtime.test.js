import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { resolveAgentForAction } from "../src/agent/resolution.js";
import { resolveAgentCommand, runAgentInvocation, AgentRunError } from "../src/agent/runtime.js";
import { loadConfig } from "../src/config/index.js";

async function loadProjectConfig(fileConfig, cli = { globals: {}, commandArgs: {} }, env = {}) {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-agent-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify(fileConfig));
  return loadConfig(project, cli, { env });
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

test("agent resolution honors env action overrides below CLI and above JSON models", async () => {
  const config = await loadProjectConfig(
    {
      implementer: "claude",
      reviewer: "claude",
      planner: "claude",
      models: {
        claude: {
          plan: { model: "json-plan", effort: "low" },
          review: { model: "json-review", effort: "low" },
        },
      },
    },
    {
      globals: {
        actionOverrides: [
          { action: "review", field: "model", value: "cli-review", argvIndex: 6 },
          { action: "review", field: "effort", value: "xhigh", argvIndex: 8 },
        ],
      },
      commandArgs: {},
    },
    {
      AGENT_LOOP_PLAN_MODEL: "env-plan",
      AGENT_LOOP_PLAN_EFFORT: "medium",
      AGENT_LOOP_REVIEW_MODEL: "env-review",
      AGENT_LOOP_REVIEW_EFFORT: "high",
    },
  );

  assert.deepEqual(resolveAgentForAction(config, { action: "plan", slot: "planner", role: "planner" }), {
    provider: "claude",
    model: "env-plan",
    effort: "medium",
    slot: "planner",
    role: "planner",
  });
  assert.deepEqual(resolveAgentForAction(config, { action: "review", slot: "reviewer", role: "reviewer" }), {
    provider: "claude",
    model: "cli-review",
    effort: "xhigh",
    slot: "reviewer",
    role: "reviewer",
  });
});

test("agent resolution keeps JSON model when only env effort override is set", async () => {
  const config = await loadProjectConfig(
    {
      implementer: "claude",
      models: {
        claude: {
          implement: { model: "json-implement", effort: "low" },
        },
      },
    },
    { globals: {}, commandArgs: {} },
    { AGENT_LOOP_IMPLEMENT_EFFORT: "high" },
  );

  assert.deepEqual(resolveAgentForAction(config, { action: "implement", slot: "implementer", role: "implementer" }), {
    provider: "claude",
    model: "json-implement",
    effort: "high",
    slot: "implementer",
    role: "implementer",
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

test("provider command builder applies Rust-shaped Claude permission tuning", async () => {
  const config = await loadProjectConfig({
    implementer: "claude",
    reviewer: "claude",
    claude_full_access: false,
    claude_allowed_tools: "Bash,Read",
    reviewer_allowed_tools: "ReadOnly",
    claude_max_output_tokens: 20000,
    claude_max_thinking_tokens: 12000,
  });

  const implementCommand = resolveAgentCommand({
    config,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Implement this",
  });
  assert.deepEqual(implementCommand.args.slice(-2), ["--allowedTools", "Bash,Read,Skill"]);
  assert.ok(!implementCommand.args.includes("--dangerously-skip-permissions"));
  assert.equal(implementCommand.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR, "1");
  assert.equal(implementCommand.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "20000");
  assert.equal(implementCommand.env.MAX_THINKING_TOKENS, "12000");

  const reviewCommand = resolveAgentCommand({
    config,
    action: "review",
    slot: "reviewer",
    role: "reviewer",
    prompt: "Review this",
  });
  assert.deepEqual(reviewCommand.args.slice(-2), ["--allowedTools", "ReadOnly"]);
  assert.ok(!reviewCommand.args.includes("ReadOnly,Skill"));
});

test("provider command builder applies planner permission mode and disabled skills", async () => {
  const config = await loadProjectConfig({
    planner: "claude",
    claude_full_access: true,
    planner_permission_mode: "plan",
    skills_enabled: false,
  });

  const command = resolveAgentCommand({
    config,
    action: "plan",
    slot: "planner",
    role: "planner",
    prompt: "Plan this",
  });

  assert.ok(command.args.includes("--permission-mode"));
  assert.ok(command.args.includes("plan"));
  assert.ok(command.args.includes("--disable-slash-commands"));
  assert.ok(!command.args.includes("--allowedTools"));
  assert.ok(!command.args.includes("--dangerously-skip-permissions"));
});

test("provider command builder honors Codex and Cursor full-access and session settings", async () => {
  const codexConfig = await loadProjectConfig({
    implementer: "codex/gpt-5.5/xhigh",
    codex_full_access: false,
    codex_session_persistence: false,
  });
  const codex = resolveAgentCommand({
    config: codexConfig,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Implement this",
    sessionId: "codex-session",
  });
  assert.deepEqual(codex.args, [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-m",
    "gpt-5.5",
    "--sandbox",
    "workspace-write",
    "-c",
    "model_reasoning_effort=\"xhigh\"",
    "Implement this",
  ]);

  const cursorConfig = await loadProjectConfig({
    implementer: "cursor/auto",
    cursor_full_access: true,
    cursor_session_persistence: true,
  });
  const cursor = resolveAgentCommand({
    config: cursorConfig,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Implement this",
    sessionId: "cursor-session",
  });
  assert.deepEqual(cursor.args.slice(0, 2), ["--resume", "cursor-session"]);
  assert.ok(cursor.args.includes("--force"));
});

test("provider command builder leaves default system prompt empty when decisions are disabled", async () => {
  const config = await loadProjectConfig({ implementer: "qwen/qwen3-coder-plus" });

  const command = resolveAgentCommand({
    config,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Implement this",
  });

  assert.deepEqual(command.args, ["-p", "Implement this", "--output-format", "text", "-m", "qwen3-coder-plus"]);
});

test("provider command builder injects Rust-shaped decision capture system prompt", async () => {
  const config = await loadProjectConfig({ implementer: "claude", decisions_enabled: true });

  const command = resolveAgentCommand({
    config,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Ship the task",
  });

  const systemPromptIndex = command.args.indexOf("--append-system-prompt");
  assert.notEqual(systemPromptIndex, -1);
  const systemPrompt = command.args[systemPromptIndex + 1];
  assert.match(systemPrompt, /DECISION CAPTURE: If you make an important architectural decision/);
  assert.match(systemPrompt, /- \[CATEGORY\] description/);
  assert.doesNotMatch(systemPrompt, /You are now the REVIEWER/);
});

test("provider command builder injects progressive context manifest into -p prompt arguments", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-agent-"));
  await mkdir(resolve(project, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    implementer: "qwen/qwen3-coder-plus",
    decisions_enabled: true,
    progressive_context: true,
  }));
  await writeFile(resolve(project, "AGENTS.md"), "# Agent rules\n");
  await writeFile(resolve(project, ".agent-loop/decisions.md"), "- [PATTERN] keep the port simple\n");
  await writeFile(resolve(project, ".agent-loop/state/conversation.md"), "history\n");
  await writeFile(resolve(project, ".agent-loop/state/plan.md"), "plan\n");
  await writeFile(resolve(project, ".agent-loop/state/tasks.md"), "tasks\n");
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });

  const command = resolveAgentCommand({
    config,
    action: "implement",
    slot: "implementer",
    role: "implementer",
    prompt: "Implement this",
  });

  assert.equal(command.args[0], "-p");
  const promptArg = command.args[1];
  assert.match(promptArg, /^DECISION CAPTURE:/);
  assert.match(promptArg, /AVAILABLE CONTEXT \(explore files on-demand as needed\):/);
  assert.ok(promptArg.includes(`- Project root: ${project} -- explore structure and source files`));
  assert.ok(promptArg.includes(`- AGENTS.md: ${resolve(project, "AGENTS.md")} -- agent conventions & guidelines`));
  assert.ok(promptArg.includes(`- .agent-loop/decisions.md: ${resolve(project, ".agent-loop/decisions.md")} -- prior decisions & learnings`));
  assert.ok(promptArg.includes(`- conversation.md: ${resolve(project, ".agent-loop/state/conversation.md")} -- round history`));
  assert.ok(promptArg.includes(`- plan.md: ${resolve(project, ".agent-loop/state/plan.md")} -- agreed development plan`));
  assert.ok(promptArg.includes(`- tasks.md: ${resolve(project, ".agent-loop/state/tasks.md")} -- task breakdown`));
  assert.doesNotMatch(promptArg, /README\.md:/);
  assert.match(promptArg, /\n\nImplement this$/);
  assert.deepEqual(command.args.slice(2), ["--output-format", "text", "-m", "qwen3-coder-plus"]);
});

test("progressive context manifest omits decisions file when decisions are disabled", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-agent-"));
  await mkdir(resolve(project, ".agent-loop/state"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    implementer: "vibe",
    progressive_context: true,
  }));
  await writeFile(resolve(project, "AGENTS.md"), "# Agent rules\n");
  await writeFile(resolve(project, ".agent-loop/decisions.md"), "- [PATTERN] hidden while disabled\n");
  await writeFile(resolve(project, ".agent-loop/state/quality_checks.md"), "checks\n");
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });

  const command = resolveAgentCommand({
    config,
    action: "verify",
    slot: "implementer",
    role: "implementer",
    prompt: "Verify this",
  });

  const promptArg = command.args[0];
  assert.match(promptArg, /^AVAILABLE CONTEXT \(explore files on-demand as needed\):/);
  assert.ok(promptArg.includes(`- AGENTS.md: ${resolve(project, "AGENTS.md")} -- agent conventions & guidelines`));
  assert.ok(promptArg.includes(`- quality_checks.md: ${resolve(project, ".agent-loop/state/quality_checks.md")} -- auto quality-check results`));
  assert.doesNotMatch(promptArg, /decisions\.md/);
  assert.doesNotMatch(promptArg, /README\.md:/);
  assert.match(promptArg, /\n\nVerify this$/);
});

test("provider command builder injects single-agent reviewer preamble and system overlays", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-agent-"));
  const profilePath = resolve(project, "profile.toml");
  await writeFile(profilePath, [
    "name = \"runtime_profile\"",
    "",
    "[overlays.system]",
    "all = \"Shared system overlay\"",
    "reviewer = \"Reviewer system overlay\"",
    "",
  ].join("\n"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    implementer: "codex/gpt-5.5/high",
    single_agent: true,
    prompt_style: "terse",
    prompt_profile: profilePath,
  }));
  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });

  const command = resolveAgentCommand({
    config,
    action: "review",
    slot: "reviewer",
    role: "reviewer",
    prompt: "Review this",
  });

  const finalPrompt = command.args.at(-1);
  assert.match(finalPrompt, /^Now REVIEWER\. Evaluate independently and critically, as if you did not write it\./);
  assert.match(finalPrompt, /Shared system overlay/);
  assert.match(finalPrompt, /Reviewer system overlay/);
  assert.match(finalPrompt, /\n\nReview this$/);
  assert.doesNotMatch(finalPrompt, /DECISION CAPTURE/);
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
