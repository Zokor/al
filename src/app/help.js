import { COMPLETION_SHELLS } from "./completionSurface.js";
import { PIPELINE_ALIAS_DEFINITIONS } from "./pipelineAliases.js";

function sessionStateDirRel(session) {
  return session ? `.agent-loop/state/${session}` : ".agent-loop/state";
}

function commandHelp() {
  return `Run a collaborative implementation/review loop between coding agents.

Usage: agent-loop [OPTIONS] [COMMAND]

Commands:
  spec              Author or resume a requirements spec
  analyze-coverage  Check spec requirement IDs against tasks.md
  plan              Plan only
  tasks             Decompose plan into tasks only
  implement         Implement from tasks.md, inline task text, or task file
  review            Run a standalone code review, then fix confirmed findings
  reset             Clear .agent-loop/state while preserving decisions.md
  status            Show current loop status
  version           Print version
  init              Initialize project configuration
  tui               Launch the TUI dashboard to monitor agent-loop state
  inline            Execute a task directly with a single agent call
  next              Determine and run the logical next command based on current state
  resume            Resume the current run and choose the right underlying workflow automatically
  verify            Run verification on completed implementation
  discuss           Interactive requirements discussion before planning
  chain             Execute multiple plan files in sequence
  goal              Persist and run an autonomous goal lifecycle
  queue             Manage queued autonomous objectives
  supervise         Run a supervised workflow through the deterministic Supervisor fallback
  pipeline          Run an arbitrary sequence of phases, e.g. --phases discuss,plan,tasks,implement,verify (legacy hyphenated shortcuts like plan-tasks-implement still work)
  list-agents       List available agents and their installation status (JSON output)
  approve           Approve a pending phase approval gate
  reject            Reject a pending phase approval gate
  completions       Generate a shell completion script (write it to your shell's completion dir)
  help              Print this message or the help of the given subcommand(s)

Options:
      --session <NAME>
      --new-context                    Start each agent call with fresh context (no session resume, full prompts)
      --json                           Emit all output as JSONL events to stdout (suppress human-readable text)
      --require-plan-approval          Require explicit approval after planning before downstream phases continue
      --no-plan-approval               Disable plan approval for this run, overriding project config
      --simple                         Use the short plan -> implement -> verify loop profile for this run
      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]
      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)
      --reviewer <AGENT>               Override the reviewer agent
      --plan-model <MODEL>             Override model for plan action
      --tasks-model <MODEL>            Override model for tasks action
      --implement-model <MODEL>        Override model for implement action
      --review-model <MODEL>           Override model for review action
      --discuss-model <MODEL>          Override model for discuss action
      --discover-model <MODEL>         Override model for discover action
      --verify-model <MODEL>           Override model for verify action
      --debugger-model <MODEL>         Override model for debugger action
      --compound-model <MODEL>         Override model for compound action
      --plan-effort <LEVEL>            Override effort for plan action
      --tasks-effort <LEVEL>           Override effort for tasks action
      --implement-effort <LEVEL>       Override effort for implement action
      --review-effort <LEVEL>          Override effort for review action
      --discuss-effort <LEVEL>         Override effort for discuss action
      --discover-effort <LEVEL>        Override effort for discover action
      --verify-effort <LEVEL>          Override effort for verify action
      --debugger-effort <LEVEL>        Override effort for debugger action
      --compound-effort <LEVEL>        Override effort for compound action
      --action-model <ACTION=MODEL>    Override model for specific action: action=model
      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort
  -h, --help                           Print help
  -V, --version                        Print version`;
}

function environmentHelp(session) {
  const stateRel = sessionStateDirRel(session);
  return `Primary commands:
  agent-loop spec <task>                    Author requirements spec
  agent-loop spec --file <path>             Author requirements spec from file
  agent-loop spec --resume                  Resume spec / clarification gate
  agent-loop analyze-coverage               Check spec REQ IDs against tasks.md
  agent-loop plan <task>                    Planning only
  agent-loop plan --file <path>             Planning only from file
  agent-loop plan --resume                  Resume planning from existing plan.md
  agent-loop tasks                          Decompose only
  agent-loop tasks --resume                 Resume decomposition
  agent-loop implement                      Implement tasks.md in batch, or fall back to plan.md when tasks are missing/empty
  agent-loop implement --per-task           Implement tasks one-by-one (legacy mode)
  agent-loop implement --task <t>           Implement one inline task
  agent-loop implement --file <p>           Implement one task from file
  agent-loop implement --resume             Resume implementation
  agent-loop resume                         Resume the current run automatically
  agent-loop resume --dry-run               Show selected resume command
  agent-loop goal "task"                    Persist and run an autonomous lifecycle goal
  agent-loop goal status                    Show active lifecycle goal state
  agent-loop goal resume --run              Resume the active lifecycle goal
  agent-loop queue add "task"               Add a queued objective
  agent-loop queue list                     List queued objectives
  agent-loop queue status                   Show active and next queue items
  agent-loop supervise --queue              Run the next eligible queued objective
  agent-loop supervise <task>               Run supervised workflow with deterministic fallback
  agent-loop supervise --phases implement,verify --resume
  agent-loop spec-plan <task>               Run spec -> plan
  agent-loop spec-plan-implement <task>     Run spec -> plan -> implement
  agent-loop spec-plan-tasks-implement <task>  Run spec -> plan -> tasks -> implement
  agent-loop spec-plan-implement-verify --task <t>  Run spec -> plan -> implement -> verify
  agent-loop discuss-spec-plan <task>       Run discuss -> spec -> plan
  agent-loop discuss-spec-plan-implement <task>  Run discuss -> spec -> plan -> implement
  agent-loop discuss-spec-plan-implement-verify --task <t>  Run discuss -> spec -> plan -> implement -> verify
  agent-loop plan-tasks-implement <task>    Run plan -> tasks -> implement
  agent-loop plan-implement <task>          Run plan -> implement (supports all implement-mode flags)
  agent-loop --simple plan-implement-verify --task <t>  Short PIV profile with minimal planning review
  agent-loop tasks-implement                Run tasks -> implement from state/plan.md or --file
  agent-loop plan-verify <task>             Plan spec, then verify existing implementation
  agent-loop plan-tasks <task>              Plan then decompose into tasks
  agent-loop implement-verify               Implement then verify (supports all implement-mode flags)
  agent-loop discuss-plan <task>            Discuss requirements then plan
  agent-loop discuss-plan-tasks <task>      Discuss, plan, then decompose
  agent-loop plan-tasks-verify <task>       Plan, decompose, then verify existing implementation
  agent-loop discuss-plan-verify <task>     Discuss, plan, then verify existing implementation
  agent-loop discuss-plan-tasks-verify <task>  Full prep pipeline then verify
  agent-loop pipeline --phases discuss,spec,plan,tasks,implement,verify --task <t>
  agent-loop review --base main             Review PR diff vs main
  agent-loop review --base main "focus"     Review with focus hint
  agent-loop review --files src/lib.rs      Review specific files
  agent-loop reset                          Clear ${stateRel}/ and preserve decisions.md
  agent-loop approve plan                   Approve a pending plan gate
  agent-loop reject plan --reason <reason>  Reject a pending plan gate
  agent-loop init                           Generate default .agent-loop.json

Configuration sources (highest precedence first):
  1. CLI flags and subcommands
  2. Environment variables
  3. .agent-loop.json (per-project Node CLI config file)
  4. Built-in defaults

Round limits: 0 = unlimited (timeout and stuck detection remain active).
Implementation review gates:
  - single-agent: reviewer gate -> fresh-context reviewer gate by default
  - dual-agent: reviewer gate (same-context) -> reviewer gate (fresh-context) -> implementer signoff
  REVIEW_MAX_ROUNDS applies to the full implementation loop across all gates.
Simple mode (--simple): use terse prompts, primary-only planning review, PLANNING_MAX_ROUNDS=3, blocking planning scope guard, no role-swap/debugger/compound expansion, and stop after a failed verify instead of auto-recovering.
Progress logs:
  - spec-progress.md tracks spec / clarification rounds
  - planning-progress.md tracks planning rounds
  - tasks-progress.md tracks decomposition rounds
  - implement-progress.md tracks implementation progress
    (root aggregate for wave mode; detailed worker logs in ${stateRel}/.wave-task-N/)
  - verification-progress.md tracks verifier rounds, gate rejections, and pass/fail outcomes

Environment variables:
  REVIEW_MAX_ROUNDS     (default: 0)   Max implementation/review rounds (0 = unlimited)
  PLANNING_MAX_ROUNDS   (default: 0)  Max planning consensus rounds (0 = unlimited)
  DECOMPOSITION_MAX_ROUNDS (default: 0)  Max decomposition rounds (0 = unlimited)
  REQUIREMENTS_WORKFLOW (default: legacy) legacy|spec requirements workflow
  TIMEOUT               (default: 600)  Idle timeout in seconds
  IMPLEMENTER           (default: claude) Implementer agent name (any registered agent)
  REVIEWER                              Reviewer agent name (default: opposite of implementer)
  PLANNER                               Planner agent name (default: same as implementer)
  DISCOVERER                            Discoverer agent name (default: same as planner)
  VERIFIER                              Verifier agent name (default: same as reviewer)
  SINGLE_AGENT          (default: 0)    Enable single-agent mode when truthy
  AUTO_COMMIT           (default: 0)    Auto-commit loop-owned changes when truthy
  AUTO_TEST             (default: 0)    Run quality checks before review when truthy
  AUTO_TEST_CMD                         Override auto-detected quality check command
  COMPOUND              (default: 1)    Enable post-consensus compound learning phase
  DECISIONS_ENABLED     (default: 0)    Master switch for decisions subsystem (0 disables all decisions)
  AGENT_LOOP_PLAN_REQUIRES_APPROVAL (default: 0) Pause after planning until approve/reject
  DECISIONS_AUTO_REFERENCE (default: 1) Auto-sync managed decisions-reference blocks in AGENTS.md/CLAUDE.md
  DECISIONS_MAX_LINES   (default: 50)   Number of decision lines injected into prompts
  SUPERVISOR_ENABLED    (default: 0)    Create Supervisor state scaffolding for opt-in runs
  SUPERVISOR_AGENT      (default: claude/claude-opus-4-7/max) Supervisor provider/model profile
  SUPERVISOR_BUDGET_TOKENS (default: 200000) Supervisor run token budget
  SUPERVISOR_TURN_TOKEN_BUDGET (default: 8000) Supervisor per-turn token budget
  SUPERVISOR_MAX_AUTO_ACTIONS (default: 25) Max automatic Supervisor actions
  CONSECUTIVE_AUTO_THRESHOLD (default: 5) Consecutive automatic action threshold
  SUPERVISOR_EVENT_SUMMARY_TURNS (default: 40) Turns per event summary
  SUPERVISOR_REQUIRES_APPROVAL Comma-separated Supervisor action kinds requiring approval (default empty)
  SUPERVISOR_MAX_BUDGET_USD Optional whole-dollar Supervisor hard cap
  SUPERVISOR_VERBOSE   (default: 0)    Enable verbose Supervisor diagnostics
  SUPERVISOR_DECISIONS (default: 1)    Let Supervisor make product/architecture/management decisions
  SUPERVISOR_AUTO_CLARIFICATIONS (default: all) off|suggest|safe|all for spec clarification handling
  SUPERVISOR_AUTO_CLARIFICATION_MIN_CONFIDENCE (default: 0.85) Confidence threshold for auto-applied answers
  SUPERVISOR_AUTO_CLARIFICATION_REQUIRES_EVIDENCE (default: true) Require evidence before auto-applying answers
  DIFF_MAX_LINES        (default: 500)  Max diff lines before truncation
  CONTEXT_LINE_CAP      (default: 0)    Max lines for project context (0 = unlimited)
  PLANNING_CONTEXT_EXCERPT_LINES (default: 0) Max lines per file excerpt in planning (0 = unlimited)
  BATCH_IMPLEMENT       (default: 1)    Implement all tasks.md tasks in one loop by default
  MAX_PARALLEL          (default: 1)    Maximum parallel task execution in wave mode
  VERBOSE               (default: 0)    Enable verbose logging when truthy
  AGENT_LOOP_PROMPT_STYLE (default: normal) Prompt style: normal|terse; terse only shortens CLI prompt boilerplate
  PROGRESSIVE_CONTEXT   (default: 0)    Replace front-loaded context with on-demand manifest
  PLANNING_ADVERSARIAL_REVIEW (default: 1) Adversarial second review of plans
  FRESH_CONTEXT_REVIEW (default: 1) Fresh-context review gates in single-agent mode
  PLANNING_SCOPE_GUARD (default: block) Broad-plan guard: off|warn|block; manager mode downgrades block to warn
  PLANNING_SCOPE_GUARD_ROUNDS (default: 10) Planning rounds before guard triggers (0 disables)
  PLANNING_SCOPE_GUARD_PLAN_LINES (default: 350) plan.md lines before guard triggers (0 disables)
  PLANNING_SCOPE_GUARD_STALE_CHURN (default: 2) Stale adversarial-review churn before guard triggers (0 disables)

  Per-action model selection:
  AGENT_LOOP_PLAN_MODEL                 Model for planning calls (e.g. claude-opus-4-7)
  AGENT_LOOP_TASKS_MODEL                Model for task decomposition
  AGENT_LOOP_IMPLEMENT_MODEL            Model for implementation
  AGENT_LOOP_REVIEW_MODEL               Model for review action
  AGENT_LOOP_DISCUSS_MODEL              Model for discussion phase
  AGENT_LOOP_DISCOVER_MODEL             Model for discovery prepass
  AGENT_LOOP_VERIFY_MODEL               Model for standalone verify command
  AGENT_LOOP_DEBUGGER_MODEL             Model for debugger diagnosis
  AGENT_LOOP_COMPOUND_MODEL             Model for compound learning phase
  AGENT_LOOP_SUPERVISOR_MODEL           Model for Supervisor LLM turns
  AGENT_LOOP_PLAN_EFFORT                Effort for planning calls (low|medium|high|max|xhigh|minimal)
  AGENT_LOOP_TASKS_EFFORT               Effort for task decomposition
  AGENT_LOOP_IMPLEMENT_EFFORT           Effort for implementation
  AGENT_LOOP_REVIEW_EFFORT              Effort for review action
  AGENT_LOOP_DISCUSS_EFFORT             Effort for discussion phase
  AGENT_LOOP_DISCOVER_EFFORT            Effort for discovery prepass
  AGENT_LOOP_VERIFY_EFFORT              Effort for standalone verify command
  AGENT_LOOP_DEBUGGER_EFFORT            Effort for debugger diagnosis
  AGENT_LOOP_COMPOUND_EFFORT            Effort for compound learning phase
  AGENT_LOOP_SUPERVISOR_EFFORT          Effort for Supervisor LLM turns
  AUTO_PUSH             (default: 0)    Push after auto_commit succeeds when truthy
  PLANNER_PERMISSION_MODE               Planner permission mode: default|plan

  Claude CLI tuning:
  CLAUDE_FULL_ACCESS    (default: 1)    Use --dangerously-skip-permissions instead of --allowedTools
  CLAUDE_ALLOWED_TOOLS  (default: Bash,Read,Edit,Write,Grep,Glob,WebFetch)
  REVIEWER_ALLOWED_TOOLS (default: Read,Grep,Glob,WebFetch) Reviewer read-only sandbox
  CLAUDE_SESSION_PERSISTENCE (default: 1) Persist Claude sessions across rounds
  CLAUDE_MAX_OUTPUT_TOKENS              Max output tokens (1-64000)
  CLAUDE_MAX_THINKING_TOKENS            Extended thinking token budget
  CLAUDE_TRANSIENT_ERROR_RETRIES (default: 2) Retry transient Claude 5xx/529 failures
  CLAUDE_TRANSIENT_ERROR_BASE_DELAY_SECONDS (default: 30) Base delay before Claude transient retries

  Codex CLI tuning:
  CODEX_FULL_ACCESS     (default: 1)    Use --dangerously-bypass-approvals-and-sandbox instead of sandbox mode
  CODEX_SESSION_PERSISTENCE (default: 1) Persist Codex sessions across rounds

  Stuck detection:
  STUCK_DETECTION_ENABLED (default: 0)  Enable stuck detection in implementation loop
  STUCK_NO_DIFF_ROUNDS   (default: 3)   Consecutive no-diff rounds before signalling
  STUCK_THRESHOLD_MINUTES (default: 10)  Wall-clock minutes before signalling
  STUCK_ACTION           (default: warn) Action on stuck: abort|warn|retry
  STUCK_ANALYSIS_PARALYSIS_THRESHOLD   Consecutive read-only tool observations before signalling analysis paralysis (default: 5)

  Wave runtime:
  WAVE_LOCK_STALE_SECONDS (default: 30)  Seconds before a wave lock is considered stale
  WAVE_SHUTDOWN_GRACE_MS  (default: 30000) Grace period (ms) for in-flight tasks on interrupt

  Observability:
  TRANSCRIPT_ENABLED    (default: 0)    Write human-readable agent I/O transcript to ${stateRel}/transcript.log

  Context control:
  NEW_CONTEXT           (default: 0)    Start each agent call with fresh context (no session resume, full prompts)

  Inline mode:
  INLINE_QUALITY_CHECK        Run quality checks after inline execution (default: true)
  INLINE_AUTO_COMMIT          Auto-commit after inline execution (default: false)

  Next router:
  NEXT_SKIP_DISCUSS           Skip discuss phase in next routing (default: false)

  Context monitor:
  CONTEXT_MONITOR_ENABLED              Enable context window monitoring (default: false)
  CONTEXT_MONITOR_WARN_THRESHOLD       Warn at this remaining % (default: 35)
  CONTEXT_MONITOR_CRITICAL_THRESHOLD   Pause at this remaining % (default: 25)
  CONTEXT_MONITOR_CAPACITY             Context window capacity in tokens (default: 200000)
  PLANNING_CONTEXT_BUDGET_PCT          Planning prompt context budget % before auto-reduction (default: 50)
  TASK_CONTEXT_BUDGET_PCT              Decomposition prompt context budget % before auto-reduction (default: 50)

  Verify phase:
  VERIFY_MAX_ROUNDS           Verifier attempts before fix loop (default: 3)
  FIX_LOOP_MAX_RETRIES       (default: 1, 0 = unlimited) Auto re-plan/re-implement retries after verification failure
  VERIFY_AUTO_TEST            Auto-run tests during verification (default: true)
  VERIFY_BROWSER_TEST         Auto-run configured browser/E2E checks before review and during verification
  BROWSER_EVIDENCE_POLICY    (default: block) Require browser/E2E evidence for browser-facing goals: off|warn|block

  Discuss phase:
  DISCUSS_MAX_ROUNDS          Maximum discussion rounds (default: 0, 0 = unlimited)
  DISCUSS_MULTI_AGENT        Enable challenger passes when distinct non-facilitator agents exist (default: 1)

  Chain mode:
  CHAIN_DEFAULT_COMMAND       Default compound command for chain (default: plan-tasks-implement)

Per-project config: place .agent-loop.json in the project root (see docs/json-config.md).`;
}

const SHARED_COMMAND_OPTION_LINES = Object.freeze([
  "      --new-context                    Start each agent call with fresh context (no session resume, full prompts)",
  "      --json                           Emit all output as JSONL events to stdout (suppress human-readable text)",
  "      --require-plan-approval          Require explicit approval after planning before downstream phases continue",
  "      --no-plan-approval               Disable plan approval for this run, overriding project config",
  "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
  "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
  "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
  "      --reviewer <AGENT>               Override the reviewer agent",
  "      --plan-model <MODEL>             Override model for plan action",
  "      --tasks-model <MODEL>            Override model for tasks action",
  "      --implement-model <MODEL>        Override model for implement action",
  "      --review-model <MODEL>           Override model for review action",
  "      --discuss-model <MODEL>          Override model for discuss action",
  "      --discover-model <MODEL>         Override model for discover action",
  "      --verify-model <MODEL>           Override model for verify action",
  "      --debugger-model <MODEL>         Override model for debugger action",
  "      --compound-model <MODEL>         Override model for compound action",
  "      --plan-effort <LEVEL>            Override effort for plan action",
  "      --tasks-effort <LEVEL>           Override effort for tasks action",
  "      --implement-effort <LEVEL>       Override effort for implement action",
  "      --review-effort <LEVEL>          Override effort for review action",
  "      --discuss-effort <LEVEL>         Override effort for discuss action",
  "      --discover-effort <LEVEL>        Override effort for discover action",
  "      --verify-effort <LEVEL>          Override effort for verify action",
  "      --debugger-effort <LEVEL>        Override effort for debugger action",
  "      --compound-effort <LEVEL>        Override effort for compound action",
  "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
  "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
  "  -h, --help                           Print help",
]);

const [
  NEW_CONTEXT_OPTION_LINE,
  JSON_OPTION_LINE,
  REQUIRE_PLAN_APPROVAL_OPTION_LINE,
  ...SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL
] = SHARED_COMMAND_OPTION_LINES;
const [
  NO_PLAN_APPROVAL_OPTION_LINE,
  ...SHARED_COMMAND_OPTION_LINES_AFTER_NO_PLAN_APPROVAL
] = SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL;

function commandOptionsBlock({ beforeSession = [], afterSession = [] } = {}) {
  return [
    "Options:",
    ...beforeSession,
    "      --session <NAME>",
    ...afterSession,
    ...SHARED_COMMAND_OPTION_LINES,
  ].join("\n");
}

function phaseTaskOptionsBlock() {
  return [
    "Options:",
    "      --file <PATH>",
    "      --session <NAME>",
    "      --discover",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --resume",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent",
    ...SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL,
  ].join("\n");
}

function tasksOptionsBlock() {
  return [
    "Options:",
    "      --resume",
    "      --session <NAME>",
    "      --file <PATH>",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --single-agent",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    ...SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL,
  ].join("\n");
}

function verifyOptionsBlock() {
  return [
    "Options:",
    "      --resume                         Resume a previously interrupted verification",
    "      --session <NAME>",
    "      --manual                         Use manual (interactive) verification mode",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    ...SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL,
  ].join("\n");
}

function discussOptionsBlock() {
  return [
    "Options:",
    "      --session <NAME>",
    "      --task <TASK>                    Task description text",
    "      --file <FILE>                    Path to a task file",
    NEW_CONTEXT_OPTION_LINE,
    "      --discover                       Run a discovery prepass before discussion",
    JSON_OPTION_LINE,
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --resume                         Resume a previously interrupted discussion",
    NO_PLAN_APPROVAL_OPTION_LINE,
    ...SHARED_COMMAND_OPTION_LINES_AFTER_NO_PLAN_APPROVAL,
  ].join("\n");
}

function reviewOptionsBlock() {
  return [
    "Options:",
    "      --base <BASE>                    Git ref to diff against (e.g., main, HEAD~3)",
    "      --session <NAME>",
    "      --files <FILES>...               Explicit files to review instead of diff",
    NEW_CONTEXT_OPTION_LINE,
    "      --file <FILE>                    Read review context from a file",
    JSON_OPTION_LINE,
    "      --plan <PLAN>                    Path to plan.md for additional context",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent                   Use single agent mode",
    ...SHARED_COMMAND_OPTION_LINES_AFTER_NO_PLAN_APPROVAL,
  ].join("\n");
}

function chainOptionsBlock() {
  return [
    "Options:",
    "      --command <COMMAND>              Command to run for each file (default: from config)",
    "      --session <NAME>",
    NEW_CONTEXT_OPTION_LINE,
    "      --resume                         Resume from where an interrupted chain left off",
    JSON_OPTION_LINE,
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    ...SHARED_COMMAND_OPTION_LINES_AFTER_REQUIRE_PLAN_APPROVAL,
  ].join("\n");
}

function implementOptionsBlock() {
  return [
    "Options:",
    "      --session <NAME>",
    "      --task <TASK>",
    "      --file <PATH>",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --resume",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent",
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --per-task",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --fail-fast",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function planningImplementWorkflowOptionsBlock() {
  return [
    "Options:",
    "      --file <PATH>",
    "      --session <NAME>",
    "      --discover                       Run a discovery prepass before planning",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --resume",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent",
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --per-task",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --fail-fast",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function tasksImplementWorkflowOptionsBlock() {
  return [
    "Options:",
    "      --resume",
    "      --session <NAME>",
    NEW_CONTEXT_OPTION_LINE,
    "      --single-agent",
    "      --file <PATH>",
    JSON_OPTION_LINE,
    "      --per-task",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --fail-fast",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --max-parallel <MAX_PARALLEL>",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function pipelineAliasPositionalOptionsBlock() {
  return [
    "Options:",
    "      --file <PATH>",
    "      --session <NAME>",
    "      --discover",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --resume",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    NO_PLAN_APPROVAL_OPTION_LINE,
    ...SHARED_COMMAND_OPTION_LINES_AFTER_NO_PLAN_APPROVAL,
  ].join("\n");
}

function pipelineAliasOptionTaskImplementOptionsBlock() {
  return [
    "Options:",
    "      --session <NAME>",
    "      --task <TASK>",
    "      --file <FILE>",
    NEW_CONTEXT_OPTION_LINE,
    "      --discover",
    JSON_OPTION_LINE,
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --resume",
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent",
    "      --per-task",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --wave",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --fail-fast",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function pipelineAliasPositionalImplementOptionsBlock() {
  return [
    "Options:",
    "      --file <PATH>",
    "      --session <NAME>",
    "      --discover",
    NEW_CONTEXT_OPTION_LINE,
    JSON_OPTION_LINE,
    "      --resume",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --single-agent",
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --per-task",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --fail-fast",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function superviseOptionsBlock() {
  return [
    "Options:",
    "      --file <FILE>                    Path to a task file",
    "      --session <NAME>",
    NEW_CONTEXT_OPTION_LINE,
    "      --phases <PHASES>                Comma-separated phases; defaults to the configured requirements workflow",
    "      --discover                       Run a discovery prepass before the first discuss/spec/plan phase",
    JSON_OPTION_LINE,
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    "      --resume                         Resume a supervised workflow",
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --queue                          Pick up or resume an item from goal-queue.json",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --single-agent                   Use single agent mode for implement-capable phases",
    "      --per-task",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --fail-fast",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function pipelineOptionsBlock() {
  return [
    "Options:",
    "      --phases <PHASES>                Comma-separated list of phases: discuss,spec,plan,tasks,implement,verify",
    "      --session <NAME>",
    NEW_CONTEXT_OPTION_LINE,
    "      --task <TASK>                    Task description text",
    "      --file <FILE>                    Path to a task file",
    JSON_OPTION_LINE,
    "      --discover                       Run a discovery prepass before the first discuss/spec/plan phase in the pipeline",
    REQUIRE_PLAN_APPROVAL_OPTION_LINE,
    NO_PLAN_APPROVAL_OPTION_LINE,
    "      --resume                         Resume from where a pipeline was interrupted",
    "      --simple                         Use the short plan -> implement -> verify loop profile for this run",
    "      --single-agent                   Use single agent mode for implement-capable pipeline phases",
    "      --per-task",
    "      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]",
    "      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)",
    "      --wave",
    "      --max-retries <MAX_RETRIES>      [default: 2]",
    "      --reviewer <AGENT>               Override the reviewer agent",
    "      --plan-model <MODEL>             Override model for plan action",
    "      --round-step <ROUND_STEP>        [default: 2]",
    "      --continue-on-fail",
    "      --tasks-model <MODEL>            Override model for tasks action",
    "      --fail-fast",
    "      --implement-model <MODEL>        Override model for implement action",
    "      --max-parallel <MAX_PARALLEL>",
    "      --review-model <MODEL>           Override model for review action",
    "      --discuss-model <MODEL>          Override model for discuss action",
    "      --discover-model <MODEL>         Override model for discover action",
    "      --verify-model <MODEL>           Override model for verify action",
    "      --debugger-model <MODEL>         Override model for debugger action",
    "      --compound-model <MODEL>         Override model for compound action",
    "      --plan-effort <LEVEL>            Override effort for plan action",
    "      --tasks-effort <LEVEL>           Override effort for tasks action",
    "      --implement-effort <LEVEL>       Override effort for implement action",
    "      --review-effort <LEVEL>          Override effort for review action",
    "      --discuss-effort <LEVEL>         Override effort for discuss action",
    "      --discover-effort <LEVEL>        Override effort for discover action",
    "      --verify-effort <LEVEL>          Override effort for verify action",
    "      --debugger-effort <LEVEL>        Override effort for debugger action",
    "      --compound-effort <LEVEL>        Override effort for compound action",
    "      --action-model <ACTION=MODEL>    Override model for specific action: action=model",
    "      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort",
    "  -h, --help                           Print help",
  ].join("\n");
}

function statusHelp() {
  return `Show current loop status

Usage: agent-loop status [OPTIONS]

${commandOptionsBlock()}`;
}

function analyzeCoverageHelp() {
  return `Check spec requirement IDs against tasks.md

Usage: agent-loop analyze-coverage [OPTIONS]

${commandOptionsBlock()}`;
}

function specHelp() {
  return `Author or resume a requirements spec

Usage: agent-loop spec [OPTIONS] [TASK]

Arguments:
  [TASK]

${phaseTaskOptionsBlock()}`;
}

function planHelp() {
  return `Plan only

Usage: agent-loop plan [OPTIONS] [TASK]

Arguments:
  [TASK]

${phaseTaskOptionsBlock()}`;
}

function tasksHelp() {
  return `Decompose plan into tasks only

Usage: agent-loop tasks [OPTIONS]

${tasksOptionsBlock()}`;
}

function implementHelp() {
  return `Implement from tasks.md, inline task text, or task file

Usage: agent-loop implement [OPTIONS]

${implementOptionsBlock()}`;
}

function implementVerifyHelp() {
  return `Run implement -> verify (with full implement-mode flags)

Usage: agent-loop implement-verify [OPTIONS]

${implementOptionsBlock()}`;
}

function planImplementHelp() {
  return `Run plan -> implement (skip task decomposition)

Usage: agent-loop plan-implement [OPTIONS] [TASK]

Arguments:
  [TASK]

${planningImplementWorkflowOptionsBlock()}`;
}

function planTasksImplementHelp() {
  return `Run plan -> tasks -> implement end-to-end

Usage: agent-loop plan-tasks-implement [OPTIONS] [TASK]

Arguments:
  [TASK]

${planningImplementWorkflowOptionsBlock()}`;
}

function tasksImplementHelp() {
  return `Run tasks -> implement (skip planning, assumes plan.md exists)

Usage: agent-loop tasks-implement [OPTIONS]

${tasksImplementWorkflowOptionsBlock()}`;
}

const PIPELINE_ALIAS_TITLES = Object.freeze({
  "discuss-plan-tasks": "Run discuss -> plan -> tasks (full prep)",
  "discuss-plan-tasks-implement": "Run discuss -> plan -> tasks -> implement end-to-end",
  "plan-tasks": "Run plan -> tasks (planning prep)",
  "plan-tasks-implement-verify": "Run plan -> tasks -> implement -> verify end-to-end",
  "plan-verify": "Run plan -> verify (plan spec, then verify existing implementation)",
});

function pipelineAliasHelp(command, definition) {
  const phases = definition.phases.split(",").join(" -> ");
  const title = PIPELINE_ALIAS_TITLES[command] ?? `Run ${phases}`;
  const usage = definition.taskStyle === "positional" ? `[OPTIONS] [TASK]` : `[OPTIONS]`;
  const argumentsBlock = definition.taskStyle === "positional" ? "\n\nArguments:\n  [TASK]" : "";
  const optionsBlock = definition.implementFlags
    ? definition.taskStyle === "option"
      ? pipelineAliasOptionTaskImplementOptionsBlock()
      : pipelineAliasPositionalImplementOptionsBlock()
    : pipelineAliasPositionalOptionsBlock();

  return `${title}

Usage: agent-loop ${command} ${usage}${argumentsBlock}

${optionsBlock}`;
}

function superviseHelp() {
  return `Run a supervised workflow through the deterministic Supervisor fallback

Usage: agent-loop supervise [OPTIONS] [TASK]

Arguments:
  [TASK]  Task description text

${superviseOptionsBlock()}`;
}

function pipelineHelp() {
  return `Run an arbitrary sequence of phases, e.g. --phases discuss,plan,tasks,implement,verify (legacy hyphenated shortcuts like plan-tasks-implement still work)

Usage: agent-loop pipeline [OPTIONS] --phases <PHASES>

${pipelineOptionsBlock()}`;
}

function inlineHelp() {
  return `Execute a task directly with a single agent call

Usage: agent-loop inline [OPTIONS]

${commandOptionsBlock({
  afterSession: [
    "      --task <TASK>                    Task description text",
    "      --file <FILE>                    Path to a task file",
  ],
})}`;
}

function reviewHelp() {
  return `Run a standalone code review, then fix confirmed findings

Usage: agent-loop review [OPTIONS] [CONTEXT]

Arguments:
  [CONTEXT]  Optional focus area or context for the review

${reviewOptionsBlock()}`;
}

function verifyHelp() {
  return `Run verification on completed implementation

Usage: agent-loop verify [OPTIONS]

${verifyOptionsBlock()}`;
}

function discussHelp() {
  return `Interactive requirements discussion before planning

Usage: agent-loop discuss [OPTIONS]

${discussOptionsBlock()}`;
}

function chainHelp() {
  return `Execute multiple plan files in sequence

Usage: agent-loop chain [OPTIONS] <FILES>...

Arguments:
  <FILES>...  Plan files to execute in sequence

${chainOptionsBlock()}`;
}

function nextHelp() {
  return `Determine and run the logical next command based on current state

Usage: agent-loop next [OPTIONS]

${commandOptionsBlock({
  afterSession: [
    "      --task <TASK>                    Task description text (for fresh start)",
    "      --file <FILE>                    Path to a task file (for fresh start)",
  ],
})}`;
}

function resumeHelp() {
  return `Resume the current run and choose the right underlying workflow automatically

Usage: agent-loop resume [OPTIONS]

${commandOptionsBlock({
  beforeSession: [
    "      --dry-run                        Print the selected resume command without running it",
  ],
})}`;
}

function listAgentsHelp() {
  return `List available agents and their installation status (JSON output)

Usage: agent-loop list-agents [OPTIONS]

${commandOptionsBlock()}`;
}

function versionHelp() {
  return `Print version

Usage: agent-loop version [OPTIONS]

${commandOptionsBlock()}`;
}

function resetHelp() {
  return `Clear .agent-loop/state while preserving decisions.md

Usage: agent-loop reset [OPTIONS]

${commandOptionsBlock({
  afterSession: [
    "      --wave-lock                      Only remove the wave.lock file (force-clear a stale wave lock)",
  ],
})}`;
}

function initHelp() {
  return `Initialize project configuration

Usage: agent-loop init [OPTIONS]

${commandOptionsBlock({
  beforeSession: [
    "      --force                          Overwrite existing .agent-loop.json",
  ],
})}`;
}

function tuiHelp() {
  return `Launch the TUI dashboard to monitor agent-loop state

Usage: agent-loop tui [OPTIONS] [PATH]...

Arguments:
  [PATH]...  Paths to project directories to monitor (defaults to current directory)

${commandOptionsBlock()}`;
}

function completionsHelp() {
  return `Generate a shell completion script (write it to your shell's completion dir)

Usage: agent-loop completions [OPTIONS] <SHELL>

Arguments:
  <SHELL>  Shell to generate completions for [possible values: ${COMPLETION_SHELLS.join(", ")}]

${commandOptionsBlock()}`;
}

function goalHelp() {
  return `Persist and run an autonomous goal lifecycle

Usage: agent-loop goal [OPTIONS] [OBJECTIVE]... [COMMAND]

Commands:
  status  Print goal and workflow status
  pause   Pause the active goal
  resume  Resume the active goal state, optionally continuing the workflow
  clear   Remove goal state
  help    Print this message or the help of the given subcommand(s)

Arguments:
  [OBJECTIVE]...  Task objective text. Quote objectives that start with status, pause, resume, or clear

Options:
      --session <NAME>
      --new-context                    Start each agent call with fresh context (no session resume, full prompts)
      --json                           Emit all output as JSONL events to stdout (suppress human-readable text)
      --require-plan-approval          Require explicit approval after planning before downstream phases continue
      --no-plan-approval               Disable plan approval for this run, overriding project config
      --objective <TEXT>               Task objective text, useful when the objective starts with a reserved subcommand word
      --file <PATH>                    Read the task objective from a file without modifying the source file
      --simple                         Use the short plan -> implement -> verify loop profile for this run
      --replace                        Replace an existing goal
      --requirements-workflow <MODE>   Requirements workflow for this run: legacy or spec [possible values: legacy, spec]
      --discover                       Run a discovery prepass before the first planning phase
      --implementer <AGENT>            Override the implementer agent (e.g., claude, codex, opencode)
      --reviewer <AGENT>               Override the reviewer agent
      --single-agent                   Use single agent mode for implement-capable phases
      --per-task
      --plan-model <MODEL>             Override model for plan action
      --tasks-model <MODEL>            Override model for tasks action
      --wave
      --implement-model <MODEL>        Override model for implement action
      --max-retries <MAX_RETRIES>      [default: 2]
      --review-model <MODEL>           Override model for review action
      --round-step <ROUND_STEP>        [default: 2]
      --continue-on-fail
      --discuss-model <MODEL>          Override model for discuss action
      --discover-model <MODEL>         Override model for discover action
      --fail-fast
      --max-parallel <MAX_PARALLEL>
      --verify-model <MODEL>           Override model for verify action
      --debugger-model <MODEL>         Override model for debugger action
      --compound-model <MODEL>         Override model for compound action
      --plan-effort <LEVEL>            Override effort for plan action
      --tasks-effort <LEVEL>           Override effort for tasks action
      --implement-effort <LEVEL>       Override effort for implement action
      --review-effort <LEVEL>          Override effort for review action
      --discuss-effort <LEVEL>         Override effort for discuss action
      --discover-effort <LEVEL>        Override effort for discover action
      --verify-effort <LEVEL>          Override effort for verify action
      --debugger-effort <LEVEL>        Override effort for debugger action
      --compound-effort <LEVEL>        Override effort for compound action
      --action-model <ACTION=MODEL>    Override model for specific action: action=model
      --action-effort <ACTION=EFFORT>  Override effort for specific action: action=effort
  -h, --help                           Print help`;
}

function queueHelp() {
  return `Manage queued autonomous objectives

Usage: agent-loop queue [OPTIONS] <COMMAND>

Commands:
  add     Add a queued objective from text or a file
  list    List queued objectives
  status  Print active and next queue status
  pause   Defer a queue item without deleting it
  resume  Return a deferred or blocked queue item to the runnable queue
  cancel  Cancel a queue item
  help    Print this message or the help of the given subcommand(s)

${commandOptionsBlock()}`;
}

function approveHelp() {
  return `Approve a pending phase approval gate

Usage: agent-loop approve [OPTIONS] <PHASE>

Arguments:
  <PHASE>  Phase to approve. Currently supported: plan

${commandOptionsBlock()}`;
}

function rejectHelp() {
  return `Reject a pending phase approval gate

Usage: agent-loop reject [OPTIONS] --reason <REASON> <PHASE>

Arguments:
  <PHASE>  Phase to reject. Currently supported: plan

${commandOptionsBlock({
  beforeSession: [
    "      --reason <REASON>                Required rejection reason",
  ],
})}`;
}

export function formatHelpText({ session } = {}) {
  return `${commandHelp()}\n\n${environmentHelp(session)}\n`;
}

export function formatCommandHelpText(command, { session } = {}) {
  const commandHelpFormatters = {
    "analyze-coverage": analyzeCoverageHelp,
    approve: approveHelp,
    chain: chainHelp,
    completions: completionsHelp,
    discuss: discussHelp,
    goal: goalHelp,
    implement: implementHelp,
    "implement-verify": implementVerifyHelp,
    init: initHelp,
    inline: inlineHelp,
    "list-agents": listAgentsHelp,
    next: nextHelp,
    pipeline: pipelineHelp,
    "plan-implement": planImplementHelp,
    plan: planHelp,
    "plan-tasks-implement": planTasksImplementHelp,
    queue: queueHelp,
    reject: rejectHelp,
    resume: resumeHelp,
    reset: resetHelp,
    review: reviewHelp,
    spec: specHelp,
    status: statusHelp,
    supervise: superviseHelp,
    tasks: tasksHelp,
    tui: tuiHelp,
    "tasks-implement": tasksImplementHelp,
    verify: verifyHelp,
    version: versionHelp,
  };
  const formatter = commandHelpFormatters[command];
  if (formatter) {
    return `${formatter()}\n\n${environmentHelp(session)}\n`;
  }
  const pipelineAliasDefinition = PIPELINE_ALIAS_DEFINITIONS[command];
  return pipelineAliasDefinition
    ? `${pipelineAliasHelp(command, pipelineAliasDefinition)}\n\n${environmentHelp(session)}\n`
    : null;
}

export function helpEvent(options = {}) {
  return {
    type: "help",
    data: {
      text: formatHelpText(options),
    },
  };
}

export function commandHelpEvent(command, options = {}) {
  return {
    type: "help",
    data: {
      text: formatCommandHelpText(command, options),
    },
  };
}
