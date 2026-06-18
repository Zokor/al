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
    "Elapsed: 00:00:00",
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

test("parity smoke supports scenario-local dynamic ID normalization", () => {
  const rust = '{"type":"queue_item","data":{"queue_id":"rust-id","title":"Ship"}}';
  const node = '{"data":{"title":"Ship","queue_id":"node-id"},"type":"queue_item"}';

  assert.equal(
    normalizeOutput(rust, { dynamicJsonKeys: ["queue_id"] }),
    normalizeOutput(node, { dynamicJsonKeys: ["queue_id"] }),
  );
  assert.equal(
    normalizeOutput("Queued abc12345: Ship\n", { outputReplacements: [[/Queued [0-9a-f]{8}:/g, "Queued <queue-id>:"]] }),
    "Queued <queue-id>: Ship",
  );
});

test("parity smoke rejects unknown scenario names before running CLIs", async () => {
  await assert.rejects(
    () => runParitySmoke({ scenarioNames: ["does-not-exist"], rustBin: "missing-rust", nodeBin: "missing-node" }),
    /unknown parity scenario/,
  );
});
