import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolveAgentForAction } from "./resolution.js";
import { providerPlugin } from "./providers.js";

export class AgentRunError extends Error {
  constructor(message, { command, status, output } = {}) {
    super(message);
    this.name = "AgentRunError";
    this.command = command;
    this.status = status;
    this.output = output;
  }
}

export function resolveAgentCommand({ config, action, slot, role, prompt, systemPrompt, sessionId }) {
  const agent = resolveAgentForAction(config, { action, slot, role });
  const plugin = providerPlugin(agent.provider);
  const args = plugin.buildCommand({ prompt, model: agent.model });
  if (sessionId && plugin.injectSessionResume && !codexReadOnlyRoleRequiresFreshSession(agent.provider, role)) {
    plugin.injectSessionResume(args, sessionId);
  }
  if (systemPrompt) {
    (plugin.injectSystemPrompt ?? defaultInjectSystemPrompt)(args, systemPrompt);
  }
  plugin.injectPermissionFlags?.(args, { config, role, action, agent });
  plugin.injectEffortFlags?.(args, { config, role, action, agent, effort: agent.effort });
  const env = {
    ...(plugin.configureEnv?.({ config, role, action, agent, effort: agent.effort }) ?? {}),
  };
  return {
    provider: agent.provider,
    model: agent.model,
    effort: agent.effort,
    command: plugin.binary,
    args,
    cwd: config.projectDir,
    env,
  };
}

export async function runAgentInvocation(invocation, { runner = spawnAgentProcess } = {}) {
  const commandSpec = resolveAgentCommand(invocation);
  const result = await runner(commandSpec);
  const rawOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const output = normalizeProviderOutput(commandSpec.provider, stripAnsi(rawOutput));
  if (result.status !== 0) {
    throw new AgentRunError(`${commandSpec.provider} exited with code ${result.status}`, {
      command: commandSpec,
      status: result.status,
      output,
    });
  }
  if (invocation.outputFile) {
    await writeFile(invocation.outputFile, output);
  }
  return {
    command: commandSpec,
    status: result.status,
    output,
    rawOutput,
  };
}

function defaultInjectSystemPrompt(args, systemPrompt) {
  if (args.length > 0) {
    args[args.length - 1] = `${systemPrompt}\n\n${args[args.length - 1]}`;
  }
}

function codexReadOnlyRoleRequiresFreshSession(provider, role) {
  return provider === "codex" && ["supervisor", "discoverer", "debugger"].includes(role);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function normalizeProviderOutput(provider, output) {
  if (provider === "claude") {
    return extractClaudeStreamJsonText(output) ?? output;
  }
  if (provider === "codex") {
    return extractCodexJsonText(output) ?? output;
  }
  return output;
}

function extractClaudeStreamJsonText(output) {
  let resultText;
  let assistantText;
  for (const line of output.split(/\r?\n/)) {
    const value = parseJsonLine(line);
    if (!value) {
      continue;
    }
    if (value.type === "result" && typeof value.result === "string") {
      resultText = value.result;
      continue;
    }
    if (value.type === "assistant" && Array.isArray(value.message?.content)) {
      const text = value.message.content
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("");
      if (text.trim()) {
        assistantText = text;
      }
    }
  }
  return resultText ?? assistantText;
}

function extractCodexJsonText(output) {
  let lastText;
  for (const line of output.split(/\r?\n/)) {
    const value = parseJsonLine(line);
    if (!value) {
      continue;
    }
    if (value.type === "message") {
      lastText = extractTextField(value.content) ?? lastText;
      continue;
    }
    if (typeof value.type === "string" && value.type.startsWith("item.")) {
      const item = value.item;
      if (!["agent_message", "assistant_message", "message"].includes(item?.type)) {
        continue;
      }
      lastText =
        nonEmptyString(item.text) ??
        extractTextField(item.content) ??
        extractTextField(item.message?.content) ??
        lastText;
    }
  }
  return lastText;
}

function extractTextField(value) {
  if (typeof value === "string") {
    return nonEmptyString(value);
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const text = value
    .map((block) => (typeof block === "string" ? block : block?.text))
    .filter((segment) => typeof segment === "string")
    .join("");
  return nonEmptyString(text);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseJsonLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function spawnAgentProcess(commandSpec) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      cwd: commandSpec.cwd,
      env: { ...process.env, ...commandSpec.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new AgentRunError(`${commandSpec.provider} failed to start: ${error.message}`, { command: commandSpec }));
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
