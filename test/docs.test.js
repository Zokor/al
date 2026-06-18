import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { UNSUPPORTED_COMMANDS } from "../src/unsupported/commands.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("unsupported docs command list matches exact unsupported commands", async () => {
  const docs = await readFile(resolve(packageDir, "docs/unsupported.md"), "utf8");
  const listBlock = docs.match(/Unsupported command names:\n\n(?<list>(?:- `[^`]+`\n)+)/)?.groups?.list;
  assert.ok(listBlock, "expected unsupported command list");
  const documentedCommands = Array.from(listBlock.matchAll(/- `([^`]+)`/g), (match) => match[1]);
  assert.deepEqual(documentedCommands, UNSUPPORTED_COMMANDS);

  for (const command of UNSUPPORTED_COMMANDS) {
    assert.match(docs, new RegExp(`\`${command}\``));
  }
  assert.match(docs, /`tui`/);
  assert.doesNotMatch(docs, /`spec-random`/);
});

test("completions parity boundary stays explicit", async () => {
  const [matrix, unsupportedDocs] = await Promise.all([
    readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8"),
    readFile(resolve(packageDir, "docs/unsupported.md"), "utf8"),
  ]);

  const completionsRow = matrix
    .split(/\r?\n/)
    .find((line) => line.startsWith("| `completions` |"));

  assert.ok(completionsRow, "expected completions parity row");
  assert.match(completionsRow, /\| `completions` \| Partial \|/);
  assert.match(completionsRow, /validation errors/);
  assert.match(completionsRow, /missing-shell, invalid-shell, extra-argument, and JSON-mode invalid-shell errors/);
  assert.match(completionsRow, /exact `clap_complete` output/);
  assert.match(completionsRow, /extra `agent-loop-node` binary alias/);
  assert.match(unsupportedDocs, /`completions` is partially implemented/);
  assert.match(unsupportedDocs, /Missing, invalid, extra, and JSON-mode invalid shell argument errors now match Rust/);
  assert.match(unsupportedDocs, /exact Rust `clap_complete` output is not ported/);
});

test("runtime config file divergence stays explicit", async () => {
  const [matrix, unsupportedDocs] = await Promise.all([
    readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8"),
    readFile(resolve(packageDir, "docs/unsupported.md"), "utf8"),
  ]);

  const configRow = matrix
    .split(/\r?\n/)
    .find((line) => line.startsWith("| Runtime config file |"));

  assert.ok(configRow, "expected runtime config parity row");
  assert.match(configRow, /Intentional divergence/);
  assert.match(configRow, /TOML discovery warnings/);
  assert.match(configRow, /JSON precedence when both files exist/);
  assert.match(unsupportedDocs, /Node intentionally reads `\.agent-loop\.json`/);
  assert.match(unsupportedDocs, /TOML-only projects emit a migration warning/);
});

test("init parity evidence stays explicit", async () => {
  const matrix = await readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8");
  const initRow = matrix
    .split(/\r?\n/)
    .find((line) => line.startsWith("| `init` |"));
  const defaultConfigRow = matrix
    .split(/\r?\n/)
    .find((line) => line.startsWith("| Default config generation |"));

  assert.ok(initRow, "expected init parity row");
  assert.match(initRow, /\| `init` \| Covered \|/);
  assert.match(initRow, /`init-empty`/);
  assert.match(initRow, /`json-init-empty`/);
  assert.match(initRow, /`init-existing-config`/);
  assert.match(initRow, /`init-force-existing-config`/);
  assert.match(initRow, /config filename\/path normalized/);
  assert.match(initRow, /canonical config file/);
  assert.ok(defaultConfigRow, "expected default config generation row");
  assert.match(defaultConfigRow, /\.agent-loop\.toml`\/`\.agent-loop\.json` filename divergence normalized/);
});

test("session global option evidence stays explicit", async () => {
  const matrix = await readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8");
  const sessionRow = matrix
    .split(/\r?\n/)
    .find((line) => line.startsWith("| `--session <NAME>` |"));

  assert.ok(sessionRow, "expected --session parity row");
  assert.match(sessionRow, /Partial/);
  assert.match(sessionRow, /plain\/JSON `status`/);
  assert.match(sessionRow, /\.agent-loop\/state\/<session>\/status\.json/);
  assert.match(sessionRow, /missing, empty, invalid-character, too-long, and JSON-mode invalid session names/);
  assert.match(sessionRow, /Resume and agent-invocation session behavior remain partial/);
});

test("global option validation evidence stays explicit", async () => {
  const matrix = await readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8");
  const rows = new Map(
    matrix
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| `--"))
      .map((line) => [line.match(/^\| (`[^`]+`)/)?.[1], line]),
  );

  assert.match(rows.get("`--json`"), /JSON-mode invalid `--requirements-workflow`/);
  assert.match(rows.get("`--json`"), /Rust-shaped `Config error:` stderr/);
  assert.match(rows.get("`--require-plan-approval`"), /conflict with `--no-plan-approval` has Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--no-plan-approval`"), /conflict with `--require-plan-approval` has Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--simple`"), /unexpected inline boolean values have Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--requirements-workflow <legacy\\|spec>`"), /missing and invalid workflow values have Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--implementer <AGENT>`"), /missing value has Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--reviewer <AGENT>`"), /missing value has Rust-vs-Node smoke evidence/);
});

test("action override validation evidence stays explicit", async () => {
  const matrix = await readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8");
  const rows = new Map(
    matrix
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| Specific") || line.startsWith("| `--action"))
      .map((line) => [line.match(/^\| ([^|]+?) \|/)?.[1], line]),
  );

  assert.match(rows.get("Specific `--*-model` flags"), /Missing model values have Rust-vs-Node smoke evidence/);
  assert.match(rows.get("Specific `--*-model` flags"), /Provider invocation behavior remains partial/);
  assert.match(rows.get("Specific `--*-effort` flags"), /Missing and invalid effort values have Rust-vs-Node smoke evidence/);
  assert.match(rows.get("Specific `--*-effort` flags"), /JSON-mode invalid effort stderr/);
  assert.match(rows.get("`--action-model ACTION=MODEL`"), /Missing values, invalid `ACTION=MODEL` shape, and unknown action names have Rust-vs-Node smoke evidence/);
  assert.match(rows.get("`--action-effort ACTION=EFFORT`"), /Missing values, invalid `ACTION=EFFORT` shape, invalid effort levels, and unknown action names have Rust-vs-Node smoke evidence/);
});

test("command parser validation evidence stays explicit", async () => {
  const matrix = await readFile(resolve(packageDir, "docs/parity-matrix.md"), "utf8");
  const rows = new Map(
    matrix
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| Unknown") || line.startsWith("| Unexpected") || line.startsWith("| Semantic") || line.startsWith("| Missing command") || line.startsWith("| Required command"))
      .map((line) => [line.match(/^\| ([^|]+?) \|/)?.[1], line]),
  );

  assert.match(rows.get("Unknown top-level command"), /`command-unknown`/);
  assert.match(rows.get("Unknown top-level command"), /`json-command-unknown`/);
  assert.match(rows.get("Unexpected command argument"), /`command-status-extra`/);
  assert.match(rows.get("Unexpected command argument"), /`json-command-status-extra`/);
  assert.match(rows.get("Unexpected command boolean value"), /representative low-runtime, phase, implementation, review, goal, and queue boolean inline-value failures/);
  assert.match(rows.get("Unexpected command boolean value"), /JSON-mode `init --force=true`/);
  assert.match(rows.get("Semantic command conflict"), /representative implementation, pipeline, and review conflicts/);
  assert.match(rows.get("Semantic command conflict"), /JSON-mode `implement --task`\/`--file`/);
  assert.match(rows.get("Missing command option value"), /`command-plan-file-missing`/);
  assert.match(rows.get("Missing command option value"), /`command-review-files-missing`/);
  assert.match(rows.get("Missing command option value"), /Broader command-specific semantic validation remains tracked/);
  assert.match(rows.get("Required command argument"), /missing `approve` phase/);
  assert.match(rows.get("Required command argument"), /`reject` phase\/reason\/both requireds/);
  assert.match(rows.get("Required command argument"), /`pipeline --phases`/);
  assert.match(rows.get("Required command argument"), /JSON-mode approve and pipeline failures/);
  assert.match(rows.get("Required command argument"), /Queue missing-subcommand help output remains partial/);
  assert.match(rows.get("Unknown queue subcommand"), /`command-queue-unknown-subcommand`/);
});
