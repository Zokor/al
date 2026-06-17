# Rust CLI parity matrix

This is the living inventory for converting `node-cli` into a 1:1 functional
port of the Rust CLI. Rust source in `../cli` is authoritative; Node source in
this package records current coverage.

## Evidence sources

- Rust command surface: `../cli/src/app/command_cli.rs`
- Rust dispatch surface: `../cli/src/app/dispatch_mapping.rs`,
  `../cli/src/app/dispatch_types.rs`
- Rust global/action flags: `../cli/src/app/cli.rs`,
  `../cli/src/app/action_overrides/args.rs`
- Rust phase and workflow args: `../cli/src/app/phase_cli.rs`,
  `../cli/src/app/implementation_cli.rs`, `../cli/src/app/pipeline_cli.rs`,
  `../cli/src/app/workflow_cli.rs`, `../cli/src/app/control_cli.rs`,
  `../cli/src/app/goal_cli.rs`, `../cli/src/app/queue_cli.rs`
- Node parser/dispatcher: `src/app/cli.js`, `src/app/dispatch.js`,
  `src/app/dispatchTypes.js`
- Node provider runtime foundation: `src/agent/resolution.js`,
  `src/agent/providers.js`, `src/agent/runtime.js`
- Node unsupported list: `src/unsupported/commands.js`, `docs/unsupported.md`
- Rust-vs-Node parity smoke harness: `scripts/parity-smoke.js`

## Status key

- `Partial`: command parses and has some compatible state/output behavior, but
  does not execute the full Rust behavior.
- `Missing`: command is recognized only as unsupported or is absent.
- `Covered`: behavior has parity-oriented Node tests and no known Rust gap.
- `Blocked`: behavior depends on unavailable evidence or environment.

## Simplicity rule

Port command groups through small shared primitives. Do not copy Rust module
shape into JavaScript wholesale. Each command should either stay a thin wrapper
around shared state/runtime helpers or own a narrowly scoped behavior file.

## Primary command parity

| Rust command | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| default/no command help | Partial | Help text, JSON help event, exit 0 | Node has custom help; needs Rust text parity audit. |
| `spec` | Partial | Args, state files, progress files, agent execution, resume, JSON/plain output, exit codes | Node validates missing/empty task input and initializes state only. `npm run parity:smoke` compares missing-task errors against Rust. |
| `analyze-coverage` | Covered | Spec/tasks missing errors, REQ coverage sorting, orphan task detection, plain/JSON output, exit codes | Reads `spec.md` and `tasks.md`, reports `REQ-###` coverage, and exits `1` when requirements are missing or task blocks have no REQ IDs. |
| `plan` | Partial | Planning runtime, approval gate, state/progress files, resume | Node validates missing/empty task input and initializes state only. `npm run parity:smoke` compares missing-task and empty-file errors against Rust. |
| `tasks` | Partial | Decomposition runtime, task parsing, resume, findings files | Node initializes state only. |
| `implement` | Partial | Unlimited retry parity, per-task/wave execution and resume, browser-blocking implementation evidence, stuck/debugger handling, git checkpoints, compound phase, golden Rust-vs-Node agent-run evidence | Fresh `implement --task/--file`, existing-state batch `implement` from `tasks.md` or `plan.md`, and batch-mode `implement --resume` run implementer + same-context reviewer, run `auto_test` quality commands as reviewer evidence, retry bounded batch runs when `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive, auto-consensus for simple/single-agent approval, run the dual-agent approval path through Gate B fresh-context review plus implementer signoff, verify Gate B findings before either signoff or bounded retry, and handle Gate C disputed late findings. `npm run parity:smoke` compares the empty-state error path against Rust. |
| `implement-verify` | Partial | Resume, per-task/wave, retry/fix-loop recovery, browser-blocking implementation evidence beyond verify, broader Rust-vs-Node golden output/state evidence | Fresh `implement-verify --task/--file` and existing-state `implement-verify` from `tasks.md` or `plan.md` compose the supported first-pass implement round and verify round, preserving implement flags/state and ending in verify state on success. `npm run parity:smoke` compares the empty-state error path against Rust. |
| `plan-tasks-implement` | Partial | Alias to plan,tasks,implement with implement flags and resume | Rust-shaped args parse; runtime remains unsupported. |
| `plan-implement` | Partial | Alias to plan,implement with implement flags and resume | Rust-shaped args parse; runtime remains unsupported. |
| `tasks-implement` | Partial | Alias to tasks,implement with file/resume behavior | Rust-shaped args parse; runtime remains unsupported. |
| `review` | Partial | Full implementation fix-loop parity, per-task/wave, Rust-vs-Node golden output/state evidence | Node initializes standalone review state, writes `changes.md` from `--files`, `--base`, or working-tree diff, runs the primary reviewer through the provider primitive, detects reviewer protocol failure, approves empty findings, runs dual-agent adversarial validation for primary findings, appends confirmed findings to `task.md`, and hands off to the supported batch `implement --resume` path. Remaining fix-loop gaps are inherited from `implement`. |
| `reset` | Covered | Preserve decisions, default/session state cleanup, `--wave-lock`, plain/JSON output, exit codes | `npm run parity:smoke` compares empty reset, seeded default cleanup, session cleanup, wave-lock present/missing, and JSON suppression against Rust. |
| `status` | Covered | Plain/JSON initialized and uninitialized status, normalized empty/corrupt status, `nextAction`, artifacts, wave state | `npm run parity:smoke` compares uninitialized, initialized plan, JSON, and empty-file status against Rust. Node tests cover corrupted status fallback plus grouped artifact, wave lock, and recent wave event rendering. |
| `version` | Covered | Rust package version text/event, plain/JSON output, exit 0 | Node prints the generated Rust version; `npm run parity:smoke` compares `--version` and `--json --version` against Rust. |
| `init` | Covered | Generate default config, project-aware starter settings, `--force`, conflicts, JSON-mode success suppression | Node intentionally generates `.agent-loop.json`; Rust generates `.agent-loop.toml`. |
| `tui` | Missing | TUI dashboard behavior for one or more paths | Likely blocked until terminal UI strategy is chosen. |
| `inline` | Partial | Git auto-commit checkpoint, Rust-vs-Node golden output/state evidence | Fresh `inline --task/--file` writes Rust-compatible task/workflow/status state, runs one implementer invocation through the provider primitive, and logs non-blocking quality checks when `inline_quality_check` and `auto_test` are enabled. `inline_auto_commit=true` remains unsupported. |
| `next` | Partial | Full no-input auto-run behavior, remaining agent-invoking routes, broader Rust-vs-Node golden output/state evidence | Deterministic control outcomes for complete, hard-error, pending plan approval, consensus transitions, verification-failed replan, context-limit resume selection, stale verification invalidation, and verify routing are covered by Node tests. `next --task/--file` parses Rust-shaped fresh input and delegates supported selected commands such as `plan` and `spec` into their Node state setup. No-input `spec`/`plan`/`tasks` selections now run the supported state shells when existing state has enough task/plan context, and final `implement` selections enter the supported batch implementation path; taskless discussion, per-task/wave implement, and broader pipeline routes still use partial route-printing or explicit unsupported boundaries. |
| `resume` | Partial | Goal/queue/pipeline/phase resume, dry-run, no-state behavior | Deterministic dry-run/no-state behavior, JSON `command_started`, interrupted-state integrity errors, supervisor/pipeline selection, and pipeline-without-status selection have parity tests. Full execution still punts unsupported goal/queue/pipeline/supervise paths. |
| `verify` | Partial | Recovery/fix loop, Rust-vs-Node golden output/state evidence | Node now enforces the fresh consensus entry guard, prepares verify state, runs one automated verifier round through the provider primitive, supports `--resume` with the follow-up prompt without clearing prior artifacts, supports `--manual` checklist generation and resume, persists and refreshes `acceptance-goals.json` for spec/slice/plan/task sources, covers Rust-shaped acceptance-goal extraction edge cases, blocks authoritative canonical-goal lint failures before verifier calls, runs configured quality commands/`auto_test_cmd` or auto-detected Rust/JavaScript quality commands when `verify_auto_test` is enabled, runs configured `browser_test_commands` when `verify_browser_test` is enabled, applies the browser evidence gate for browser-facing plans/tasks, applies a canonical plan-goal coverage gate for common plan/task goal shapes, runs Gate B through the implementer in dual-agent verification, checks command-final completion invariants before returning success, parses tagged verification artifacts, writes `verification.md`/`verification.json`/`verification-fixes.md`, and sets `VERIFIED` or `VERIFICATION_FAILED`. |
| `discuss` | Partial | Discovery prepass, prompt overlays/session parity, golden Rust-vs-Node evidence | Node runs the facilitator/progress/resume path through the provider primitive and supports challenger approval/finalization flow. `--discover` remains unsupported. |
| `chain` | Partial | Default compound dispatch, full pipeline command fallback, Rust-vs-Node golden output/state evidence | Node validates plan files, persists `.agent-loop/chain.json`, resumes at the first incomplete result, runs supported direct command steps such as `plan`, archives successful state into `.agent-loop/state/archive/{plan_stem}/`, and records non-zero step failures. The Rust default `plan-tasks-implement` and broader compound/pipeline step dispatch still route to unsupported boundaries. |
| `goal` | Partial | Goal creation, supervisor run, budget checkpoints, real flock locking, `resume --run`, Rust-vs-Node golden output/state evidence | Node supports lifecycle-only `goal status`, `goal pause`, `goal resume`, and `goal clear` against Rust-compatible `goal.json`; creation and `resume --run` remain unsupported runtime gaps. |
| `queue` | Partial | Queue run/supervisor execution, activation, dependency scheduling for run, real flock locking, Rust-vs-Node golden output/state evidence | Node supports state-only `queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`, and `queue cancel` against Rust-compatible `goal-queue.json`; `resume --run` remains unsupported. |
| `supervise` | Partial | Supervisor fallback workflow, queue pickup, resume, tool protocol | Rust-shaped args parse; runtime remains unsupported. |
| `pipeline` | Partial | Arbitrary phase sequence, resume state, recovery/fix-loop | Rust-shaped args parse; Node only reads existing pipeline resume state. |
| `approve` | Covered | Plan-only validation, pending marker errors, response files, plain/JSON output | Writes `.agent-loop/state/decisions/<decision_id>/response.json` and legacy `.agent-loop/state/decision_response.json` from `plan-pending-approval.flag`. |
| `reject` | Covered | Required `--reason`, plan-only validation, pending marker errors, response files, plain/JSON output | Writes the same Rust-compatible response files with `reason`/`free_text`. |
| `completions` | Covered | Shell completion generation and stdout/stderr handling | Supports Rust shell names: bash, elvish, fish, powershell, zsh. Output is functional, not byte-for-byte `clap_complete`. |
| `list-agents` | Covered | JSON provider registry and installation status, elapsed routing | Ported in Node through shared registry metadata; `npm run parity:smoke` compares plain and JSON `list-agents` output against Rust. |

## Hidden pipeline alias parity

All Rust aliases below dispatch through pipeline alias handling. Node parses the
alias phase metadata and Rust-shaped task/file/discover/resume/single-agent and
implement-mode flags where the Rust alias accepts them, but none execute yet.

| Alias group | Rust commands | Node status | Notes |
| --- | --- | --- | --- |
| Plan/implement aliases | `plan-tasks-implement-verify`, `plan-implement-verify`, `tasks-implement-verify` | Partial | Args and phase metadata parse; runtime remains unsupported. `implement-verify` is a dedicated Rust command and has its own partial row above. |
| Discuss plan aliases | `discuss-plan`, `discuss-plan-tasks`, `discuss-plan-implement`, `discuss-plan-tasks-implement`, `discuss-plan-verify`, `discuss-plan-tasks-verify`, `discuss-plan-implement-verify`, `discuss-plan-tasks-implement-verify` | Partial | Args and phase metadata parse; runtime remains unsupported. |
| Spec aliases | `spec-plan`, `spec-plan-tasks`, `spec-plan-implement`, `spec-plan-tasks-implement`, `spec-plan-verify`, `spec-plan-tasks-verify`, `spec-plan-implement-verify`, `spec-plan-tasks-implement-verify` | Partial | Args and phase metadata parse; runtime remains unsupported. |
| Discuss spec aliases | `discuss-spec`, `discuss-spec-plan`, `discuss-spec-plan-tasks`, `discuss-spec-plan-implement`, `discuss-spec-plan-tasks-implement`, `discuss-spec-plan-verify`, `discuss-spec-plan-tasks-verify`, `discuss-spec-plan-implement-verify`, `discuss-spec-plan-tasks-implement-verify` | Partial | Args and phase metadata parse; runtime remains unsupported. |
| Planning prep aliases | `plan-verify`, `plan-tasks`, `plan-tasks-verify` | Partial | Args and phase metadata parse; runtime remains unsupported. |

## Global option parity

| Rust global option | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| `--session <NAME>` | Partial | State path selection, session locks/journals, resume | Parser/config supported; runtime coverage partial. |
| `--new-context` | Partial | Agent invocation/session behavior | Parser/config supported; needs runtime. |
| `--json` | Partial | JSONL event shape, stderr/stdout routing, fatal errors | Some parse/errors covered; runtime incomplete. |
| `--require-plan-approval` | Partial | Plan approval gate state and downstream pause | Parser/config supported; runtime incomplete. |
| `--no-plan-approval` | Partial | Config override and conflict with require flag | Parser conflict covered; runtime incomplete. |
| `--simple` | Partial | Simple workflow defaults through pipeline/supervisor | Parser/config supported; runtime incomplete. |
| `--requirements-workflow <legacy\|spec>` | Partial | Next/supervise/pipeline routing | Parser/config supported; runtime incomplete. |
| `--implementer <AGENT>` | Partial | Provider resolution and invocation | Parser/config supported; runtime incomplete. |
| `--reviewer <AGENT>` | Partial | Provider resolution and review gates | Parser/config supported; runtime incomplete. |
| Specific `--*-model` flags | Partial | CLI precedence, provider model selection for all actions | Parser supports most current actions. |
| Specific `--*-effort` flags | Partial | Effort validation and provider invocation | Parser supports most current actions. |
| `--action-model ACTION=MODEL` | Partial | Generic action precedence/order | Parser supports current action set. |
| `--action-effort ACTION=EFFORT` | Partial | Generic action precedence/order | Parser supports current action set. |

## Command option gaps

- `inline` now parses Rust-shaped `--task` and `--file` options and executes
  the default direct implementer path. `inline_auto_commit=true` remains
  unsupported because git checkpoint parity is not ported.
- `chain` now parses Rust-shaped plan file arguments, `--command <command>`,
  and `--resume`, executes supported direct Node command steps sequentially,
  writes `.agent-loop/chain.json`, and archives successful state. The Rust
  default `plan-tasks-implement` and broader compound/pipeline step dispatch
  remain unsupported.
- `next` no-input selections now delegate into the supported `spec`, `plan`,
  and `tasks` state shells when existing state has enough task/plan context.
  Taskless agent-start routes and broader runtime routes remain partial
  boundaries until their selected commands are fully ported.
- `queue` now parses Rust-shaped lifecycle forms. State-only add/list/status,
  pause/resume/cancel execute against `goal-queue.json`; `resume --run` remains
  unsupported because it activates and runs supervisor orchestration.
- `goal` now parses Rust-shaped lifecycle and creation forms. Lifecycle-only
  `status`, `pause`, `resume`, and `clear` execute against `goal.json`; goal
  creation and `resume --run` remain unsupported because they enter
  supervisor/resume orchestration.
- `discuss` now parses `--task`, `--file`, `--discover`, and `--resume`.
  Runtime supports the main discussion progress loop, but `--discover` returns
  an explicit first-pass unsupported error until discovery prepass parity lands.
- Fresh `implement --task/--file`, existing-state batch `implement` from
  `tasks.md` or `plan.md`, and batch-mode `implement --resume` now run
  implementation and same-context review rounds. When `review_max_rounds` /
  `REVIEW_MAX_ROUNDS` is positive, Node retries batch `NEEDS_CHANGES` rounds
  until approval or `MAX_ROUNDS`. Dual-agent approval runs through Gate B
  fresh-context review, Gate B findings verification when needed, implementer
  signoff, and Gate C disputed late-finding bounce. `auto_test` quality
  commands now run before implementation review, write `quality_checks.md`, and
  are referenced by Gate A and Gate B review prompts as reviewer evidence.
  Unlimited retry parity, per-task/wave execution and resume,
  browser-blocking implementation evidence, stuck/debugger handling, compound
  phases, and git checkpoints remain first-pass gaps.
- Standalone `review` now parses `--base`, `--files`, `--file`, `--plan`, and
  `--single-agent`, prepares `changes.md`, runs the primary reviewer, and runs
  dual-agent adversarial validation for primary findings. Confirmed findings
  are appended to `task.md` and handed off to the supported batch
  `implement --resume` path; remaining fix-loop gaps are inherited from
  `implement`, including per-task/wave behavior and broader parity evidence.
- Fresh automated `verify` now requires implementation/review consensus, writes
  `workflow.txt` as `verify`, clears stale verification artifacts, runs a single
  verifier round, persists tagged verifier artifacts, and writes
  `VERIFIED`/`VERIFICATION_FAILED` status. `verify --resume` validates
  `workflow.txt`/`status.json`, keeps existing artifacts, uses the follow-up
  verifier prompt, and reruns one verifier round. It applies a canonical
  plan-goal coverage gate for common plan/task goal shapes before accepting
  success, persists and refreshes `acceptance-goals.json` for spec/slice/plan/task
  sources, blocks authoritative canonical-goal lint failures before verifier
  calls, and checks command-final completion invariants before returning a
  verified exit. `verify --manual` now generates a manual checklist through the
  verifier, persists `verification.json` after each answer, writes manual fixes
  for failed/skipped items, and supports resume. Acceptance-goal extraction now
  covers explicit canonical sections, embedded task plans, task-heading fallback,
  and verification checklist items. Dual-agent verify now runs the implementer
  as Gate B after the primary verifier passes coverage. The fix loop remains a
  first-pass gap.
- Configured `quality_commands`, `auto_test_cmd`, and auto-detected
  Rust/JavaScript quality commands now run during automated verify when
  `verify_auto_test` is enabled. Passing quality output is included in the
  verifier prompt and progress; failures deterministically write
  `verification-fixes.md` and block verification after the verifier response.
- Configured `browser_test_commands` now run during automated verify when
  `verify_browser_test` is enabled. Passing or failing browser evidence is
  included in the verifier prompt and progress; failures only become
  deterministic blockers when `browser_evidence_policy` is `block`.
- Browser-facing plans/tasks without captured browser/E2E evidence now write
  `browser-evidence-gate.md`; `browser_evidence_policy=block` pauses verify as
  `AWAITING_INPUT`, while `warn` records the gate and lets verification
  continue.
- `implement-verify --task/--file` and existing-state `implement-verify` from
  `tasks.md` or `plan.md` now run the supported first-pass implement round and
  immediately transition into the supported first-pass verify round.
  `implement-verify --resume`, per-task/wave execution, and retry/fix-loop
  recovery remain first-pass gaps.
- `pipeline`, `supervise`, and hidden pipeline aliases now parse shared
  `ImplementModeFlags` and alias phase metadata before routing to the
  unsupported handler. Provider command construction and the injectable process
  runner exist, but the larger phase/pipeline orchestration remains incomplete.
- Node `completions` generates functional scripts for both `agent-loop` and
  `agent-loop-node`; it intentionally does not copy Rust `clap_complete` output
  byte-for-byte.

## Config parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| Runtime config file | Intentional divergence | Rust reads `.agent-loop.toml`; Node reads `.agent-loop.json` | Preserve Node JSON support and migration script per goal. |
| TOML migration | Covered | Script conversion tests and warnings | Keep while porting runtime behavior. |
| Env/CLI/config precedence | Partial | Per-key parity tests against Rust fixtures | Role slots and action overrides have tests; many settings accepted but inert. |
| Default config generation | Covered | `init` output, project auto-detection, and `--force` behavior | Node generates JSON defaults and detected quality/browser settings instead of Rust TOML comments. |
| Provider registry | Partial | Agent validation, fallback routing, list output | Node has registry metadata plus provider command builders covered by fake-runner tests. |

## Agent Runtime Parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| Action-to-provider resolution | Partial | Slot/action provider, model, effort, handoff, CLI override tests | `src/agent/resolution.js` covers model/effort tables, action providers, and slot handoff. Env action overrides are not yet implemented. |
| Provider command construction | Partial | Per-provider golden command args and env tests | `src/agent/providers.js` mirrors Rust command builders for registered providers at the command-shape level. Permission/env coverage is still partial. |
| Provider process runner | Partial | Fake-runner and real-process failure tests | `src/agent/runtime.js` captures stdout/stderr, strips ANSI output, writes output artifacts, and surfaces non-zero exits. Session persistence, transcripts, JSONL events, retry, usage, tool-call extraction, and provider-specific output normalization remain pending. |

## State, output, and resume parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| `.agent-loop/state` layout | Partial | File-by-file fixture comparison for each command group | Node initializes core files. The parity smoke harness now compares selected state files for deterministic scenarios such as seeded `goal pause`. |
| Goal state | Partial | Create/pause/resume/clear fixture comparison, lock behavior, checkpoints, budget limit status | Lifecycle-only goal commands read/write Rust-compatible `goal.json`; mutating commands create `goal.lock`, but full cross-process flock parity and supervisor checkpoints remain open. |
| Queue state | Partial | Add/list/status/pause/resume/cancel fixture comparison, lock behavior, activation, supervisor sync | Lifecycle-only queue commands read/write Rust-compatible `goal-queue.json`; mutating commands create `goal-queue.lock`, but `resume --run`, activation scheduling, supervisor sync, and full flock parity remain open. |
| Decisions preservation | Partial | Reset/init/runtime tests | Node reset preserves decisions. |
| Wave locks | Partial | Live, stale, malformed lock behavior and session variants | Node covers state-mutating shell checks. |
| Events JSONL | Partial | Event schema/order comparison | Node writes a small subset. |
| Plain output | Partial | Golden stdout/stderr per command | Initial parity smoke coverage compares normalized plain output for stable non-agent scenarios. |
| JSON output | Partial | JSONL event golden output per command | The parity smoke harness canonicalizes JSON key order and scrubs timestamp fields for stable comparisons. |
| Exit codes | Partial | Per-command success/config/runtime interruption exits | Initial parity smoke coverage compares exit codes for stable non-agent scenarios. |
| Signal handling | Partial | SIGINT behavior for runtime dispatches | Node currently treats unsupported/runtime shells as agent dispatches. |
| Resume routing | Partial | Phase, pipeline, goal, queue, supervised, interrupted-state cases | Node selects some commands, but most selected targets are unsupported. |

## Recommended port order

1. Project-aware JSON config generation, `completions`, and `list-agents` have
   been ported.
2. Shared implement-mode flag parser and pipeline alias metadata has been
   ported for parser/validation coverage.
3. Agent/provider runtime primitive with a fake-provider test seam has been
   ported as a foundation.
4. `discuss`, `spec`, `plan`, `tasks`, `implement`, `review`, and `verify`
   runtime groups.
5. `pipeline`, `supervise`, `goal`, `queue`, approvals, chain, and TUI.

Each group should add tests that prove behavior, output, exit codes, and state
files for that group before removing entries from `docs/unsupported.md`. For
stable non-agent surfaces, extend `npm run parity:smoke` so Rust-vs-Node
evidence remains reproducible instead of ad hoc.
