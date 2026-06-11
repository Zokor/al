# Unsupported Node CLI First-Pass Commands

The Node CLI first pass implements command parsing, source execution, state-path compatibility, non-destructive state helpers, and shells for `spec`, `plan`, `tasks`, `next`, `resume`, and `verify`.

The production Rust CLI remains the complete implementation. Commands listed here are recognized by `node-cli` so users receive an intentional non-zero error instead of an ambiguous parser failure.

Unsupported command names:

- `analyze-coverage`
- `implement`
- `plan-tasks-implement`
- `plan-implement`
- `tasks-implement`
- `review`
- `init`
- `tui`
- `inline`
- `discuss`
- `chain`
- `goal`
- `queue`
- `supervise`
- `pipeline`
- `approve`
- `reject`
- `plan-tasks-implement-verify`
- `plan-implement-verify`
- `tasks-implement-verify`
- `implement-verify`
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
- `list-agents`

Unsupported commands print:

```text
Unsupported in node-cli first pass: <command>
See node-cli/docs/unsupported.md for supported first-pass behavior.
```

`init` and default-config generation are intentionally unsupported in this first pass. The Rust CLI template remains canonical, and action provider/model examples remain documentation examples until a Node implementation is explicitly added.
