import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseTomlSubset } from "../scripts/migrate-config.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(packageDir, "scripts/migrate-config.js");

function runMigrate(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

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

test("migrate-config converts a legacy TOML config and respects --force", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), [
    "single_agent = true",
    "timeout = 3.5 # idle seconds",
    "implementer = \"codex/gpt-5.5/high\"",
    "supervisor_requires_approval = []",
    "blocked_skills = [\"a,b\", \"c\"]",
    "",
    "[models.codex.plan]",
    "model = \"gpt-5.5\"",
    "effort = \"xhigh\"",
    "",
  ].join("\n"));

  const first = runMigrate([project]);
  assert.equal(first.status, 0);
  assert.equal(first.stdout, "");
  assert.match(first.stderr, /Wrote .*\.agent-loop\.json from .*\.agent-loop\.toml/);
  const written = await readFile(resolve(project, ".agent-loop.json"), "utf8");
  assert.ok(written.endsWith("\n"));
  assert.deepEqual(JSON.parse(written), {
    single_agent: true,
    timeout: 3.5,
    implementer: "codex/gpt-5.5/high",
    supervisor_requires_approval: [],
    blocked_skills: ["a,b", "c"],
    models: {
      codex: {
        plan: {
          model: "gpt-5.5",
          effort: "xhigh",
        },
      },
    },
  });

  const refused = runMigrate([project]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /already exists; re-run with --force to overwrite/);

  const forced = runMigrate([project, "--force"]);
  assert.equal(forced.status, 0);
  assert.match(forced.stderr, /Wrote .*\.agent-loop\.json/);
});

test("migrate-config warns when the converted config would be rejected by the CLI", async () => {
  const unknownKey = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(unknownKey, ".agent-loop.toml"), "tags = [\"a\"]\nimplementer = \"codex\"\n");
  const rootResult = runMigrate([unknownKey]);
  assert.equal(rootResult.status, 0);
  assert.equal(rootResult.stdout, "");
  assert.match(rootResult.stderr, /Wrote .*\.agent-loop\.json/);
  assert.match(rootResult.stderr, /warning: the Node CLI will reject this config \(unknown \.agent-loop\.json key 'tags'\); edit .*\.agent-loop\.json to fix it/);
  // The file is still written so the user can fix it in place.
  assert.equal(JSON.parse(await readFile(resolve(unknownKey, ".agent-loop.json"), "utf8")).implementer, "codex");

  const nestedKey = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(nestedKey, ".agent-loop.toml"), "[models.codex.plan]\nthreshold = 0.5\n");
  const nestedResult = runMigrate([nestedKey]);
  assert.equal(nestedResult.status, 0);
  assert.match(nestedResult.stderr, /warning: the Node CLI will reject this config \(models\.codex\.plan\.threshold: unknown model config key\)/);

  const clean = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(clean, ".agent-loop.toml"), "implementer = \"codex\"\n");
  const cleanResult = runMigrate([clean]);
  assert.equal(cleanResult.status, 0);
  assert.doesNotMatch(cleanResult.stderr, /warning:/);
});

test("migrate-config surfaces non-fatal config warnings after conversion", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "[models.future_provider.plan]\nmodel = \"future\"\n");
  const result = runMigrate([project]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /warning: Unknown provider 'future_provider'/);
});

test("migrate-config runs standalone (copied outside the package) and skips validation with a notice", async () => {
  // realpath: the script's run-as-main guard compares import.meta.url (which
  // Node resolves through symlinks such as macOS's /var -> /private/var) to
  // process.argv[1], so the spawn path must be the real one.
  const scriptDir = await realpath(await mkdtemp(resolve(tmpdir(), "agent-loop-node-")));
  const copiedScript = resolve(scriptDir, "migrate-config.js");
  await copyFile(scriptPath, copiedScript);

  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  await writeFile(resolve(project, ".agent-loop.toml"), "implementer = \"codex\"\ntags = [\"a\"]\n");
  const result = spawnSync(process.execPath, [copiedScript, project], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Wrote .*\.agent-loop\.json from .*\.agent-loop\.toml/);
  assert.match(result.stderr, /note: skipping post-conversion validation/);
  assert.doesNotMatch(result.stderr, /warning:/);
  assert.deepEqual(JSON.parse(await readFile(resolve(project, ".agent-loop.json"), "utf8")), {
    implementer: "codex",
    tags: ["a"],
  });
});

test("migrate-config errors clearly when no TOML config exists", async () => {
  const project = await mkdtemp(resolve(tmpdir(), "agent-loop-node-"));
  const result = runMigrate([project]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No \.agent-loop\.toml found in .*; nothing to migrate\./);
});
