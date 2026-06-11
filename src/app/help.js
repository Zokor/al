export function formatHelpText() {
  return `agent-loop ${"0.1.120"}

Usage: agent-loop [OPTIONS] [COMMAND]

Commands:
  spec       Create or resume specification state
  plan       Create or resume planning state
  tasks      Decompose an existing plan
  status     Inspect Agent Loop state
  reset      Clear Agent Loop state
  next       Select the next workflow command
  resume     Select or resume pending workflow state
  verify     Validate verification state
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
