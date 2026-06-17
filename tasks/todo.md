# Rust CLI parity conversion

Convert `node-cli` into a 1:1 functional port of the Rust `agent-loop` CLI while
keeping the JavaScript implementation simple, incremental, and evidence-backed.

## Active Slice: dedicated implementation workflow commands

- [ ] Define supported first-pass behavior for `plan-implement`,
      `tasks-implement`, and `plan-tasks-implement`.
- [ ] Parse and dispatch the dedicated workflow commands as supported pipeline
      compositions without Rust's legacy-alias note.
- [ ] Route runnable default batch-compatible paths through existing plan/tasks
      shell and implement runtime primitives.
- [ ] Update docs/parity notes so unsupported commands only list true current
      boundaries.
- [ ] Verify with focused parser/command tests, lint, full tests, smoke parity,
      and `git diff --check`.

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
- [x] Port prompt style/profile overlays for currently executed Node prompts.
  - [x] Record assumptions and scope for prompt style/profile parity.
  - [x] Load Rust-shaped `prompt_style` / `AGENT_LOOP_PROMPT_STYLE` with validation.
  - [x] Resolve `prompt_profile` / `PROMPT_PROFILE` for built-in `xml_boundaries_v1`
        and profile TOML paths.
  - [x] Apply phase overlays to currently executed Node discovery and discuss prompts.
  - [x] Add focused config and command tests for style/profile loading and prompt overlay application.
  - [x] Update parity docs and run Node verification.
- [x] Port Rust-shaped provider system prompts for current agent invocations.
  - [x] Record assumptions and scope for system prompt parity.
  - [x] Correct `decisions_enabled` default and env precedence to match Rust.
  - [x] Generate role system prompts for decision capture, single-agent reviewer preamble, and prompt-profile system overlays.
  - [x] Inject generated system prompts through the existing provider runtime seam.
  - [x] Add focused config/runtime tests and update parity docs.
  - [x] Run Node verification.
  - [x] Append Rust-shaped progressive-context state manifests to provider
        system prompts.
  - [x] Load `progressive_context` / `PROGRESSIVE_CONTEXT` with Rust-shaped
        precedence.
  - [x] Add provider-specific injection coverage so manifest prompts land in
        the prompt argument for `-p` providers.
  - [x] Update parity docs and run Node verification for the manifest slice.
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
  - [x] `AGENT_LOOP_<ACTION>_MODEL` / `AGENT_LOOP_<ACTION>_EFFORT`
        env override precedence for provider resolution
  - [x] Rust-shaped Claude/Codex/Cursor CLI tuning config, permission flags,
        and session-persistence gates
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
        `REVIEW_MAX_ROUNDS` is positive; keep per-task/wave and
        stuck/debugger as explicit gaps
  - [x] `implement` unbounded batch retry loop when `review_max_rounds` is `0`;
        keep stuck/debugger, role-swap, per-task/wave, and git checkpoint
        behavior as explicit gaps
  - [x] `implement` high-watermark logging for unbounded retry rounds; keep
        stuck/debugger, role-swap, per-task/wave, and git checkpoints as
        explicit gaps
  - [x] `implement-verify` from existing `tasks.md` or `plan.md` state by
        composing the supported batch implement path and first-pass verify path;
        keep resume and fix-loop recovery as explicit gaps
  - [x] `implement-verify` empty-state Rust-vs-Node parity smoke scenario for
        normalized stdout/stderr and exit code
  - [x] `implement-verify --resume` for persisted `implement` and `verify`
        workflows by composing supported resumes; keep `plan` and standalone
        `review` workflow chaining explicit until those runtimes are ported
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
        review
  - [x] `implement` browser/E2E check evidence, blocking failure synthesis,
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
        lifecycle commands against Rust-compatible `goal.json`; keep goal
        supervisor/resume orchestration as explicit runtime gap
  - [x] `goal` creation state path for text / `--objective` / `--file` with
        Rust-compatible `goal.json`; keep supervisor run as explicit runtime gap
  - [x] `goal resume --run` state preparation: mark goal active and clear
        reason before unsupported resume orchestration boundary
  - [x] `resume` action-required routing for paused/budget-limited goals and
        deferred/blocked queue items using Rust `queue_id` output
  - [x] `resume` active queue item hydration: create active `goal.json` from
        active/split/implementing/verifying queue attention before runtime routing
  - [x] `resume` non-dry-run preamble messages before supervisor, pipeline,
        interrupted workflow, and `next` fallback handoff
  - [x] `resume` interrupted workflow handoff through existing Node resume
        command shells after Rust pre-runtime validation
  - [x] `pipeline --resume` state persistence and active workflow handoff through
        existing Node resume command shells
  - [x] `pipeline --phases spec|plan` fresh single-phase state setup and
        `pipeline.json` persistence through existing phase shells
  - [x] `pipeline --phases tasks` fresh single-phase state setup with
        Rust-compatible plan/task selection
  - [x] `pipeline --phases implement` fresh single-phase batch implementation
        handoff with `pipeline.json` persistence
  - [x] `pipeline --phases discuss` fresh single-phase discussion handoff with
        `pipeline.json` persistence
  - [x] `pipeline --phases verify` fresh single-phase verification handoff with
        `pipeline.json` persistence and supported verifier execution
  - [x] `pipeline --phases implement,verify` fresh multi-phase handoff using the
        supported batch implementation and verifier paths
  - [x] Runtime-only fresh pipeline subsets across `discuss`, `implement`, and
        `verify`, preserving state between supported phases
  - [x] Pipeline aliases dispatch through the canonical pipeline runner with
        Rust's legacy-alias note; unsupported docs now list only true command
        boundaries
  - [x] `pipeline --phases plan,implement` and
        `pipeline --phases plan,implement,verify` narrow first-pass planning
        runtime: planner writes `plan.md`, reviewer approves it, then supported
        batch implementation and verification continue
  - [x] `pipeline --phases tasks,implement` and
        `pipeline --phases tasks,implement,verify` plan-backed handoff through
        the existing tasks shell, batch implementation, and verifier paths
  - [x] `queue add` / `queue list` / `queue status` / `queue pause` /
        `queue resume` / `queue cancel` state-only lifecycle commands against
        Rust-compatible `goal-queue.json`; keep supervisor queue execution as
        explicit runtime gap
  - [x] `queue resume <id> --run` state preparation: queued resume, activation,
        and active `goal.json`; keep supervisor queue execution as explicit gap
  - [x] `supervise --queue` state preparation: activate next eligible queued
        item and create active `goal.json`; keep supervisor execution as
        explicit gap
  - [x] `supervise --queue` resumable-state detection: print Running vs
        Resuming like Rust before the supervisor boundary
  - [x] `inline --task/--file` direct implementer execution with Rust-compatible
        task/workflow/status state, non-blocking quality check logging, and
        checkpoint support behind `inline_auto_commit` plus `auto_commit`
  - [x] `inline_auto_commit` git checkpoint parity for successful inline runs,
        gated by `auto_commit` and excluding `.agent-loop/state/**`
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
  evidence. Browser/E2E checks now also run before implementation review,
  append to `quality_checks.md`, synthesize blocking review findings when
  policy blocks, warn when policy is non-blocking, and apply the missing
  browser-evidence gate for browser-facing work. Unbounded `NEEDS_CHANGES`
  batch retries now continue when `review_max_rounds` is `0`, and unlimited
  mode logs the Rust high-watermark safeguard at round 50 and every 25 rounds
  after. Per-task/wave, stuck/debugger behavior, compound phases, and git
  checkpoints remain documented gaps until ported.
- `implement` without fresh task/file input now supports Rust's batch-mode
  existing-state path from `tasks.md` or `plan.md`, including final `next`
  handoff into implementation. It builds Rust-shaped combined task prompts and
  keeps per-task/wave/retry loops as explicit boundaries.
- `implement --resume` now validates Rust-compatible implement state,
  supports persisted/default batch mode without clearing existing state, and
  keeps per-task/wave resume plus retry loops as explicit boundaries.
- `implement` now supports bounded batch retry after same-context reviewer
  `NEEDS_CHANGES` when `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive,
  including retry prompts and `MAX_ROUNDS` terminal status. Unbounded batch
  retry now continues when the cap is `0` and logs high-watermark safeguards
  at Rust's unlimited-round thresholds; per-task/wave, stuck/debugger,
  role-swap, and git checkpoint behavior remain explicit boundaries.
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
  round. `implement-verify --resume` now composes the supported
  `implement --resume` and `verify` paths when state is in `implement`, and
  delegates to `verify --resume` when state is already in `verify`. Plan-stage
  resume chaining, standalone review workflow resume, per-task/wave execution,
  and retry/fix-loop recovery remain documented gaps.
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
  errors before `next` fallback, active pipeline selection when
  `pipeline.json`/`workflow.txt` exist without `status.json`, and
  action-required output for paused/budget-limited goals plus deferred/blocked
  queue items. Active queue items now hydrate active `goal.json` before runtime
  routing, and non-dry-run supervisor, pipeline, interrupted workflow, and
  `next` fallback routes print Rust's pre-runtime messages before handoff.
  Interrupted workflow routes now delegate to the existing Node resume command
  shells instead of a generic unsupported handler. Full pipeline, supervise, and
  phase execution paths remain partial.
- `pipeline --resume` now validates Rust phase rules, writes Rust-shaped
  `pipeline.json`, verifies the active workflow belongs to the requested phases,
  and delegates to the existing Node resume command shells. Fresh pipeline
  execution now supports single-phase `discuss`, `spec`, `plan`, `tasks`,
  `implement`, and `verify` through existing Node phase/runtime paths, then
  writes Rust-shaped `pipeline.json`; `tasks` follows Rust plan/task selection
  for existing state, explicit plan files, and task overrides, `discuss` uses
  the supported facilitator loop, `implement` writes pipeline metadata before
  runtime failure can occur, and `verify` initializes fresh verify state from
  pipeline task input before entering the supported verifier round. Fresh
  multi-phase pipelines composed only of `discuss`, `implement`, and `verify`
  now run in order, preserve accumulated state, transition workflow/status
  before continuation phases, and stop before later phases if an earlier phase
  fails. Fresh `plan,implement` and `plan,implement,verify` pipelines now run
  a narrow first-pass planning runtime before supported implementation and
  verification. Fresh `tasks,implement` and `tasks,implement,verify` pipelines
  run when a plan file or existing `plan.md` supplies tasks-phase input.
  Pipeline aliases now dispatch through the canonical pipeline runner and emit
  Rust's legacy-alias note. Broader fresh orchestration that depends on full
  spec or task-decomposition runtimes remains an explicit unsupported boundary
  until full orchestration is ported.
- `goal status`, `goal pause`, `goal resume`, and `goal clear` now parse and
  execute as lifecycle-only state commands against Rust-compatible
  `goal.json`. Mutating commands create `goal.lock` and preserve Rust output,
  status values, reason handling, and exit codes for the supported subset.
  Goal creation from text, `--objective`, or `--file` now writes Rust-compatible
  active `goal.json` state and then stops at the explicit unsupported
  supervisor-run boundary. `goal resume --run` now marks the goal active and
  clears the pause reason before the explicit unsupported resume-orchestration
  boundary.
- `queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`,
  and `queue cancel` now parse and execute as lifecycle commands
  against Rust-compatible `goal-queue.json`. Mutating commands create
  `goal-queue.lock`; title derivation, dependency normalization, terminal item
  protection, plain/JSON output, and exit codes match the supported Rust paths.
  `queue resume <id> --run` now performs Rust-shaped state prep by marking the
  item runnable, activating it, deferring any previous active run, and creating
  active `goal.json`; supervisor execution remains unsupported.
- `supervise --queue` now performs Rust-shaped state prep by rejecting task,
  file, and resume combinations, activating the current active run or next
  eligible queued item using priority/dependency rules, creating active
  `goal.json`, and choosing `Running` vs `Resuming` from resumable state;
  supervisor execution remains unsupported.
- `inline --task` and `inline --file` now parse and execute as direct
  implementer invocations. Node writes Rust-compatible `original-request.md`,
  `task.md`, `workflow.txt`, and `status.json`, runs one implementer call, logs
  non-blocking quality checks when both `inline_quality_check` and `auto_test`
  are enabled, and supports `inline_auto_commit` checkpoints after successful
  inline execution when `auto_commit` is also enabled. Checkpoints exclude
  `.agent-loop/state/**` and log Rust-shaped skip/failure/success messages.
- `scripts/parity-smoke.js` now provides a repeatable Rust-vs-Node smoke
  harness for deterministic non-agent scenarios. It compares exit code,
  normalized stdout/stderr, and selected state files while normalizing elapsed
  lines, JSON key order, and timestamp fields.
- `prompt_style` / `AGENT_LOOP_PROMPT_STYLE` and `prompt_profile` /
  `PROMPT_PROFILE` now load with Rust-shaped precedence. The Node first pass
  supports the built-in `xml_boundaries_v1` profile, explicit and named prompt
  profile TOML paths, and phase overlays for the currently executed discovery
  and discuss prompts. System prompt overlays and unported phase prompts remain
  explicit parity gaps.
- Provider invocations now get Rust-shaped default system prompts through the
  shared runtime seam: decision capture when `decisions_enabled` is true,
  single-agent reviewer preambles, and prompt-profile system overlays. The
  `decisions_enabled` default now matches Rust (`false`) with
  `DECISIONS_ENABLED` env override support. Progressive-context state manifests
  now append to generated system prompts when `progressive_context` /
  `PROGRESSIVE_CONTEXT` is enabled, matching Rust's on-demand context manifest.
- Provider resolution now honors Rust-shaped per-action env overrides:
  `AGENT_LOOP_<ACTION>_MODEL` and `AGENT_LOOP_<ACTION>_EFFORT` sit below CLI
  action overrides and above JSON `models`, with invalid env effort values
  rejected during config loading.
- Provider command construction now honors Rust-shaped Claude/Codex/Cursor CLI
  tuning for the currently implemented runtime seam: full-access flags,
  Claude allowed tools, reviewer allowed tools, planner permission mode, skills
  toggling, Claude token env, and provider session-persistence gates.

## Review

- 2026-06-17: Ported the next compound/pipeline alias execution slice. Node now
  treats Rust pipeline aliases as supported dispatches into the canonical
  pipeline runner, emits the Rust legacy-alias note, removes those aliases from
  the unsupported command set/docs, runs `plan,implement` and
  `plan,implement,verify` through a narrow first-pass planning runtime, and
  runs `tasks,implement` / `tasks,implement,verify` when a plan file or existing
  `plan.md` supplies tasks-phase input. Spec-leading aliases and full task
  decomposition remain explicit gaps. Verification: `npm test --
  test/parser.test.js test/commands.test.js` (188 passing), `npm run lint` (86
  JavaScript files), `npm test -- --test-reporter=dot` (266 passing),
  `npm run parity:smoke` (45 scenarios), and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported Rust-shaped Claude/Codex/Cursor CLI tuning for the shared
  provider runtime seam. Node now loads provider full-access flags, Claude and
  reviewer allowed-tool lists, planner permission mode, skills toggling,
  Claude token settings, `NEW_CONTEXT`, and provider session-persistence gates
  with Rust-shaped env/file/default precedence. Provider command builders now
  emit Rust-shaped Claude permission flags, Codex/Cursor sandbox/full-access
  flags, Claude token env, and resume-session suppression. Verification:
  `npm test -- test/config.test.js test/agent-runtime.test.js` (42 passing),
  `npm test -- test/agent-runtime.test.js test/config.test.js
  test/commands.test.js` (204 passing), `npm run lint` (86 JavaScript files),
  `npm test` (264 passing), `npm run parity:smoke` (45 scenarios), and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Ported Rust-shaped per-action env model/effort overrides for
  provider resolution. Node now loads `AGENT_LOOP_<ACTION>_MODEL` and
  `AGENT_LOOP_<ACTION>_EFFORT` for all Rust actions, rejects invalid env effort
  values during config load, and resolves provider calls with Rust precedence:
  CLI action override > env action override > JSON `models` > slot profile
  shorthand. Focused tests cover env-over-JSON, CLI-over-env, and effort-only
  env overrides preserving JSON model selection. Verification: `npm test --
  test/config.test.js test/agent-runtime.test.js` (36 passing), `npm test --
  test/agent-runtime.test.js test/config.test.js test/commands.test.js` (198
  passing), `npm run lint` (86 JavaScript files), `npm test` (258 passing),
  `npm run parity:smoke` (45 scenarios), and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported Rust-shaped progressive-context state manifests for
  provider invocations. Node now loads `progressive_context` /
  `PROGRESSIVE_CONTEXT`, appends the same on-demand context manifest as Rust
  after decision/reviewer system prompt parts, gates `.agent-loop/decisions.md`
  on `decisions_enabled`, omits missing docs/state files, and injects manifest
  prompts into the actual prompt argument for `-p` providers such as Qwen and
  Copilot. Verification: `npm test -- test/config.test.js
  test/agent-runtime.test.js` (33 passing), `npm test --
  test/agent-runtime.test.js test/config.test.js test/commands.test.js` (195
  passing), `npm run lint` (86 JavaScript files), `npm test` (255 passing),
  `npm run parity:smoke` (45 scenarios), and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported Rust-shaped provider system prompts for current agent
  invocations. Node now defaults `decisions_enabled` to false, honors
  `DECISIONS_ENABLED`, injects decision-capture prompts only when enabled,
  adds the single-agent reviewer preamble, and applies prompt-profile system
  overlays through the provider runtime when callers do not pass an explicit
  system prompt. Progressive-context state manifest prompts remain open.
  Verification: `npm test -- test/config.test.js test/agent-runtime.test.js`
  (30 passing), `npm test -- test/agent-runtime.test.js test/config.test.js
  test/commands.test.js` (192 passing), `npm run lint` (85 JavaScript files),
  `npm test` (252 passing), `npm run parity:smoke` (45 scenarios), and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Ported prompt style/profile loading for currently executed
  discovery and discuss prompts. Node now validates `prompt_style`, honors
  `AGENT_LOOP_PROMPT_STYLE`, resolves `prompt_profile` / `PROMPT_PROFILE` for
  built-in `xml_boundaries_v1`, explicit TOML paths, and named project profile
  paths, and appends Rust-ordered global plus phase overlays to discovery and
  discuss prompts. System prompt overlays and unported phase prompts remain
  explicit gaps. Verification: `npm test -- test/config.test.js
  test/commands.test.js` (182 passing), `npm run lint` (84 JavaScript files),
  `npm test` (248 passing), `npm run parity:smoke` (45 scenarios), and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Matched Rust `resume` non-dry-run pre-runtime messages for
  supervisor checkpoints, saved pipelines, interrupted workflow handoff, and
  `next` fallback paths while keeping dry-run output unchanged. Verification:
  `npm test -- test/commands.test.js`.
- 2026-06-17: Routed interrupted `resume` workflows through the existing Node
  workflow resume dispatcher after the Rust pre-runtime checks and message. The
  supported shell boundary now preserves phase-specific validation/output instead
  of falling through the generic unsupported handler. Verification:
  `npm test -- test/commands.test.js`.
- 2026-06-17: Ported the deterministic `pipeline --resume` setup path. Node now
  validates phase names, duplicate phases, order, and tasks-without-plan state,
  writes Rust-shaped `pipeline.json`, checks active workflow membership, and
  delegates to existing resume shells. Verification:
  `npm test -- test/commands.test.js`.
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
- 2026-06-17: Ported `implement-verify --resume` for state already in
  `implement` or `verify` by composing the supported implementation and
  verification resume paths. Plan-stage resume chaining and standalone review
  workflow resume remain explicit boundaries. Verification:
  `npm test -- test/commands.test.js`.
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
  lifecycle-only validation, and missing-goal resume handling. Installed
  Rust-vs-Node smokes matched plain lifecycle output, exit codes, and canonical
  JSON status for the supported subset.
- 2026-06-17: Ported `goal` creation state. Text, `--objective`, and `--file`
  inputs now create Rust-compatible active `goal.json` state with `goal.lock`
  before returning the documented unsupported supervisor-run boundary; `--replace`
  preserves Rust's existing-goal guard.
- 2026-06-17: Ported `goal resume --run` state preparation. Node now marks the
  goal active, clears the pause reason, and writes `goal.lock` before returning
  the explicit unsupported resume-orchestration boundary; missing goals still
  return Rust-compatible `No goal to resume.` with exit 1.
- 2026-06-17: Matched Rust `resume` action-required routing for paused goals
  and deferred queue items. Node now returns the Rust stderr guidance instead
  of the unsupported handler for paused goals, and dry-run JSON/plain queue
  resume output uses the persisted `queue_id`.
- 2026-06-17: Matched Rust `resume` active queue hydration. Non-dry-run resume
  now creates active `goal.json` from active/split/implementing/verifying queue
  attention before falling through to the remaining runtime route.
- 2026-06-17: Ported state-only queue lifecycle commands. Tests cover parser
  add/lifecycle forms, `goal-queue.json` writes, dependency normalization,
  list/status output, pause/resume/cancel mutations, terminal item protection,
  JSON status/mutation output, and silent JSON resume. Installed Rust-vs-Node
  smokes matched normalized plain queue output, exit codes, canonical queue
  state after add/cancel, and canonical JSON status.
- 2026-06-17: Ported `queue resume <id> --run` state preparation. Node now
  marks the item runnable, activates it, defers any previous active run, creates
  active `goal.json` from the queue objective, and then returns the explicit
  unsupported supervisor-run boundary; active-goal conflicts remain blocking
  after activation like Rust.
- 2026-06-17: Ported `supervise --queue` state preparation. Node now rejects
  task/file/resume combinations, activates the current active run or next
  eligible queued item using Rust priority/dependency rules, creates active
  `goal.json`, and then returns the explicit unsupported supervisor-run
  boundary; active-goal conflicts remain blocking after activation like Rust.
- 2026-06-17: Matched Rust `supervise --queue` queue-run resume detection.
  Node now prints `Running queue item` for fresh state and `Resuming queue item`
  when `status.json`, `workflow.txt`, `pipeline.json`, or core task/plan/verify
  artifacts make the state resumable before the supervisor boundary.
- 2026-06-17: Ported the default `inline --task/--file` path. Tests cover
  parser support, direct implementer invocation, file input precedence, status
  transitions, and non-blocking quality check logging behind `auto_test`.
- 2026-06-17: Ported `inline_auto_commit` checkpoint behavior for successful
  inline runs. Node now honors the Rust `auto_commit` gate, skips with the
  Rust-shaped log when disabled, commits non-state loop-owned files when enabled,
  and excludes `.agent-loop/state/**` from the commit.
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
- 2026-06-17: Ported `implement` browser/E2E evidence gates. Configured
  `browser_test_commands` now run before implementation review, append to
  `.agent-loop/state/quality_checks.md`, synthesize review/findings/status when
  failing checks block, warn and continue when policy is non-blocking, and write
  `browser-evidence-gate.md` / `AWAITING_INPUT` before review when
  browser-facing work lacks browser evidence.
- 2026-06-17: Ported unbounded batch `implement` retry for
  `review_max_rounds=0`. Ordinary `NEEDS_CHANGES` reviews now continue to the
  next implementation round until approval instead of returning the old
  first-pass unsupported boundary; positive round caps still end in
  `MAX_ROUNDS`.
- 2026-06-17: Ported `implement` high-watermark logging for unbounded retry.
  Node logs the unlimited-round safeguard at round 50 and every 25 rounds
  after, while bounded `review_max_rounds` runs stay quiet.
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
  Latest `implement` browser/E2E evidence verification:
  `npm test -- test/commands.test.js` passed with 121 tests; `npm test`
  passed with 202 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `implement` unbounded retry verification:
  `npm test -- test/commands.test.js` passed with 121 tests; `npm test`
  passed with 202 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `implement` high-watermark verification:
  `npm test -- test/commands.test.js` passed with 122 tests; `npm test`
  passed with 203 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `goal` creation-state verification:
  `npm test -- test/commands.test.js` passed with 124 tests; `npm test`
  passed with 205 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `queue resume --run` state-prep verification:
  `npm test -- test/commands.test.js` passed with 126 tests; `npm test`
  passed with 207 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `goal resume --run` state-prep verification:
  `npm test -- test/commands.test.js` passed with 127 tests; `npm test`
  passed with 208 tests; `npm run lint` checked 77 JavaScript files;
  `git diff --check` was clean; `npm run parity:smoke` passed all 42 default
  Rust-vs-Node scenarios.
  Latest `supervise --queue` state-prep/resume-detection verification:
  `npm test -- test/commands.test.js` passed with 132 tests; `npm test`
  passed with 213 tests; `npm run lint` checked 79 JavaScript files; targeted
  `npm run parity:smoke -- --scenario supervise-queue-empty` passed, then
  `npm run parity:smoke` passed all 43 default Rust-vs-Node scenarios.
  Latest `resume` goal/queue action-required routing verification:
  `npm test -- test/commands.test.js` passed with 133 tests; `npm test`
  passed with 214 tests; `npm run lint` checked 79 JavaScript files; targeted
  `npm run parity:smoke -- --scenario
  resume-dry-run-deferred-queue,json-resume-dry-run-deferred-queue` passed;
  `npm run parity:smoke` passed all 45 default Rust-vs-Node scenarios;
  `npm test -- test/parity-smoke.test.js` passed with 3 tests; `git diff
  --check` was clean.
  Latest `resume` active queue hydration verification:
  `npm test -- test/commands.test.js` passed with 134 tests; `npm test`
  passed with 215 tests; `npm run lint` checked 79 JavaScript files;
  `npm run parity:smoke` passed all 45 default Rust-vs-Node scenarios;
  `npm test -- test/parity-smoke.test.js` passed with 3 tests; `git diff
  --check` was clean.
  Latest fresh single-phase `pipeline --phases verify` verification:
  `npm test -- test/parser.test.js test/commands.test.js` passed with 175
  tests; `npm test` passed with 232 tests; `npm run lint` checked 80
  JavaScript files; `npm run parity:smoke` passed all 45 default
  Rust-vs-Node scenarios; `git diff --check` was clean.
  Latest fresh multi-phase `pipeline --phases implement,verify` verification:
  `npm test -- test/parser.test.js test/commands.test.js` passed with 177
  tests; `npm test` passed with 234 tests; `npm run lint` checked 80
  JavaScript files; `npm run parity:smoke` passed all 45 default
  Rust-vs-Node scenarios; `git diff --check` was clean.
  Latest fresh runtime-only `pipeline --phases discuss,implement,verify`
  verification: `npm test -- test/parser.test.js test/commands.test.js`
  passed with 178 tests; `npm test` passed with 235 tests; `npm run lint`
  checked 80 JavaScript files; `npm run parity:smoke` passed all 45 default
  Rust-vs-Node scenarios; `git diff --check` was clean.
  Latest `implement-verify --resume` supported-stage verification:
  `npm test -- test/parser.test.js test/commands.test.js` passed with 180
  tests; `npm test` passed with 237 tests; `npm run lint` checked 80
  JavaScript files; `npm run parity:smoke` passed all 45 default
  Rust-vs-Node scenarios; `git diff --check` was clean.
  Latest `inline_auto_commit` checkpoint verification:
  `npm test -- test/parser.test.js test/commands.test.js` passed with 181
  tests; `npm test` passed with 238 tests; `npm run lint` checked 81
  JavaScript files; `npm run parity:smoke` passed all 45 default
  Rust-vs-Node scenarios; `git diff --check` was clean.
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
