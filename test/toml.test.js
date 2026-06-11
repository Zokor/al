import assert from "node:assert/strict";
import test from "node:test";
import { parseTomlSubset } from "../src/config/toml.js";

test("floats and negative floats parse as numbers", () => {
  const parsed = parseTomlSubset("timeout = 3.5\noffset = -0.25\ncount = 42\nnegative = -7\n");
  assert.equal(parsed.timeout, 3.5);
  assert.equal(parsed.offset, -0.25);
  assert.equal(parsed.count, 42);
  assert.equal(parsed.negative, -7);
});

test("arrays keep quoted commas intact", () => {
  const parsed = parseTomlSubset("items = [\"a,b\", \"c\"]\n");
  assert.deepEqual(parsed.items, ["a,b", "c"]);
});

test("arrays mix quoted strings, numbers, and booleans", () => {
  const parsed = parseTomlSubset("mixed = [\"x, y\", 1, 2.5, true]\n");
  assert.deepEqual(parsed.mixed, ["x, y", 1, 2.5, true]);
});

test("escaped quotes inside strings are preserved", () => {
  const parsed = parseTomlSubset("label = \"say \\\"hi\\\", ok\"\nlist = [\"a \\\"b\\\", c\", \"d\"]\n");
  assert.equal(parsed.label, "say \"hi\", ok");
  assert.deepEqual(parsed.list, ["a \"b\", c", "d"]);
});

test("inline comments and empty arrays still parse", () => {
  const parsed = parseTomlSubset("ratio = 1.5 # half again\nempty = []\n");
  assert.equal(parsed.ratio, 1.5);
  assert.deepEqual(parsed.empty, []);
});
