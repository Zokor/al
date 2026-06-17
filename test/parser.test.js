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
  assert.equal(unsupported.cli.commandArgs.phases, "plan,implement");
  assert.equal(unsupported.cli.commandArgs.resume, true);
});

test("implement command parses shared mode flags before runtime support is complete", () => {
  const parsed = parseCliFrom([
    "implement",
    "--task",
    "ship it",
    "--single-agent",
    "--max-retries",
    "4",
    "--round-step=3",
    "--continue-on-fail",
  ]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Implement);
  assert.equal(parsed.cli.commandArgs.task, "ship it");
  assert.equal(parsed.cli.commandArgs.singleAgent, true);
  assert.deepEqual(parsed.cli.commandArgs.flags, {
    perTask: false,
    wave: false,
    maxRetries: 4,
    roundStep: 3,
    continueOnFail: true,
    failFast: false,
    maxParallel: undefined,
  });

  const conflict = parseCliFrom(["implement", "--task", "ship it", "--file", "task.md"]);
  assert.equal(conflict.kind, "error");
  assert.match(conflict.stderr, /task and --file cannot be used together/);

  const resumePerTask = parseCliFrom(["implement", "--resume", "--per-task"]);
  assert.equal(resumePerTask.kind, "error");
  assert.match(resumePerTask.stderr, /--per-task cannot be combined with --resume/);
});

test("implement-verify parses as a dedicated supported command", () => {
  const parsed = parseCliFrom([
    "implement-verify",
    "--task",
    "ship it",
    "--single-agent",
    "--max-retries",
    "4",
    "--round-step=3",
  ]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.ImplementVerify);
  assert.equal(parsed.cli.commandArgs.task, "ship it");
  assert.equal(parsed.cli.commandArgs.singleAgent, true);
  assert.deepEqual(parsed.cli.commandArgs.flags, {
    perTask: false,
    wave: false,
    maxRetries: 4,
    roundStep: 3,
    continueOnFail: false,
    failFast: false,
    maxParallel: undefined,
  });

  const conflict = parseCliFrom(["implement-verify", "--task", "ship it", "--file", "task.md"]);
  assert.equal(conflict.kind, "error");
  assert.match(conflict.stderr, /task and --file cannot be used together/);
});

test("inline command parses Rust task and file options", () => {
  const parsed = parseCliFrom(["inline", "--task", "ship it", "--file", "task.md"]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Inline);
  assert.equal(parsed.cli.commandArgs.task, "ship it");
  assert.equal(parsed.cli.commandArgs.file, "task.md");

  const positional = parseCliFrom(["inline", "ship it"]);
  assert.equal(positional.kind, "error");
  assert.match(positional.stderr, /unexpected argument 'ship it' for inline/);
});

test("review command parses standalone review options and conflicts", () => {
  const parsed = parseCliFrom(["review", "focus on auth", "--files", "src/auth.js", "src/session.js", "--single-agent"]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Review);
  assert.equal(parsed.cli.commandArgs.context, "focus on auth");
  assert.deepEqual(parsed.cli.commandArgs.files, ["src/auth.js", "src/session.js"]);
  assert.equal(parsed.cli.commandArgs.singleAgent, true);

  const withPlan = parseCliFrom(["review", "--base=main", "--file", "context.md", "--plan", "plan.md"]);
  assert.equal(withPlan.kind, "parsed");
  assert.equal(withPlan.cli.commandArgs.base, "main");
  assert.equal(withPlan.cli.commandArgs.file, "context.md");
  assert.equal(withPlan.cli.commandArgs.plan, "plan.md");

  const conflict = parseCliFrom(["review", "--files", "src/a.js", "--base", "main"]);
  assert.equal(conflict.kind, "error");
  assert.match(conflict.stderr, /--files and --base cannot be used together/);

  const extraPositional = parseCliFrom(["review", "focus", "extra"]);
  assert.equal(extraPositional.kind, "error");
  assert.match(extraPositional.stderr, /unexpected argument 'extra' for review/);
});

test("goal command parses lifecycle and creation forms", () => {
  const inline = parseCliFrom(["goal", "create", "status", "page"]);
  assert.equal(inline.kind, "parsed");
  assert.equal(dispatchFromCli(inline.cli).kind, DispatchKind.Goal);
  assert.equal(inline.cli.commandArgs.goalCommand, undefined);
  assert.deepEqual(inline.cli.commandArgs.objectiveWords, ["create", "status", "page"]);

  const objective = parseCliFrom(["goal", "--objective", "status page app"]);
  assert.equal(objective.kind, "parsed");
  assert.equal(dispatchFromCli(objective.cli).kind, DispatchKind.Goal);
  assert.equal(objective.cli.commandArgs.objectiveText, "status page app");

  const fromFile = parseCliFrom(["goal", "--file", "kanban.md", "--replace"]);
  assert.equal(fromFile.kind, "parsed");
  assert.equal(fromFile.cli.commandArgs.file, "kanban.md");
  assert.equal(fromFile.cli.commandArgs.replace, true);

  const status = parseCliFrom(["goal", "status"]);
  assert.equal(status.kind, "parsed");
  assert.equal(dispatchFromCli(status.cli).kind, DispatchKind.Goal);
  assert.equal(status.cli.commandArgs.goalCommand, "status");

  const resume = parseCliFrom(["goal", "resume", "--run"]);
  assert.equal(resume.kind, "parsed");
  assert.equal(dispatchFromCli(resume.cli).kind, DispatchKind.Goal);
  assert.equal(resume.cli.commandArgs.goalCommand, "resume");
  assert.equal(resume.cli.commandArgs.run, true);

  const extra = parseCliFrom(["goal", "status", "unexpected"]);
  assert.equal(extra.kind, "error");
  assert.match(extra.stderr, /unexpected argument 'unexpected' for goal status/);
});

test("queue command parses lifecycle forms", () => {
  const add = parseCliFrom([
    "queue",
    "add",
    "--priority",
    "4",
    "--depends-on",
    "queue-a",
    "--depends-on=queue-b, queue-a",
    "ship",
    "queue",
  ]);
  assert.equal(add.kind, "parsed");
  assert.equal(dispatchFromCli(add.cli).kind, DispatchKind.Queue);
  assert.equal(add.cli.commandArgs.queueCommand, "add");
  assert.equal(add.cli.commandArgs.priority, 4);
  assert.deepEqual(add.cli.commandArgs.dependsOn, ["queue-a", "queue-b, queue-a"]);
  assert.deepEqual(add.cli.commandArgs.objectiveWords, ["ship", "queue"]);

  const fromFile = parseCliFrom(["queue", "add", "--file", "task.md", "--priority=-2"]);
  assert.equal(fromFile.kind, "parsed");
  assert.equal(fromFile.cli.commandArgs.file, "task.md");
  assert.equal(fromFile.cli.commandArgs.priority, -2);

  const resume = parseCliFrom(["queue", "resume", "queue-a", "--run"]);
  assert.equal(resume.kind, "parsed");
  assert.equal(dispatchFromCli(resume.cli).kind, DispatchKind.Queue);
  assert.equal(resume.cli.commandArgs.queueCommand, "resume");
  assert.equal(resume.cli.commandArgs.queueId, "queue-a");
  assert.equal(resume.cli.commandArgs.run, true);

  const missingId = parseCliFrom(["queue", "pause"]);
  assert.equal(missingId.kind, "error");
  assert.match(missingId.stderr, /missing queue item ID for queue pause/);

  const optionBeforeSubcommand = parseCliFrom(["queue", "--file", "task.md", "add"]);
  assert.equal(optionBeforeSubcommand.kind, "error");
  assert.match(optionBeforeSubcommand.stderr, /unexpected argument '--file' for queue/);
});

test("unsupported pipeline aliases expose Rust phase metadata and implement flags", () => {
  const alias = parseCliFrom([
    "plan-implement-verify",
    "--task",
    "ship it",
    "--single-agent",
    "--wave",
    "--max-parallel",
    "3",
  ]);
  assert.equal(alias.kind, "parsed");
  assert.equal(dispatchFromCli(alias.cli).kind, "Unsupported");
  assert.equal(alias.cli.commandArgs.phases, "plan,implement,verify");
  assert.equal(alias.cli.commandArgs.task, "ship it");
  assert.equal(alias.cli.commandArgs.singleAgent, true);
  assert.equal(alias.cli.commandArgs.flags.wave, true);
  assert.equal(alias.cli.commandArgs.flags.maxParallel, 3);

  const prepAlias = parseCliFrom(["spec-plan", "tighten requirements", "--discover"]);
  assert.equal(prepAlias.kind, "parsed");
  assert.equal(prepAlias.cli.commandArgs.phases, "spec,plan");
  assert.equal(prepAlias.cli.commandArgs.task, "tighten requirements");
  assert.equal(prepAlias.cli.commandArgs.discover, true);

  const invalid = parseCliFrom(["spec-plan", "task", "--single-agent"]);
  assert.equal(invalid.kind, "error");
  assert.match(invalid.stderr, /unexpected argument '--single-agent' for spec-plan/);
});

test("unsupported pipeline commands validate required phases and implement flag conflicts", () => {
  const pipeline = parseCliFrom([
    "pipeline",
    "--phases",
    "plan,implement",
    "--task",
    "ship it",
    "--wave",
    "--max-parallel=2",
  ]);
  assert.equal(pipeline.kind, "parsed");
  assert.equal(pipeline.cli.commandArgs.phases, "plan,implement");
  assert.equal(pipeline.cli.commandArgs.flags.wave, true);
  assert.equal(pipeline.cli.commandArgs.flags.maxParallel, 2);

  const missing = parseCliFrom(["pipeline", "--task", "ship it"]);
  assert.equal(missing.kind, "error");
  assert.match(missing.stderr, /missing value for --phases/);

  const flagConflict = parseCliFrom(["pipeline", "--phases", "plan,implement", "--wave", "--per-task"]);
  assert.equal(flagConflict.kind, "error");
  assert.match(flagConflict.stderr, /--wave and --per-task cannot be used together/);

  const noImplementPhase = parseCliFrom(["pipeline", "--phases", "plan,verify", "--round-step", "0"]);
  assert.equal(noImplementPhase.kind, "parsed");
  assert.equal(noImplementPhase.cli.commandArgs.flags.roundStep, 0);
});

test("chain parses Rust-shaped file list and resume options", () => {
  const parsed = parseCliFrom(["chain", "plans/a.md", "plans/b.md", "--command", "plan-implement", "--resume"]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Chain);
  assert.deepEqual(parsed.cli.commandArgs.files, ["plans/a.md", "plans/b.md"]);
  assert.equal(parsed.cli.commandArgs.command, "plan-implement");
  assert.equal(parsed.cli.commandArgs.resume, true);

  const inlineCommand = parseCliFrom(["chain", "--command=plan-tasks-implement", "plans/a.md"]);
  assert.equal(inlineCommand.kind, "parsed");
  assert.deepEqual(inlineCommand.cli.commandArgs.files, ["plans/a.md"]);
  assert.equal(inlineCommand.cli.commandArgs.command, "plan-tasks-implement");

  const missingFile = parseCliFrom(["chain", "--resume"]);
  assert.equal(missingFile.kind, "error");
  assert.match(missingFile.stderr, /Plan file is required/);

  const duplicateCommand = parseCliFrom(["chain", "plans/a.md", "--command", "plan", "--command", "tasks"]);
  assert.equal(duplicateCommand.kind, "error");
  assert.match(duplicateCommand.stderr, /--command cannot be provided more than once/);
});

test("next parses Rust-shaped fresh task and file options", () => {
  const parsed = parseCliFrom(["next", "--task", "ship next", "--file=next.md"]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Next);
  assert.equal(parsed.cli.commandArgs.task, "ship next");
  assert.equal(parsed.cli.commandArgs.file, "next.md");

  const duplicate = parseCliFrom(["next", "--task", "first", "--task", "second"]);
  assert.equal(duplicate.kind, "error");
  assert.match(duplicate.stderr, /--task cannot be provided more than once/);
});

test("supported commands without positional inputs reject stray arguments", () => {
  for (const command of ["status", "reset", "tasks", "next", "resume", "verify", "discuss", "version", "init", "analyze-coverage"]) {
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

test("list-agents dispatches to supported introspection and keeps elapsed off stdout", () => {
  const parsed = parseCliFrom(["list-agents"]);
  assert.equal(parsed.kind, "parsed");
  const dispatch = dispatchFromCli(parsed.cli);
  assert.equal(dispatch.kind, DispatchKind.ListAgents);
  assert.equal(elapsedPrefersStderr(dispatch, false), true);
  assert.equal(elapsedPrefersStderr(dispatch, true), true);
  assert.equal(elapsedPrefersStderr({ kind: DispatchKind.Status }, true), true);
});

test("analyze-coverage dispatches to supported read-only command", () => {
  const parsed = parseCliFrom(["analyze-coverage"]);
  assert.equal(parsed.kind, "parsed");
  const dispatch = dispatchFromCli(parsed.cli);
  assert.equal(dispatch.kind, DispatchKind.AnalyzeCoverage);
  assert.equal(elapsedPrefersStderr(dispatch, false), false);
  assert.equal(elapsedPrefersStderr(dispatch, true), true);
});

test("init accepts only the force flag", () => {
  const parsed = parseCliFrom(["init", "--force"]);
  assert.equal(parsed.kind, "parsed");
  assert.equal(parsed.cli.commandArgs.force, true);
  assert.equal(dispatchFromCli(parsed.cli).kind, DispatchKind.Init);
  const invalid = parseCliFrom(["init", "--force=true"]);
  assert.equal(invalid.kind, "error");
  assert.match(invalid.stderr, /unexpected value for --force/);
});

test("approval commands parse phase and required rejection reason", () => {
  const approve = parseCliFrom(["approve", "plan"]);
  assert.equal(approve.kind, "parsed");
  assert.equal(dispatchFromCli(approve.cli).kind, DispatchKind.Approve);
  assert.equal(approve.cli.commandArgs.phase, "plan");

  const reject = parseCliFrom(["reject", "plan", "--reason", "needs scope cut"]);
  assert.equal(reject.kind, "parsed");
  assert.equal(dispatchFromCli(reject.cli).kind, DispatchKind.Reject);
  assert.equal(reject.cli.commandArgs.phase, "plan");
  assert.equal(reject.cli.commandArgs.reason, "needs scope cut");

  const missingReason = parseCliFrom(["reject", "plan"]);
  assert.equal(missingReason.kind, "error");
  assert.match(missingReason.stderr, /--reason is required when rejecting a plan/);

  const extra = parseCliFrom(["approve", "plan", "extra"]);
  assert.equal(extra.kind, "error");
  assert.match(extra.stderr, /unexpected argument 'extra' for approve/);
});

test("completions accepts Rust shell names and rejects invalid shells", () => {
  for (const shell of ["bash", "elvish", "fish", "powershell", "zsh"]) {
    const parsed = parseCliFrom(["completions", shell]);
    assert.equal(parsed.kind, "parsed");
    assert.equal(parsed.cli.commandArgs.shell, shell);
    const dispatch = dispatchFromCli(parsed.cli);
    assert.equal(dispatch.kind, DispatchKind.Completions);
    assert.equal(elapsedPrefersStderr(dispatch, false), true);
  }

  const missing = parseCliFrom(["completions"]);
  assert.equal(missing.kind, "error");
  assert.match(missing.stderr, /missing shell for completions/);

  const invalid = parseCliFrom(["completions", "nope"]);
  assert.equal(invalid.kind, "error");
  assert.match(invalid.stderr, /expected one of bash, elvish, fish, powershell, zsh/);
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
  const discussTask = parseCliFrom(["discuss", "--task", "clarify", "--resume", "--discover"]);
  assert.equal(discussTask.kind, "parsed");
  assert.equal(dispatchFromCli(discussTask.cli).kind, DispatchKind.Discuss);
  assert.equal(discussTask.cli.commandArgs.task, "clarify");
  assert.equal(discussTask.cli.commandArgs.resume, true);
  assert.equal(discussTask.cli.commandArgs.discover, true);
  const implementFile = parseCliFrom(["implement", "--file", "task.md"]);
  assert.equal(implementFile.kind, "parsed");
  assert.equal(dispatchFromCli(implementFile.cli).kind, DispatchKind.Implement);
  assert.equal(implementFile.cli.commandArgs.file, "task.md");
});
