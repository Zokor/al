import { readFile, stat } from "node:fs/promises";
import { waveLockPathForSession } from "./paths.js";

// Mirrors the Rust CLI default WAVE_LOCK_STALE_SECONDS (cli/src/wave_runtime/lock.rs).
const DEFAULT_STALE_SECONDS = 30;

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function isLockStale(lockPath, staleSeconds) {
  try {
    const { mtimeMs } = await stat(lockPath);
    return Date.now() - mtimeMs > staleSeconds * 1000;
  } catch {
    return false;
  }
}

export async function assertNoActiveWaveLock(config, { staleSeconds = DEFAULT_STALE_SECONDS } = {}) {
  const lockPath = waveLockPathForSession(config.projectDir, config.session);
  let raw;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  let lock = null;
  try {
    lock = JSON.parse(raw);
  } catch {
    lock = null;
  }
  const pid = Number.isInteger(lock?.pid) ? lock.pid : undefined;
  if (pid !== undefined && (!isPidAlive(pid) || (await isLockStale(lockPath, staleSeconds)))) {
    return;
  }
  const owner = pid !== undefined ? ` (PID ${pid})` : "";
  throw new Error(`A run is in progress${owner}. If stale, run: agent-loop reset --wave-lock`);
}
