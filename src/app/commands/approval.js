import { loadConfig } from "../../config/index.js";
import { writePlanApprovalResponse } from "../../state/decisions.js";

const ACTION_NAMES = ["plan", "tasks", "implement", "review", "discuss", "discover", "verify", "debugger", "compound", "supervisor"];

export async function runApprove(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const phase = approvalPhaseFromArg(cli.commandArgs.phase);
  await writePlanApprovalResponse(config, { chosen: "approve" });
  writeApprovalOutput(context, {
    jsonMode: cli.globals.json,
    phase,
    chosen: "approve",
  });
  return 0;
}

export async function runReject(cli, context) {
  const config = await loadConfig(context.cwd, cli, context);
  const phase = approvalPhaseFromArg(cli.commandArgs.phase);
  const reason = cli.commandArgs.reason.trim();
  await writePlanApprovalResponse(config, { chosen: "reject", reason });
  writeApprovalOutput(context, {
    jsonMode: cli.globals.json,
    phase,
    chosen: "reject",
    reason,
  });
  return 0;
}

function approvalPhaseFromArg(value) {
  if (!ACTION_NAMES.includes(value)) {
    throw new Error(`unknown action '${value}': expected one of ${ACTION_NAMES.join(", ")}`);
  }
  if (value !== "plan") {
    throw new Error("only plan approval is supported in this release");
  }
  return value;
}

function writeApprovalOutput(context, { jsonMode, phase, chosen, reason }) {
  if (jsonMode) {
    const data = reason === undefined
      ? { phase, chosen }
      : { phase, chosen, reason };
    context.stdout.write(`${JSON.stringify({ type: "approval_response", data })}\n`);
    return;
  }
  const verb = chosen === "approve" ? "Approved" : "Rejected";
  context.stdout.write(`${verb} pending ${phase} gate.\n`);
}
