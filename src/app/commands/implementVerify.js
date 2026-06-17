import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { runImplement } from "./implement.js";
import { runVerify } from "./verify.js";

export async function runImplementVerify(cli, context) {
  if (cli.commandArgs.resume) {
    return handleUnsupportedCommand("implement-verify --resume", context);
  }

  const implementExit = await runImplement({ ...cli, command: "implement" }, context);
  if (implementExit !== 0) {
    return implementExit;
  }

  return runVerify(
    {
      ...cli,
      command: "verify",
      commandArgs: {},
    },
    context,
  );
}
