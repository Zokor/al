import { access } from "node:fs/promises";
import { readJsonStateFile, readStateFile, safeStatePath } from "./files.js";

export async function supervisorResumePhasesFromStateDir(config) {
  if (!(await readStateFile(config, "workflow.txt")).trim()) {
    return undefined;
  }

  const value = await readJsonStateFile(config, "supervisor.json");
  if (!value) {
    return undefined;
  }
  const phases = value?.workflow?.phases;
  if (!Array.isArray(phases)) {
    return undefined;
  }
  const phaseNames = phases
    .filter((phase) => typeof phase === "string")
    .map((phase) => phase.trim())
    .filter(Boolean);
  return phaseNames.length > 0 ? phaseNames.join(",") : undefined;
}

async function stateFileExists(config, fileName) {
  try {
    await access(safeStatePath(config, fileName));
    return true;
  } catch {
    return false;
  }
}

export async function hasResumableState(config) {
  if (await stateFileExists(config, "status.json")) {
    return true;
  }
  if ((await readStateFile(config, "workflow.txt")).trim()) {
    return true;
  }
  for (const fileName of ["pipeline.json", "task.md", "spec.md", "plan.md", "tasks.md", "verification-fixes.md"]) {
    if ((await readStateFile(config, fileName)).trim()) {
      return true;
    }
  }
  return false;
}
