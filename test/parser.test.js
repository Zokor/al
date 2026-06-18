import assert from "node:assert/strict";
import test from "node:test";
import { parseCliFrom } from "../src/app/cli.js";
import { dispatchFromCli } from "../src/app/dispatch.js";
import { DispatchKind, elapsedPrefersStderr, suppressesElapsed } from "../src/app/dispatchTypes.js";

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
  const missingPlanModel = parseCliFrom(["--plan-model"]);
  assert.equal(missingPlanModel.kind, "error");
  assert.equal(
    missingPlanModel.stderr,
    "Config error: error: a value is required for '--plan-model <MODEL>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const missingPlanEffort = parseCliFrom(["--plan-effort"]);
  assert.equal(missingPlanEffort.kind, "error");
  assert.equal(
    missingPlanEffort.stderr,
    "Config error: error: a value is required for '--plan-effort <LEVEL>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const invalidSpecificEffort = parseCliFrom(["--tasks-effort=wild", "status"]);
  assert.equal(invalidSpecificEffort.kind, "error");
  assert.equal(
    invalidSpecificEffort.stderr,
    "Config error: unknown effort level 'wild': expected one of minimal, low, medium, high, max, xhigh\n",
  );

  const missingActionModel = parseCliFrom(["--action-model"]);
  assert.equal(missingActionModel.kind, "error");
  assert.equal(
    missingActionModel.stderr,
    "Config error: error: a value is required for '--action-model <ACTION=MODEL>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const invalidActionModelShape = parseCliFrom(["--action-model", "plan", "status"]);
  assert.equal(invalidActionModelShape.kind, "error");
  assert.equal(
    invalidActionModelShape.stderr,
    "Config error: invalid --action-model value 'plan': expected ACTION=MODEL\n",
  );

  const unknownActionModel = parseCliFrom(["--action-model", "bogus=x", "status"]);
  assert.equal(unknownActionModel.kind, "error");
  assert.equal(
    unknownActionModel.stderr,
    "Config error: unknown action 'bogus': expected one of plan, tasks, implement, review, discuss, discover, verify, debugger, compound, supervisor\n",
  );

  const missingActionEffort = parseCliFrom(["--action-effort"]);
  assert.equal(missingActionEffort.kind, "error");
  assert.equal(
    missingActionEffort.stderr,
    "Config error: error: a value is required for '--action-effort <ACTION=EFFORT>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const invalidActionEffortShape = parseCliFrom(["--action-effort", "review", "status"]);
  assert.equal(invalidActionEffortShape.kind, "error");
  assert.equal(
    invalidActionEffortShape.stderr,
    "Config error: invalid --action-effort value 'review': expected ACTION=EFFORT\n",
  );

  const invalidActionEffortLevel = parseCliFrom(["--action-effort", "review=wild", "status"]);
  assert.equal(invalidActionEffortLevel.kind, "error");
  assert.equal(
    invalidActionEffortLevel.stderr,
    "Config error: unknown effort level 'wild': expected one of minimal, low, medium, high, max, xhigh\n",
  );

  const approvalConflict = parseCliFrom(["--require-plan-approval", "status", "--no-plan-approval"]);
  assert.equal(approvalConflict.kind, "error");
  assert.equal(
    approvalConflict.stderr,
    "Config error: error: the argument '--require-plan-approval' cannot be used with '--no-plan-approval'\n\nUsage: agent-loop [OPTIONS] [COMMAND]\n\nFor more information, try '--help'.\n",
  );
});

test("unknown leading global options use Rust config-error formatting", () => {
  const parsed = parseCliFrom(["--wat"]);
  assert.equal(parsed.kind, "error");
  assert.equal(parsed.code, 1);
  assert.equal(
    parsed.stderr,
    "Config error: error: unexpected argument '--wat' found\n\nUsage: agent-loop [OPTIONS] [COMMAND]\n\nFor more information, try '--help'.\n",
  );
});

test("command parser validation errors use Rust config-error formatting", () => {
  const unknown = parseCliFrom(["wat"]);
  assert.equal(unknown.kind, "error");
  assert.equal(
    unknown.stderr,
    "Config error: error: unrecognized subcommand 'wat'\n\nUsage: agent-loop [OPTIONS] [COMMAND]\n\nFor more information, try '--help'.\n",
  );

  const statusExtra = parseCliFrom(["status", "extra"]);
  assert.equal(statusExtra.kind, "error");
  assert.equal(
    statusExtra.stderr,
    "Config error: error: unexpected argument 'extra' found\n\nUsage: agent-loop status [OPTIONS]\n\nFor more information, try '--help'.\n",
  );

  const missingPlanFile = parseCliFrom(["plan", "--file"]);
  assert.equal(missingPlanFile.kind, "error");
  assert.equal(
    missingPlanFile.stderr,
    "Config error: error: a value is required for '--file <PATH>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const missingReviewFiles = parseCliFrom(["review", "--files"]);
  assert.equal(missingReviewFiles.kind, "error");
  assert.equal(
    missingReviewFiles.stderr,
    "Config error: error: a value is required for '--files <FILES>...' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const unknownQueueSubcommand = parseCliFrom(["queue", "wat"]);
  assert.equal(unknownQueueSubcommand.kind, "error");
  assert.equal(
    unknownQueueSubcommand.stderr,
    "Config error: error: unrecognized subcommand 'wat'\n\nUsage: agent-loop queue [OPTIONS] <COMMAND>\n\nFor more information, try '--help'.\n",
  );
});

test("global option validation errors use Rust config-error formatting", () => {
  const invalidWorkflow = parseCliFrom(["--requirements-workflow", "bogus", "status"]);
  assert.equal(invalidWorkflow.kind, "error");
  assert.equal(
    invalidWorkflow.stderr,
    "Config error: error: invalid value 'bogus' for '--requirements-workflow <MODE>'\n  [possible values: legacy, spec]\n\nFor more information, try '--help'.\n",
  );

  const missingWorkflow = parseCliFrom(["--requirements-workflow"]);
  assert.equal(missingWorkflow.kind, "error");
  assert.equal(
    missingWorkflow.stderr,
    "Config error: error: a value is required for '--requirements-workflow <MODE>' but none was supplied\n  [possible values: legacy, spec]\n\nFor more information, try '--help'.\n",
  );

  const missingSession = parseCliFrom(["--session"]);
  assert.equal(missingSession.kind, "error");
  assert.equal(
    missingSession.stderr,
    "Config error: error: a value is required for '--session <NAME>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const missingImplementer = parseCliFrom(["--implementer"]);
  assert.equal(missingImplementer.kind, "error");
  assert.equal(
    missingImplementer.stderr,
    "Config error: error: a value is required for '--implementer <AGENT>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const missingReviewer = parseCliFrom(["--reviewer"]);
  assert.equal(missingReviewer.kind, "error");
  assert.equal(
    missingReviewer.stderr,
    "Config error: error: a value is required for '--reviewer <AGENT>' but none was supplied\n\nFor more information, try '--help'.\n",
  );

  const simpleValue = parseCliFrom(["--simple=true", "status"]);
  assert.equal(simpleValue.kind, "error");
  assert.equal(
    simpleValue.stderr,
    "Config error: error: unexpected value 'true' for '--simple' found; no more were expected\n\nUsage: agent-loop --simple\n\nFor more information, try '--help'.\n",
  );
});

test("explicit help and version support JSON parse exits", () => {
  const help = parseCliFrom(["--json", "--help"]);
  assert.equal(help.kind, "exit");
  const helpEvent = JSON.parse(help.stdout);
  assert.equal(helpEvent.type, "help");
  assert.match(helpEvent.data.text, /^Run a collaborative implementation\/review loop between coding agents\./);
  assert.match(helpEvent.data.text, /Primary commands:\n  agent-loop spec <task>/);
  assert.match(helpEvent.data.text, /Configuration sources[\s\S]*\.agent-loop\.json/);
  assert.match(helpEvent.data.text, /VERIFY_BROWSER_TEST/);
  const version = parseCliFrom(["--json", "--version"]);
  assert.equal(version.kind, "exit");
  assert.deepEqual(JSON.parse(version.stdout), {
    type: "version",
    data: { version: "0.1.120" },
  });
});

test("status command help uses command-specific text in plain and JSON modes", () => {
  const plain = parseCliFrom(["status", "--help"]);
  assert.equal(plain.kind, "exit");
  assert.match(plain.stdout, /^Show current loop status\n\nUsage: agent-loop status \[OPTIONS\]/);
  assert.doesNotMatch(plain.stdout.split(/\n\n/)[0], /Commands:/);

  const helpCommand = parseCliFrom(["help", "status"]);
  assert.equal(helpCommand.kind, "exit");
  assert.match(helpCommand.stdout, /^Show current loop status\n\nUsage: agent-loop status \[OPTIONS\]/);

  const json = parseCliFrom(["--json", "help", "status"]);
  assert.equal(json.kind, "exit");
  const event = JSON.parse(json.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Show current loop status\n\nUsage: agent-loop status \[OPTIONS\]/);
});

test("low-runtime command help uses command-specific text in plain and JSON modes", () => {
  const reset = parseCliFrom(["reset", "--help"]);
  assert.equal(reset.kind, "exit");
  assert.match(reset.stdout, /^Clear \.agent-loop\/state while preserving decisions\.md\n\nUsage: agent-loop reset \[OPTIONS\]/);
  assert.match(reset.stdout, /--wave-lock\s+Only remove the wave\.lock file/);
  assert.doesNotMatch(reset.stdout.split(/\n\n/)[0], /Commands:/);

  const init = parseCliFrom(["help", "init"]);
  assert.equal(init.kind, "exit");
  assert.match(init.stdout, /^Initialize project configuration\n\nUsage: agent-loop init \[OPTIONS\]/);
  assert.match(init.stdout, /--force\s+Overwrite existing \.agent-loop\.json/);

  const completions = parseCliFrom(["--json", "completions", "--help"]);
  assert.equal(completions.kind, "exit");
  const event = JSON.parse(completions.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Generate a shell completion script/);
  assert.match(event.data.text, /Usage: agent-loop completions \[OPTIONS\] <SHELL>/);
  assert.match(event.data.text, /possible values: bash, elvish, fish, powershell, zsh/);
});

test("tui help uses Rust-shaped command-specific text while runtime stays unsupported", () => {
  const plain = parseCliFrom(["tui", "--help"]);
  assert.equal(plain.kind, "exit");
  assert.match(plain.stdout, /^Launch the TUI dashboard to monitor agent-loop state\n\nUsage: agent-loop tui \[OPTIONS\] \[PATH\]\.\.\./);
  assert.match(plain.stdout, /Arguments:\n  \[PATH\]\.\.\.\s+Paths to project directories to monitor \(defaults to current directory\)/);
  assert.match(plain.stdout, /Options:\n      --session <NAME>\n      --new-context/);
  assert.doesNotMatch(plain.stdout.split(/\n\n/)[0], /Commands:/);

  const json = parseCliFrom(["--json", "help", "tui"]);
  assert.equal(json.kind, "exit");
  const event = JSON.parse(json.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Launch the TUI dashboard to monitor agent-loop state/);

  const runtime = parseCliFrom(["tui"]);
  assert.equal(runtime.kind, "parsed");
  assert.equal(dispatchFromCli(runtime.cli).kind, DispatchKind.Unsupported);
});

test("lifecycle and control command help uses command-specific text", () => {
  const goal = parseCliFrom(["goal", "--help"]);
  assert.equal(goal.kind, "exit");
  assert.match(goal.stdout, /^Persist and run an autonomous goal lifecycle\n\nUsage: agent-loop goal \[OPTIONS\] \[OBJECTIVE\]\.\.\. \[COMMAND\]/);
  assert.match(goal.stdout, /Commands:\n  status\s+Print goal and workflow status/);
  assert.match(goal.stdout, /--objective <TEXT>\s+Task objective text/);
  assert.match(goal.stdout, /--single-agent\s+Use single agent mode/);

  const queue = parseCliFrom(["help", "queue"]);
  assert.equal(queue.kind, "exit");
  assert.match(queue.stdout, /^Manage queued autonomous objectives\n\nUsage: agent-loop queue \[OPTIONS\] <COMMAND>/);
  assert.match(queue.stdout, /Commands:\n  add\s+Add a queued objective/);

  const approve = parseCliFrom(["approve", "--help"]);
  assert.equal(approve.kind, "exit");
  assert.match(approve.stdout, /^Approve a pending phase approval gate\n\nUsage: agent-loop approve \[OPTIONS\] <PHASE>/);
  assert.match(approve.stdout, /<PHASE>\s+Phase to approve\. Currently supported: plan/);

  const reject = parseCliFrom(["--json", "help", "reject"]);
  assert.equal(reject.kind, "exit");
  const event = JSON.parse(reject.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Reject a pending phase approval gate\n\nUsage: agent-loop reject \[OPTIONS\] --reason <REASON> <PHASE>/);
  assert.match(event.data.text, /--reason <REASON>\s+Required rejection reason/);
});

test("read-only and routing command help uses command-specific text", () => {
  const analyze = parseCliFrom(["analyze-coverage", "--help"]);
  assert.equal(analyze.kind, "exit");
  assert.match(analyze.stdout, /^Check spec requirement IDs against tasks\.md\n\nUsage: agent-loop analyze-coverage \[OPTIONS\]/);
  assert.doesNotMatch(analyze.stdout.split(/\n\n/)[0], /Commands:/);

  const next = parseCliFrom(["help", "next"]);
  assert.equal(next.kind, "exit");
  assert.match(next.stdout, /^Determine and run the logical next command based on current state\n\nUsage: agent-loop next \[OPTIONS\]/);
  assert.match(next.stdout, /--task <TASK>\s+Task description text \(for fresh start\)/);
  assert.match(next.stdout, /--file <FILE>\s+Path to a task file \(for fresh start\)/);

  const resume = parseCliFrom(["resume", "--help"]);
  assert.equal(resume.kind, "exit");
  assert.match(resume.stdout, /^Resume the current run and choose the right underlying workflow automatically\n\nUsage: agent-loop resume \[OPTIONS\]/);
  assert.match(resume.stdout, /--dry-run\s+Print the selected resume command without running it/);

  const listAgents = parseCliFrom(["list-agents", "--help"]);
  assert.equal(listAgents.kind, "exit");
  assert.match(listAgents.stdout, /^List available agents and their installation status \(JSON output\)\n\nUsage: agent-loop list-agents \[OPTIONS\]/);

  const version = parseCliFrom(["--json", "help", "version"]);
  assert.equal(version.kind, "exit");
  const event = JSON.parse(version.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Print version\n\nUsage: agent-loop version \[OPTIONS\]/);
});

test("phase command help uses command-specific text", () => {
  const spec = parseCliFrom(["spec", "--help"]);
  assert.equal(spec.kind, "exit");
  assert.match(spec.stdout, /^Author or resume a requirements spec\n\nUsage: agent-loop spec \[OPTIONS\] \[TASK\]/);
  assert.match(spec.stdout, /Arguments:\n  \[TASK\]\n/);
  assert.match(spec.stdout, /Options:\n      --file <PATH>\n      --session <NAME>\n      --discover\n/);
  assert.doesNotMatch(spec.stdout.split(/\n\n/)[0], /Commands:/);

  const plan = parseCliFrom(["help", "plan"]);
  assert.equal(plan.kind, "exit");
  assert.match(plan.stdout, /^Plan only\n\nUsage: agent-loop plan \[OPTIONS\] \[TASK\]/);
  assert.match(plan.stdout, /--resume\n      --require-plan-approval/);
  assert.match(plan.stdout, /--single-agent\n      --no-plan-approval/);

  const tasks = parseCliFrom(["--json", "tasks", "--help"]);
  assert.equal(tasks.kind, "exit");
  const event = JSON.parse(tasks.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Decompose plan into tasks only\n\nUsage: agent-loop tasks \[OPTIONS\]/);
  assert.match(event.data.text, /Options:\n      --resume\n      --session <NAME>\n      --file <PATH>\n/);
  assert.match(event.data.text, /--json\s+Emit all output as JSONL events/);
});

test("runtime command help uses command-specific text", () => {
  const inline = parseCliFrom(["inline", "--help"]);
  assert.equal(inline.kind, "exit");
  assert.match(inline.stdout, /^Execute a task directly with a single agent call\n\nUsage: agent-loop inline \[OPTIONS\]/);
  assert.match(inline.stdout, /--task <TASK>\s+Task description text/);
  assert.match(inline.stdout, /--file <FILE>\s+Path to a task file/);
  assert.doesNotMatch(inline.stdout.split(/\n\n/)[0], /Commands:/);

  const review = parseCliFrom(["help", "review"]);
  assert.equal(review.kind, "exit");
  assert.match(review.stdout, /^Run a standalone code review, then fix confirmed findings\n\nUsage: agent-loop review \[OPTIONS\] \[CONTEXT\]/);
  assert.match(review.stdout, /Arguments:\n  \[CONTEXT\]\s+Optional focus area or context for the review/);
  assert.match(review.stdout, /--base <BASE>\s+Git ref to diff against/);
  assert.match(review.stdout, /--files <FILES>\.\.\.\s+Explicit files to review instead of diff/);
  assert.match(review.stdout, /--single-agent\s+Use single agent mode/);

  const verify = parseCliFrom(["--json", "verify", "--help"]);
  assert.equal(verify.kind, "exit");
  let event = JSON.parse(verify.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Run verification on completed implementation\n\nUsage: agent-loop verify \[OPTIONS\]/);
  assert.match(event.data.text, /--resume\s+Resume a previously interrupted verification/);
  assert.match(event.data.text, /--manual\s+Use manual \(interactive\) verification mode/);

  const discuss = parseCliFrom(["discuss", "--help"]);
  assert.equal(discuss.kind, "exit");
  assert.match(discuss.stdout, /^Interactive requirements discussion before planning\n\nUsage: agent-loop discuss \[OPTIONS\]/);
  assert.match(discuss.stdout, /--discover\s+Run a discovery prepass before discussion/);
  assert.match(discuss.stdout, /--resume\s+Resume a previously interrupted discussion/);

  const chain = parseCliFrom(["--json", "help", "chain"]);
  assert.equal(chain.kind, "exit");
  event = JSON.parse(chain.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Execute multiple plan files in sequence\n\nUsage: agent-loop chain \[OPTIONS\] <FILES>\.\.\./);
  assert.match(event.data.text, /Arguments:\n  <FILES>\.\.\.\s+Plan files to execute in sequence/);
  assert.match(event.data.text, /--command <COMMAND>\s+Command to run for each file \(default: from config\)/);
});

test("implementation command help uses command-specific text", () => {
  const implement = parseCliFrom(["implement", "--help"]);
  assert.equal(implement.kind, "exit");
  assert.match(implement.stdout, /^Implement from tasks\.md, inline task text, or task file\n\nUsage: agent-loop implement \[OPTIONS\]/);
  assert.match(implement.stdout, /Options:\n      --session <NAME>\n      --task <TASK>\n      --file <PATH>\n/);
  assert.match(implement.stdout, /--resume\n      --require-plan-approval/);
  assert.match(implement.stdout, /--single-agent\n      --no-plan-approval/);
  assert.match(implement.stdout, /--per-task\n      --simple/);
  assert.match(implement.stdout, /--wave\n      --max-retries <MAX_RETRIES>\s+\[default: 2\]/);
  assert.match(implement.stdout, /--round-step <ROUND_STEP>\s+\[default: 2\]\n      --continue-on-fail/);
  assert.match(implement.stdout, /--fail-fast\n      --plan-model <MODEL>/);
  assert.match(implement.stdout, /--max-parallel <MAX_PARALLEL>\n      --tasks-model <MODEL>/);
  assert.doesNotMatch(implement.stdout.split(/\n\n/)[0], /Commands:/);

  const implementVerify = parseCliFrom(["--json", "help", "implement-verify"]);
  assert.equal(implementVerify.kind, "exit");
  const event = JSON.parse(implementVerify.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Run implement -> verify \(with full implement-mode flags\)\n\nUsage: agent-loop implement-verify \[OPTIONS\]/);
  assert.match(event.data.text, /--task <TASK>\n      --file <PATH>/);
  assert.match(event.data.text, /--action-effort <ACTION=EFFORT>\s+Override effort for specific action/);
});

test("orchestration command help uses command-specific text", () => {
  const supervise = parseCliFrom(["supervise", "--help"]);
  assert.equal(supervise.kind, "exit");
  assert.match(supervise.stdout, /^Run a supervised workflow through the deterministic Supervisor fallback\n\nUsage: agent-loop supervise \[OPTIONS\] \[TASK\]/);
  assert.match(supervise.stdout, /Arguments:\n  \[TASK\]\s+Task description text/);
  assert.match(supervise.stdout, /Options:\n      --file <FILE>\s+Path to a task file\n      --session <NAME>\n      --new-context/);
  assert.match(supervise.stdout, /--phases <PHASES>\s+Comma-separated phases; defaults to the configured requirements workflow/);
  assert.match(supervise.stdout, /--resume\s+Resume a supervised workflow/);
  assert.match(supervise.stdout, /--queue\s+Pick up or resume an item from goal-queue\.json/);
  assert.match(supervise.stdout, /--single-agent\s+Use single agent mode for implement-capable phases/);
  assert.doesNotMatch(supervise.stdout.split(/\n\n/)[0], /Commands:/);

  const pipeline = parseCliFrom(["--json", "help", "pipeline"]);
  assert.equal(pipeline.kind, "exit");
  const event = JSON.parse(pipeline.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Run an arbitrary sequence of phases/);
  assert.match(event.data.text, /Usage: agent-loop pipeline \[OPTIONS\] --phases <PHASES>/);
  assert.match(event.data.text, /Options:\n      --phases <PHASES>\s+Comma-separated list of phases: discuss,spec,plan,tasks,implement,verify\n      --session <NAME>/);
  assert.match(event.data.text, /--task <TASK>\s+Task description text\n      --file <FILE>\s+Path to a task file/);
  assert.match(event.data.text, /--discover\s+Run a discovery prepass before the first discuss\/spec\/plan phase in the pipeline/);
  assert.match(event.data.text, /--resume\s+Resume from where a pipeline was interrupted/);
  assert.match(event.data.text, /--single-agent\s+Use single agent mode for implement-capable pipeline phases/);
});

test("dedicated workflow command help uses command-specific text", () => {
  const planImplement = parseCliFrom(["plan-implement", "--help"]);
  assert.equal(planImplement.kind, "exit");
  assert.match(planImplement.stdout, /^Run plan -> implement \(skip task decomposition\)\n\nUsage: agent-loop plan-implement \[OPTIONS\] \[TASK\]/);
  assert.match(planImplement.stdout, /Arguments:\n  \[TASK\]\n/);
  assert.match(planImplement.stdout, /Options:\n      --file <PATH>\n      --session <NAME>\n      --discover\s+Run a discovery prepass before planning/);
  assert.match(planImplement.stdout, /--per-task\n      --simple/);
  assert.match(planImplement.stdout, /--round-step <ROUND_STEP>\s+\[default: 2\]\n      --continue-on-fail/);
  assert.match(planImplement.stdout, /--max-parallel <MAX_PARALLEL>\n      --tasks-model <MODEL>/);
  assert.doesNotMatch(planImplement.stdout.split(/\n\n/)[0], /Commands:/);

  const tasksImplement = parseCliFrom(["help", "tasks-implement"]);
  assert.equal(tasksImplement.kind, "exit");
  assert.match(tasksImplement.stdout, /^Run tasks -> implement \(skip planning, assumes plan\.md exists\)\n\nUsage: agent-loop tasks-implement \[OPTIONS\]/);
  assert.match(tasksImplement.stdout, /Options:\n      --resume\n      --session <NAME>\n      --new-context/);
  assert.match(tasksImplement.stdout, /--single-agent\n      --file <PATH>/);
  assert.match(tasksImplement.stdout, /--per-task\n      --require-plan-approval/);
  assert.match(tasksImplement.stdout, /--max-parallel <MAX_PARALLEL>\n      --plan-model <MODEL>/);

  const planTasksImplement = parseCliFrom(["--json", "plan-tasks-implement", "--help"]);
  assert.equal(planTasksImplement.kind, "exit");
  const event = JSON.parse(planTasksImplement.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Run plan -> tasks -> implement end-to-end\n\nUsage: agent-loop plan-tasks-implement \[OPTIONS\] \[TASK\]/);
  assert.match(event.data.text, /--discover\s+Run a discovery prepass before planning/);
  assert.match(event.data.text, /--action-effort <ACTION=EFFORT>\s+Override effort for specific action/);
});

test("pipeline alias help uses Rust-shaped command-specific text", () => {
  const specPlan = parseCliFrom(["spec-plan", "--help"]);
  assert.equal(specPlan.kind, "exit");
  assert.match(specPlan.stdout, /^Run spec -> plan\n\nUsage: agent-loop spec-plan \[OPTIONS\] \[TASK\]/);
  assert.match(specPlan.stdout, /Arguments:\n  \[TASK\]\n/);
  assert.match(specPlan.stdout, /Options:\n      --file <PATH>\n      --session <NAME>\n      --discover\n      --new-context/);
  assert.match(specPlan.stdout, /--resume\n      --require-plan-approval/);
  assert.match(specPlan.stdout, /--no-plan-approval\s+Disable plan approval/);
  assert.doesNotMatch(specPlan.stdout.split(/\n\n/)[0], /Commands:/);

  const planTasks = parseCliFrom(["plan-tasks", "--help"]);
  assert.equal(planTasks.kind, "exit");
  assert.match(planTasks.stdout, /^Run plan -> tasks \(planning prep\)\n\nUsage: agent-loop plan-tasks \[OPTIONS\] \[TASK\]/);

  const specPlanImplement = parseCliFrom(["spec-plan-implement", "--help"]);
  assert.equal(specPlanImplement.kind, "exit");
  assert.match(specPlanImplement.stdout, /^Run spec -> plan -> implement\n\nUsage: agent-loop spec-plan-implement \[OPTIONS\] \[TASK\]/);
  assert.match(specPlanImplement.stdout, /--discover\n      --new-context/);
  assert.match(specPlanImplement.stdout, /--single-agent\n      --no-plan-approval/);
  assert.match(specPlanImplement.stdout, /--per-task\n      --simple/);
  assert.match(specPlanImplement.stdout, /--max-parallel <MAX_PARALLEL>\n      --tasks-model <MODEL>/);

  const planImplementVerify = parseCliFrom(["--json", "help", "plan-implement-verify"]);
  assert.equal(planImplementVerify.kind, "exit");
  const event = JSON.parse(planImplementVerify.stdout);
  assert.equal(event.type, "help");
  assert.match(event.data.text, /^Run plan -> implement -> verify\n\nUsage: agent-loop plan-implement-verify \[OPTIONS\]/);
  assert.doesNotMatch(event.data.text, /Usage: agent-loop plan-implement-verify \[OPTIONS\] \[TASK\]/);
  assert.match(event.data.text, /Options:\n      --session <NAME>\n      --task <TASK>\n      --file <FILE>/);
  assert.match(event.data.text, /--resume\n      --no-plan-approval/);
  assert.match(event.data.text, /--action-effort <ACTION=EFFORT>\s+Override effort for specific action/);
});

test("pipeline aliases dispatch exactly and typo aliases remain unknown", () => {
  const alias = parseCliFrom(["spec-plan"]);
  assert.equal(alias.kind, "parsed");
  assert.equal(dispatchFromCli(alias.cli).kind, "Pipeline");
  assert.equal(parseCliFrom(["spec-random"]).kind, "error");
});

test("dedicated implementation workflows dispatch through pipeline without alias parsing", () => {
  const planImplement = parseCliFrom(["plan-implement", "ship it", "--discover", "--single-agent"]);
  assert.equal(planImplement.kind, "parsed");
  assert.equal(dispatchFromCli(planImplement.cli).kind, DispatchKind.Pipeline);
  assert.equal(planImplement.cli.commandArgs.phases, "plan,implement");
  assert.equal(planImplement.cli.commandArgs.task, "ship it");
  assert.equal(planImplement.cli.commandArgs.discover, true);
  assert.equal(planImplement.cli.commandArgs.singleAgent, true);

  const tasksImplement = parseCliFrom(["tasks-implement", "--file", "plan.md"]);
  assert.equal(tasksImplement.kind, "parsed");
  assert.equal(dispatchFromCli(tasksImplement.cli).kind, DispatchKind.Pipeline);
  assert.equal(tasksImplement.cli.commandArgs.phases, "tasks,implement");
  assert.equal(tasksImplement.cli.commandArgs.file, "plan.md");

  const missingTask = parseCliFrom(["plan-tasks-implement"]);
  assert.equal(missingTask.kind, "error");
  assert.match(missingTask.stderr, /Task is required/);
});

test("pipeline aliases preserve Rust-style command args for dispatch", () => {
  const alias = parseCliFrom(["spec-plan", "--resume"]);
  assert.equal(alias.kind, "parsed");
  assert.equal(dispatchFromCli(alias.cli).kind, "Pipeline");
  assert.equal(alias.cli.commandArgs.phases, "spec,plan");
  assert.equal(alias.cli.commandArgs.resume, true);
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
  assert.equal(
    positional.stderr,
    "Config error: error: unexpected argument 'ship it' found\n\nUsage: agent-loop inline [OPTIONS]\n\nFor more information, try '--help'.\n",
  );
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

test("pipeline aliases expose Rust phase metadata and implement flags", () => {
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
  assert.equal(dispatchFromCli(alias.cli).kind, "Pipeline");
  assert.equal(alias.cli.commandArgs.phases, "plan,implement,verify");
  assert.equal(alias.cli.commandArgs.task, "ship it");
  assert.equal(alias.cli.commandArgs.singleAgent, true);
  assert.equal(alias.cli.commandArgs.flags.wave, true);
  assert.equal(alias.cli.commandArgs.flags.maxParallel, 3);

  const naturalTask = parseCliFrom(["plan-implement-verify", "ship it"]);
  assert.equal(naturalTask.kind, "parsed");
  assert.equal(naturalTask.cli.commandArgs.task, "ship it");

  const prepAlias = parseCliFrom(["spec-plan", "tighten requirements", "--discover"]);
  assert.equal(prepAlias.kind, "parsed");
  assert.equal(prepAlias.cli.commandArgs.phases, "spec,plan");
  assert.equal(prepAlias.cli.commandArgs.task, "tighten requirements");
  assert.equal(prepAlias.cli.commandArgs.discover, true);

  const invalid = parseCliFrom(["spec-plan", "task", "--single-agent"]);
  assert.equal(invalid.kind, "error");
  assert.match(invalid.stderr, /unexpected argument '--single-agent' for spec-plan/);
});

test("pipeline command parses Rust-shaped phases and implement flags", () => {
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
  assert.equal(dispatchFromCli(pipeline.cli).kind, DispatchKind.Pipeline);
  assert.equal(pipeline.cli.commandArgs.phases, "plan,implement");
  assert.equal(pipeline.cli.commandArgs.flags.wave, true);
  assert.equal(pipeline.cli.commandArgs.flags.maxParallel, 2);

  const taskFileCombo = parseCliFrom(["pipeline", "--phases", "tasks", "--task", "custom task", "--file", "plan.md"]);
  assert.equal(taskFileCombo.kind, "parsed");
  assert.equal(taskFileCombo.cli.commandArgs.task, "custom task");
  assert.equal(taskFileCombo.cli.commandArgs.file, "plan.md");

  const missing = parseCliFrom(["pipeline", "--task", "ship it"]);
  assert.equal(missing.kind, "error");
  assert.equal(
    missing.stderr,
    "Config error: error: the following required arguments were not provided:\n  --phases <PHASES>\n\nUsage: agent-loop pipeline --phases <PHASES> --task <TASK>\n\nFor more information, try '--help'.\n",
  );

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
    assert.equal(
      parsed.stderr,
      `Config error: error: unexpected argument 'unexpected' found\n\nUsage: agent-loop ${command} [OPTIONS]\n\nFor more information, try '--help'.\n`,
    );
  }
});

test("resume dispatch suppresses outer elapsed output", () => {
  const parsed = parseCliFrom(["resume"]);
  assert.equal(parsed.kind, "parsed");
  const dispatch = dispatchFromCli(parsed.cli);
  assert.equal(dispatch.kind, DispatchKind.Resume);
  assert.equal(suppressesElapsed(dispatch), true);

  const goalResumeRun = parseCliFrom(["goal", "resume", "--run"]);
  assert.equal(goalResumeRun.kind, "parsed");
  const goalDispatch = dispatchFromCli(goalResumeRun.cli);
  assert.equal(goalDispatch.kind, DispatchKind.Goal);
  assert.equal(suppressesElapsed(goalDispatch), true);
});

test("spec and plan still accept positional task text", () => {
  for (const command of ["spec", "plan"]) {
    const parsed = parseCliFrom([command, "ship", "this"]);
    assert.equal(parsed.kind, "parsed");
    assert.deepEqual(parsed.cli.commandArgs.positional, ["ship", "this"]);
  }
});

test("list-agents dispatches to supported introspection and suppresses elapsed", () => {
  const parsed = parseCliFrom(["list-agents"]);
  assert.equal(parsed.kind, "parsed");
  const dispatch = dispatchFromCli(parsed.cli);
  assert.equal(dispatch.kind, DispatchKind.ListAgents);
  assert.equal(suppressesElapsed(dispatch), true);
  assert.equal(elapsedPrefersStderr(dispatch, false), false);
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
  assert.equal(
    invalid.stderr,
    "Config error: error: unexpected value 'true' for '--force' found; no more were expected\n\nUsage: agent-loop init --force\n\nFor more information, try '--help'.\n",
  );
});

test("command boolean inline values use Rust config-error formatting", () => {
  const resumeDryRun = parseCliFrom(["resume", "--dry-run=true"]);
  assert.equal(resumeDryRun.kind, "error");
  assert.equal(
    resumeDryRun.stderr,
    "Config error: error: unexpected value 'true' for '--dry-run' found; no more were expected\n\nUsage: agent-loop resume --dry-run\n\nFor more information, try '--help'.\n",
  );

  const planResume = parseCliFrom(["plan", "--resume=true"]);
  assert.equal(planResume.kind, "error");
  assert.equal(
    planResume.stderr,
    "Config error: error: unexpected value 'true' for '--resume' found; no more were expected\n\nUsage: agent-loop plan --resume [TASK]\n\nFor more information, try '--help'.\n",
  );

  const implementPerTask = parseCliFrom(["implement", "--per-task=true"]);
  assert.equal(implementPerTask.kind, "error");
  assert.equal(
    implementPerTask.stderr,
    "Config error: error: unexpected value 'true' for '--per-task' found; no more were expected\n\nUsage: agent-loop implement --per-task\n\nFor more information, try '--help'.\n",
  );

  const reviewSingleAgent = parseCliFrom(["review", "--single-agent=true"]);
  assert.equal(reviewSingleAgent.kind, "error");
  assert.equal(
    reviewSingleAgent.stderr,
    "Config error: error: unexpected value 'true' for '--single-agent' found; no more were expected\n\nUsage: agent-loop review --single-agent [CONTEXT]\n\nFor more information, try '--help'.\n",
  );

  const goalRun = parseCliFrom(["goal", "resume", "--run=true"]);
  assert.equal(goalRun.kind, "error");
  assert.equal(
    goalRun.stderr,
    "Config error: error: unexpected value 'true' for '--run' found; no more were expected\n\nUsage: agent-loop goal resume --run\n\nFor more information, try '--help'.\n",
  );

  const queueRun = parseCliFrom(["queue", "resume", "queue-id", "--run=true"]);
  assert.equal(queueRun.kind, "error");
  assert.equal(
    queueRun.stderr,
    "Config error: error: unexpected value 'true' for '--run' found; no more were expected\n\nUsage: agent-loop queue resume --run <QUEUE_ID>\n\nFor more information, try '--help'.\n",
  );
});

test("command semantic conflicts use Rust config-error formatting", () => {
  const taskFile = parseCliFrom(["implement", "--task", "a", "--file", "b.md"]);
  assert.equal(taskFile.kind, "error");
  assert.equal(taskFile.stderr, "Config error: --task and --file cannot be used together.\n");

  const resumeTask = parseCliFrom(["implement", "--resume", "--task", "a"]);
  assert.equal(resumeTask.kind, "error");
  assert.equal(resumeTask.stderr, "Config error: --resume cannot be combined with --task or --file.\n");

  const perTaskTask = parseCliFrom(["implement", "--per-task", "--task", "a"]);
  assert.equal(perTaskTask.kind, "error");
  assert.equal(perTaskTask.stderr, "Config error: --per-task cannot be combined with --task or --file.\n");

  const wavePerTask = parseCliFrom(["implement", "--wave", "--per-task"]);
  assert.equal(wavePerTask.kind, "error");
  assert.equal(wavePerTask.stderr, "Config error: --wave and --per-task cannot be used together.\n");

  const continueFailFast = parseCliFrom(["implement", "--continue-on-fail", "--fail-fast"]);
  assert.equal(continueFailFast.kind, "error");
  assert.equal(continueFailFast.stderr, "Config error: --continue-on-fail and --fail-fast cannot be used together.\n");

  const pipelineWavePerTask = parseCliFrom(["pipeline", "--phases", "plan,implement", "--wave", "--per-task"]);
  assert.equal(pipelineWavePerTask.kind, "error");
  assert.equal(pipelineWavePerTask.stderr, "Config error: --wave and --per-task cannot be used together.\n");

  const reviewFilesBase = parseCliFrom(["review", "--files", "a.js", "--base", "main"]);
  assert.equal(reviewFilesBase.kind, "error");
  assert.equal(reviewFilesBase.stderr, "Config error: --files and --base cannot be used together.\n");
});

test("numeric command option validation uses Rust config-error formatting", () => {
  const maxRetries = parseCliFrom(["implement", "--max-retries", "abc"]);
  assert.equal(maxRetries.kind, "error");
  assert.equal(
    maxRetries.stderr,
    "Config error: error: invalid value 'abc' for '--max-retries <MAX_RETRIES>': invalid digit found in string\n\nFor more information, try '--help'.\n",
  );

  const roundStepZero = parseCliFrom(["implement", "--round-step", "0"]);
  assert.equal(roundStepZero.kind, "error");
  assert.equal(roundStepZero.stderr, "Config error: --round-step must be at least 1.\n");

  const maxParallelInvalid = parseCliFrom(["pipeline", "--phases", "plan,implement", "--max-parallel", "abc"]);
  assert.equal(maxParallelInvalid.kind, "error");
  assert.equal(
    maxParallelInvalid.stderr,
    "Config error: error: invalid value 'abc' for '--max-parallel <MAX_PARALLEL>': invalid digit found in string\n\nFor more information, try '--help'.\n",
  );

  const maxParallelZero = parseCliFrom(["implement", "--max-parallel", "0"]);
  assert.equal(maxParallelZero.kind, "error");
  assert.equal(maxParallelZero.stderr, "Config error: --max-parallel must be at least 1.\n");

  const goalMaxRetries = parseCliFrom(["goal", "--max-retries", "abc", "task"]);
  assert.equal(goalMaxRetries.kind, "error");
  assert.equal(
    goalMaxRetries.stderr,
    "Config error: error: invalid value 'abc' for '--max-retries <MAX_RETRIES>': invalid digit found in string\n\nFor more information, try '--help'.\n",
  );

  const queuePriority = parseCliFrom(["queue", "add", "--priority", "abc", "task"]);
  assert.equal(queuePriority.kind, "error");
  assert.equal(
    queuePriority.stderr,
    "Config error: error: invalid value 'abc' for '--priority <PRIORITY>': invalid digit found in string\n\nFor more information, try '--help'.\n",
  );
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
  assert.equal(
    missingReason.stderr,
    "Config error: error: the following required arguments were not provided:\n  --reason <REASON>\n\nUsage: agent-loop reject --reason <REASON> <PHASE>\n\nFor more information, try '--help'.\n",
  );

  const missingApprovePhase = parseCliFrom(["approve"]);
  assert.equal(missingApprovePhase.kind, "error");
  assert.equal(
    missingApprovePhase.stderr,
    "Config error: error: the following required arguments were not provided:\n  <PHASE>\n\nUsage: agent-loop approve <PHASE>\n\nFor more information, try '--help'.\n",
  );

  const missingRejectPhase = parseCliFrom(["reject", "--reason", "needs scope"]);
  assert.equal(missingRejectPhase.kind, "error");
  assert.equal(
    missingRejectPhase.stderr,
    "Config error: error: the following required arguments were not provided:\n  <PHASE>\n\nUsage: agent-loop reject --reason <REASON> <PHASE>\n\nFor more information, try '--help'.\n",
  );

  const missingRejectBoth = parseCliFrom(["reject"]);
  assert.equal(missingRejectBoth.kind, "error");
  assert.equal(
    missingRejectBoth.stderr,
    "Config error: error: the following required arguments were not provided:\n  --reason <REASON>\n  <PHASE>\n\nUsage: agent-loop reject --reason <REASON> <PHASE>\n\nFor more information, try '--help'.\n",
  );

  const extra = parseCliFrom(["approve", "plan", "extra"]);
  assert.equal(extra.kind, "error");
  assert.equal(
    extra.stderr,
    "Config error: error: unexpected argument 'extra' found\n\nUsage: agent-loop approve [OPTIONS] <PHASE>\n\nFor more information, try '--help'.\n",
  );
});

test("completions accepts Rust shell names and rejects invalid shells", () => {
  for (const shell of ["bash", "elvish", "fish", "powershell", "zsh"]) {
    const parsed = parseCliFrom(["completions", shell]);
    assert.equal(parsed.kind, "parsed");
    assert.equal(parsed.cli.commandArgs.shell, shell);
    const dispatch = dispatchFromCli(parsed.cli);
    assert.equal(dispatch.kind, DispatchKind.Completions);
    assert.equal(suppressesElapsed(dispatch), true);
    assert.equal(elapsedPrefersStderr(dispatch, false), false);
  }

  const missing = parseCliFrom(["completions"]);
  assert.equal(missing.kind, "error");
  assert.equal(
    missing.stderr,
    "Config error: error: the following required arguments were not provided:\n  <SHELL>\n\nUsage: agent-loop completions <SHELL>\n\nFor more information, try '--help'.\n",
  );

  const invalid = parseCliFrom(["completions", "nope"]);
  assert.equal(invalid.kind, "error");
  assert.equal(
    invalid.stderr,
    "Config error: error: invalid value 'nope' for '<SHELL>'\n  [possible values: bash, elvish, fish, powershell, zsh]\n\nFor more information, try '--help'.\n",
  );

  const extra = parseCliFrom(["completions", "bash", "extra"]);
  assert.equal(extra.kind, "error");
  assert.equal(
    extra.stderr,
    "Config error: error: unexpected argument 'extra' found\n\nUsage: agent-loop completions [OPTIONS] <SHELL>\n\nFor more information, try '--help'.\n",
  );
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
