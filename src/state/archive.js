import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { preferencesPath } from "./paths.js";

export async function archiveState(config, planStem) {
  const archiveDir = resolve(config.stateDir, "archive", planStem);
  await mkdir(archiveDir, { recursive: true });

  for (const entry of await readdir(config.stateDir, { withFileTypes: true })) {
    if (entry.name === "archive") {
      continue;
    }
    if (!entry.isFile() && !(entry.isDirectory() && entry.name.startsWith(".wave-task-"))) {
      continue;
    }
    await moveIfPossible(resolve(config.stateDir, entry.name), resolve(archiveDir, entry.name));
  }

  await moveIfPossible(preferencesPath(config.projectDir), resolve(archiveDir, "preferences.md"));
}

async function moveIfPossible(source, destination) {
  try {
    await rm(destination, { recursive: true, force: true });
    await rename(source, destination);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
