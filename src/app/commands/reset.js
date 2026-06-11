import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { waveJournalPathForSession, waveLockPathForSession } from "../../state/paths.js";

export async function runReset(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  if (cli.commandArgs.waveLock) {
    try {
      await rm(waveLockPathForSession(config.projectDir, config.session), { force: false });
      context.stdout.write("Wave lock removed.\n");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      context.stdout.write("No wave lock found.\n");
    }
    return 0;
  }
  if (config.session) {
    await rm(config.stateDir, { recursive: true, force: true });
    await mkdir(config.stateDir, { recursive: true });
  } else {
    await mkdir(config.stateDir, { recursive: true });
    for (const entry of await readdir(config.stateDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".wave-task-") && !["decisions", "history", "plan-details", "partial", "event-summaries"].includes(entry.name)) {
        continue;
      }
      await rm(resolve(config.stateDir, entry.name), { recursive: true, force: true });
    }
  }
  await rm(waveJournalPathForSession(config.projectDir, config.session), { force: true });
  context.stdout.write("State reset.\n");
  return 0;
}
