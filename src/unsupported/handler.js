export class UnsupportedCommandError extends Error {
  constructor(command) {
    super(`Unsupported in node-cli first pass: ${command}`);
    this.command = command;
  }
}

export function unsupportedMessage(command, suggestedCommand) {
  const suggestion = suggestedCommand ? `This workflow requires the Rust CLI. Run: ${suggestedCommand}\n` : "";
  return `Unsupported in node-cli first pass: ${command}
${suggestion}See node-cli/docs/unsupported.md for supported first-pass behavior.
`;
}

export function handleUnsupportedCommand(command, { stderr = process.stderr } = {}, suggestedCommand) {
  stderr.write(unsupportedMessage(command, suggestedCommand));
  return 2;
}
