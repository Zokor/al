import { spawnSync } from "node:child_process";

export const AGENT_REGISTRY = Object.freeze([
  {
    name: "aider",
    binary: "aider",
    install_hint: "pip install aider-chat",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: [
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "gpt-5",
      "o3",
      "o4-mini",
      "deepseek/deepseek-chat",
    ],
    supported_effort_levels: [],
  },
  {
    name: "claude",
    binary: "claude",
    install_hint: "npm install -g @anthropic-ai/claude-code",
    tier: "Stable",
    supports_model_flag: true,
    suggested_models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
    supported_effort_levels: ["low", "medium", "high", "max"],
  },
  {
    name: "codex",
    binary: "codex",
    install_hint: "npm install -g @openai/codex",
    tier: "Stable",
    supports_model_flag: true,
    suggested_models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2",
    ],
    supported_effort_levels: ["low", "medium", "high", "xhigh"],
  },
  {
    name: "copilot",
    binary: "copilot",
    install_hint: "npm install -g @github/copilot",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: [
      "claude-sonnet-4.5",
      "claude-opus-4.7",
      "gpt-5",
      "gpt-5-mini",
      "o3",
    ],
    supported_effort_levels: [],
  },
  {
    name: "cursor",
    binary: "agent",
    install_hint: "curl https://cursor.com/install -fsS | bash",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: [
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "gpt-5",
      "gpt-5-mini",
      "auto",
    ],
    supported_effort_levels: [],
  },
  {
    name: "deepseek",
    binary: "deepseek",
    install_hint: "Install DeepSeek CLI",
    tier: "Experimental",
    supports_model_flag: false,
    suggested_models: [],
    supported_effort_levels: [],
  },
  {
    name: "opencode",
    binary: "opencode",
    install_hint: "Install OpenCode: https://opencode.ai",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-7",
      "openai/gpt-5",
      "openai/o3",
    ],
    supported_effort_levels: ["minimal", "low", "medium", "high", "max"],
  },
  {
    name: "pi",
    binary: "pi",
    install_hint: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: [
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "openai/gpt-5.5",
      "qwen.qwen3-coder-next",
    ],
    supported_effort_levels: ["minimal", "low", "medium", "high", "xhigh"],
  },
  {
    name: "qwen",
    binary: "qwen",
    install_hint: "Install Qwen CLI",
    tier: "Experimental",
    supports_model_flag: true,
    suggested_models: ["qwen3-coder-plus", "qwen3-coder-flash", "qwen-max", "qwen-plus"],
    supported_effort_levels: [],
  },
  {
    name: "vibe",
    binary: "vibe",
    install_hint: "Install Vibe CLI",
    tier: "Experimental",
    supports_model_flag: false,
    suggested_models: [],
    supported_effort_levels: [],
  },
]);

export const REGISTERED_PROVIDERS = Object.freeze(AGENT_REGISTRY.map((agent) => agent.name));

export const PROVIDERS_WITH_EFFORT = new Set(
  AGENT_REGISTRY.filter((agent) => agent.supported_effort_levels.length > 0).map((agent) => agent.name),
);

function probeInstalled(agent, env) {
  const result = spawnSync(agent.binary, ["--version"], {
    encoding: "utf8",
    env,
    timeout: 5000,
  });
  if (result.error || result.status !== 0) {
    return false;
  }
  if (agent.name !== "copilot") {
    return true;
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return !output.includes("Cannot find GitHub Copilot CLI") && !output.includes("Install GitHub Copilot CLI?");
}

export function listAgents(env = process.env) {
  return AGENT_REGISTRY.map((agent) => ({
    name: agent.name,
    binary: agent.binary,
    install_hint: agent.install_hint,
    installed: probeInstalled(agent, env),
    tier: agent.tier,
    supports_model_flag: agent.supports_model_flag,
    suggested_models: [...agent.suggested_models],
    supported_effort_levels: [...agent.supported_effort_levels],
  }));
}

export function assertRegisteredProvider(provider, context) {
  if (!REGISTERED_PROVIDERS.includes(provider)) {
    throw new Error(`${context}: unknown provider '${provider}'`);
  }
}

export function defaultReviewerFor(implementer) {
  return implementer === "codex" ? "claude" : "codex";
}
