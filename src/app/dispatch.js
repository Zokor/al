import { formatHelpText } from "./help.js";
import { handleVersion } from "./version.js";
import { DispatchKind } from "./dispatchTypes.js";
import { UNSUPPORTED_COMMAND_SET } from "../unsupported/commands.js";
import { handleUnsupportedCommand } from "../unsupported/handler.js";
import { runAnalyzeCoverage } from "./commands/analyzeCoverage.js";
import { runApprove, runReject } from "./commands/approval.js";
import { runChain } from "./commands/chain.js";
import { runCompletions } from "./commands/completions.js";
import { runDiscuss } from "./commands/discuss.js";
import { runGoal } from "./commands/goal.js";
import { runImplement } from "./commands/implement.js";
import { runImplementVerify } from "./commands/implementVerify.js";
import { runInline } from "./commands/inline.js";
import { runInit } from "./commands/init.js";
import { runListAgents } from "./commands/listAgents.js";
import { runNext } from "./commands/next.js";
import { runPlan, runSpec, runTasks } from "./commands/phases.js";
import { runQueue } from "./commands/queue.js";
import { runReview } from "./commands/review.js";
import { runReset } from "./commands/reset.js";
import { runResume } from "./commands/resume.js";
import { runStatus } from "./commands/status.js";
import { runVerify } from "./commands/verify.js";

export function dispatchFromCli(cli) {
  if (!cli.command) {
    return { kind: DispatchKind.ShowHelp, cli };
  }
  if (cli.command === "version") {
    return { kind: DispatchKind.Version, cli };
  }
  if (UNSUPPORTED_COMMAND_SET.has(cli.command)) {
    return { kind: DispatchKind.Unsupported, command: cli.command, cli };
  }
  const kindByCommand = {
    status: DispatchKind.Status,
    reset: DispatchKind.Reset,
    spec: DispatchKind.Spec,
    "analyze-coverage": DispatchKind.AnalyzeCoverage,
    plan: DispatchKind.Plan,
    tasks: DispatchKind.Tasks,
    next: DispatchKind.Next,
    resume: DispatchKind.Resume,
    verify: DispatchKind.Verify,
    discuss: DispatchKind.Discuss,
    implement: DispatchKind.Implement,
    "implement-verify": DispatchKind.ImplementVerify,
    inline: DispatchKind.Inline,
    chain: DispatchKind.Chain,
    review: DispatchKind.Review,
    goal: DispatchKind.Goal,
    queue: DispatchKind.Queue,
    "list-agents": DispatchKind.ListAgents,
    init: DispatchKind.Init,
    completions: DispatchKind.Completions,
    approve: DispatchKind.Approve,
    reject: DispatchKind.Reject,
  };
  return { kind: kindByCommand[cli.command], cli };
}

export async function executeDispatch(dispatch, context) {
  switch (dispatch.kind) {
    case DispatchKind.ShowHelp:
      context.stdout.write(formatHelpText());
      return 0;
    case DispatchKind.Version:
      return handleVersion({ jsonMode: dispatch.cli.globals.json, stdout: context.stdout });
    case DispatchKind.Status:
      return runStatus(dispatch.cli, context);
    case DispatchKind.Reset:
      return runReset(dispatch.cli, context);
    case DispatchKind.Spec:
      return runSpec(dispatch.cli, context);
    case DispatchKind.AnalyzeCoverage:
      return runAnalyzeCoverage(dispatch.cli, context);
    case DispatchKind.Plan:
      return runPlan(dispatch.cli, context);
    case DispatchKind.Tasks:
      return runTasks(dispatch.cli, context);
    case DispatchKind.Next:
      return runNext(dispatch.cli, context);
    case DispatchKind.Resume:
      return runResume(dispatch.cli, context);
    case DispatchKind.Verify:
      return runVerify(dispatch.cli, context);
    case DispatchKind.Discuss:
      return runDiscuss(dispatch.cli, context);
    case DispatchKind.Implement:
      return runImplement(dispatch.cli, context);
    case DispatchKind.ImplementVerify:
      return runImplementVerify(dispatch.cli, context);
    case DispatchKind.Inline:
      return runInline(dispatch.cli, context);
    case DispatchKind.Chain:
      return runChain(dispatch.cli, context);
    case DispatchKind.Review:
      return runReview(dispatch.cli, context);
    case DispatchKind.Goal:
      return runGoal(dispatch.cli, context);
    case DispatchKind.Queue:
      return runQueue(dispatch.cli, context);
    case DispatchKind.ListAgents:
      return runListAgents(dispatch.cli, context);
    case DispatchKind.Init:
      return runInit(dispatch.cli, context);
    case DispatchKind.Completions:
      return runCompletions(dispatch.cli, context);
    case DispatchKind.Approve:
      return runApprove(dispatch.cli, context);
    case DispatchKind.Reject:
      return runReject(dispatch.cli, context);
    case DispatchKind.Unsupported:
      return handleUnsupportedCommand(dispatch.command, context);
    default:
      throw new Error(`unhandled dispatch kind: ${dispatch.kind}`);
  }
}
