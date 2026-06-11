import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function initializeDecisions(config) {
  const decisionsPath = resolve(config.projectDir, ".agent-loop", "decisions.md");
  if (!config.decisionsEnabled) {
    return;
  }
  await mkdir(resolve(config.projectDir, ".agent-loop"), { recursive: true });
  try {
    await writeFile(decisionsPath, "# Decisions\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}
