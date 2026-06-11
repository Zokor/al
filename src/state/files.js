import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export function safeStatePath(config, fileName) {
  if (fileName.includes("..") || fileName.startsWith("/") || fileName.includes(`..${sep}`)) {
    throw new Error(`unsafe state file name: ${fileName}`);
  }
  const path = resolve(config.stateDir, fileName);
  if (!path.startsWith(`${config.stateDir}${sep}`) && path !== config.stateDir) {
    throw new Error(`unsafe state file name: ${fileName}`);
  }
  return path;
}

let interrupted = false;
let inFlightWrites = 0;
let onWritesDrained = null;

export function isInterruptRequested() {
  return interrupted;
}

export function requestInterrupt(onDrained) {
  interrupted = true;
  if (inFlightWrites === 0) {
    onDrained();
    return;
  }
  onWritesDrained = onDrained;
}

export function clearInterrupt() {
  interrupted = false;
  onWritesDrained = null;
}

function finishWrite() {
  inFlightWrites -= 1;
  if (interrupted && inFlightWrites === 0 && onWritesDrained) {
    const onDrained = onWritesDrained;
    onWritesDrained = null;
    onDrained();
  }
}

export async function readStateFile(config, fileName) {
  try {
    return await readFile(safeStatePath(config, fileName), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function readJsonStateFile(config, fileName) {
  const text = await readStateFile(config, fileName);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`State file '${fileName}' is corrupted (${error.message}). Run 'agent-loop status' for details or reset state with the Rust CLI.`);
  }
}

export async function writeStateFile(config, fileName, content) {
  const path = safeStatePath(config, fileName);
  inFlightWrites += 1;
  try {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, path);
  } finally {
    finishWrite();
  }
}

export async function removeStateFile(config, fileName) {
  await rm(safeStatePath(config, fileName), { force: true, recursive: true });
}
