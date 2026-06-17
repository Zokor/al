import { PIPELINE_ALIAS_COMMANDS } from "./pipelineAliases.js";
import { UNSUPPORTED_COMMANDS } from "../unsupported/commands.js";

export const COMPLETION_SHELLS = Object.freeze(["bash", "elvish", "fish", "powershell", "zsh"]);

export const COMPLETION_BINARIES = Object.freeze(["agent-loop", "agent-loop-node"]);

export const GLOBAL_OPTIONS = Object.freeze([
  { name: "--session", description: "Session name", takesValue: true },
  { name: "--new-context", description: "Start each agent call with fresh context" },
  { name: "--json", description: "Emit JSON output where supported" },
  { name: "--require-plan-approval", description: "Require explicit approval after planning" },
  { name: "--no-plan-approval", description: "Disable plan approval for this run" },
  { name: "--simple", description: "Use the short plan -> implement -> verify profile" },
  { name: "--requirements-workflow", description: "Requirements workflow for this run", takesValue: true, values: ["legacy", "spec"] },
  { name: "--implementer", description: "Override the implementer agent", takesValue: true },
  { name: "--reviewer", description: "Override the reviewer agent", takesValue: true },
  { name: "--plan-model", description: "Override model for plan action", takesValue: true },
  { name: "--tasks-model", description: "Override model for tasks action", takesValue: true },
  { name: "--implement-model", description: "Override model for implement action", takesValue: true },
  { name: "--review-model", description: "Override model for review action", takesValue: true },
  { name: "--discuss-model", description: "Override model for discuss action", takesValue: true },
  { name: "--discover-model", description: "Override model for discover action", takesValue: true },
  { name: "--verify-model", description: "Override model for verify action", takesValue: true },
  { name: "--debugger-model", description: "Override model for debugger action", takesValue: true },
  { name: "--compound-model", description: "Override model for compound action", takesValue: true },
  { name: "--plan-effort", description: "Override effort for plan action", takesValue: true },
  { name: "--tasks-effort", description: "Override effort for tasks action", takesValue: true },
  { name: "--implement-effort", description: "Override effort for implement action", takesValue: true },
  { name: "--review-effort", description: "Override effort for review action", takesValue: true },
  { name: "--discuss-effort", description: "Override effort for discuss action", takesValue: true },
  { name: "--discover-effort", description: "Override effort for discover action", takesValue: true },
  { name: "--verify-effort", description: "Override effort for verify action", takesValue: true },
  { name: "--debugger-effort", description: "Override effort for debugger action", takesValue: true },
  { name: "--compound-effort", description: "Override effort for compound action", takesValue: true },
  { name: "--action-model", description: "Override model for specific action", takesValue: true },
  { name: "--action-effort", description: "Override effort for specific action", takesValue: true },
  { name: "-h", description: "Print help" },
  { name: "--help", description: "Print help" },
  { name: "-V", description: "Print version" },
  { name: "--version", description: "Print version" },
]);

const SUPPORTED_COMMANDS = [
  ["spec", "Create or resume specification state"],
  ["plan", "Create or resume planning state"],
  ["tasks", "Decompose an existing plan"],
  ["status", "Inspect Agent Loop state"],
  ["reset", "Clear Agent Loop state"],
  ["next", "Select the next workflow command"],
  ["resume", "Select or resume pending workflow state"],
  ["verify", "Validate verification state"],
  ["inline", "Run direct implementer execution"],
  ["pipeline", "Resume pipeline state; fresh orchestration is partial"],
  ["version", "Print version"],
  ["init", "Generate default .agent-loop.json"],
  ["list-agents", "List available agents as JSON"],
  ["completions", "Generate a shell completion script"],
];

const UNSUPPORTED_COMMAND_DESCRIPTIONS = new Map(
  UNSUPPORTED_COMMANDS.map((command) => [command, "Recognized Rust CLI command; runtime not yet ported in node-cli"]),
);

const PIPELINE_ALIAS_DESCRIPTIONS = new Map(
  [...PIPELINE_ALIAS_COMMANDS].map((command) => [command, "Legacy pipeline alias; use pipeline --phases for the canonical form"]),
);

export const COMMANDS = Object.freeze(
  [
    ...SUPPORTED_COMMANDS.map(([name, description]) => ({ name, description })),
    ...[...PIPELINE_ALIAS_COMMANDS].map((name) => ({ name, description: PIPELINE_ALIAS_DESCRIPTIONS.get(name) })),
    ...UNSUPPORTED_COMMANDS.map((name) => ({ name, description: UNSUPPORTED_COMMAND_DESCRIPTIONS.get(name) })),
  ].sort((left, right) => left.name.localeCompare(right.name)),
);
