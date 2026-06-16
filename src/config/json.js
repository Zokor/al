import { readFile } from "node:fs/promises";

export async function readJsonConfig(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  if (!text.trim()) {
    // Match the legacy empty-config ergonomics: an empty file opts in with
    // all defaults instead of failing as invalid JSON.
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`.agent-loop.json is not valid JSON (${error.message})`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(".agent-loop.json must contain a JSON object at the top level");
  }
  return parsed;
}
