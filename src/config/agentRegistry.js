export const REGISTERED_PROVIDERS = Object.freeze([
  "claude",
  "codex",
  "copilot",
  "cursor",
  "opencode",
  "pi",
  "aider",
  "qwen",
  "vibe",
  "deepseek",
]);

export const PROVIDERS_WITH_EFFORT = new Set(["claude", "codex", "opencode", "pi"]);

export function assertRegisteredProvider(provider, context) {
  if (!REGISTERED_PROVIDERS.includes(provider)) {
    throw new Error(`${context}: unknown provider '${provider}'`);
  }
}

export function defaultReviewerFor(implementer) {
  return implementer === "codex" ? "claude" : "codex";
}
