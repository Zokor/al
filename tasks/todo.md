# Rust CLI parity conversion

Convert `node-cli` into a 1:1 functional port of the Rust `agent-loop` CLI while
keeping the JavaScript implementation simple, incremental, and evidence-backed.

## Active Slice: numeric command option validation parity-smoke evidence

ASSUMPTIONS:
1. Rust clap output is authoritative for invalid numeric option values such as
   `--max-retries abc` and `queue add --priority abc`.
2. This slice only changes deterministic numeric validation stderr; valid
   numeric parsing and runtime dispatch stay unchanged.

PLAN:
- [ ] Align Node numeric command option validation errors with Rust
      `Config error:` output for implementation, pipeline, goal, and queue
      parser surfaces.
- [ ] Add Rust-vs-Node parity-smoke scenarios for representative invalid
      numeric values and minimum-value failures in plain and JSON global modes.
- [ ] Update parity docs/tests to cite numeric validation evidence while keeping
      deeper command runtime behavior partial.
- [ ] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Completed Slice: command semantic conflict parity-smoke evidence

ASSUMPTIONS:
1. Rust `Config error:` prefix is authoritative for semantic parser conflicts
   that happen before runtime.
2. This slice only changes deterministic validation stderr; successful command
   parsing and runtime dispatch stay unchanged.

PLAN:
- [x] Align Node semantic conflict validation errors with Rust `Config error:`
      output for implementation, pipeline, and review parser surfaces.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative semantic
      conflicts in plain and JSON global modes.
- [x] Update parity docs/tests to cite semantic conflict evidence while keeping
      deeper command runtime behavior partial.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: command semantic conflict parity-smoke evidence

- Aligned Node semantic parser conflict failures with Rust `Config error:`
  output for implementation, pipeline, and review parser surfaces.
- Added Rust-vs-Node smoke scenarios for representative implementation
  task/file, resume/task, mutually exclusive mode, continue/fail-fast, pipeline,
  review, and JSON-mode conflicts.
- Updated the command parser validation matrix/tests while leaving deeper
  runtime behavior partial.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/docs.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario command-implement-task-file-conflict,json-command-implement-task-file-conflict,command-implement-resume-task-conflict,command-implement-wave-per-task-conflict,command-implement-continue-failfast-conflict,command-pipeline-wave-per-task-conflict,command-review-files-base-conflict`,
  `npm run lint`, `npm test -- --test-reporter=dot`,
  `npm run parity:smoke`, and `git -C node-cli diff --check`.

## Completed Slice: command boolean inline-value parity-smoke evidence

ASSUMPTIONS:
1. Rust clap output is authoritative for command boolean flags that reject
   inline values such as `--force=true` or `--resume=true`.
2. This slice only changes deterministic parse failures; valid boolean flag
   behavior and runtime dispatch stay unchanged.

PLAN:
- [x] Align Node command boolean inline-value failures with Rust `Config error:`
      output for representative low-runtime, phase, implementation, review,
      goal, and queue parser surfaces.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative boolean
      inline-value failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite boolean inline-value evidence while
      keeping deeper command runtime behavior partial.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: command boolean inline-value parity-smoke evidence

- Aligned command boolean inline-value failures with Rust `Config error:`
  output for representative low-runtime, phase, implementation, review, goal,
  and queue parser surfaces.
- Fixed parser branches that previously accepted inline values for `resume
  --dry-run`, `reset --wave-lock`, and `verify --manual/--resume`.
- Added Rust-vs-Node smoke scenarios for representative plain and JSON
  boolean inline-value failures and updated parser/runtime/docs tests.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/docs.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario command-init-force-inline-value,json-command-init-force-inline-value,command-resume-dry-run-inline-value,command-reset-wave-lock-inline-value,command-verify-manual-inline-value,command-plan-resume-inline-value,command-implement-per-task-inline-value,command-review-single-agent-inline-value,command-goal-run-inline-value,command-queue-run-inline-value`,
  `npm run lint`, `npm test -- --test-reporter=dot`,
  `npm run parity:smoke`, and `git -C node-cli diff --check`.

## Completed Slice: required command argument parity-smoke evidence

ASSUMPTIONS:
1. Rust clap output is authoritative for required command parser arguments:
   `approve`/`reject` phase, `reject --reason`, and `pipeline --phases`.
2. This slice only changes deterministic parse failures; successful command
   behavior and runtime dispatch stay unchanged.

PLAN:
- [x] Align Node required command argument failures with Rust `Config error:`
      output for approval, rejection, and pipeline parser surfaces.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative required
      argument failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite required-argument evidence while keeping
      deeper runtime behavior partial.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: required command argument parity-smoke evidence

- Aligned Node required command parser failures with Rust `Config error:`
  output for missing `approve` phase, missing `reject` phase/reason/both
  requireds, and missing `pipeline --phases`.
- Added Rust-vs-Node smoke scenarios for plain and JSON required-argument
  failures for approval and pipeline parser paths, plus rejection requireds.
- Updated the command parser validation matrix/tests while leaving queue
  missing-subcommand help output as an explicit partial boundary.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/docs.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario command-approve-missing-phase,json-command-approve-missing-phase,command-reject-missing-phase,command-reject-missing-reason,command-reject-missing-requireds,command-pipeline-required-phases,json-command-pipeline-required-phases`,
  `npm run lint`, `npm test -- --test-reporter=dot`,
  `npm run parity:smoke`, and `git -C node-cli diff --check`.

## Completed Slice: command parser validation parity-smoke evidence

ASSUMPTIONS:
1. Rust clap output is authoritative for deterministic command parser failures
   that do not enter agent/provider runtime.
2. This slice only normalizes validation failures; successful command behavior
   and runtime dispatch stay unchanged.

PLAN:
- [x] Align Node unknown command, unknown subcommand, unexpected argument, and
      missing command-option value errors with Rust `Config error:` output.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative command parser
      failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite validation evidence while keeping runtime
      behavior partial where command execution is still incomplete.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: command parser validation parity-smoke evidence

- Aligned Node command parser failures with Rust `Config error:` output for
  unknown top-level commands, generic unexpected command arguments, missing
  command-option values, and unknown queue subcommands.
- Added Rust-vs-Node smoke scenarios for plain and JSON unknown commands,
  plain and JSON unexpected `status` arguments, representative missing
  `--file`/`--files` values, and unknown queue subcommands.
- Added a command parser validation block to the parity matrix and docs tests
  while keeping broader command-specific semantic validation partial.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/docs.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario command-unknown,json-command-unknown,command-status-extra,json-command-status-extra,command-plan-file-missing,command-review-files-missing,command-queue-unknown-subcommand`,
  `npm run lint`, `npm test -- --test-reporter=dot`,
  `npm run parity:smoke`, and `git -C node-cli diff --check`.

## Completed Slice: action override validation parity-smoke evidence

ASSUMPTIONS:
1. Rust action override parse/collection errors are authoritative for
   `--*-model`, `--*-effort`, `--action-model`, and `--action-effort`.
2. This slice only changes deterministic validation failures; successful
   override ordering and provider resolution remain unchanged.

PLAN:
- [x] Align Node missing-value and semantic validation errors for model/effort
      override flags with Rust `Config error:` output.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative action override
      failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite validation evidence while keeping provider
      invocation behavior partial.
- [x] Verify focused parser/docs/smoke tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: action override validation parity-smoke evidence

- Aligned Node action override validation failures with Rust `Config error:`
  output for missing `--*-model`, missing/invalid `--*-effort`,
  `--action-model`, and `--action-effort` values.
- Added Rust-vs-Node smoke scenarios for representative missing-value, invalid
  shape, unknown action, invalid effort, and JSON-mode invalid effort failures.
- Updated parity docs/tests to cite validation evidence while keeping provider
  invocation behavior partial.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/docs.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario global-plan-model-missing,global-plan-effort-missing,global-plan-effort-invalid,global-action-model-missing,global-action-model-invalid-shape,global-action-model-unknown-action,global-action-effort-missing,global-action-effort-invalid-shape,global-action-effort-invalid-effort,global-action-effort-unknown-action,json-global-plan-effort-invalid`,
  `npm run lint`, `npm test -- --test-reporter=dot`,
  `npm run parity:smoke`, and `git -C node-cli diff --check`.

## Completed Slice: global option validation parity-smoke evidence

ASSUMPTIONS:
1. Rust clap output is authoritative for deterministic global-option parse
   failures.
2. This slice should stay at the parser boundary and avoid changing successful
   command behavior.

PLAN:
- [x] Align Node global option validation errors with Rust for missing value,
      invalid `--requirements-workflow`, approval-flag conflict, boolean values,
      and unknown leading options.
- [x] Add Rust-vs-Node parity-smoke scenarios for representative global-option
      failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite global option validation evidence while
      keeping runtime behavior partial where agent execution is still missing.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: global option validation parity-smoke evidence

- Aligned Node global-option parse failures with Rust clap-shaped
  `Config error:` output for missing values, invalid `--requirements-workflow`,
  approval-flag conflicts, boolean inline values, and unknown leading options.
- Added Rust-vs-Node smoke scenarios for representative global-option failures,
  including JSON global mode for invalid `--requirements-workflow`.
- Updated parity docs/tests to cite validation evidence while keeping runtime
  behavior partial for options whose effect depends on agent/provider execution.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario global-requirements-workflow-invalid,global-requirements-workflow-missing,global-session-missing,global-implementer-missing,global-reviewer-missing,global-plan-approval-conflict,global-simple-unexpected-value,global-unknown-leading-option,json-global-requirements-workflow-invalid`,
  `npm test -- test/docs.test.js test/parser.test.js test/commands.test.js test/parity-smoke.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: completions validation parity-smoke evidence

ASSUMPTIONS:
1. Rust clap errors are authoritative for `completions` argument validation.
2. Exact generated completion script output remains partial; this slice only
   aligns missing, invalid, and unexpected shell argument failures.

PLAN:
- [x] Align Node `completions` missing/invalid/extra argument errors with Rust.
- [x] Add Rust-vs-Node parity-smoke scenarios for `completions` validation
      failures in plain and JSON global modes.
- [x] Update parity docs/tests to cite validation evidence while keeping exact
      `clap_complete` output as an explicit gap.
- [x] Verify focused parser/command/docs/smoke tests, lint, full Node tests,
      smoke parity, and diff hygiene.

## Review: completions validation parity-smoke evidence

- Aligned Node `completions` validation failures with Rust clap-shaped
  `Config error:` output for missing shell, invalid shell, and unexpected
  extra argument cases.
- Added Rust-vs-Node smoke scenarios for missing-shell, invalid-shell,
  extra-argument, and JSON-mode invalid-shell validation failures.
- Updated parity docs and unsupported docs to cite validation parity while
  keeping exact generated Rust `clap_complete` output marked partial.
- Verification: `npm test -- test/parser.test.js test/commands.test.js test/parity-smoke.test.js`,
  `npm run parity:smoke -- --scenario completions-missing-shell,completions-invalid-shell,completions-extra-argument,json-completions-invalid-shell`,
  `npm test -- test/docs.test.js test/parser.test.js test/commands.test.js test/parity-smoke.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: init parity-smoke evidence

ASSUMPTIONS:
1. Rust `init` behavior is authoritative for exit codes and stdout/stderr
   routing, while Node's `.agent-loop.json` output is an intentional divergence.
2. Smoke coverage should normalize only the expected `.agent-loop.toml` vs
   `.agent-loop.json` filename/path text and still compare the command result.

PLAN:
- [x] Add Rust-vs-Node parity-smoke scenarios for default `init`, JSON `init`,
      existing config refusal, and `init --force`.
- [x] Compare canonical config-file creation using Rust's TOML file and Node's
      JSON file without pretending the contents are byte-compatible.
- [x] Update parity docs/tests to cite the `init` smoke evidence and the
      intentional filename normalization.
- [x] Verify focused smoke/docs tests, lint, full Node tests, smoke parity, and
      diff hygiene.

## Review: init parity-smoke evidence

- Added Rust-vs-Node smoke scenarios for default `init`, JSON `init`,
  existing canonical config refusal, and `init --force`.
- Normalized only the intentional `.agent-loop.toml` vs `.agent-loop.json`
  filename/path output difference, while still comparing stdout, stderr, and
  exit code.
- Added canonical config file-pair presence checks so Rust's TOML file and
  Node's JSON file are both verified after the smoke scenarios.
- Updated the parity matrix and docs tests to cite the new `init` smoke
  evidence and keep the JSON/TOML divergence explicit.
- Verification: `npm run parity:smoke -- --scenario init-empty,json-init-empty,init-existing-config,init-force-existing-config`,
  `npm test -- test/docs.test.js test/parity-smoke.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: session validation parity-smoke evidence

ASSUMPTIONS:
1. Rust `cli/src/config/session.rs` is the source of truth for session-name
   validation and error text.
2. Node should keep validation centralized in `src/state/paths.js` and avoid a
   broader parser rewrite for this slice.

PLAN:
- [x] Align Node session-name validation with Rust for empty, too-long, and
      invalid-character values.
- [x] Add Rust-vs-Node parity-smoke scenarios for invalid `--session` values.
- [x] Update parity docs/tests to cite session validation evidence while keeping
      broader session runtime gaps explicit.
- [x] Verify focused tests/smoke, lint, full Node tests, smoke parity, and diff
      hygiene.

## Review: session validation parity-smoke evidence

- Aligned Node session-name validation with Rust for empty, invalid-character,
  and too-long values, including Rust-style `Config error:` text.
- Preserved JSON error events for non-`Config error:` failures while matching
  Rust's plain stderr behavior for config validation failures under `--json`.
- Added Rust-vs-Node smoke scenarios for empty, invalid-character, too-long,
  and JSON-mode invalid session names.
- Updated parity docs/tests to cite session validation evidence while leaving
  broader resume and agent-invocation session behavior marked partial.
- Verification: `npm test -- test/state.test.js test/commands.test.js`,
  `npm run parity:smoke -- --scenario status-empty-session-name,status-invalid-session-name,status-too-long-session-name,json-status-invalid-session-name`,
  `npm test -- test/docs.test.js test/state.test.js test/commands.test.js test/parity-smoke.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: session status parity-smoke evidence

- [x] Compare Rust and Node `--session demo status` with session-scoped state.
- [x] Add a Rust-vs-Node parity-smoke scenario for session-scoped `status`.
- [x] Update parity docs/ledger to cite `--session` status path evidence while
      keeping broader session runtime gaps explicit.
- [x] Verify focused smoke/docs tests, lint, full Node tests, smoke parity, and
      diff hygiene.

## Review: session status parity-smoke evidence

- Added Rust-vs-Node parity-smoke scenarios for plain and JSON
  `--session demo status` using `.agent-loop/state/demo/status.json`.
- The smoke harness now compares stdout, stderr, exit code, and the
  session-scoped `status.json` fixture for this global option path.
- Updated the global option matrix to cite session status evidence while keeping
  resume and agent-invocation session behavior marked partial.
- Verification: `npm test -- test/docs.test.js test/parity-smoke.test.js test/state.test.js`,
  `npm run parity:smoke -- --scenario status-session-initialized-plan,json-status-session-initialized-plan`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: config discovery parity boundary

- [x] Add focused runtime tests for `.agent-loop.toml` discovery warnings when
      no `.agent-loop.json` exists.
- [x] Add focused runtime tests for `.agent-loop.json` precedence when both
      config files exist.
- [x] Update parity docs/ledger to describe the runtime config-file divergence
      with test evidence.
- [x] Verify focused config/docs tests, lint, full Node tests, smoke parity,
      and diff hygiene.

## Review: config discovery parity boundary

- Strengthened runtime config discovery tests for the intentional divergence:
  Rust reads `.agent-loop.toml`, while Node reads `.agent-loop.json`.
- The TOML-only path now proves Node ignores the TOML values, keeps defaults,
  and emits a migration warning to stderr.
- The TOML-plus-JSON path now proves JSON wins, the TOML is reported as ignored,
  and the warning is emitted to stderr.
- Updated parity docs and unsupported docs so the config-file divergence,
  TOML discovery warning, and JSON precedence behavior stay explicit.
- Verification: `npm test -- test/config.test.js test/docs.test.js test/commands.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: completions parity boundary audit

- [x] Compare representative Rust and Node `completions` output for bash, fish,
      and zsh.
- [x] Update parity docs/ledger so `completions` does not claim byte-for-byte
      Rust `clap_complete` parity.
- [x] Add focused docs coverage for the explicit completions boundary.
- [x] Verify focused docs tests, lint, full Node tests, smoke parity, and diff
      hygiene.

## Review: completions parity boundary audit

- Audited Rust-vs-Node `completions` output for bash, fish, and zsh. Rust emits
  full `clap_complete` command/option trees for `agent-loop`; Node emits compact
  custom scripts for both `agent-loop` and `agent-loop-node`.
- Updated the parity matrix and unsupported docs to mark `completions` as
  partial for exact generated-output parity instead of covered.
- Added focused docs coverage so the `clap_complete` boundary and
  `agent-loop-node` alias difference stay explicit.
- Verification: `npm test -- test/docs.test.js test/parser.test.js test/commands.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: analyze-coverage JSON parity-smoke evidence

- [x] Confirm Rust-vs-Node JSON `analyze-coverage` output can be smoke-compared
      without broad harness changes.
- [x] Add JSON parity-smoke scenarios for complete and incomplete
      `analyze-coverage` paths.
- [x] Update parity docs/ledger to cite JSON smoke evidence instead of
      Node-only JSON coverage.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: analyze-coverage JSON parity-smoke evidence

- Added Rust-vs-Node JSON parity-smoke scenarios for complete and incomplete
  `analyze-coverage` paths, reusing the same fixtures as the existing plain
  output cases.
- Updated parity docs and unsupported-command notes so JSON `analyze-coverage`
  coverage is smoke-backed rather than only Node-test-backed.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario analyze-coverage-complete,json-analyze-coverage-complete,analyze-coverage-incomplete,json-analyze-coverage-incomplete`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: analyze-coverage parity-smoke evidence

- [x] Add Rust-vs-Node parity-smoke scenarios for missing `spec.md` and missing
      `tasks.md` error paths.
- [x] Add Rust-vs-Node parity-smoke scenarios for incomplete coverage with
      missing requirements and orphan task blocks.
- [x] Compare stdout, stderr, exit code, and plain output for the new
      `analyze-coverage` scenarios.
- [x] Update parity docs/ledger to cite expanded `analyze-coverage` smoke
      evidence.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: analyze-coverage parity-smoke evidence

- Added Rust-vs-Node parity-smoke scenarios for missing `spec.md`, missing
  `tasks.md`, and incomplete coverage with an uncovered requirement plus an
  orphan task block.
- Matched Rust's `State error:` prefix for missing `analyze-coverage` state
  files while preserving the existing coverage reporting behavior.
- Updated parity docs to cite complete, missing-state, and incomplete plain
  output smoke evidence; JSON output remains covered by focused Node tests.
- Verification: `npm test -- test/commands.test.js test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario analyze-coverage-missing-spec,analyze-coverage-missing-tasks,analyze-coverage-incomplete`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: approval command parity-smoke evidence

- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `approve plan`.
- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `reject plan --reason`.
- [x] Compare stdout, stderr, exit code, per-decision `response.json`, and
      legacy `decision_response.json` state files for approval commands.
- [x] Update parity docs/ledger to cite approval smoke evidence and keep broader
      approval-gate orchestration gaps explicit.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: approval command parity-smoke evidence

- Added seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
  `approve plan` and plain/JSON `reject plan --reason`.
- The smoke harness now compares stdout, stderr, exit code,
  `.agent-loop/state/decisions/<decision_id>/response.json`, and legacy
  `.agent-loop/state/decision_response.json`; `chosen_at` is normalized as a
  dynamic timestamp.
- Updated parity docs to cite approval smoke evidence while keeping broader
  plan approval gate orchestration under the `plan`/pipeline runtime gaps.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario approve-plan,json-approve-plan,reject-plan,json-reject-plan`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: goal lifecycle parity-smoke evidence

- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `goal status`.
- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `goal resume` and `goal clear`, including `goal.lock` where mutation
      should touch the lock file.
- [x] Compare stdout, stderr, exit code, `goal.json`, and lock-file state for
      the new lifecycle scenarios.
- [x] Update parity docs/ledger to cite expanded goal lifecycle fixture evidence
      while keeping supervisor creation/resume and budget checkpoint gaps
      explicit.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: goal lifecycle parity-smoke evidence

- Added seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
  `goal status`, plain/JSON `goal resume`, and plain/JSON `goal clear`.
- Updated the existing seeded `goal pause` smoke scenario to compare
  `goal.lock` as well as `goal.json`, so mutating lifecycle commands now prove
  lock-file creation in the smoke harness.
- Updated parity docs to cite seeded status/pause/resume/clear lifecycle
  fixture evidence while keeping goal creation supervisor execution, budget
  checkpoints, supervisor checkpoints, and full flock parity as open gaps.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario goal-status-seeded,json-goal-status-seeded,goal-resume-seeded,json-goal-resume-seeded,goal-clear-seeded,json-goal-clear-seeded,goal-pause-state`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: queue add parity-smoke evidence

- [x] Add scenario-local parity-smoke normalization for generated queue IDs
      without weakening seeded exact-ID queue fixtures.
- [x] Add plain/JSON Rust-vs-Node `queue add` parity-smoke scenarios.
- [x] Compare stdout, stderr, exit code, and `goal-queue.json` state for
      `queue add`.
- [x] Update parity docs/ledger to cite smoke-backed `queue add` evidence and
      the normalized random-ID boundary.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: queue add parity-smoke evidence

- Added scenario-local parity-smoke normalization for generated `queue_id`
  fields and the short ID in plain `queue add` output, without changing exact
  ID checks for seeded queue fixtures.
- Added plain/JSON Rust-vs-Node `queue add` scenarios comparing stdout,
  stderr, exit code, and `goal-queue.json` state with generated IDs normalized.
- Updated parity docs to cite smoke-backed `queue add` evidence alongside the
  existing seeded list/status/pause/resume/cancel queue fixture comparisons.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario queue-add,json-queue-add`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: queue list/cancel parity-smoke evidence

- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `queue list`.
- [x] Add seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
      `queue cancel`.
- [x] Compare stdout, stderr, exit code, and `goal-queue.json` state for the
      new scenarios.
- [x] Update parity docs/ledger to cite expanded lifecycle fixture evidence and
      keep random-ID `queue add` evidence separate.
- [x] Verify focused parity tests, docs tests, lint, full Node tests, smoke
      parity, and diff hygiene.

## Review: queue list/cancel parity-smoke evidence

- Added seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
  `queue list` and plain/JSON `queue cancel`, comparing stdout, stderr, exit
  code, and `goal-queue.json` state.
- Updated the parity matrix and unsupported docs to state that seeded
  list/status/pause/resume/cancel queue fixtures are smoke-compared against
  Rust, while `queue add` remains covered by focused Node tests because both
  CLIs generate random queue IDs.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario queue-list-seeded,json-queue-list-seeded,queue-cancel-seeded,json-queue-cancel-seeded`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: queue lifecycle parity-smoke evidence

- [x] Confirm queue lifecycle implementation already has focused Node coverage
      and direct Rust source evidence for status/mutation output.
- [x] Add deterministic Rust-vs-Node parity-smoke scenarios for seeded
      `queue status`, `queue pause`, and `queue resume` paths.
- [x] Compare stdout, stderr, exit code, and `goal-queue.json` state for the
      new scenarios.
- [x] Update parity docs/ledger to cite the stronger queue lifecycle evidence.
- [x] Verify focused parity tests, lint, full Node tests, smoke parity, and diff
      hygiene.

## Review: queue lifecycle parity-smoke evidence

- Added seeded Rust-vs-Node parity-smoke scenarios for plain/JSON
  `queue status`, plain/JSON `queue pause`, and plain `queue resume`,
  comparing stdout, stderr, exit code, and `goal-queue.json` state.
- Updated the parity matrix and unsupported docs to cite the stronger queue
  lifecycle evidence while keeping supervisor sync/finalization, interruptions,
  budget limits, unsupported runtime failures, and full flock locking as open
  gaps.
- Verification: `npm test -- test/parity-smoke.test.js test/docs.test.js`,
  `npm run parity:smoke -- --scenario queue-status-seeded,json-queue-status-seeded,queue-pause-seeded,json-queue-pause-seeded,queue-resume-seeded`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: active queue non-zero resume finalization

- [x] Compare Rust and Node behavior for `resume` with an active queue item,
      active goal, and a supported non-zero `next` fallback route.
- [x] Add focused tests showing `resume` finalizes the queue item as blocked
      while leaving the active goal active after a supported non-zero route.
- [x] Add a parity-smoke scenario comparing stdout, stderr, exit code, and
      `goal-queue.json` state for the non-zero route.
- [x] Update the existing resume finalization helper to finalize queues for
      supported non-zero routes without completing goals or broadening
      unsupported supervisor/pipeline boundaries.
- [x] Update parity docs/ledger and verify focused tests, lint, smoke parity,
      and diff hygiene.

## Review: active queue non-zero resume finalization

- Plain `resume` now leaves active goals active and finalizes active queue
  items to `blocked` with `Queue run exited with code 1.` after supported
  `next` hard-error routes, matching Rust for the deterministic non-zero
  fallback subset.
- The parity smoke harness now compares `resume-active-queue-error` across
  stdout, stderr, exit code, `goal.json`, and `goal-queue.json`.
- Verification: `npm test -- test/parser.test.js test/commands.test.js`,
  `npm test -- test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: active queue resume finalization

- [x] Compare Rust and Node behavior for `resume` with an active queue item,
      active goal, and a supported complete `next` fallback route.
- [x] Add focused tests showing `resume` finalizes the queue item after a
      supported successful route in plain and JSON modes.
- [x] Add a small queue state helper that maps the active goal status and exit
      code into Rust-compatible queue finalization.
- [x] Wire non-dry `resume` to finalize active queue items without broadening
      supervisor or pipeline runtime scope.
- [x] Update parity docs/ledger and verify focused tests, lint, smoke parity,
      and diff hygiene.

## Review: active queue resume finalization

- Plain `resume` now completes an already-active goal after a supported
  successful route, matching Rust resume finalization for the supported
  success subset.
- Plain/JSON `resume` now finalizes active queue items to `done` with
  `Queue item completed.` after supported successful routes, while leaving
  unsupported supervisor/pipeline boundaries and non-zero/interrupted/
  budget-limit finalization as explicit gaps.
- Verification: `npm test -- test/parser.test.js test/commands.test.js`,
  `npm test -- test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

## Completed Slice: goal resume run and resume-next routing

- [x] Compare Rust and Node behavior for `goal resume --run` when no resumable
      state exists in plain and JSON modes, and for non-dry `resume` when the
      fallback `next` route is complete.
- [x] Route `goal resume --run` through the existing Node `resume` router after
      reactivating the goal, instead of stopping at an unsupported boundary.
- [x] Route non-dry `resume` fallback into the existing Node `next` command
      instead of treating computed `complete` as unsupported.
- [x] Add focused tests for no-state plain/JSON parity, resume complete
      fallback, and successful supported goal-run finalization.
- [x] Update parity docs/ledger and verify focused tests, lint, smoke parity,
      and diff hygiene.

## Review: goal resume run and resume-next routing

- `goal resume --run` now reactivates the goal, delegates through the existing
  `resume` router, preserves no-state plain/JSON behavior, and finalizes the
  current goal when a supported resume route succeeds.
- Non-dry `resume` fallback now delegates into `next` instead of returning a
  computed command boundary, including the complete route and supported state
  shell paths.
- Verification: `npm test -- test/parser.test.js test/commands.test.js`,
  `npm test -- test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js`,
  `npm run lint`, `npm test -- --test-reporter=dot`, `npm run parity:smoke`,
  and `git -C node-cli diff --check`.

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
- Implementation-capable pipeline aliases and dedicated workflows now parse
  Rust-shaped implement flags and phase metadata before routing through the
  pipeline runner where the supported first-pass phase composition exists.
- `chain` now parses Rust-shaped plan file arguments, validates files, writes
  `.agent-loop/chain.json`, resumes at the first incomplete result, runs
  supported direct Node command steps sequentially, archives successful state,
  and records non-zero step failures. The Rust default `plan-tasks-implement`
  now routes through the dedicated first-pass workflow path; broader
  compound/pipeline step dispatch remains partial.
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
  routing, non-dry-run supervisor, pipeline, interrupted workflow, and `next`
  fallback routes print Rust's pre-runtime messages before handoff, and
  supported successful resume routes complete active goals and finalize active
  queue items to `done`. Supported `next` hard-error routes now leave active
  goals active and finalize active queue items to `blocked`. Interrupted
  workflow routes now delegate to the existing Node resume command shells
  instead of a generic unsupported handler. Full pipeline, supervise, phase
  execution, interruption finalization, budget-limit finalization, and
  unsupported-runtime finalization paths remain partial.
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
  supervisor-run boundary. `goal resume --run` now marks the goal active,
  clears the pause reason, delegates through `resume`, and completes the goal
  when a supported route succeeds. Plain `resume` also completes an active goal
  after a supported successful route.
- `queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`,
  and `queue cancel` now parse and execute as lifecycle commands
  against Rust-compatible `goal-queue.json`. Mutating commands create
  `goal-queue.lock`; title derivation, dependency normalization, terminal item
  protection, plain/JSON output, and exit codes match the supported Rust paths.
  `queue resume <id> --run` now performs Rust-shaped state prep by marking the
  item runnable, activating it, deferring any previous active run, and creating
  active `goal.json`; plain/JSON `resume` finalizes active queue items to
  `done` after supported successful routes and `blocked` after supported
  `next` hard-error routes. Supervisor execution and broader
  interrupted/budget-limit/unsupported-runtime finalization remain unsupported.
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

- 2026-06-17: Ported TUI command-surface help parity while keeping the runtime
  explicitly unsupported. `tui --help` and `help tui` now route through
  `formatCommandHelpText` with Rust-shaped title, usage, `[PATH]...`
  arguments, shared options, JSON help event, and elapsed handling. Plain
  `tui` still exits through the unsupported-command boundary because the
  interactive dashboard runtime is not ported. Verification: Rust-vs-Node spot
  checks for `tui --help` and `--json help tui` matched command header, usage,
  arguments, option ordering, JSON event type, exit 0, and clean stderr with
  only Clap padding whitespace differences; `npm test --
  test/parser.test.js test/commands.test.js` (220 passing); `npm test --
  test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js` (8
  passing); `npm run lint` (86 JavaScript files); `npm test --
  --test-reporter=dot` (passed); `npm run parity:smoke` (45 scenarios); and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for hidden pipeline aliases such as
  `spec-plan`, `plan-tasks`, `spec-plan-implement`, and
  `plan-implement-verify`. Alias help is now generated from
  `pipelineAliases.js` metadata with Rust-shaped titles, usage forms,
  positional/option-task argument handling, implement flag ordering, and JSON
  help events. Representative parser and command tests cover prep aliases,
  spec-leading implement aliases, title overrides, and option-task
  implement/verify aliases. Verification: Rust-vs-Node spot checks for
  `plan-tasks --help`, `spec-plan-implement --help`, and
  `--json help plan-implement-verify` matched command headers, usage, option
  ordering, JSON event type, exit 0, and clean stderr with only Clap padding
  whitespace differences; `npm test -- test/parser.test.js test/commands.test.js`
  (218 passing); `npm test -- test/docs.test.js test/parity-smoke.test.js
  test/bin-entrypoint.test.js` (8 passing); `npm run lint` (86 JavaScript
  files); `npm test -- --test-reporter=dot` (passed); `npm run parity:smoke`
  (45 scenarios); and `git diff --check`. No Rust build was created; `cargo
  clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for dedicated implementation
  workflow commands: `plan-implement`, `tasks-implement`, and
  `plan-tasks-implement`. These now route through `formatCommandHelpText` for
  direct `--help`, `help <command>`, and JSON help event forms. The planning
  workflow help shape mirrors Rust's positional task argument, discovery,
  resume, single-agent, per-task/wave, retry, model override, and effort flags;
  `tasks-implement` mirrors Rust's existing-plan/file-oriented option order.
  Verification: Rust-vs-Node spot checks for `plan-implement --help`, `help
  tasks-implement`, and `--json plan-tasks-implement --help` confirmed matching
  command headers/usage/options, JSON event type, exit 0, and clean stderr with
  only Clap padding whitespace differences on blank option descriptions; `npm
  test -- test/parser.test.js test/commands.test.js` (216 passing); `npm test
  -- test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js`
  (8 passing); `npm run lint` (86 JavaScript files); `npm test --
  --test-reporter=dot` (passed); `npm run parity:smoke` (45 scenarios); and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for orchestration commands:
  `pipeline` and `supervise`. Both now route through `formatCommandHelpText`
  for direct `--help`, `help <command>`, and JSON help event forms. Dedicated
  option blocks mirror Rust's command-specific order for phase selection,
  task/file input, discovery, resume, queue mode, single-agent, implement-mode,
  model override, and effort flags. Verification: Rust-vs-Node spot checks for
  `supervise --help` and `--json help pipeline` confirmed matching command
  headers/usage/options, JSON event type, exit 0, and clean stderr with only
  Clap padding whitespace differences on blank option descriptions; `npm test
  -- test/parser.test.js test/commands.test.js` (214 passing); `npm test --
  test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js` (8
  passing); `npm run lint` (86 JavaScript files); `npm test --
  --test-reporter=dot` (passed); `npm run parity:smoke` (45 scenarios); and
  `git diff --check`. No Rust build was created; `cargo clean --manifest-path
  cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for implementation commands:
  `implement` and `implement-verify`. Both now route through
  `formatCommandHelpText` for direct `--help`, `help <command>`, and JSON help
  event forms. A shared implement-mode help block mirrors Rust's option order
  for task/file input, resume, single-agent, per-task/wave, retry, parallelism,
  action override, and effort flags. Verification: Rust-vs-Node spot checks for
  `implement --help` and `--json help implement-verify` confirmed matching
  command headers/usage/options, JSON event type, exit 0, and clean stderr with
  only Clap padding whitespace differences on blank option descriptions;
  `npm test -- test/parser.test.js test/commands.test.js` (212 passing);
  `npm test -- test/docs.test.js test/parity-smoke.test.js
  test/bin-entrypoint.test.js` (8 passing); `npm run lint` (86 JavaScript
  files); `npm test -- --test-reporter=dot` (passed);
  `npm run parity:smoke` (45 scenarios); and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for direct runtime commands:
  `inline`, `review`, `verify`, `discuss`, and `chain`. These now route
  through `formatCommandHelpText` for direct `--help`, `help <command>`, and
  JSON help event forms. The command headers, usage lines, argument sections,
  command-specific options, and option ordering follow the Rust help surface;
  Node keeps its existing `.agent-loop.json` wording in the shared extended
  help. Verification: Rust-vs-Node spot checks for `inline --help`, `help
  review`, `--json verify --help`, `discuss --help`, and `--json help chain`
  confirmed matching command headers/usage/options, JSON event type, exit 0,
  and clean stderr with only Clap padding whitespace differences on blank
  `--session` descriptions; `npm test -- test/parser.test.js
  test/commands.test.js` (210 passing); `npm test -- test/docs.test.js
  test/parity-smoke.test.js test/bin-entrypoint.test.js` (8 passing);
  `npm run lint` (86 JavaScript files); `npm test -- --test-reporter=dot`
  (passed); `npm run parity:smoke` (45 scenarios); and `git diff --check`.
  No Rust build was created; `cargo clean --manifest-path cli/Cargo.toml` was
  not needed.
- 2026-06-17: Ported command-specific help for phase commands: `spec`, `plan`,
  and `tasks`. These now route through `formatCommandHelpText` for direct
  `--help`, `help <command>`, and JSON help event forms. The command headers,
  usage lines, arguments, and phase-specific option ordering follow the Rust
  help surface; Node keeps its existing `.agent-loop.json` wording in the
  shared extended help. Verification: Rust-vs-Node spot checks for `spec
  --help`, `help plan`, and `--json tasks --help` confirmed matching command
  headers/usage/options, JSON event type, exit 0, and clean stderr with only
  Clap padding whitespace differences on blank phase option descriptions;
  `npm test -- test/parser.test.js test/commands.test.js` (208 passing);
  `npm test -- test/docs.test.js test/parity-smoke.test.js
  test/bin-entrypoint.test.js` (8 passing); `npm run lint` (86 JavaScript
  files); `npm test -- --test-reporter=dot` (passed);
  `npm run parity:smoke` (45 scenarios); and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for supported read-only/routing
  commands: `analyze-coverage`, `next`, `resume`, `list-agents`, and
  `version`. These now route through `formatCommandHelpText` for direct
  `--help`, `help <command>`, and JSON help event forms. The command-specific
  option lines for `next --task/--file` and `resume --dry-run` match the Rust
  help surface, while Node keeps the shared `.agent-loop.json` extended-help
  wording. Verification: Rust-vs-Node spot checks for `analyze-coverage
  --help`, `help next`, `resume --help`, `list-agents --help`, and
  `--json help version` confirmed matching command headers/usage/options, exit
  0, and clean stderr with only formatting whitespace differences on empty
  `--session` descriptions; `npm test -- test/parser.test.js
  test/commands.test.js` (206 passing); `npm test -- test/docs.test.js
  test/parity-smoke.test.js test/bin-entrypoint.test.js` (8 passing);
  `npm run lint` (86 JavaScript files); `npm test -- --test-reporter=dot`
  (passed); `npm run parity:smoke` (45 scenarios); and `git diff --check`.
  No Rust build was created; `cargo clean --manifest-path cli/Cargo.toml` was
  not needed.
- 2026-06-17: Ported command-specific help for lifecycle/control commands:
  `goal`, `queue`, `approve`, and `reject`. These now route through
  `formatCommandHelpText` for direct `--help`, `help <command>`, and JSON help
  event forms, while preserving Node's `.agent-loop.json` wording in the
  shared extended help. The `goal` help includes Rust's lifecycle subcommands,
  objective argument, goal-specific options, and implement-mode flags; `queue`
  lists the queue subcommands; `approve`/`reject` include the required phase
  argument and rejection reason help. Verification: Rust-vs-Node spot checks
  for `goal --help`, `help queue`, `approve --help`, and `--json help reject`
  confirmed matching command headers/usage/argument sections, exit 0, and
  clean stderr with only formatting whitespace differences on empty `--session`
  descriptions; `npm test -- test/parser.test.js test/commands.test.js` (204
  passing); `npm test -- test/docs.test.js test/parity-smoke.test.js
  test/bin-entrypoint.test.js` (8 passing); `npm run lint` (86 JavaScript
  files); `npm test -- --test-reporter=dot` (passed);
  `npm run parity:smoke` (45 scenarios); and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported command-specific help for the low-runtime `reset`,
  `init`, and `completions` commands. These now route through the same
  `formatCommandHelpText` path as `status`, including `help <command>` and
  JSON help events, while preserving Node's intentional `.agent-loop.json`
  config wording. Added a small shared command-options formatter so command
  help stays simple and does not duplicate the global flag block per command.
  Verification: Rust-vs-Node spot checks for `reset --help`, `help init`, and
  `--json help completions` confirmed matching command headers/usage,
  supported shell values, exit 0, and clean stderr with only the expected TOML
  vs JSON wording difference; `npm test -- test/parser.test.js
  test/commands.test.js` (202 passing); `npm test -- test/docs.test.js
  test/parity-smoke.test.js test/bin-entrypoint.test.js` (8 passing);
  `npm run lint` (86 JavaScript files); `npm test -- --test-reporter=dot`
  (passed); `npm run parity:smoke` (45 scenarios); and `git diff --check`.
  No Rust build was created; `cargo clean --manifest-path cli/Cargo.toml` was
  not needed.
- 2026-06-17: Ported the first command-specific help slice. `status --help`
  and `help status` now render Rust-shaped status command help instead of
  falling back to global help, including JSON help events for `--json status
  --help` and `--json help status`. The status help keeps Node's intentional
  `.agent-loop.json` wording in the shared extended help block; broader
  subcommand help remains a future command-by-command parity task. Verification:
  Rust-vs-Node spot checks for plain `status --help` and JSON `help status`;
  `npm test -- test/parser.test.js test/commands.test.js` (200 passing);
  `npm test -- test/docs.test.js test/parity-smoke.test.js
  test/bin-entrypoint.test.js` (8 passing); `npm run lint` (86 JavaScript
  files); `npm test -- --test-reporter=dot` (passed);
  `npm run parity:smoke` (45 scenarios); and `git diff --check`. No Rust build
  was created; `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Fixed the unknown leading global option parser boundary. Rust
  rejects `agent-loop --wat` with exit 1 and no stdout; Node previously treated
  the unknown option as no-command help and exited 0. `parseCliFrom` now rejects
  unknown leading options before command selection, while command-level unknown
  args still flow through existing command parsers. Added parser and public
  command tests for `--wat`, and updated the parity matrix global JSON/parse
  note. Verification: Rust-vs-Node spot check for `--wat`; `npm test --
  test/parser.test.js test/commands.test.js` (198 passing); `npm test --
  test/docs.test.js test/parity-smoke.test.js test/bin-entrypoint.test.js`
  (8 passing); `npm run lint` (86 JavaScript files);
  `npm test -- --test-reporter=dot` (passed); `npm run parity:smoke` (45
  scenarios); and `git diff --check`. No Rust build was created;
  `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported the Rust-shaped outer elapsed formatter. Node now emits
  `Elapsed: HH:MM:SS` for plain command paths that still use the outer runner
  timing line, matching Rust spot checks for `status` and `--version`; JSON
  mode remains silent in non-TTY command tests, and `resume`, `list-agents`, and
  `completions` stay suppressed by the previous no-elapsed boundary. Added a
  pure formatter test plus representative plain `status` output coverage, and
  updated the parity smoke normalization sample and matrix notes. Verification:
  Rust-vs-Node spot checks for `status`, `--version`, and `list-agents`;
  `npm test -- test/commands.test.js test/parity-smoke.test.js` (173 passing);
  `npm test -- test/parser.test.js test/docs.test.js test/bin-entrypoint.test.js`
  (31 passing); `npm run lint` (86 JavaScript files);
  `npm test -- --test-reporter=dot` (passed); `npm run parity:smoke` (45
  scenarios); and `git diff --check`. No Rust build was created;
  `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported the next elapsed-output boundary slice. Node now suppresses
  the outer elapsed line for `resume`, `list-agents`, and `completions`, matching
  Rust samples for no-state/dry-run/action-required `resume`, introspection, and
  completion generation. Parser metadata tests now guard the suppression set,
  command tests assert quiet stderr/stdout for the affected paths, and
  `docs/parity-matrix.md` no longer says the `chain` default
  `plan-tasks-implement` remains unsupported. Verification: `npm test --
  test/docs.test.js test/parser.test.js` (27 passing), `npm test --
  test/commands.test.js` (168 passing), `npm run lint` (86 JavaScript files),
  `npm test -- --test-reporter=dot` (passed), `npm run parity:smoke` (45
  scenarios), and `git diff --check`. No Rust build was created;
  `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Ported Rust-shaped default/help output for Node. `src/app/help.js`
  now mirrors Rust's command list, primary command examples, environment/config
  help, review-gate notes, progress log notes, and model/env option sections
  while preserving Node's intentional `.agent-loop.json` config wording.
  No-command help now renders session-aware state paths such as
  `.agent-loop/state/<session>/transcript.log`; JSON help emits the same
  Rust-shaped text inside the `help` event. `docs/parity-matrix.md` now marks
  default/no-command help covered for this Node-specific contract. Verification:
  `npm test -- test/docs.test.js test/parser.test.js test/commands.test.js`
  (194 passing), `npm run lint` (86 JavaScript files),
  `npm test -- --test-reporter=dot` (passed), `npm run parity:smoke` (45
  scenarios), and `git diff --check`. No Rust build was created;
  `cargo clean --manifest-path cli/Cargo.toml` was not needed.
- 2026-06-17: Completed the dedicated implementation workflow command slice.
  Node now treats `plan-implement`, `tasks-implement`, and
  `plan-tasks-implement` as supported Rust workflow commands that dispatch into
  the pipeline runner without the legacy alias note, and `chain` default
  dispatch can run `plan-tasks-implement` through the same first-pass workflow
  path. `docs/unsupported.md` now lists only true unsupported command names and
  `test/docs.test.js` checks the docs list against `UNSUPPORTED_COMMANDS`.
  Remaining parity gaps are the documented full planning loops, real task
  decomposition, per-task/wave execution, and complete resume transitions.
  Verification: `npm test -- test/parser.test.js test/commands.test.js
  test/docs.test.js` (193 passing), `npm run lint` (86 JavaScript files),
  `npm test -- --test-reporter=dot` (passed), `npm run parity:smoke` (45
  scenarios), and `git diff --check`. No Rust build was created;
  `cargo clean --manifest-path cli/Cargo.toml` was not needed.
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
  coverage for missing-file errors. The default `plan-tasks-implement` step now
  routes through the dedicated first-pass workflow path; broader
  compound/pipeline dispatch remains open.
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
