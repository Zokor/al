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
| `spec` | Partial | Args, state files, progress files, agent execution, resume, JSON/plain output, exit codes | Node validates missing/empty task input, runs the discovery prepass for explicit `--discover` or enabled plan-phase discovery settings, and initializes state only. `npm run parity:smoke` compares missing-task errors against Rust. |
| `analyze-coverage` | Covered | Spec/tasks missing errors, REQ coverage sorting, orphan task detection, plain/JSON output, exit codes | Reads `spec.md` and `tasks.md`, reports `REQ-###` coverage, and exits `1` when requirements are missing or task blocks have no REQ IDs. |
| `plan` | Partial | Planning runtime, approval gate, state/progress files, resume | Node validates missing/empty task input, runs the discovery prepass for explicit `--discover` or enabled plan-phase discovery settings, and initializes state only. `npm run parity:smoke` compares missing-task and empty-file errors against Rust. |
| `tasks` | Partial | Decomposition runtime, task parsing, resume, findings files | Node initializes state only. |
| `implement` | Partial | Per-task/wave execution and resume, stuck/debugger handling, git checkpoints, compound phase, golden Rust-vs-Node agent-run evidence | Fresh `implement --task/--file`, existing-state batch `implement` from `tasks.md` or `plan.md`, and batch-mode `implement --resume` run implementer + same-context reviewer, run `auto_test` quality commands plus configured browser/E2E checks as reviewer evidence, synthesize browser-blocking review findings when `browser_evidence_policy=block`, apply the missing-browser-evidence gate before review, retry capped batch runs when `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive, retry unbounded batch runs when the cap is `0`, log high-watermark warnings during unbounded retries at Rust thresholds, auto-consensus for simple/single-agent approval, run the dual-agent approval path through Gate B fresh-context review plus implementer signoff, verify Gate B findings before either signoff or retry, and handle Gate C disputed late findings. `npm run parity:smoke` compares the empty-state error path against Rust. |
| `implement-verify` | Partial | Plan-stage resume, standalone review workflow resume, per-task/wave, retry/fix-loop recovery, broader Rust-vs-Node golden output/state evidence | Fresh `implement-verify --task/--file` and existing-state `implement-verify` from `tasks.md` or `plan.md` compose the supported first-pass implement round and verify round, preserving implement flags/state and ending in verify state on success. `implement-verify --resume` composes supported resumes from `implement` state into verification and delegates `verify` state to `verify --resume`; plan-stage resume and standalone review workflow resume remain explicit boundaries. `npm run parity:smoke` compares the empty-state error path against Rust. |
| `plan-tasks-implement` | Partial | Alias to plan,tasks,implement with implement flags and resume | Rust-shaped args parse; runtime remains unsupported. |
| `plan-implement` | Partial | Alias to plan,implement with implement flags and resume | Rust-shaped args parse; runtime remains unsupported. |
| `tasks-implement` | Partial | Alias to tasks,implement with file/resume behavior | Rust-shaped args parse; runtime remains unsupported. |
| `review` | Partial | Full implementation fix-loop parity, per-task/wave, Rust-vs-Node golden output/state evidence | Node initializes standalone review state, writes `changes.md` from `--files`, `--base`, or working-tree diff, runs the primary reviewer through the provider primitive, detects reviewer protocol failure, approves empty findings, runs dual-agent adversarial validation for primary findings, appends confirmed findings to `task.md`, and hands off to the supported batch `implement --resume` path. Remaining fix-loop gaps are inherited from `implement`. |
| `reset` | Covered | Preserve decisions, default/session state cleanup, `--wave-lock`, plain/JSON output, exit codes | `npm run parity:smoke` compares empty reset, seeded default cleanup, session cleanup, wave-lock present/missing, and JSON suppression against Rust. |
| `status` | Covered | Plain/JSON initialized and uninitialized status, normalized empty/corrupt status, `nextAction`, artifacts, wave state | `npm run parity:smoke` compares uninitialized, initialized plan, JSON, and empty-file status against Rust. Node tests cover corrupted status fallback plus grouped artifact, wave lock, and recent wave event rendering. |
| `version` | Covered | Rust package version text/event, plain/JSON output, exit 0 | Node prints the generated Rust version; `npm run parity:smoke` compares `--version` and `--json --version` against Rust. |
| `init` | Covered | Generate default config, project-aware starter settings, `--force`, conflicts, JSON-mode success suppression | Node intentionally generates `.agent-loop.json`; Rust generates `.agent-loop.toml`. |
| `tui` | Missing | TUI dashboard behavior for one or more paths | Likely blocked until terminal UI strategy is chosen. |
| `inline` | Partial | Broader git checkpoint parity and Rust-vs-Node golden output/state evidence | Fresh `inline --task/--file` writes Rust-compatible task/workflow/status state, runs one implementer invocation through the provider primitive, logs non-blocking quality checks when `inline_quality_check` and `auto_test` are enabled, and supports `inline_auto_commit` checkpoints after success when `auto_commit` is also enabled. The checkpoint excludes `.agent-loop/state/**` and logs Rust-shaped skip/success messages. |
| `next` | Partial | Full no-input auto-run behavior, remaining agent-invoking routes, broader Rust-vs-Node golden output/state evidence | Deterministic control outcomes for complete, hard-error, pending plan approval, consensus transitions, verification-failed replan, context-limit resume selection, stale verification invalidation, and verify routing are covered by Node tests. `next --task/--file` parses Rust-shaped fresh input and delegates supported selected commands such as `plan` and `spec` into their Node state setup. No-input `spec`/`plan`/`tasks` selections now run the supported state shells when existing state has enough task/plan context, and final `implement` selections enter the supported batch implementation path; taskless discussion, per-task/wave implement, and broader pipeline routes still use partial route-printing or explicit unsupported boundaries. |
| `resume` | Partial | Goal/queue/pipeline/phase resume, dry-run, no-state behavior | Deterministic dry-run/no-state behavior, JSON `command_started`, interrupted-state integrity errors, supervisor/pipeline selection, pipeline-without-status selection, paused-goal action-required output, deferred-queue `queue_id` routing, active-queue `goal.json` hydration, non-dry-run supervisor/pipeline/interrupted/next-fallback preamble messages, and interrupted workflow delegation into existing Node resume shells have parity tests. `npm run parity:smoke` compares empty, interrupted, pipeline, and deferred-queue dry-run resume paths against Rust. Full execution still punts unsupported pipeline/supervise/phase paths. |
| `verify` | Partial | Recovery/fix loop, Rust-vs-Node golden output/state evidence | Node now enforces the fresh consensus entry guard, prepares verify state, runs one automated verifier round through the provider primitive, supports `--resume` with the follow-up prompt without clearing prior artifacts, supports `--manual` checklist generation and resume, persists and refreshes `acceptance-goals.json` for spec/slice/plan/task sources, covers Rust-shaped acceptance-goal extraction edge cases, blocks authoritative canonical-goal lint failures before verifier calls, runs configured quality commands/`auto_test_cmd` or auto-detected Rust/JavaScript quality commands when `verify_auto_test` is enabled, runs configured `browser_test_commands` when `verify_browser_test` is enabled, applies the browser evidence gate for browser-facing plans/tasks, applies a canonical plan-goal coverage gate for common plan/task goal shapes, runs Gate B through the implementer in dual-agent verification, checks command-final completion invariants before returning success, parses tagged verification artifacts, writes `verification.md`/`verification.json`/`verification-fixes.md`, and sets `VERIFIED` or `VERIFICATION_FAILED`. |
| `discuss` | Partial | Session parity, golden Rust-vs-Node evidence | Node runs the facilitator/progress/resume path through the provider primitive, supports challenger approval/finalization flow, and supports Rust-style discovery prepasses for explicit `--discover` and `discover_enabled` + `discover_before_discuss`, extracting `<discovery>` output, writing `discovery.md`, and retrying up to `discover_max_rounds` / `DISCOVER_MAX_ROUNDS`. `prompt_style` now shortens discovery prompts when set to `terse`, `prompt_profile` phase overlays apply to discovery/discuss prompts, and Rust-shaped system prompts are injected through provider invocations. |
| `chain` | Partial | Default compound dispatch, full pipeline command fallback, Rust-vs-Node golden output/state evidence | Node validates plan files, persists `.agent-loop/chain.json`, resumes at the first incomplete result, runs supported direct command steps such as `plan`, archives successful state into `.agent-loop/state/archive/{plan_stem}/`, and records non-zero step failures. The Rust default `plan-tasks-implement` and broader compound/pipeline step dispatch still route to unsupported boundaries. |
| `goal` | Partial | Supervisor/resume orchestration, budget checkpoints, real flock locking, Rust-vs-Node golden output/state evidence | Node supports `goal` creation state for text, `--objective`, and `--file`, then stops at the explicit unsupported supervisor-run boundary. `goal status`, `goal pause`, `goal resume`, and `goal clear` run against Rust-compatible `goal.json`; `goal resume --run` now marks the goal active and clears the reason before stopping at the unsupported resume-orchestration boundary. |
| `queue` | Partial | Queue run/supervisor execution, queue finalization, real flock locking, Rust-vs-Node golden output/state evidence | Node supports `queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`, and `queue cancel` against Rust-compatible `goal-queue.json`. `queue resume <id> --run` now performs Rust-shaped state prep by marking the item runnable, activating it, deferring any previous active run, and creating active `goal.json` before stopping at the explicit unsupported supervisor-run boundary. |
| `supervise` | Partial | Supervisor fallback workflow, task/resume runtime, tool protocol, broader Rust-vs-Node golden output/state evidence | Rust-shaped args parse. `supervise --queue` now performs Rust-shaped state prep by rejecting task/file/resume combinations, activating the current active run or next eligible queued item using priority/dependency rules, creating active `goal.json`, printing `Running` or `Resuming` from the same resumable-state predicate as Rust, and stopping at the explicit unsupported supervisor-run boundary. `npm run parity:smoke` compares the empty queue path against Rust. Other supervisor runtime paths remain unsupported. |
| `pipeline` | Partial | Broader multi-phase orchestration, broader discovery coverage, per-task/wave implement modes, recovery/fix-loop, broader Rust-vs-Node golden evidence | Fresh single-phase `pipeline --phases discuss|spec|plan|tasks|implement|verify` delegates through existing Node phase/runtime paths and persists Rust-shaped `pipeline.json`; the `spec`/`plan` starts run supported discovery prepasses before their state shell, the `tasks` start follows Rust plan/task selection, `discuss` uses the supported facilitator loop and discovery settings, `implement` uses the supported batch implementation subset with pipeline metadata written before runtime failure can occur, and `verify` initializes fresh verify state from pipeline task input before entering the supported verifier round. Fresh multi-phase pipelines composed only of `discuss`, `implement`, and `verify` now run in order, preserve accumulated state between supported runtime phases, transition workflow/status before each continuation phase, and stop before later phases when an earlier phase fails. `pipeline --resume` validates phase names/order/duplicates and tasks-without-plan state, writes Rust-shaped `pipeline.json`, checks active workflow membership, and delegates to the existing Node resume command shells. Broader fresh pipeline execution that depends on unported `spec`/`plan`/`tasks` runtimes still stops at an explicit unsupported boundary. |
| `approve` | Covered | Plan-only validation, pending marker errors, response files, plain/JSON output | Writes `.agent-loop/state/decisions/<decision_id>/response.json` and legacy `.agent-loop/state/decision_response.json` from `plan-pending-approval.flag`. |
| `reject` | Covered | Required `--reason`, plan-only validation, pending marker errors, response files, plain/JSON output | Writes the same Rust-compatible response files with `reason`/`free_text`. |
| `completions` | Covered | Shell completion generation and stdout/stderr handling | Supports Rust shell names: bash, elvish, fish, powershell, zsh. Output is functional, not byte-for-byte `clap_complete`. |
| `list-agents` | Covered | JSON provider registry and installation status, elapsed routing | Ported in Node through shared registry metadata; `npm run parity:smoke` compares plain and JSON `list-agents` output against Rust. |

## Hidden pipeline alias parity

All Rust aliases below dispatch through pipeline alias handling. Node parses the
alias phase metadata and Rust-shaped task/file/discover/resume/single-agent and
implement-mode flags where the Rust alias accepts them, emits the Rust-style
legacy-alias note, and then routes through the pipeline runner. Execution still
depends on the underlying phase sequence support.

| Alias group | Rust commands | Node status | Notes |
| --- | --- | --- | --- |
| Plan/implement aliases | `plan-tasks-implement-verify`, `plan-implement-verify`, `tasks-implement-verify` | Partial | `plan-implement-verify --task/--file` and natural positional task text run the narrow first-pass plan -> implement -> verify path. `tasks-implement-verify` runs through the tasks shell -> implement -> verify path when a plan file or existing `plan.md` supplies the tasks input. `plan-tasks-implement-verify` remains bounded by unported task-decomposition orchestration. `implement-verify` is a dedicated Rust command and has its own partial row above. |
| Discuss plan aliases | `discuss-plan`, `discuss-plan-tasks`, `discuss-plan-implement`, `discuss-plan-tasks-implement`, `discuss-plan-verify`, `discuss-plan-tasks-verify`, `discuss-plan-implement-verify`, `discuss-plan-tasks-implement-verify` | Partial | Args and phase metadata dispatch through pipeline; broader discuss -> plan/task orchestration remains unsupported unless the same phase sequence is explicitly documented in the pipeline row. |
| Spec aliases | `spec-plan`, `spec-plan-tasks`, `spec-plan-implement`, `spec-plan-tasks-implement`, `spec-plan-verify`, `spec-plan-tasks-verify`, `spec-plan-implement-verify`, `spec-plan-tasks-implement-verify` | Partial | Args and phase metadata dispatch through pipeline; spec-leading orchestration remains unsupported because the spec runtime is still a state shell. |
| Discuss spec aliases | `discuss-spec`, `discuss-spec-plan`, `discuss-spec-plan-tasks`, `discuss-spec-plan-implement`, `discuss-spec-plan-tasks-implement`, `discuss-spec-plan-verify`, `discuss-spec-plan-tasks-verify`, `discuss-spec-plan-implement-verify`, `discuss-spec-plan-tasks-implement-verify` | Partial | Args and phase metadata dispatch through pipeline; discuss -> spec orchestration remains bounded by the unported spec runtime. |
| Planning prep aliases | `plan-verify`, `plan-tasks`, `plan-tasks-verify` | Partial | Args and phase metadata dispatch through pipeline; verification and decomposition prep sequences remain unsupported until those phase transitions have parity. |

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
| Specific `--*-model` flags | Partial | CLI precedence, provider model selection for all actions | Parser supports current actions and runtime resolution preserves CLI-over-env precedence. |
| Specific `--*-effort` flags | Partial | Effort validation and provider invocation | Parser supports current actions and runtime resolution preserves CLI-over-env precedence. |
| `--action-model ACTION=MODEL` | Partial | Generic action precedence/order | Parser supports current action set and last CLI override wins. |
| `--action-effort ACTION=EFFORT` | Partial | Generic action precedence/order | Parser supports current action set and last CLI override wins. |

## Command option gaps

- `inline` now parses Rust-shaped `--task` and `--file` options and executes
  the default direct implementer path. `inline_auto_commit` now follows Rust's
  `auto_commit` gate, commits successful inline changes when both flags are
  enabled, and excludes `.agent-loop/state/**` from the checkpoint.
- `chain` now parses Rust-shaped plan file arguments, `--command <command>`,
  and `--resume`, executes supported direct Node command steps sequentially,
  writes `.agent-loop/chain.json`, and archives successful state. The Rust
  default `plan-tasks-implement` and broader compound/pipeline step dispatch
  remain unsupported.
- `next` no-input selections now delegate into the supported `spec`, `plan`,
  and `tasks` state shells when existing state has enough task/plan context.
  Taskless agent-start routes and broader runtime routes remain partial
  boundaries until their selected commands are fully ported.
- `queue` now parses Rust-shaped lifecycle forms. Add/list/status,
  pause/resume/cancel execute against `goal-queue.json`; `resume --run`
  performs queue activation plus active `goal.json` state prep, then stops at
  the unsupported supervisor orchestration boundary.
- `goal` now parses Rust-shaped lifecycle and creation forms. `status`,
  `pause`, `resume`, and `clear` execute against `goal.json`; goal creation and
  `resume --run` both perform Rust-compatible state prep before stopping at the
  unsupported supervisor/resume orchestration boundary.
- `discuss` now parses `--task`, `--file`, `--discover`, and `--resume`.
  Runtime supports the main discussion progress loop, explicit `--discover`,
  and config-driven `discover_enabled` + `discover_before_discuss`.
  `prompt_style` / `AGENT_LOOP_PROMPT_STYLE` and `prompt_profile` /
  `PROMPT_PROFILE` are loaded with Rust-shaped precedence for these executed
  prompts; phase overlays apply to discovery and discuss prompts, while
  Rust-shaped system prompts apply to provider invocations. Unported phase
  prompts remain pending.
- `spec` and `plan` now run the Rust-style discovery prepass for explicit
  `--discover` or `discover_enabled` + `discover_before_plan` before their
  state-only runtime boundary.
- Fresh `implement --task/--file`, existing-state batch `implement` from
  `tasks.md` or `plan.md`, and batch-mode `implement --resume` now run
  implementation and same-context review rounds. Node retries batch
  `NEEDS_CHANGES` rounds until approval, or until `MAX_ROUNDS` when
  `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive. Dual-agent approval
  runs through Gate B
  fresh-context review, Gate B findings verification when needed, implementer
  signoff, and Gate C disputed late-finding bounce. `auto_test` quality
  commands now run before implementation review, write `quality_checks.md`, and
  are referenced by Gate A and Gate B review prompts as reviewer evidence.
  Configured browser/E2E checks also run before review, append evidence to
  `quality_checks.md`, synthesize blocking review findings when
  `browser_evidence_policy=block`, warn when policy is non-blocking, and apply
  the missing-browser-evidence gate for browser-facing work. Unlimited retries
  log the Rust high-watermark safeguard at round 50 and every 25 rounds after.
  Per-task/wave execution and resume, stuck/debugger handling, compound phases,
  and git checkpoints remain first-pass gaps.
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
  `implement-verify --resume` now resumes supported `implement` state before
  verification and delegates supported `verify` state to `verify --resume`.
  Plan-stage resume chaining, standalone review workflow resume, per-task/wave
  execution, and retry/fix-loop recovery remain first-pass gaps.
- Fresh single-phase `pipeline --phases discuss|spec|plan|tasks|implement|verify`
  delegates through existing Node phase/runtime paths and persists Rust-shaped
  `pipeline.json`. Fresh multi-phase pipeline now covers runtime-only
  `discuss,implement,verify`, narrow first-pass `plan,implement` and
  `plan,implement,verify`, plus `tasks,implement` and
  `tasks,implement,verify` when a plan file or existing `plan.md` supplies the
  tasks phase. `pipeline --resume` validates Rust phase rules, writes
  `pipeline.json`, checks the
  active workflow belongs to the requested phases, and delegates to the
  existing Node resume command shells. Broader multi-phase flows that require
  full spec or task-decomposition runtimes remain explicit unsupported
  boundaries. Ordinary `supervise` remains partial beyond `--queue` state prep.
  Provider command construction and the injectable process runner exist, but
  the larger phase/pipeline orchestration remains incomplete.
- Node `completions` generates functional scripts for both `agent-loop` and
  `agent-loop-node`; it intentionally does not copy Rust `clap_complete` output
  byte-for-byte.

## Config parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| Runtime config file | Intentional divergence | Rust reads `.agent-loop.toml`; Node reads `.agent-loop.json` | Preserve Node JSON support and migration script per goal. |
| TOML migration | Covered | Script conversion tests and warnings | Keep while porting runtime behavior. |
| Env/CLI/config precedence | Partial | Per-key parity tests against Rust fixtures | Role slots, `decisions_enabled`, `progressive_context`, prompt style/profile, CLI/env action overrides, and Claude/Codex/Cursor CLI tuning have tests; many settings accepted but inert. |
| Prompt style/profile | Partial | Config precedence, profile lookup, prompt overlay tests, remaining prompt-suite audit | Node supports `prompt_style` / `AGENT_LOOP_PROMPT_STYLE`, built-in `xml_boundaries_v1`, explicit/named prompt profile TOML paths, `PROMPT_PROFILE` override, phase overlays for discovery/discuss, system overlays through provider invocations, and progressive-context state manifest prompts. Unported phase prompts remain open. |
| Default config generation | Covered | `init` output, project auto-detection, and `--force` behavior | Node generates JSON defaults and detected quality/browser settings instead of Rust TOML comments. |
| Provider registry | Partial | Agent validation, fallback routing, list output | Node has registry metadata plus provider command builders covered by fake-runner tests. |

## Agent Runtime Parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| Action-to-provider resolution | Partial | Slot/action provider, model, effort, handoff, CLI/env override tests | `src/agent/resolution.js` covers model/effort tables, action providers, slot handoff, and Rust-shaped `AGENT_LOOP_<ACTION>_MODEL` / `AGENT_LOOP_<ACTION>_EFFORT` precedence below CLI overrides and above JSON `models`. |
| Provider command construction | Partial | Per-provider golden command args and env tests | `src/agent/providers.js` mirrors Rust command builders for registered providers at the command-shape level. Claude/Codex/Cursor full-access flags, Claude allowlists, planner permission mode, skills toggling, Claude token env, and session-resume gates now have focused coverage. Transient retry loops, transcripts, usage/tool-call extraction, and broader provider runtime parity remain pending. |
| Provider system prompts | Partial | Role prompt text, system overlays, progressive manifest, provider-specific injection tests | Node now injects Rust-shaped decision-capture prompts when `decisions_enabled` is true, single-agent reviewer preambles, prompt-profile system overlays, and progressive-context state manifests through the provider runtime. Provider-specific tests cover `-p` prompt injection for manifest-bearing prompts. |
| Provider process runner | Partial | Fake-runner and real-process failure tests | `src/agent/runtime.js` captures stdout/stderr, strips ANSI output, writes output artifacts, and surfaces non-zero exits. Session persistence, transcripts, JSONL events, retry, usage, tool-call extraction, and provider-specific output normalization remain pending. |

## State, output, and resume parity

| Area | Node status | Required parity evidence | Notes |
| --- | --- | --- | --- |
| `.agent-loop/state` layout | Partial | File-by-file fixture comparison for each command group | Node initializes core files. The parity smoke harness now compares selected state files for deterministic scenarios such as seeded `goal pause`. |
| Goal state | Partial | Create/pause/resume/clear fixture comparison, lock behavior, checkpoints, budget limit status | Goal creation, lifecycle commands, and `goal resume --run` state prep read/write Rust-compatible `goal.json`; mutating commands create `goal.lock`, but full cross-process flock parity and supervisor checkpoints remain open. |
| Queue state | Partial | Add/list/status/pause/resume/cancel fixture comparison, lock behavior, activation, supervisor sync | Queue lifecycle commands, `queue resume <id> --run`, and `supervise --queue` state prep read/write Rust-compatible `goal-queue.json`; mutating commands create `goal-queue.lock`, but supervisor sync/finalization and full flock parity remain open. |
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
