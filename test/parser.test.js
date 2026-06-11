import assert from "node:assert/strict";
import test from "node:test";
import { parseCliFrom } from "../src/app/cli.js";
import { dispatchFromCli } from "../src/app/dispatch.js";
import { DispatchKind, elapsedPrefersStderr } from "../src/app/dispatchTypes.js";

test("global flags parse before and after subcommands", () => {
  const parsed = parseCliFrom([
    "--session=demo_1",
    "--requirements-workflow",
    "spec",
    "plan",
    "--implementer=codex",
    "--reviewer",
    "codex",
    "--simple",
  ]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(parsed.cli.command, "plan");
  assert.equal(parsed.cli.globals.session, "demo_1");
  assert.equal(parsed.cli.globals.requirementsWorkflow, "spec");
  assert.equal(parsed.cli.globals.implementer, "codex");
  assert.equal(parsed.cli.globals.reviewer, "codex");
  assert.equal(parsed.cli.globals.simple, true);
});

test("action overrides preserve argv order and validate effort", () => {
  const parsed = parseCliFrom([
    "--plan-model",
    "a",
    "status",
    "--action-model",
    "plan=b",
    "--plan-effort=high",
  ]);
  assert.equal(parsed.kind, "parsed");
  assert.deepEqual(
    parsed.cli.globals.actionOverrides.map((override) => [override.action, override.field, override.value]),
    [
      ["plan", "model", "a"],
      ["plan", "model", "b"],
      ["plan", "effort", "high"],
    ],
  );
});

test("invalid action override and approval conflicts fail", () => {
  assert.equal(parseCliFrom(["--action-model", "bogus=x", "status"]).kind, "error");
  assert.match(parseCliFrom(["--tasks-effort=wild", "status"]).stderr, /unknown effort level/);
  assert.match(parseCliFrom(["--require-plan-approval", "status", "--no-plan-approval"]).stderr, /cannot be used/);
});

test("explicit help and version support JSON parse exits", () => {
  const help = parseCliFrom(["--json", "--help"]);
  assert.equal(help.kind, "exit");
  assert.deepEqual(JSON.parse(help.stdout).type, "help");
  const version = parseCliFrom(["--json", "--version"]);
  assert.equal(version.kind, "exit");
  assert.deepEqual(JSON.parse(version.stdout), {
    type: "version",
    data: { version: "0.1.120" },
  });
});

test("unsupported commands are exact and typo aliases remain unknown", () => {
  const unsupported = parseCliFrom(["spec-plan"]);
  assert.equal(unsupported.kind, "parsed");
  assert.equal(dispatchFromCli(unsupported.cli).kind, "Unsupported");
  assert.equal(parseCliFrom(["spec-random"]).kind, "error");
});

test("unsupported commands preserve Rust-style command args for dispatch", () => {
  const unsupported = parseCliFrom(["pipeline", "--phases", "plan,implement", "--resume"]);
  assert.equal(unsupported.kind, "parsed");
  assert.equal(dispatchFromCli(unsupported.cli).kind, "Unsupported");
  assert.deepEqual(unsupported.cli.commandArgs.raw, ["--phases", "plan,implement", "--resume"]);
});

test("supported commands without positional inputs reject stray arguments", () => {
  for (const command of ["status", "reset", "tasks", "next", "resume", "verify", "version"]) {
    const parsed = parseCliFrom([command, "unexpected"]);
    assert.equal(parsed.kind, "error");
    assert.equal(parsed.code, 1);
    assert.match(parsed.stderr, new RegExp(`unexpected argument 'unexpected' for ${command}`));
  }
});

test("spec and plan still accept positional task text", () => {
  for (const command of ["spec", "plan"]) {
    const parsed = parseCliFrom([command, "ship", "this"]);
    assert.equal(parsed.kind, "parsed");
    assert.deepEqual(parsed.cli.commandArgs.positional, ["ship", "this"]);
  }
});

test("list-agents dispatches as Unsupported and elapsed stderr preference follows json mode only", () => {
  const parsed = parseCliFrom(["list-agents"]);
  assert.equal(parsed.kind, "parsed");
  const dispatch = dispatchFromCli(parsed.cli);
  assert.equal(dispatch.kind, DispatchKind.Unsupported);
  assert.equal(dispatch.command, "list-agents");
  assert.equal(elapsedPrefersStderr(dispatch, false), false);
  assert.equal(elapsedPrefersStderr(dispatch, true), true);
  assert.equal(elapsedPrefersStderr({ kind: DispatchKind.Status }, true), true);
});

test("phase commands accept their resume and file flags", () => {
  const planResume = parseCliFrom(["plan", "--resume"]);
  assert.equal(planResume.kind, "parsed");
  assert.equal(planResume.cli.commandArgs.resume, true);
  const specFile = parseCliFrom(["spec", "--file", "task.md"]);
  assert.equal(specFile.kind, "parsed");
  assert.equal(specFile.cli.commandArgs.file, "task.md");
  const tasksResume = parseCliFrom(["tasks", "--resume"]);
  assert.equal(tasksResume.kind, "parsed");
  assert.equal(tasksResume.cli.commandArgs.resume, true);
  const verifyResume = parseCliFrom(["verify", "--resume"]);
  assert.equal(verifyResume.kind, "parsed");
  assert.equal(verifyResume.cli.commandArgs.resume, true);
});
