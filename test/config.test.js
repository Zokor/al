import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("env action effort overrides reject invalid effort values", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: { AGENT_LOOP_REVIEW_EFFORT: "extreme" } }),
    /unknown effort level 'extreme'/,
  );
});

test("provider CLI settings load Rust defaults and env overrides JSON", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const defaults = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(defaults.claudeFullAccess, true);
  assert.equal(defaults.codexFullAccess, true);
  assert.equal(defaults.cursorFullAccess, false);
  assert.equal(defaults.claudeAllowedTools, "Bash,Read,Edit,Write,Grep,Glob,WebFetch");
  assert.equal(defaults.reviewerAllowedTools, "Read,Grep,Glob,WebFetch");
  assert.equal(defaults.claudeSessionPersistence, true);
  assert.equal(defaults.codexSessionPersistence, true);
  assert.equal(defaults.cursorSessionPersistence, false);
  assert.equal(defaults.skillsEnabled, true);
  assert.equal(defaults.plannerPermissionMode, "default");

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    claude_full_access: true,
    codex_full_access: true,
    cursor_full_access: true,
    claude_allowed_tools: "FileClaudeTools",
    reviewer_allowed_tools: "FileReviewerTools",
    claude_session_persistence: true,
    codex_session_persistence: true,
    cursor_session_persistence: false,
    claude_max_output_tokens: 99,
    claude_max_thinking_tokens: 111,
    skills_enabled: false,
    blocked_skills: [" one ", "", "two"],
    planner_permission_mode: "default",
  }));
  const fromEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, {
    env: {
      CLAUDE_FULL_ACCESS: "0",
      CODEX_FULL_ACCESS: "0",
      CURSOR_FULL_ACCESS: "0",
      CLAUDE_ALLOWED_TOOLS: "EnvClaudeTools",
      REVIEWER_ALLOWED_TOOLS: "EnvReviewerTools",
      CLAUDE_SESSION_PERSISTENCE: "0",
      CODEX_SESSION_PERSISTENCE: "0",
      CURSOR_SESSION_PERSISTENCE: "1",
      CLAUDE_MAX_OUTPUT_TOKENS: "123",
      CLAUDE_MAX_THINKING_TOKENS: "456",
      SKILLS_ENABLED: "1",
      PLANNER_PERMISSION_MODE: "plan",
    },
  });
  assert.equal(fromEnv.claudeFullAccess, false);
  assert.equal(fromEnv.codexFullAccess, false);
  assert.equal(fromEnv.cursorFullAccess, false);
  assert.equal(fromEnv.claudeAllowedTools, "EnvClaudeTools");
  assert.equal(fromEnv.reviewerAllowedTools, "EnvReviewerTools");
  assert.equal(fromEnv.claudeSessionPersistence, false);
  assert.equal(fromEnv.codexSessionPersistence, false);
  assert.equal(fromEnv.cursorSessionPersistence, true);
  assert.equal(fromEnv.claudeMaxOutputTokens, 123);
  assert.equal(fromEnv.claudeMaxThinkingTokens, 456);
  assert.equal(fromEnv.skillsEnabled, true);
  assert.deepEqual(fromEnv.blockedSkills, ["one", "two"]);
  assert.equal(fromEnv.plannerPermissionMode, "plan");
});

test("new_context from JSON or env disables provider session persistence", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    new_context: true,
    claude_session_persistence: true,
    codex_session_persistence: true,
    cursor_session_persistence: true,
  }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.newContext, true);
  assert.equal(fromFile.claudeSessionPersistence, false);
  assert.equal(fromFile.codexSessionPersistence, false);
  assert.equal(fromFile.cursorSessionPersistence, false);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    new_context: false,
    claude_session_persistence: true,
    codex_session_persistence: true,
    cursor_session_persistence: true,
  }));
  const fromEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { NEW_CONTEXT: "1" } });
  assert.equal(fromEnv.newContext, true);
  assert.equal(fromEnv.claudeSessionPersistence, false);
  assert.equal(fromEnv.codexSessionPersistence, false);
  assert.equal(fromEnv.cursorSessionPersistence, false);
});

test("planner_permission_mode rejects invalid values", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ planner_permission_mode: "invalid" }));
  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} }),
    /planner_permission_mode must be one of/,
  );
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

test("decisions_enabled defaults false and DECISIONS_ENABLED overrides JSON", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const defaults = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(defaults.decisionsEnabled, false);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ decisions_enabled: true }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.decisionsEnabled, true);

  const disabledByEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { DECISIONS_ENABLED: "false" } });
  assert.equal(disabledByEnv.decisionsEnabled, false);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ decisions_enabled: false }));
  const enabledByEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { DECISIONS_ENABLED: "true" } });
  assert.equal(enabledByEnv.decisionsEnabled, true);
});

test("progressive_context defaults false and PROGRESSIVE_CONTEXT overrides JSON", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const defaults = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(defaults.progressiveContext, false);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ progressive_context: true }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.progressiveContext, true);

  const disabledByEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { PROGRESSIVE_CONTEXT: "false" } });
  assert.equal(disabledByEnv.progressiveContext, false);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ progressive_context: false }));
  const enabledByEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { PROGRESSIVE_CONTEXT: "true" } });
  assert.equal(enabledByEnv.progressiveContext, true);
});

test("review_max_rounds loads from JSON and REVIEW_MAX_ROUNDS overrides it", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ review_max_rounds: 2 }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.reviewMaxRounds, 2);

  const fromEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { REVIEW_MAX_ROUNDS: "3" } });
  assert.equal(fromEnv.reviewMaxRounds, 3);

  const invalidFileProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(invalidFileProject, ".agent-loop.json"), JSON.stringify({ review_max_rounds: -1 }));
  await assert.rejects(
    () => loadConfig(invalidFileProject, { globals: {}, commandArgs: {} }, { env: {} }),
    /review_max_rounds must be a non-negative integer/,
  );

  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: { REVIEW_MAX_ROUNDS: "-1" } }),
    /invalid value '-1' for REVIEW_MAX_ROUNDS: expected a non-negative integer/,
  );
});

test("discover_max_rounds loads from JSON and DISCOVER_MAX_ROUNDS overrides it", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const defaults = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(defaults.discoverEnabled, false);
  assert.equal(defaults.discoverMaxRounds, 1);
  assert.equal(defaults.discoverBeforeDiscuss, false);
  assert.equal(defaults.discoverBeforePlan, true);

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({
    discover_enabled: true,
    discover_max_rounds: 2,
    discover_before_discuss: true,
    discover_before_plan: false,
  }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.discoverEnabled, true);
  assert.equal(fromFile.discoverMaxRounds, 2);
  assert.equal(fromFile.discoverBeforeDiscuss, true);
  assert.equal(fromFile.discoverBeforePlan, false);

  const fromEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, {
    env: {
      DISCOVER_ENABLED: "false",
      DISCOVER_MAX_ROUNDS: "3",
      DISCOVER_BEFORE_DISCUSS: "false",
      DISCOVER_BEFORE_PLAN: "true",
    },
  });
  assert.equal(fromEnv.discoverEnabled, false);
  assert.equal(fromEnv.discoverMaxRounds, 3);
  assert.equal(fromEnv.discoverBeforeDiscuss, false);
  assert.equal(fromEnv.discoverBeforePlan, true);

  const invalidFileProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(invalidFileProject, ".agent-loop.json"), JSON.stringify({ discover_max_rounds: 0 }));
  await assert.rejects(
    () => loadConfig(invalidFileProject, { globals: {}, commandArgs: {} }, { env: {} }),
    /discover_max_rounds must be >= 1/,
  );

  await assert.rejects(
    () => loadConfig(project, { globals: {}, commandArgs: {} }, { env: { DISCOVER_MAX_ROUNDS: "0" } }),
    /discover_max_rounds must be >= 1/,
  );
});

test("prompt_style loads from JSON and AGENT_LOOP_PROMPT_STYLE overrides it", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const defaults = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(defaults.promptStyle, "normal");

  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ prompt_style: "terse" }));
  const fromFile = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });
  assert.equal(fromFile.promptStyle, "terse");

  const fromEnv = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { AGENT_LOOP_PROMPT_STYLE: "normal" } });
  assert.equal(fromEnv.promptStyle, "normal");

  const invalidProject = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(invalidProject, ".agent-loop.json"), JSON.stringify({ prompt_style: "caveman" }));
  await assert.rejects(
    () => loadConfig(invalidProject, { globals: {}, commandArgs: {} }, { env: {} }),
    /invalid prompt_style/,
  );
});

test("prompt_profile supports builtin xml boundaries overlays", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ prompt_profile: "xml_boundaries_v1" }));

  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });

  assert.equal(config.promptProfile, "xml_boundaries_v1");
  assert.match(config.promptOverlays.verification, /<verification_json>/);
  assert.match(config.promptOverlays.discovery, /Keep discovery read-only/);
});

test("PROMPT_PROFILE overrides JSON profile paths and keeps raw overlay text", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const fileProfile = resolve(project, "file-profile.toml");
  const envProfile = resolve(project, "env-profile.toml");
  await writeFile(fileProfile, [
    "name = \"file_profile\"",
    "",
    "[overlays]",
    "planning = \"file overlay\"",
    "",
  ].join("\n"));
  await writeFile(envProfile, [
    "name = \"env_profile\"",
    "",
    "[overlays]",
    "discuss = \"Use {raw_braces} literally.\"",
    "",
    "[overlays.system]",
    "planner = \"Planner system overlay\"",
    "",
  ].join("\n"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ prompt_profile: fileProfile }));

  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: { PROMPT_PROFILE: envProfile } });

  assert.equal(config.promptProfile, "env_profile");
  assert.equal(config.promptOverlays.discuss, "Use {raw_braces} literally.");
  assert.equal(config.promptOverlays.system.planner, "Planner system overlay");
});

test("prompt_profile resolves named project profile paths", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await mkdir(resolve(project, ".agent-loop/profiles"), { recursive: true });
  await writeFile(resolve(project, ".agent-loop/profiles/local.toml"), [
    "name = \"local_profile\"",
    "",
    "[overlays]",
    "discovery = \"Local discovery overlay\"",
    "",
  ].join("\n"));
  await writeFile(resolve(project, ".agent-loop.json"), JSON.stringify({ prompt_profile: "local" }));

  const config = await loadConfig(project, { globals: {}, commandArgs: {} }, { env: {} });

  assert.equal(config.promptProfile, "local_profile");
  assert.equal(config.promptOverlays.discovery, "Local discovery overlay");
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
