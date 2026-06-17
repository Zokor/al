import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJsonContent, normalizeOutput, runParitySmoke } from "../scripts/parity-smoke.js";

test("parity smoke output normalization removes elapsed lines and canonicalizes JSON", () => {
  const rust = [
    '{"data":{"workflow":{"timestamp":"2026-06-17T11:00:00Z","status":"PENDING"},"goal":null},"type":"goal_status"}',
    "Elapsed: 00:00:00",
  ].join("\n");
  const node = [
    '{"type":"goal_status","data":{"goal":null,"workflow":{"status":"PENDING","timestamp":"2026-06-17T11:00:01.000Z"}}}',
    "elapsed: 0.00s",
  ].join("\n");

  assert.equal(normalizeOutput(rust), normalizeOutput(node));
});

test("parity smoke state normalization sorts keys and scrubs dynamic timestamps", () => {
  const rust = JSON.stringify({
    updated_at: "2026-06-17T11:00:00Z",
    objective: "Ship",
    schema_version: 1,
  });
  const node = JSON.stringify({
    schema_version: 1,
    objective: "Ship",
    updated_at: "2026-06-17T11:00:01.000Z",
  });

  assert.equal(normalizeJsonContent(rust), normalizeJsonContent(node));
});

test("parity smoke rejects unknown scenario names before running CLIs", async () => {
  await assert.rejects(
    () => runParitySmoke({ scenarioNames: ["does-not-exist"], rustBin: "missing-rust", nodeBin: "missing-node" }),
    /unknown parity scenario/,
  );
});
