export function formatHelpText() {
  return `agent-loop ${"0.1.120"}

Usage: agent-loop [OPTIONS] [COMMAND]

Commands:
  spec       Create or resume specification state
  analyze-coverage
             Check spec REQ IDs against tasks.md
  plan       Create or resume planning state
  tasks      Decompose an existing plan
  status     Inspect Agent Loop state
  reset      Clear Agent Loop state
  next       Select the next workflow command
  resume     Select or resume pending workflow state
  verify     Validate verification state
  discuss    Clarify requirements before planning
  implement  Run a first implementation/review round
  implement-verify
             Run first-pass implementation, then verification
  inline     Run direct implementer execution
  review     Run a standalone code review
  goal       Manage lifecycle goal state
  queue      Manage queued objective state
  pipeline   Resume pipeline state
  list-agents
             List available agents as JSON
  init       Generate default .agent-loop.json
  completions
             Generate shell completion scripts
  approve    Approve a pending plan gate
  reject     Reject a pending plan gate
  version    Print the Rust Agent Loop CLI version
  help       Print help

Global options:
      --session <NAME>
      --new-context
      --json
      --require-plan-approval
      --no-plan-approval
      --simple
      --requirements-workflow <legacy|spec>
      --implementer <AGENT>
      --reviewer <AGENT>
      --*-model <MODEL>
      --*-effort <LEVEL>
      --action-model <ACTION=MODEL>
      --action-effort <ACTION=EFFORT>
  -h, --help
  -V, --version
`;
}

export function helpEvent() {
  return {
    type: "help",
    data: {
      text: formatHelpText(),
    },
  };
}
