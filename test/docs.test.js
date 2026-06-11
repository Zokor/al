import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { UNSUPPORTED_COMMANDS } from "../src/unsupported/commands.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("unsupported docs cover every exact unsupported command", async () => {
  const docs = await readFile(resolve(packageDir, "docs/unsupported.md"), "utf8");
  for (const command of UNSUPPORTED_COMMANDS) {
    assert.match(docs, new RegExp(`\`${command}\``));
  }
  assert.match(docs, /`tui`/);
  assert.doesNotMatch(docs, /`spec-random`/);
});
