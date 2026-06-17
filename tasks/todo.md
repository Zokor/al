# Rust CLI parity conversion

Convert `node-cli` into a 1:1 functional port of the Rust `agent-loop` CLI while
keeping the JavaScript implementation simple, incremental, and evidence-backed.

## Assumptions

- `../cli` is the source of truth for command behavior, options, state files,
  plain/JSON output, exit codes, resume behavior, and lock handling.
- `node-cli` should keep its existing Node >=20 ESM style, `.agent-loop.json`
  support, TOML migration script, and current passing behavior.
- Simplicity is a hard constraint: prefer small command modules and shared
  primitives over broad rewrites, large catch-all files, or Rust-shaped copies.

## Plan

- [x] Inventory Rust commands, global options, and Node unsupported commands from
  source evidence.
- [x] Create `docs/parity-matrix.md` as the living parity matrix.
- [x] Add a parity harness that can compare Rust and Node stdout, stderr, exit
  code, and `.agent-loop/` state for isolated fixtures.
  - [x] deterministic smoke runner for non-agent scenarios
  - [x] normalization for elapsed lines, JSON key order, and timestamps
  - [x] docs/package script wiring
  - [x] tests that do not require Rust during `npm test`
- [x] Port the smallest high-value command group first: `list-agents`, `init`,
  and completion/config discovery behavior.
  - [x] `list-agents`
  - [x] `init` (JSON-native config generation with Rust-style force/conflict behavior)
  - [x] `completions` (shell script generation for Rust-supported shells)
  - [x] project-aware JSON config template detection
- [ ] Port shared agent/provider execution primitives before `implement`,
  `review`, `discuss`, and runtime pipelines.
  - [x] shared implement-mode flag parser and pipeline alias metadata
  - [x] agent/provider runtime primitive with fake-provider tests
  - [ ] wire phase/runtime commands through the shared provider primitive
    - [x] `discuss` facilitator/progress/resume loop with fake-provider tests
- [ ] Port `implement`, `review`, `discuss`, and `verify` runtime behavior with
  focused behavior tests.
  - [x] `implement --task/--file` batch-mode round 1 with implementer, Gate A
        reviewer, simple/single-agent auto-consensus, and explicit partial gaps
  - [x] `implement` batch mode from existing `tasks.md` or `plan.md` state,
        including `next` handoff into the supported batch path; keep
        per-task/wave/resume/retry loops as explicit gaps
  - [x] `implement --resume` for persisted/default batch mode without clearing
        existing state; keep per-task/wave resume and retry loops as explicit gaps
  - [x] `implement` bounded batch retry loop when `review_max_rounds` /
        `REVIEW_MAX_ROUNDS` is positive; keep unlimited retry, per-task/wave,
        stuck/debugger, browser-blocking implementation evidence, and advanced
        Gate B/Gate C branches as explicit gaps
  - [x] `implement-verify` from existing `tasks.md` or `plan.md` state by
        composing the supported batch implement path and first-pass verify path;
        keep resume and fix-loop recovery as explicit gaps
  - [x] `implement-verify` empty-state Rust-vs-Node parity smoke scenario for
        normalized stdout/stderr and exit code
  - [x] `review` standalone primary reviewer path with file/base diff setup,
        protocol-failure detection, approved outcome, and explicit partial gaps
  - [x] `review` dual-agent adversarial validation after primary findings;
        keep implementation fix loop as the remaining explicit boundary
  - [x] `review` confirmed-findings handoff into the supported batch
        implementation resume path; keep unported implement gates as the
        remaining explicit boundaries
  - [x] `implement` dual-agent approval path through Gate B fresh-context
        review and implementer signoff
  - [x] `implement` Gate B verification after fresh-context findings
  - [x] `implement` Gate C dispute bounce after implementer signoff disputes
  - [x] `implement` auto-test quality check evidence before implementation
        review; keep browser-blocking implementation evidence as a later slice
  - [ ] `implement` browser/E2E check evidence, blocking failure synthesis,
        and missing-evidence gate before implementation review
  - [x] `verify` fresh automated verifier round with consensus entry guard,
        tagged artifact parsing, VERIFIED/VERIFICATION_FAILED statuses, and
        explicit manual/resume/fix-loop gaps
  - [x] `verify --resume` automated verifier round with follow-up prompt,
        existing artifact preservation, and focused state tests
  - [x] `verify` configured quality command gate with prompt evidence,
        deterministic failure blocking, and `verify_auto_test` opt-out
  - [x] `verify` Rust/JavaScript quality command auto-detection when no
        explicit quality config exists
  - [x] `verify` configured browser/E2E command gate with prompt evidence and
        `browser_evidence_policy` block/warn behavior
  - [x] `verify` browser evidence gate for browser-facing plans/tasks without
        captured browser/E2E evidence
  - [x] `verify` canonical plan-goal coverage gate with focused state tests
  - [x] `verify` Gate B second verifier for dual-agent verification
  - [x] `verify` command-final completion invariants for successful runs
  - [x] `verify` acceptance-goal cache and source precedence for spec/slice scope
  - [x] `verify` canonical-goal lint blocking for authoritative goal sources
  - [x] `verify --manual` checklist generation, persistence, answer loop, and resume
  - [x] `verify` Rust-shaped acceptance-goal extraction edge coverage
- [ ] Port `pipeline`, `supervise`, compound aliases, `goal`, and `queue`
  lifecycle behavior.
  - [x] `implement-verify --task/--file` fresh simple path by composing the
        existing first-pass implement and verify commands; keep resume and
        fix-loop recovery documented as gaps
  - [x] `approve plan` / `reject plan --reason <reason>` control commands that
        write Rust-compatible approval response files; broader plan approval
        gate orchestration remains a pipeline/plan runtime gap
  - [x] `goal status` / `goal pause` / `goal resume` / `goal clear`
        lifecycle-only commands against Rust-compatible `goal.json`; keep goal
        creation and `goal resume --run` as explicit runtime gaps
  - [x] `queue add` / `queue list` / `queue status` / `queue pause` /
        `queue resume` / `queue cancel` state-only lifecycle commands against
        Rust-compatible `goal-queue.json`; keep `queue resume --run` and
        supervisor queue execution as explicit runtime gaps
  - [x] `inline --task/--file` direct implementer execution with Rust-compatible
        task/workflow/status state, non-blocking quality check logging, and
        explicit auto-commit boundary
  - [x] `chain` Rust-shaped parser surface for plan files, `--command`, and
        `--resume`
- [ ] Port remaining read-only/low-runtime commands.
  - [x] `analyze-coverage` spec REQ coverage report with Rust-compatible
        plain/JSON output and exit codes
  - [x] `reset` exact output, JSON suppression, state cleanup, and wave-lock
        parity against the Rust CLI
  - [x] `status` initialized output, JSON event fields, default/corrupt status
        normalization, nextAction, and grouped artifact parity
  - [x] `next` deterministic control outcomes for complete, hard-error, and
        pending plan-approval states without invoking agent phases
  - [x] `next --task/--file` fresh input routing into supported selected
        commands while keeping no-input route-printing partial behavior
  - [x] `next` deterministic decision-table edges for consensus transitions,
        verification-failed replan, context-limit resume selection, stale
        verification invalidation, and verify routing
  - [x] `next` no-input delegation for supported `spec`/`plan`/`tasks`
        state-shell transitions when existing state contains enough context,
        while keeping taskless agent-start routes explicitly bounded
  - [x] `spec`/`plan` missing and empty task input errors match Rust instead
        of initializing empty task state
  - [x] `resume` deterministic dry-run, no-state JSON/plain, interrupted-state
        integrity errors, and pipeline-without-status selection parity
- [ ] Replace entries in `docs/unsupported.md` only when behavior has parity
  tests or a documented blocker.
- [x] `chain` runtime: validate files, persist `.agent-loop/chain.json`, run
      supported Node command steps sequentially, archive successful state, and
      keep unported compound/default command dispatch explicitly bounded
- [ ] Keep `npm test` and `npm run lint` green after each command group.

## Simplicity guardrails

- Avoid large catch-all modules; add feature files only when they isolate a real
  command or shared primitive.
- Prefer data tables for command alias mapping and option metadata, but keep
  runtime behavior in named functions that are easy to test.
- Do not duplicate state-file read/write logic across commands; extend the
  existing `src/state/*` helpers when behavior is shared.
- Treat a passing Node test suite as build health, not parity proof.

## Current status

- Rust source evidence is mapped in `docs/parity-matrix.md`.
- Node currently supports first-pass state shells for `spec`, `plan`, `tasks`,
  `next`, `resume`, and `verify`, plus `status`, `reset`, `version`, and help.
- Most Rust commands still intentionally route through the unsupported handler.
- `list-agents` now uses Rust-shaped provider metadata and keeps elapsed output
  on stderr so stdout remains parseable JSON.
- Project-aware JSON `init` now detects Rust, PHP/Laravel, JavaScript/TypeScript,
  quality commands, browser/E2E commands, and browser-facing projects without
  adding runtime execution complexity.
- Unsupported implement-capable commands now parse Rust-shaped implement flags
  and pipeline alias phase metadata before intentionally routing to the
  unsupported handler.
- `chain` now parses Rust-shaped plan file arguments, validates files, writes
  `.agent-loop/chain.json`, resumes at the first incomplete result, runs
  supported direct Node command steps sequentially, archives successful state,
  and records non-zero step failures. The Rust default `plan-tasks-implement`
  and broader compound/pipeline step dispatch remain documented gaps until
  ported.
- `next --task/--file` now parses Rust-shaped fresh input and delegates into
  supported selected commands such as `plan` and `spec` state setup. No-input
  agent-invoking `next` routes still keep the existing partial route-printing
  behavior until full auto-run parity lands.
- `next` now covers more of Rust's deterministic decision table: discuss/spec
  consensus transitions, verification-failed replan from
  `verification-fixes.md`, context-limit workflow resume selection, stale
  verification artifact invalidation before implementation verification, and
  direct verify routing through the existing `verify` command. Remaining
  no-input agent/pipeline routes are still partial boundaries.
- `next` now delegates no-input `spec`, `plan`, and `tasks` selections into
  the supported Node state shells when existing state contains enough task/plan
  context. Taskless agent-start routes remain explicit partial boundaries.
- `spec` and `plan` now reject missing, whitespace-only, and empty-file task
  input with Rust-shaped errors instead of initializing empty task state.
- Agent/provider runtime foundation now resolves action/slot provider, model,
  and effort, builds Rust-shaped provider command lines, captures provider
  output through an injectable runner, and writes output artifacts in tests.
- `discuss` now parses Rust-shaped args and runs the facilitator/progress/resume
  loop through the shared provider primitive, including distinct reviewer/planner
  challenger approvals and finalization. `--discover`, prompt overlays/session
  parity, and Rust-vs-Node golden evidence remain open.
- `implement --task` / `implement --file` now initializes implement state,
  persists batch mode/flags, runs the implementer through `Action::Implement`,
  runs the same-context reviewer through `Action::Review`, finishes with
  consensus for the supported simple/single-agent approval path, and runs the
  dual-agent approval path through Gate B fresh-context review, Gate B findings
  verification when needed, implementer signoff, and Gate C disputed
  late-finding bounce. Auto-test quality commands now run before implementation
  review, write `quality_checks.md`, and feed Gate A/Gate B prompts as reviewer
  evidence. Unlimited retry, per-task/wave, browser-blocking implementation
  evidence, compound phases, and git checkpoints remain documented gaps until
  ported.
- `implement` without fresh task/file input now supports Rust's batch-mode
  existing-state path from `tasks.md` or `plan.md`, including final `next`
  handoff into implementation. It builds Rust-shaped combined task prompts and
  keeps per-task/wave/retry loops as explicit boundaries.
- `implement --resume` now validates Rust-compatible implement state,
  supports persisted/default batch mode without clearing existing state, and
  keeps per-task/wave resume plus retry loops as explicit boundaries.
- `implement` now supports bounded batch retry after same-context reviewer
  `NEEDS_CHANGES` when `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive,
  including retry prompts and `MAX_ROUNDS` terminal status. Unlimited retry,
  per-task/wave, stuck/debugger, and browser-blocking implementation evidence
  remain explicit boundaries.
- `review` now initializes standalone review state, writes `changes.md` from
  `--files`, `--base`, or working-tree diffs, runs the primary reviewer through
  `Action::Review`, detects reviewer protocol failures, approves empty
  findings, runs dual-agent adversarial validation for primary findings, and
  hands confirmed findings into the supported batch `implement --resume` path.
  Remaining review fix-loop gaps are inherited from `implement`, including
  per-task/wave behavior and broader parity evidence.
- `verify` now enforces the fresh consensus entry guard, prepares verification
  state, runs one automated verifier round through `Action::Verify`, parses
  tagged verifier output, writes `verification.md`, `verification.json`, and
  `verification-fixes.md`, and sets `VERIFIED` or `VERIFICATION_FAILED`.
  `verify --resume` now validates the existing verify workflow, preserves
  existing progress/artifacts, uses the follow-up verifier prompt, and reruns
  one verifier round. It now applies a canonical plan-goal coverage gate for
  common plan/task goal shapes before accepting success, and rejects would-be
  successful runs when command-final completion invariants fail. It now persists
  `acceptance-goals.json`, refreshes it by source hash, and prefers active
  slice-scope `tasks.md` requirements over full `spec.md` requirements, with
  plan/task heuristics as fallback. It blocks authoritative canonical-goal lint
  failures before verifier calls. Manual verification now generates and
  persists a human checklist, records pass/fail/blocked/skipped answers, and
  supports `--manual --resume`. Acceptance-goal extraction now covers explicit
  canonical sections, embedded task plans, task-heading fallback, and
  verification checklist items. Fix-loop retries remain documented gaps until
  ported. Dual-agent verify now runs the implementer as Gate B after the
  primary verifier passes coverage.
- Configured `quality_commands`, `auto_test_cmd`, and Rust/JavaScript
  auto-detected quality commands now run during automated verify when
  `verify_auto_test` is enabled. Their output is included in the verifier
  prompt, passing checks are recorded in `verification-progress.md`, and
  failures deterministically block verification with `verification-fixes.md`
  even when the verifier reports all items passed.
- Configured `browser_test_commands` now run during automated verify when
  `verify_browser_test` is enabled. Their output is included in the verifier
  prompt and progress; failures block verification only when
  `browser_evidence_policy` is `block`, matching the Rust policy boundary.
- Browser-facing plans/tasks without captured browser/E2E evidence now write
  `browser-evidence-gate.md`; `browser_evidence_policy=block` pauses verify as
  `AWAITING_INPUT`, while `warn` records the gate and continues.
- `implement-verify --task/--file` now routes through a dedicated supported
  command that composes the first-pass implement round and first-pass verify
  round. `implement-verify --resume`, per-task/wave execution, and
  retry/fix-loop recovery remain documented gaps.
- `approve plan` and `reject plan --reason <reason>` now parse as supported
  control commands, validate the Rust-supported plan phase, require a pending
  `plan-pending-approval.flag`, write per-decision and legacy approval response
  files, and emit plain or JSON approval responses.
- `analyze-coverage` now reads existing `spec.md` and `tasks.md`, extracts
  sorted `REQ-###` IDs, reports missing requirements and orphan task blocks,
  supports plain/JSON output, and exits non-zero for incomplete coverage.
- `reset` now matches Rust output and JSON silence, preserves
  `.agent-loop/decisions.md`, removes default top-level run state plus wave
  task/supervisor directories, preserves session namespaces during default
  reset, clears only the selected session state in `--session` mode, and keeps
  `reset --wave-lock` scoped to the session wave lock.
- `status` now normalizes existing `status.json` like Rust, including empty and
  invalid files, prints Rust-shaped initialized plain/JSON fields with
  `nextAction`, keeps uninitialized output unchanged, and uses Rust-style
  grouped artifact, wave lock, and recent wave event sections.
- `next` now matches Rust for deterministic non-agent control outcomes:
  completed pipelines, hard-failure states, pending plan approval, and JSON
  `command_started` events for those control paths. Agent-invoking routes remain
  partial.
- `resume` now matches Rust for deterministic dry-run and no-state paths,
  JSON `command_started` on non-dry-run error paths, interrupted-state integrity
  errors before `next` fallback, and active pipeline selection when
  `pipeline.json`/`workflow.txt` exist without `status.json`. Full goal/queue,
  pipeline, supervise, and phase execution paths remain partial.
- `goal status`, `goal pause`, `goal resume`, and `goal clear` now parse and
  execute as lifecycle-only state commands against Rust-compatible
  `goal.json`. Mutating commands create `goal.lock` and preserve Rust output,
  status values, reason handling, and exit codes for the supported subset.
  Goal creation and `goal resume --run` still depend on pipeline/supervisor
  orchestration and remain unsupported.
- `queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`,
  and `queue cancel` now parse and execute as state-only lifecycle commands
  against Rust-compatible `goal-queue.json`. Mutating commands create
  `goal-queue.lock`; title derivation, dependency normalization, terminal item
  protection, plain/JSON output, and exit codes match the supported Rust paths.
  `queue resume --run` still depends on queue activation plus supervisor
  execution and remains unsupported.
- `inline --task` and `inline --file` now parse and execute as direct
  implementer invocations. Node writes Rust-compatible `original-request.md`,
  `task.md`, `workflow.txt`, and `status.json`, runs one implementer call, logs
  non-blocking quality checks when both `inline_quality_check` and `auto_test`
  are enabled, and keeps `inline_auto_commit=true` as an explicit unsupported
  boundary until git checkpoint parity is ported.
- `scripts/parity-smoke.js` now provides a repeatable Rust-vs-Node smoke
  harness for deterministic non-agent scenarios. It compares exit code,
  normalized stdout/stderr, and selected state files while normalizing elapsed
  lines, JSON key order, and timestamp fields.

## Review

- 2026-06-17: Ported `implement` Gate C dispute bounce after implementer
  signoff disputes. Rejected late findings now write consensus; confirmed late
  findings enter the bounded retry loop or max-rounds path. Verification:
  `npm test -- test/commands.test.js`.
- 2026-06-17: Ported `implement` Gate B findings verification after
  fresh-context findings. Withdrawn findings now proceed to implementer
  signoff; confirmed findings enter the bounded retry loop or max-rounds path.
  Verification: `npm test -- test/commands.test.js`.
- 2026-06-17: Ported `implement` dual-agent approval path through Gate B
  fresh-context review and implementer signoff. Verification:
  `npm test -- test/commands.test.js`.
- 2026-06-17: Ported standalone `review` confirmed-findings handoff into the
  supported batch implementation resume path. Simple mode can now complete the
  review fix loop through auto-consensus; dual-agent can now complete when Gate
  B fresh-context review approves and implementer signoff reaches consensus.
  Verification: `npm test -- test/commands.test.js`.
- 2026-06-17: Ported standalone `review` dual-agent adversarial validation
  after primary findings. The adversarial reviewer can withdraw findings and
  approve the review, or confirm findings before Node reaches the existing
  implementation fix-loop boundary. Verification:
  `npm test -- test/commands.test.js`.
- 2026-06-17: Added `implement-verify-empty-state` to the Rust-vs-Node parity
  smoke harness. It compares exit code and normalized stdout/stderr for the
  deterministic no-state error path. Verification:
  `npm run parity:smoke -- --scenario implement-verify-empty-state`.
- 2026-06-17: Ported existing-state `implement-verify` for saved `tasks.md` or
  `plan.md` input by letting the command compose the supported batch implement
  path and first-pass verify path. Empty state now reaches the Rust-shaped
  implement state error, while `implement-verify --resume` remains an explicit
  unsupported boundary. Verification: `npm test -- test/commands.test.js`.
- 2026-06-17: Ported Rust-style command-final completion invariants for
  successful `verify` runs. Node now rejects stale `handoff.json`/`handoff.md`,
  missing or invalid `verification.json`, missing `verification.md`, and
  non-`VERIFIED` terminal status before returning success.
- 2026-06-17: Added `acceptance-goals.json` cache/source precedence for
  `verify`, covering source hash refresh, `spec.md` `REQ-###` extraction, and
  active slice-scope `tasks.md` extraction.
- 2026-06-17: Added canonical-goal lint checks for evidence citations and
  contradictory quoted-subject requirements; authoritative goal sources now
  block `verify` as `NEEDS_REVISION` before verifier calls.
- 2026-06-17: Ported `verify --manual` for checklist generation through the
  verifier, immediate `verification.json` persistence, failed/skipped
  `verification-fixes.md`, and manual resume.
- 2026-06-17: Added Rust-shaped acceptance-goal extraction coverage for
  explicit canonical sections, embedded task plans, task-heading fallback, and
  verification checklist items with dash aliases.
- 2026-06-17: Ported the fresh `implement-verify --task/--file` simple compose
  path. Node now dispatches `implement-verify` as a dedicated supported command,
  runs first-pass implement then verify, and keeps resume as an explicit
  unsupported boundary.
- 2026-06-17: Ported `approve plan` and `reject plan --reason <reason>` as
  Rust-compatible approval response writers. Tests cover parser behavior,
  missing/invalid pending markers, plan-only validation, plain/JSON output, and
  response files under both `decisions/<id>/response.json` and
  `decision_response.json`.
- 2026-06-17: Ported `analyze-coverage` as a read-only state command. Tests
  cover missing `spec.md`/`tasks.md`, sorted REQ coverage, orphan tasks,
  plain/JSON output, and exit codes.
- 2026-06-17: Ported lifecycle-only `goal status`, `goal pause`,
  `goal resume`, and `goal clear`. Tests cover parser creation/lifecycle forms,
  plain/JSON status output, goal state mutation, `goal.lock` creation,
  lifecycle-only validation, unsupported creation, and unsupported
  `resume --run`. Installed Rust-vs-Node smokes matched plain lifecycle output,
  exit codes, and canonical JSON status for the supported subset.
- 2026-06-17: Ported state-only queue lifecycle commands. Tests cover parser
  add/lifecycle forms, `goal-queue.json` writes, dependency normalization,
  list/status output, pause/resume/cancel mutations, terminal item protection,
  JSON status/mutation output, silent JSON resume, and unsupported
  `queue resume --run`. Installed Rust-vs-Node smokes matched normalized plain
  queue output, exit codes, canonical queue state after add/cancel, and
  canonical JSON status.
- 2026-06-17: Ported the default `inline --task/--file` path. Tests cover
  parser support, direct implementer invocation, file input precedence, status
  transitions, non-blocking quality check logging behind `auto_test`, and the
  explicit `inline_auto_commit=true` unsupported boundary.
- 2026-06-17: Added `npm run parity:smoke` as the first reusable Rust-vs-Node
  parity harness. Default scenarios currently cover `analyze-coverage`,
  empty `goal status`, empty `queue status`, `inline` missing-task errors,
  `version`, `list-agents`, JSON `version`, JSON `list-agents`, JSON
  goal/queue status, and seeded `goal pause` state comparison.
- 2026-06-17: Ported exact `reset` command parity for default reset, session
  reset, wave-lock present/missing, plain output, JSON silence, and seeded
  `.agent-loop/` state cleanup/preservation.
- 2026-06-17: Ported deterministic `status` parity for uninitialized and
  initialized output, JSON event fields, empty/corrupt status normalization,
  `nextAction`, grouped artifacts, wave locks, and recent wave events.
- 2026-06-17: Ported deterministic `next` control outcomes for complete,
  hard-error, and pending plan approval states, including JSON
  `command_started` parity. Full phase execution through `next` remains a
  partial runtime gap.
- 2026-06-17: Ported deterministic `resume` dry-run/no-state/integrity
  behavior, including JSON `command_started` parity and pipeline resume
  selection without `status.json`. Full resume execution still routes to
  supported partial implementations or explicit unsupported boundaries.
- 2026-06-17: Ported the `chain` parser surface for Rust-shaped plan file
  arguments, `--command <command>`, and `--resume` before the explicit
  unsupported runtime boundary. Execution, `chain.json`, archiving, and
  per-file command dispatch remain open.
- 2026-06-17: Ported the first `chain` runtime slice. Node now validates plan
  files, writes `.agent-loop/chain.json`, resumes at the first incomplete
  result, runs supported direct command steps such as `plan`, archives
  successful state, records non-zero step failures, and has Rust-vs-Node smoke
  coverage for missing-file errors. The default `plan-tasks-implement` step and
  broader compound/pipeline dispatch remain open.
- 2026-06-17: Ported `implement` auto-test quality evidence. When `auto_test`
  is enabled, Node runs configured or auto-detected quality commands before
  Gate A review, writes `.agent-loop/state/quality_checks.md`, and references
  that evidence in Gate A and Gate B prompts. Ordinary failures remain reviewer
  evidence, matching Rust's non-blocking implementation quality behavior.
- 2026-06-17: Ported `next --task/--file` fresh input routing for supported
  selected commands. Tests cover parser shape plus routed `plan` and `spec`
  state setup while preserving no-input route-printing as the documented
  partial boundary.
- 2026-06-17: Ported additional deterministic `next` decision-table edges.
  Tests cover discuss/spec consensus transitions, verification-failed replan
  through `verification-fixes.md`, context-limit workflow resume selection,
  stale verification cleanup, and `next` running `verify` after implementation
  consensus.
- Verification: `npm test -- test/parser.test.js test/commands.test.js`
  passed with 106 tests for the inline slice. Latest verification:
  `npm test -- test/parser.test.js test/commands.test.js test/parity-smoke.test.js`
  passed with 109 tests; latest reset-focused verification
  `npm test -- test/commands.test.js test/parity-smoke.test.js` passed with 88
  tests; latest status/reset-focused verification
  `npm test -- test/commands.test.js test/parity-smoke.test.js` passed with 91
  tests; latest `next` focused verification `npm test -- test/commands.test.js`
  passed with 89 tests; latest `resume` focused verification
  `npm test -- test/commands.test.js` passed with 90 tests; `npm test` passed
  with 167 tests; latest `chain` focused verification
  `npm test -- test/parser.test.js test/commands.test.js` passed with 113
  tests; `npm test` passed with 168 tests; `npm run lint` checked 73
  JavaScript files; latest `chain` runtime focused verification
  `npm test -- test/parser.test.js test/commands.test.js test/parity-smoke.test.js`
  passed with 120 tests; `npm test` passed with 172 tests; `npm run lint`
  checked 75 JavaScript files; `git diff --check` was clean;
  `npm run parity:smoke` passed all 37 default Rust-vs-Node scenarios.
  Latest `next --task/--file` focused verification
  `npm test -- test/parser.test.js test/commands.test.js` passed with 120
  tests. Latest `next` decision-table focused verification
  `npm test -- test/parser.test.js test/commands.test.js` passed with 124
  tests. Latest `next` no-input delegation verification:
  `npm test -- test/parser.test.js test/commands.test.js` passed with 124
  tests; `npm run parity:smoke` passed all 37 default Rust-vs-Node scenarios;
  `npm test` passed with 179 tests; `npm run lint` checked 75 JavaScript
  files; `git diff --check` was clean. Latest `spec`/`plan` task-input
  validation verification: `npm test -- test/parser.test.js test/commands.test.js`
  passed with 125 tests; targeted `npm run parity:smoke -- --scenario
  spec-missing-task,plan-missing-task,plan-empty-file` passed. Latest full
  verification: `npm run parity:smoke` passed all 40 default Rust-vs-Node
  scenarios; `npm test` passed with 180 tests; `npm run lint` checked 75
  JavaScript files; `git diff --check` was clean. Latest existing-state
  `implement` batch verification: `npm test -- test/parser.test.js
  test/commands.test.js` passed with 128 tests; targeted
  `npm run parity:smoke -- --scenario implement-empty-state` passed; latest
  full verification: `npm run parity:smoke` passed all 41 default Rust-vs-Node
  scenarios; `npm test` passed with 183 tests; `npm run lint` checked 75
  JavaScript files; `git diff --check` was clean. Latest batch
  `implement --resume` verification: `npm test -- test/parser.test.js
  test/commands.test.js` passed with 130 tests; `npm run parity:smoke` passed
  all 41 default Rust-vs-Node scenarios; `npm test` passed with 185 tests;
  `npm run lint` checked 75 JavaScript files; `git diff --check` was clean.
  Latest bounded `implement` retry verification: `npm test --
  test/config.test.js test/commands.test.js` passed with 123 tests;
  `npm test` passed with 188 tests; `npm run lint` checked 75 JavaScript
  files; `git diff --check` was clean; `npm run parity:smoke` passed all 41
  default Rust-vs-Node scenarios.
  Latest `implement-verify` existing-state and empty-state smoke verification:
  `npm test -- test/commands.test.js` passed with 110 tests; `npm test` passed
  with 190 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest standalone `review` adversarial validation verification:
  `npm test -- test/commands.test.js` passed with 111 tests; `npm test` passed
  with 191 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest standalone `review` confirmed-findings implementation handoff
  verification: `npm test -- test/commands.test.js` passed with 111 tests;
  `npm test` passed with 191 tests; `npm run lint` checked 75 JavaScript
  files; `git diff --check` was clean; `npm run parity:smoke` passed all 42
  default Rust-vs-Node scenarios.
  Latest `implement` dual-agent Gate B/signoff approval-path verification:
  `npm test -- test/commands.test.js` passed with 114 tests; `npm test`
  passed with 194 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `implement` Gate B findings-verification verification:
  `npm test -- test/commands.test.js` passed with 115 tests; `npm test`
  passed with 195 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `implement` Gate C dispute-bounce verification:
  `npm test -- test/commands.test.js` passed with 116 tests; `npm test`
  passed with 196 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `implement` auto-test quality evidence verification:
  `npm test -- test/commands.test.js` passed with 118 tests; `npm test`
  passed with 198 tests; `npm run lint` checked 75 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Earlier installed Rust-vs-Node smokes matched exit code, stderr, and empty
  stdout for `inline` missing-task and empty-file input errors.

---

# TOML → JSON config conversion

Convert node-cli configuration from `.agent-loop.toml` to `.agent-loop.json`,
removing TOML from the runtime path entirely and providing a migration script.

## Tasks

- [x] `src/config/json.js`: JSON config reader — ENOENT → `{}`, invalid JSON / non-object root → hard error naming the file
- [x] `src/config/index.js`: read `.agent-loop.json`; update `.agent-loop.toml` strings in error messages and slot-profile source labels; warn on stderr when a legacy `.agent-loop.toml` is present
- [x] Delete `src/config/toml.js`
- [x] `scripts/migrate-config.js`: standalone TOML-subset → `.agent-loop.json` converter (`--force` to overwrite)
- [x] `test/config.test.js` + `test/commands.test.js`: fixtures write JSON instead of TOML
- [x] `test/toml.test.js` → `test/migrate.test.js`: parser coverage (floats, quoted commas, escapes, array-of-tables) moves to migration-script tests; add corrupt-JSON and legacy-warning tests
- [x] Docs: delete `docs/toml-subset.md`, add `docs/json-config.md` (format, example, precedence, migration)
- [x] CHANGELOG entry under [Unreleased] (repo root CHANGELOG.md)
- [x] Verify: `npm test` green, `node scripts/lint.js` clean, functional smoke with a real `.agent-loop.json`

## Review

- Runtime config now reads only `<project>/.agent-loop.json` via `src/config/json.js`
  (ENOENT → `{}`; invalid JSON / non-object root → hard error naming the file).
  `src/config/toml.js` is deleted; its subset parser moved verbatim into the standalone
  `scripts/migrate-config.js` (`node scripts/migrate-config.js [projectDir] [--force]`).
  The script has no static `src/` imports: post-conversion schema validation is loaded
  via dynamic `import()` and skipped with a `note:` when the script runs as a single
  copied file outside the package.
- `loadConfig` warns (stderr, via the existing `emitConfigWarnings` path) when a legacy
  `.agent-loop.toml` exists: a migrate hint when no JSON file is present, an "ignored"
  notice when both exist. Warnings also surface in `config.warnings`.
- Also modified: `src/main.js` (fatal config errors in `--json` mode are emitted as a
  `{"type":"error",...}` NDJSON event on stderr instead of a plain stack line) and
  `package.json` (adds the `migrate-config` npm script referenced by the docs).
- Tests: 51 → 63 passing (`node --test`); all old TOML parser assertions preserved in
  `test/migrate.test.js` plus end-to-end script runs (including a copied-out-of-package
  standalone run), and new config tests cover corrupt JSON, non-object root, and both
  legacy-TOML warnings. `node scripts/lint.js` clean. The former repo-root TOML loading
  test became a self-contained tmp-dir JSON fixture (the repo root keeps
  `.agent-loop.toml` for the Rust CLI).
- Docs: `docs/toml-subset.md` replaced by `docs/json-config.md` (format, annotated
  example, precedence, accepted-vs-acted-on keys, migration). CHANGELOG [Unreleased]
  gained a Changed entry.
