export const READ_ONLY_CLAUDE_TOOLS = "Read,Grep,Glob,WebFetch";
export const IMPLEMENTER_COPILOT_PERMISSIONS = "read, write, shell, url, memory";
export const READ_ONLY_COPILOT_PERMISSIONS = "read, url, memory";
export const READ_ONLY_COPILOT_TOOLS = "view,grep,glob,web_fetch,skill,report_intent,show_file,fetch_copilot_cli_documentation,update_todo,store_memory,list_agents,read_agent";

function buildSimpleMessageArgs(prompt, model, { modelFlag = "--model", messageFlag } = {}) {
  const args = [];
  if (model) {
    args.push(modelFlag, model);
  }
  if (messageFlag) {
    args.push(messageFlag);
  }
  args.push(prompt);
  return args;
}

function prependSystemPrompt(args, systemPrompt) {
  if (systemPrompt && args.length > 0) {
    args[args.length - 1] = `${systemPrompt}\n\n${args[args.length - 1]}`;
  }
}

function insertBeforeLast(args, values) {
  args.splice(Math.max(0, args.length - 1), 0, ...values);
}

function insertCodexOptionsBeforePositionals(args, values) {
  const insertAt = args[1] === "resume" ? Math.max(0, args.length - 2) : Math.max(0, args.length - 1);
  args.splice(insertAt, 0, ...values);
}

export const AGENT_PROVIDER_PLUGINS = Object.freeze({
  aider: {
    binary: "aider",
    buildCommand: ({ prompt, model }) => buildSimpleMessageArgs(prompt, model, { messageFlag: "--message" }),
  },
  claude: {
    binary: "claude",
    buildCommand: ({ prompt, model }) => {
      const args = ["-p", prompt, "--verbose", "--output-format", "stream-json"];
      if (model) {
        args.push("--model", model);
      }
      return args;
    },
    injectSessionResume(args, sessionId) {
      args.unshift("--resume", sessionId);
    },
    injectSystemPrompt(args, systemPrompt) {
      if (systemPrompt) {
        args.push("--append-system-prompt", systemPrompt);
      }
    },
    injectPermissionFlags(args, { config, role }) {
      if (["supervisor", "discoverer", "debugger"].includes(role)) {
        args.push("--allowedTools", config.reviewerAllowedTools ?? READ_ONLY_CLAUDE_TOOLS);
      } else if (config.claudeFullAccess !== false) {
        args.push("--dangerously-skip-permissions");
      } else {
        args.push("--allowedTools", config.claudeAllowedTools ?? "Bash,Read,Edit,Write,Grep,Glob,WebFetch");
      }
    },
    configureEnv({ config, effort }) {
      const env = { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1" };
      if (effort) {
        env.CLAUDE_CODE_EFFORT_LEVEL = effort;
      }
      if (config.claudeMaxOutputTokens) {
        env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(config.claudeMaxOutputTokens);
      }
      if (config.claudeMaxThinkingTokens) {
        env.MAX_THINKING_TOKENS = String(config.claudeMaxThinkingTokens);
      }
      return env;
    },
  },
  codex: {
    binary: "codex",
    buildCommand: ({ prompt, model }) => {
      const args = ["exec", "--skip-git-repo-check", "--json"];
      if (model) {
        args.push("-m", model);
      }
      args.push(prompt);
      return args;
    },
    injectSessionResume(args, sessionId) {
      const execIndex = args.indexOf("exec");
      if (execIndex !== -1) {
        args.splice(execIndex + 1, 0, "resume");
        args.splice(Math.max(0, args.length - 1), 0, sessionId);
      }
    },
    injectSystemPrompt: prependSystemPrompt,
    injectPermissionFlags(args, { config, role }) {
      if (["supervisor", "discoverer", "debugger"].includes(role)) {
        insertCodexOptionsBeforePositionals(args, ["--sandbox", "read-only"]);
      } else if (config.codexFullAccess !== false) {
        insertCodexOptionsBeforePositionals(args, ["--dangerously-bypass-approvals-and-sandbox"]);
      } else {
        insertCodexOptionsBeforePositionals(args, ["--sandbox", "workspace-write"]);
      }
    },
    injectEffortFlags(args, { effort }) {
      if (effort) {
        insertCodexOptionsBeforePositionals(args, ["-c", `model_reasoning_effort="${effort}"`]);
      }
    },
  },
  copilot: {
    binary: "copilot",
    buildCommand: ({ prompt, model }) => {
      const args = ["-p", prompt, "-s", "--output-format", "text", "--no-color"];
      if (model) {
        args.push("--model", model);
      }
      return args;
    },
    injectSystemPrompt: prependSystemPrompt,
    injectPermissionFlags(args, { role }) {
      args.push("--no-ask-user", "--autopilot");
      if (["supervisor", "reviewer", "verifier", "discoverer", "debugger", "planner"].includes(role)) {
        args.push("--allow-tool", READ_ONLY_COPILOT_PERMISSIONS, "--available-tools", READ_ONLY_COPILOT_TOOLS);
      } else {
        args.push("--allow-tool", IMPLEMENTER_COPILOT_PERMISSIONS);
      }
    },
  },
  cursor: {
    binary: "agent",
    buildCommand: ({ prompt, model }) => {
      const args = ["-p", "--output-format", "text"];
      if (model) {
        args.push("--model", model);
      }
      args.push(prompt);
      return args;
    },
    injectSessionResume(args, sessionId) {
      args.unshift("--resume", sessionId);
    },
    injectSystemPrompt: prependSystemPrompt,
    injectPermissionFlags(args, { config, role }) {
      if (["supervisor", "discoverer", "debugger"].includes(role)) {
        args.push("--sandbox", "enabled");
      } else if (config.cursorFullAccess) {
        args.push("--force");
      }
    },
  },
  deepseek: {
    binary: "deepseek",
    buildCommand: ({ prompt }) => [prompt],
  },
  opencode: {
    binary: "opencode",
    buildCommand: ({ prompt, model }) => {
      const args = ["run"];
      if (model) {
        args.push("-m", model);
      }
      args.push(prompt);
      return args;
    },
    injectSessionResume(args, sessionId) {
      args.unshift("--session", sessionId);
    },
    injectSystemPrompt: prependSystemPrompt,
    injectEffortFlags(args, { effort }) {
      if (effort) {
        insertBeforeLast(args, ["--variant", effort]);
      }
    },
    configureEnv({ role }) {
      return role === "planner" ? { OPENCODE_EXPERIMENTAL_PLAN_MODE: "true" } : {};
    },
  },
  pi: {
    binary: "pi",
    buildCommand: ({ prompt, model }) => {
      const args = ["-p"];
      if (model) {
        args.push("--model", model);
      }
      args.push(prompt);
      return args;
    },
    injectSystemPrompt: prependSystemPrompt,
    injectPermissionFlags(args, { role }) {
      if (["reviewer", "verifier", "debugger", "discoverer", "supervisor"].includes(role)) {
        insertBeforeLast(args, ["--tools", "read,grep,find,ls"]);
      }
    },
    injectEffortFlags(args, { effort }) {
      if (effort) {
        insertBeforeLast(args, ["--thinking", effort]);
      }
    },
  },
  qwen: {
    binary: "qwen",
    buildCommand: ({ prompt, model }) => {
      const args = ["-p", prompt, "--output-format", "text"];
      if (model) {
        args.push("-m", model);
      }
      return args;
    },
  },
  vibe: {
    binary: "vibe",
    buildCommand: ({ prompt }) => [prompt],
  },
});

export function providerPlugin(provider) {
  const plugin = AGENT_PROVIDER_PLUGINS[provider];
  if (!plugin) {
    throw new Error(`unknown provider runtime '${provider}'`);
  }
  return plugin;
}
