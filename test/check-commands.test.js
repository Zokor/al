import assert from "node:assert/strict";
import test from "node:test";
import { CHECK_TIMEOUT_MS } from "../src/app/checkCommands.js";

test("check command timeout allows long-running project suites", () => {
  assert.equal(CHECK_TIMEOUT_MS, 600_000);
});
