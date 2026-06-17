import { handleUnsupportedCommand } from "../../unsupported/handler.js";
import { loadConfig } from "../../config/index.js";
import { readStateFile } from "../../state/files.js";
import { runImplement } from "./implement.js";
import { runVerify } from "./verify.js";

export async function runImplementVerify(cli, context) {
  if (cli.commandArgs.resume) {
    return runImplementVerifyResume(cli, context);
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

async function runImplementVerifyResume(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const workflow = (await readStateFile(config, "workflow.txt")).trim();
  if (workflow === "implement") {
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
  if (workflow === "verify") {
    return runVerify(
      {
        ...cli,
        command: "verify",
        commandArgs: { resume: true },
      },
      context,
    );
  }
  if (workflow === "plan") {
    return handleUnsupportedCommand("implement-verify --resume plan workflow", context);
  }
  if (workflow === "review") {
    return handleUnsupportedCommand("implement-verify --resume review workflow", context);
  }
  throw new Error("State error: Cannot resume implement-verify: workflow is not 'plan', 'implement', or 'verify'.");
}
