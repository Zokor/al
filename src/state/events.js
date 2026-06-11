import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

async function readLastSequence(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`State file '${basename(path)}' is corrupted (${error.message}). Run 'agent-loop status' for details or reset state with the Rust CLI.`);
    }
    if (Number.isFinite(event.sequence)) {
      max = Math.max(max, event.sequence);
    }
  }
  return max;
}

export async function ensureEventStream(config) {
  const path = resolve(config.stateDir, "events.jsonl");
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, "", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

export async function appendEvent(config, event) {
  if (!config.eventsEnabled) {
    return;
  }
  await ensureEventStream(config);
  const livePath = resolve(config.stateDir, "events.jsonl");
  const archivePath = resolve(config.stateDir, "events.archive.jsonl");
  const nextSequence = Math.max(await readLastSequence(archivePath), await readLastSequence(livePath)) + 1;
  const payload = {
    sequence: nextSequence,
    timestamp: (config.now ? config.now() : new Date()).toISOString(),
    ...event,
  };
  await appendFile(livePath, `${JSON.stringify(payload)}\n`);
}
