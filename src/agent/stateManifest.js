import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_FILES = Object.freeze([
  ["README.md", "project documentation"],
  ["CLAUDE.md", "project instructions for AI"],
  ["AGENTS.md", "agent conventions & guidelines"],
]);

const STATE_FILES = Object.freeze([
  ["original-request.md", "immutable snapshot of the initial user request"],
  ["conversation.md", "round history"],
  ["discovery.md", "codebase discovery prepass"],
  ["spec.md", "canonical requirements spec"],
  ["plan.md", "agreed development plan"],
  ["acceptance-goals.json", "canonical acceptance goals derived from the plan"],
  ["tasks.md", "task breakdown"],
  ["quality_checks.md", "auto quality-check results"],
]);

export function stateManifest(config) {
  const lines = ["AVAILABLE CONTEXT (explore files on-demand as needed):"];
  lines.push(`- Project root: ${config.projectDir} -- explore structure and source files`);

  const docFiles = [...DOC_FILES];
  if (config.decisionsEnabled) {
    docFiles.push([".agent-loop/decisions.md", "prior decisions & learnings"]);
  }

  for (const [relative, description] of docFiles) {
    const fullPath = resolve(config.projectDir, relative);
    if (existsSync(fullPath)) {
      lines.push(`- ${relative}: ${fullPath} -- ${description}`);
    }
  }

  for (const [filename, description] of STATE_FILES) {
    const fullPath = resolve(config.stateDir, filename);
    if (existsSync(fullPath)) {
      lines.push(`- ${filename}: ${fullPath} -- ${description}`);
    }
  }

  return lines.join("\n");
}
