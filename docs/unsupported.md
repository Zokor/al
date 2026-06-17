# Unsupported Node CLI First-Pass Commands

The Node CLI first pass implements command parsing, source execution, state-path compatibility, non-destructive state helpers, `analyze-coverage`, `completions`, `init`, `list-agents`, `approve`, `reject`, `goal` lifecycle state commands, `queue` lifecycle state commands, `discuss`, standalone primary `review`, partial batch-mode `implement` fresh/existing/resume paths, `inline --task/--file`, fresh automated `verify`, first-pass `implement-verify` compose paths for fresh task/file input and existing task/plan state, shells for `spec`, `plan`, `tasks`, and `resume`, and partial `next` delegation into supported state shells.

The production Rust CLI remains the complete implementation. Commands listed here are recognized by `node-cli` so users receive an intentional non-zero error instead of an ambiguous parser failure. Some unsupported runtime commands now parse Rust-shaped arguments first, including implement-mode flags and pipeline alias phase metadata. Node also has a shared provider command runner foundation, but these commands still do not execute until their phase orchestration is ported.

Unsupported command names:

- `plan-tasks-implement`
- `plan-implement`
- `tasks-implement`
- `tui`
- `supervise`
- `pipeline`
- `plan-tasks-implement-verify`
- `plan-implement-verify`
- `tasks-implement-verify`
- `discuss-plan-tasks-implement`
- `discuss-plan-implement`
- `discuss-plan-implement-verify`
- `discuss-plan-tasks-implement-verify`
- `plan-verify`
- `plan-tasks`
- `discuss-plan`
- `discuss-spec`
- `spec-plan`
- `spec-plan-tasks`
- `discuss-spec-plan`
- `discuss-spec-plan-tasks`
- `spec-plan-implement`
- `spec-plan-tasks-implement`
- `discuss-spec-plan-implement`
- `discuss-spec-plan-tasks-implement`
- `spec-plan-verify`
- `spec-plan-tasks-verify`
- `discuss-spec-plan-verify`
- `discuss-spec-plan-tasks-verify`
- `spec-plan-implement-verify`
- `spec-plan-tasks-implement-verify`
- `discuss-spec-plan-implement-verify`
- `discuss-spec-plan-tasks-implement-verify`
- `discuss-plan-tasks`
- `plan-tasks-verify`
- `discuss-plan-verify`
- `discuss-plan-tasks-verify`

Unsupported commands print:

```text
Unsupported in node-cli first pass: <command>
See node-cli/docs/unsupported.md for supported first-pass behavior.
```

`init` is implemented as Node-native `.agent-loop.json` generation. The Rust CLI still generates the canonical `.agent-loop.toml`; convert legacy TOML with `npm run migrate-config -- <projectDir>`.

`analyze-coverage` is implemented for existing `spec.md` and `tasks.md` state. It reports sorted `REQ-###` coverage, orphan task headings, plain/JSON output, and Rust-compatible exit codes.

`discuss` is partially implemented: the facilitator/progress/resume loop runs through the shared provider primitive, but `discuss --discover` still returns an explicit unsupported error until discovery prepass parity is ported. Compound discuss aliases remain unsupported.

`implement` is partially implemented for fresh `implement --task <text>` / `implement --file <path>`, for batch-mode `implement` from existing `tasks.md` or `plan.md` state, and for `implement --resume` when the persisted/default implementation mode is batch. It initializes or resumes implement state, runs the implementer, runs `auto_test` quality commands as reviewer evidence, runs the same-context reviewer, can retry bounded batch `NEEDS_CHANGES` rounds when `review_max_rounds` / `REVIEW_MAX_ROUNDS` is positive, auto-consenses simple/single-agent approvals, runs the dual-agent approval path through Gate B fresh-context review plus implementer signoff, verifies Gate B findings before either signoff or bounded retry, and handles Gate C disputed late findings. Unlimited retry parity, per-task/wave execution and resume, browser-blocking implementation evidence, stuck/debugger handling, compound phases, and git checkpoints remain unsupported first-pass behavior.

`implement-verify` is partially implemented for fresh `implement-verify --task <text>` / `implement-verify --file <path>` and for existing `tasks.md` or `plan.md` state by composing the supported first-pass `implement` and `verify` paths. `implement-verify --resume`, per-task/wave execution, retry/fix-loop recovery, and Rust-vs-Node golden parity remain unsupported first-pass behavior.

`inline` is partially implemented for fresh `inline --task <text>` and `inline --file <path>`. It writes Rust-compatible `original-request.md`, `task.md`, `workflow.txt`, and `status.json`, invokes the implementer once through the shared provider primitive, and runs non-blocking implementation quality checks only when both `inline_quality_check` and `auto_test` are enabled. `inline_auto_commit=true` remains unsupported because git checkpoint parity is not ported.

`approve plan` and `reject plan --reason <reason>` are implemented for pending plan approval gates. They write Rust-compatible response files under `.agent-loop/state/decisions/<decision_id>/response.json` and `.agent-loop/state/decision_response.json`. Other phases are rejected because the Rust CLI currently supports only plan approval through these commands.

`goal status`, `goal pause`, `goal resume`, and `goal clear` are implemented as lifecycle-only state commands against Rust-compatible `.agent-loop/state/goal.json`. Goal creation still starts the Rust supervisor workflow, so `goal <objective>` / `goal --objective <text>` / `goal --file <path>` remain unsupported runtime behavior. `goal resume --run` also remains unsupported because it re-enters the workflow resume path.

`queue add`, `queue list`, `queue status`, `queue pause`, `queue resume`, and `queue cancel` are implemented as lifecycle-only state commands against Rust-compatible `.agent-loop/state/goal-queue.json`. `queue resume <id> --run` remains unsupported because it activates and runs supervisor workflow execution.

`review` is partially implemented for standalone review. It prepares `changes.md` from `--files`, `--base`, or the working tree, runs the primary reviewer, approves empty findings, detects reviewer protocol failures, runs dual-agent adversarial validation for primary findings, and hands confirmed findings to the supported batch `implement --resume` path. Remaining fix-loop gaps are inherited from `implement`, including per-task/wave behavior and broader parity evidence.

`verify` is partially implemented for fresh automated verification after implementation/review consensus and for `verify --resume` on an existing verification workflow. It supports `verify --manual` checklist generation, answer persistence, failure fixes, and resume. It persists and refreshes `acceptance-goals.json` for spec/slice/plan/task sources, covers Rust-shaped acceptance-goal extraction edge cases, and blocks authoritative canonical-goal lint failures before verifier calls. It runs configured `quality_commands`/`auto_test_cmd`, or auto-detected Rust/JavaScript quality commands when neither is configured, when `verify_auto_test` is enabled. It also runs configured `browser_test_commands` when `verify_browser_test` is enabled, includes browser output in the verifier prompt, and blocks browser failures only when `browser_evidence_policy` is `block`. Browser-facing plans/tasks without captured browser/E2E evidence write `browser-evidence-gate.md`; `browser_evidence_policy=block` pauses verify as `AWAITING_INPUT`, while `warn` records the gate and continues. It blocks verification on deterministic quality/browser failures, parses tagged `<verification_markdown>` and `<verification_json>` output, applies a canonical plan-goal coverage gate for common plan/task shapes, runs Gate B through the implementer in dual-agent verification, checks command-final completion invariants before returning success, persists verification artifacts, and writes `VERIFIED` or `VERIFICATION_FAILED`. Fix-loop retries remain an explicit first-pass boundary.

`next` is partially implemented. Deterministic control outcomes run directly, `next --task/--file` delegates fresh supported selections, no-input transitions into `spec`, `plan`, or `tasks` run the existing state-shell commands when prior state contains enough context, and final `implement` selections delegate into the supported batch implementation path. Taskless discussion routes, per-task/wave implement routes, broader pipeline routes, and full Rust-vs-Node golden parity remain explicit first-pass boundaries.
