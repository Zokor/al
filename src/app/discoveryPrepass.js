import { relative } from "node:path";
import { runAgentInvocation } from "../agent/runtime.js";
import { appendPromptOverlay } from "./promptOverlays.js";
import { appendStateFile, readStateFile, safeStatePath, writeStateFile } from "../state/files.js";
import { writeStatus } from "../state/status.js";

export const DiscoveryPhase = Object.freeze({
  Discuss: "discuss",
  Plan: "plan",
});

export async function shouldRunDiscoveryPrepass(config, { explicit = false, phase }) {
  if (explicit) {
    return true;
  }
  if (!config.discoverEnabled || await discoveryExists(config)) {
    return false;
  }
  if (phase === DiscoveryPhase.Discuss) {
    return config.discoverBeforeDiscuss;
  }
  if (phase === DiscoveryPhase.Plan) {
    return config.discoverBeforePlan;
  }
  return false;
}

export async function runDiscoveryPrepass(config, { runner } = {}) {
  await appendLog(config, "━━━ Discovery Prepass ━━━");
  const prompt = discoveryPrompt(config);

  for (let round = 1; round <= config.discoverMaxRounds; round += 1) {
    await appendLog(config, `🔎 Discovery round ${round}/${config.discoverMaxRounds}`);

    let output;
    try {
      const result = await runAgentInvocation(
        {
          config,
          action: "discover",
          slot: "discoverer",
          role: "discoverer",
          prompt,
        },
        { runner },
      );
      output = result.output;
    } catch (error) {
      await writeStatus(
        { status: "ERROR", round, reason: `Discovery prepass failed: ${error.message ?? error}`, workflow: "discuss" },
        config,
      );
      return false;
    }

    const content = extractTaggedBlock(output, "discovery");
    if (content) {
      await writeStateFile(config, "discovery.md", content);
      await appendLog(config, "✅ Discovery complete — discovery.md written");
      return true;
    }

    await appendLog(config, "⚠ Discovery output was empty or missing <discovery> markers; retrying if rounds remain");
  }

  await writeStatus(
    {
      status: "ERROR",
      round: config.discoverMaxRounds,
      reason: "Discovery prepass did not produce a usable discovery.md artifact.",
      workflow: "discuss",
    },
    config,
  );
  return false;
}

async function discoveryExists(config) {
  return Boolean((await readStateFile(config, "discovery.md")).trim());
}

function discoveryPrompt(config) {
  const paths = phasePaths(config);
  const prompt = config.promptStyle === "terse"
    ? `Read ${paths.taskMd}. Survey codebase read-only only.\n\nUse Glob, Grep, Read, and other read-only inspection tools. Do NOT edit repository files, write discovery.md, or propose implementation changes yet.\n\nReturn concise markdown between <discovery> and </discovery> with exact sections:\n1. Architecture Overview\n2. Relevant Files\n3. Existing Patterns To Reuse\n4. Integration Points\n5. Risk Areas\n\nCLI persists final report to ${paths.discoveryMd}.`
    : `Read the task from ${paths.taskMd} and survey the codebase using read-only exploration only.\n\nUse only codebase discovery actions such as Glob, Grep, Read, and other read-only inspection tools. Do NOT edit repository files, do NOT write discovery.md yourself, and do NOT propose implementation changes yet.\n\nProduce a concise markdown discovery report with these exact sections:\n1. Architecture Overview\n2. Relevant Files\n3. Existing Patterns To Reuse\n4. Integration Points\n5. Risk Areas\n\nReturn the report between <discovery> and </discovery> tags. The CLI will persist the final report to ${paths.discoveryMd}.`;
  return appendPromptOverlay(prompt, config, "discovery");
}

function extractTaggedBlock(output, tag) {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = pattern.exec(output);
  const value = match?.[1]?.trim();
  return value || undefined;
}

function phasePaths(config) {
  return {
    taskMd: displayPath(config, safeStatePath(config, "task.md")),
    discoveryMd: displayPath(config, safeStatePath(config, "discovery.md")),
  };
}

function displayPath(config, path) {
  return relative(config.projectDir, path).replaceAll("\\", "/");
}

async function appendLog(config, message) {
  await appendStateFile(config, "log.txt", `${message}\n`);
}
