export const DispatchKind = Object.freeze({
  ShowHelp: "ShowHelp",
  Version: "Version",
  Status: "Status",
  Reset: "Reset",
  Spec: "Spec",
  AnalyzeCoverage: "AnalyzeCoverage",
  Plan: "Plan",
  Tasks: "Tasks",
  Next: "Next",
  Resume: "Resume",
  Verify: "Verify",
  Discuss: "Discuss",
  Implement: "Implement",
  ImplementVerify: "ImplementVerify",
  Inline: "Inline",
  Chain: "Chain",
  Review: "Review",
  Goal: "Goal",
  Queue: "Queue",
  Pipeline: "Pipeline",
  Supervise: "Supervise",
  ListAgents: "ListAgents",
  Init: "Init",
  Completions: "Completions",
  Approve: "Approve",
  Reject: "Reject",
  Unsupported: "Unsupported",
});

const AGENT_RUNTIME_DISPATCHES = new Set([
  DispatchKind.Spec,
  DispatchKind.Plan,
  DispatchKind.Tasks,
  DispatchKind.Verify,
  DispatchKind.Discuss,
  DispatchKind.Implement,
  DispatchKind.ImplementVerify,
  DispatchKind.Inline,
  DispatchKind.Chain,
  DispatchKind.Review,
  DispatchKind.Pipeline,
  DispatchKind.Supervise,
  DispatchKind.Unsupported,
]);

export function printsElapsedInternally(dispatch) {
  return AGENT_RUNTIME_DISPATCHES.has(dispatch.kind);
}

export function elapsedPrefersStderr(dispatch, jsonMode) {
  return Boolean(jsonMode) || dispatch.kind === DispatchKind.ListAgents || dispatch.kind === DispatchKind.Completions;
}

export function needsSignalHandlers(dispatch) {
  return AGENT_RUNTIME_DISPATCHES.has(dispatch.kind);
}
