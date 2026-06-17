# JSON Configuration

The Node CLI reads its project configuration from `<project>/.agent-loop.json` — a single
JSON object at the top level. A missing file is fine (all defaults apply), and so is an
empty or whitespace-only file; a non-empty file that is not valid JSON, or whose root is
not an object, is a hard error.

## Example

```json
{
  "implementer": "claude/claude-sonnet-4-6/max",
  "reviewer": "codex/gpt-5.5/xhigh",
  "planner": "claude/claude-opus-4-7/max",
  "discoverer": "claude/claude-sonnet-4-6/medium",
  "verifier": "codex/gpt-5.5/xhigh",
  "supervisor_agent": "codex/gpt-5.5/xhigh",
  "single_agent": false,
  "plan_requires_approval": true,
  "models": {
    "codex": {
      "plan": { "model": "gpt-5.5", "effort": "xhigh" }
    }
  },
  "action_providers": {
    "review": "codex",
    "verify": "codex"
  }
}
```

## Generate a starter config

From a target project directory, run:

```sh
agent-loop-node init
```

The Node CLI writes `<project>/.agent-loop.json`. It refuses to overwrite an existing
JSON config unless `--force` is passed. If only a legacy `.agent-loop.toml` exists, use
the migration command below instead of `init` unless you intentionally want a fresh JSON
config.

When run from a Rust, PHP/Laravel, or JavaScript/TypeScript project, `init` adds the
same project-aware starter settings as the Rust CLI in JSON form: `auto_test`,
detected `quality_commands`, detected `browser_test_commands`, and a
`browser_evidence_policy` of `block` when browser commands exist or `warn` when a web
surface is detected without a deterministic browser command.

- **Role slots** (`implementer`, `reviewer`, `planner`, `discoverer`, `verifier`,
  `supervisor_agent`) take a profile string:
  `<provider>[/<model>[/<effort>]][|<handoff-provider>/<handoff-model>[/<handoff-effort>]]`.
  Providers that require an effort segment (e.g. `pi`) must include one.
- **`single_agent`** collapses planner/reviewer/discoverer/verifier to the implementer.
- **`plan_requires_approval`** pauses after plan consensus until an explicit approval.
- **`models`** is the JSON equivalent of the Rust CLI's `[models.<provider>.<action>]`
  tables: nested objects keyed by provider, then action (`plan`, `tasks`, `implement`,
  `review`, `discuss`, `discover`, `verify`, `debugger`, `compound`, `supervisor`), each
  holding optional `model` and `effort` entries.
- **`action_providers`** routes individual actions to a provider, overriding slot routing.

## Precedence

For role slots (`implementer`, `reviewer`, `planner`, `discoverer`, `verifier`):
environment variables > CLI flags > `.agent-loop.json` > built-in defaults.

`single_agent` is the exception: the `SINGLE_AGENT` environment variable overrides the
file value, but the `--single-agent`/`--simple` CLI flags force single-agent mode on top
of both — including over `SINGLE_AGENT=false` (the flags can only force the mode on,
never off).

## Accepted keys

Unknown root keys are rejected with `unknown .agent-loop.json key '<key>'`. The accepted
set is the full Rust CLI key set, mirrored in `src/config/fileConfigSchema.js`. The Node
CLI first pass only acts on a subset (role slots, `single_agent`, `requirements_workflow`,
`next_skip_discuss`, `plan_requires_approval`, `decisions_enabled`, `models`,
`action_providers`, `auto_commit`, `auto_push`, `auto_test`, `batch_implement`,
`review_max_rounds`, `prompt_style`, `prompt_profile`, `progressive_context`,
`discover_enabled`, `discover_max_rounds`,
`discover_before_discuss`, `discover_before_plan`,
`inline_quality_check`,
`inline_auto_commit`, `chain_default_command`, `new_context`,
`planner_permission_mode`, `skills_enabled`, `blocked_skills`,
`claude_full_access`, `claude_allowed_tools`, `reviewer_allowed_tools`,
`claude_session_persistence`, `claude_max_output_tokens`,
`claude_max_thinking_tokens`, `codex_full_access`, `codex_session_persistence`,
`cursor_full_access`, and `cursor_session_persistence`).
`prompt_style` accepts `normal` or `terse` and can be overridden by
`AGENT_LOOP_PROMPT_STYLE`. `prompt_profile` supports the Rust built-in
`xml_boundaries_v1`, explicit TOML profile paths, and named project profiles
under `.agent-loop/profiles/<name>.toml` or `bench/profiles/<name>.toml`; the
`PROMPT_PROFILE` environment variable overrides the file value. The Node first
pass applies phase prompt overlays to the currently executed discovery and
discuss prompts, system prompt overlays to provider invocations, and
`progressive_context` state manifests to provider system prompts. Unported
phase prompts remain pending parity work. `decisions_enabled` defaults to
`false`, matching Rust, and can be overridden by `DECISIONS_ENABLED`.
`progressive_context` defaults to `false`, matching Rust, and can be overridden
by `PROGRESSIVE_CONTEXT`.
Per-action environment overrides now follow Rust precedence below CLI flags and
above `models`: `AGENT_LOOP_<ACTION>_MODEL` and
`AGENT_LOOP_<ACTION>_EFFORT`, where `<ACTION>` is one of `PLAN`, `TASKS`,
`IMPLEMENT`, `REVIEW`, `DISCUSS`, `DISCOVER`, `VERIFY`, `DEBUGGER`,
`COMPOUND`, or `SUPERVISOR`.
Claude, Codex, and Cursor CLI tuning follows Rust-shaped env/file/default
precedence for the acted-on provider settings. `NEW_CONTEXT` or
`new_context=true` disables Claude/Codex/Cursor session resume injection;
`PLANNER_PERMISSION_MODE=plan` applies Claude planner `--permission-mode plan`;
`SKILLS_ENABLED=false` adds Claude `--disable-slash-commands` and removes the
constrained-mode `Skill` allowlist addition.
`quality_commands`, `auto_test_cmd`, and `verify_auto_test` now affect automated
`verify`; when neither explicit quality setting exists, automated `verify`
detects Rust and JavaScript/TypeScript project quality commands from `Cargo.toml`
or `package.json`. `inline` uses the same quality command resolution when both
`inline_quality_check` and `auto_test` are enabled, but failed checks are
non-blocking to match Rust inline behavior. `inline_auto_commit` follows Rust's
broader `auto_commit` gate: successful inline runs commit non-state files only
when both `inline_auto_commit` and `auto_commit` are true. `browser_test_commands`,
`verify_browser_test`, and `browser_evidence_policy` also affect automated
`verify` for configured browser/E2E checks and the verify-phase browser
evidence gate. Broader implementation/supervisor browser phases remain pending
— see `docs/unsupported.md` for what the first pass implements.

## Migration from `.agent-loop.toml`

Earlier versions read `.agent-loop.toml`. As with an empty `.agent-loop.toml` before,
an empty or whitespace-only `.agent-loop.json` opts in with all defaults. Convert an
existing file with:

```sh
node <path-to-node-cli>/scripts/migrate-config.js [projectDir] [--force]
```

or, from a node-cli checkout:

```sh
npm run migrate-config -- [projectDir] [--force]
```

The script lives in the node-cli package, not in the target project, so invoke it by its
package-relative path (or via the npm script above) from anywhere. `projectDir` defaults
to the current directory. The script reads `<projectDir>/.agent-loop.toml`, writes a
pretty-printed `<projectDir>/.agent-loop.json`, and refuses to overwrite an existing
`.agent-loop.json` unless `--force` is passed. After writing, it validates the converted
config against the Node CLI schema and prints a `warning:` line on stderr naming anything
the CLI would reject (e.g. an unknown key that the TOML-only state silently ignored), so
a migration never trades a working setup for a silent hard error. The validation step is
best-effort: the script also runs as a single copied file, and when the node-cli `src/`
modules are not alongside it the conversion still completes and a `note:` line says
validation was skipped.

When a legacy `.agent-loop.toml` is still present, `loadConfig` warns on stderr:

- TOML only: `found .agent-loop.toml, but the Node CLI now reads .agent-loop.json; run
  'node "<absolute-path-to>/scripts/migrate-config.js" "<projectDir>"' to convert it.`
  (the warning embeds the resolved absolute script and project paths, double-quoted so
  the command is copy-pasteable from any directory — including when either path contains
  spaces)
- Both files: `.agent-loop.toml is ignored by the Node CLI; .agent-loop.json takes
  precedence.`
