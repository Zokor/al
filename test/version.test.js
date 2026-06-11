import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatVersionText, versionEvent } from "../src/app/version.js";
import { RUST_AGENT_LOOP_VERSION } from "../src/generated/rustVersion.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("generated Rust version matches fixture and command output", async () => {
  const fixture = await readFile(resolve(packageDir, "test/fixtures/rust/Cargo.toml"), "utf8");
  assert.match(fixture, new RegExp(`version = "${RUST_AGENT_LOOP_VERSION}"`));
  assert.equal(formatVersionText(), "agent-loop 0.1.120");
  assert.deepEqual(versionEvent(), { type: "version", data: { version: "0.1.120" } });
});
