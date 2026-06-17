import { COMMANDS, COMPLETION_BINARIES, COMPLETION_SHELLS, GLOBAL_OPTIONS } from "../completionSurface.js";

function quoteSingle(value) {
  return value.replace(/'/g, "'\\''");
}

function names(values) {
  return values.map((entry) => entry.name ?? entry).join(" ");
}

function bashCompletion() {
  const commands = names(COMMANDS);
  const options = names(GLOBAL_OPTIONS);
  const shells = COMPLETION_SHELLS.join(" ");
  return `_agent_loop_node_cli()
{
  local cur prev words cword
  _init_completion -n = || return

  case "$prev" in
    completions)
      COMPREPLY=( $(compgen -W "${shells}" -- "$cur") )
      return
      ;;
    --requirements-workflow)
      COMPREPLY=( $(compgen -W "legacy spec" -- "$cur") )
      return
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "${options}" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "${commands}" -- "$cur") )
  fi
}

complete -F _agent_loop_node_cli agent-loop
complete -F _agent_loop_node_cli agent-loop-node
`;
}

function zshCompletion() {
  const commandEntries = COMMANDS.map((command) => `${command.name}:${command.description}`).join(" ");
  const optionEntries = GLOBAL_OPTIONS.map((option) => `'${option.name}[${quoteSingle(option.description)}]'`).join(" \\\n  ");
  return `#compdef agent-loop agent-loop-node

_agent_loop_node_cli() {
  local -a commands
  commands=(${commandEntries})

  _arguments -C \\
  ${optionEntries} \\
  '1:command:->command' \\
  '*::arg:->arg'

  case $state in
    command)
      _describe 'command' commands
      ;;
    arg)
      if [[ $words[2] == completions ]]; then
        _values 'shell' ${COMPLETION_SHELLS.join(" ")}
      fi
      ;;
  esac
}

_agent_loop_node_cli "$@"
`;
}

function fishCompletion() {
  const lines = [];
  for (const binary of COMPLETION_BINARIES) {
    for (const option of GLOBAL_OPTIONS) {
      const optionName = option.name.replace(/^-+/, "");
      const short = option.name.startsWith("--") ? "" : ` -s ${optionName}`;
      const long = option.name.startsWith("--") ? ` -l ${optionName}` : "";
      const requiresArg = option.takesValue ? " -r" : "";
      lines.push(`complete -c ${binary}${short}${long}${requiresArg} -d '${quoteSingle(option.description)}'`);
    }
    for (const command of COMMANDS) {
      lines.push(`complete -c ${binary} -f -a '${quoteSingle(command.name)}' -d '${quoteSingle(command.description)}'`);
    }
    for (const shell of COMPLETION_SHELLS) {
      lines.push(`complete -c ${binary} -n "__fish_seen_subcommand_from completions" -f -a '${shell}' -d 'Generate ${shell} completions'`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function powershellCompletion() {
  const commandCases = COMMANDS.map(
    (command) => `            [CompletionResult]::new('${quoteSingle(command.name)}', '${quoteSingle(command.name)}', [CompletionResultType]::ParameterValue, '${quoteSingle(command.description)}')`,
  ).join("\n");
  const optionCases = GLOBAL_OPTIONS.map(
    (option) => `            [CompletionResult]::new('${quoteSingle(option.name)}', '${quoteSingle(option.name)}', [CompletionResultType]::ParameterName, '${quoteSingle(option.description)}')`,
  ).join("\n");
  const shellCases = COMPLETION_SHELLS.map(
    (shell) => `            [CompletionResult]::new('${shell}', '${shell}', [CompletionResultType]::ParameterValue, 'Generate ${shell} completions')`,
  ).join("\n");
  return `using namespace System.Management.Automation
using namespace System.Management.Automation.Language

Register-ArgumentCompleter -Native -CommandName ${COMPLETION_BINARIES.map((binary) => `'${binary}'`).join(", ")} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $elements = $commandAst.CommandElements | ForEach-Object { $_.Extent.Text }
    $previous = if ($elements.Count -gt 1) { $elements[$elements.Count - 2] } else { '' }
    $completions = @()
    if ($previous -eq 'completions') {
${shellCases}
    } elseif ($wordToComplete.StartsWith('-')) {
${optionCases}
    } else {
${commandCases}
    }
    $completions | Where-Object { $_.CompletionText -like "$wordToComplete*" }
}
`;
}

function elvishCompletion() {
  const candidates = [
    ...GLOBAL_OPTIONS.map((option) => `            cand ${option.name} '${quoteSingle(option.description)}'`),
    ...COMMANDS.map((command) => `            cand ${command.name} '${quoteSingle(command.description)}'`),
  ].join("\n");
  const shellCandidates = COMPLETION_SHELLS.map((shell) => `            cand ${shell} 'Generate ${shell} completions'`).join("\n");
  return `use builtin
use str

fn _agent_loop_node_cli_completion {|@words|
    fn cand {|text desc|
        edit:complex-candidate $text &display=$text' '$desc
    }
    if (> (count $words) 1) {
        if (== $words[-2] completions) {
${shellCandidates}
            return
        }
    }
${candidates}
}

set edit:completion:arg-completer[agent-loop] = $_agent_loop_node_cli_completion
set edit:completion:arg-completer[agent-loop-node] = $_agent_loop_node_cli_completion
`;
}

export function generateCompletions(shell) {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
    case "powershell":
      return powershellCompletion();
    case "elvish":
      return elvishCompletion();
    default:
      throw new Error(`unsupported shell '${shell}'`);
  }
}

export function runCompletions(cli, context) {
  context.stdout.write(generateCompletions(cli.commandArgs.shell));
  return 0;
}
